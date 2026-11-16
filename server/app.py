"""BilaVoice optional LOCAL VieNeu v3 Turbo TTS backend.
Run: python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
For a public deployment, add auth, rate limits, abuse prevention, and TLS *before* access.
"""
from __future__ import annotations

import os
import tempfile
import wave
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

ROOT = Path(__file__).resolve().parents[1]
MAX_UPLOAD = 10 * 1024 * 1024
app = FastAPI(title="BilaVoice Local VieNeu TTS", docs_url="/api/docs", redoc_url=None)


@lru_cache(maxsize=1)
def vieneu_engine():
    try:
        from vieneu import Vieneu
        return Vieneu()  # SDK default backend/model; select v3 in installed version.
    except Exception as exc:
        raise HTTPException(503, f"Không khởi tạo được VieNeu SDK: {type(exc).__name__}") from exc


def persist_pcm_reference(upload: UploadFile) -> Path:
    if Path(upload.filename or "").suffix.lower() != ".wav":
        raise HTTPException(415, "Chỉ nhận mẫu giọng WAV PCM.")
    data = upload.file.read(MAX_UPLOAD + 1)
    if not data or len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Tệp quá lớn hoặc rỗng; giới hạn 10 MB.")
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise HTTPException(415, "Tệp không phải WAV RIFF.")
    fd, path = tempfile.mkstemp(prefix="bv-ref-", suffix=".wav")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        with wave.open(path, "rb") as wav:
            if wav.getcomptype() != "NONE" or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
                raise HTTPException(415, "Mẫu phải là WAV PCM16 mono.")
            if not wav.getframerate():
                raise HTTPException(415, "Sample rate không hợp lệ.")
            duration = wav.getnframes() / wav.getframerate()
            if not (3 <= duration <= 8):
                raise HTTPException(400, f"Mẫu tham chiếu cần 3–8 giây; nhận {duration:.2f}s.")
        return Path(path)
    except Exception:
        Path(path).unlink(missing_ok=True)
        raise


@app.get("/api/health")
def health():
    return {"status": "ready", "mode": "local", "model": "VieNeu SDK"}


@app.post("/api/tts")
def infer_tts(
    text: str = Form(...),
    consent: bool = Form(False),
    reference: UploadFile = File(...),
):
    if not text.strip() or len(text) > 2000:
        raise HTTPException(400, "Văn bản đầu vào cần 1–2000 ký tự.")
    if not consent:
        raise HTTPException(403, "Cần quyền sử dụng mẫu giọng.")
    ref_path = persist_pcm_reference(reference)
    output_path = None
    try:
        fd, path = tempfile.mkstemp(prefix="bv-out-", suffix=".wav")
        os.close(fd)
        output_path = Path(path)
        tts = vieneu_engine()
        speech = tts.infer(text, ref_audio=str(ref_path), denoise=True)
        tts.save(speech, str(output_path))
        if not output_path.exists() or output_path.stat().st_size < 44:
            raise RuntimeError("VieNeu không tạo WAV hợp lệ.")
        return FileResponse(
            str(output_path),
            media_type="audio/wav",
            filename="bilavoice-cloned.wav",
            background=BackgroundTask(lambda: output_path.unlink(missing_ok=True))
        )
    except HTTPException:
        if output_path: output_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        if output_path: output_path.unlink(missing_ok=True)
        raise HTTPException(503, f"TTS lỗi: {type(exc).__name__}; xem log máy chủ.") from exc
    finally:
        ref_path.unlink(missing_ok=True)


# Same-origin local app works at http://127.0.0.1:8000/ without CORS or leaked API keys.
# Do not expose to public interface without authentication and other controls.
app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="static")
