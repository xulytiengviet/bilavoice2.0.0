"""HTTP contract checks without downloading model weights."""
from io import BytesIO
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import wave

from fastapi.testclient import TestClient
from server.app import app


def wav_bytes():
    stream = BytesIO()
    with wave.open(stream, "wb") as wav:
        wav.setparams((1, 2, 8000, 0, "NONE", ""))
        wav.writeframes(bytes(48000))
    return stream.getvalue()


class LocalSpeech(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.patch = patch.dict(os.environ, BILAVOICE_ENABLE_F5="1",
                                BILAVOICE_ENABLE_LOCAL_SDK="1", BILAVOICE_CLIENT_TOKEN="test")
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.headers = {"X-BilaVoice-Token": "test"}
        self.sample = wav_bytes()

    def post(self, fields, sample=False):
        files = {"reference": ("sample.wav", self.sample, "audio/wav")} if sample else None
        return self.client.post("/api/tts", data={"text": "Xin chào", **fields},
                                headers=self.headers, files=files)

    @patch("server.app.vieneu_engine")
    def test_preset_and_legacy(self, engine):
        tts = engine.return_value
        tts.save.side_effect = lambda _, path: Path(path).write_bytes(self.sample)
        self.assertEqual(self.post({"engine": "vieneu-preset"}).content, self.sample)
        tts.infer.assert_called_once_with("Xin chào")
        self.assertEqual(self.post({"consent": "true"}, True).content, self.sample)
        self.assertTrue(tts.infer.call_args.kwargs["denoise"])

    @patch("server.app.f5.synthesize")
    def test_f5(self, synth):
        def render(text, reference, transcript, output):
            self.assertEqual(reference.read_bytes(), self.sample)
            self.assertEqual(transcript, "Giọng mẫu")
            output.write_bytes(self.sample)
        synth.side_effect = render
        self.assertEqual(self.post({"engine": "f5", "ref_text": "Giọng mẫu", "consent": "true"}, True).content, self.sample)
        self.assertFalse(synth.call_args.args[1].exists())
        self.assertFalse(synth.call_args.args[3].exists())

    def test_validation(self):
        self.assertEqual(self.post({"engine": "f5"}, True).status_code, 400)
        self.assertEqual(self.post({"engine": "vieneu"}, True).status_code, 403)
        self.assertEqual(self.post({"engine": "unknown"}).status_code, 400)
        with patch.dict(os.environ, BILAVOICE_ENABLE_F5="0"):
            self.assertEqual(self.post({"engine": "f5"}).status_code, 503)
        self.headers.clear()
        self.assertEqual(self.post({"engine": "vieneu-preset"}).status_code, 401)
