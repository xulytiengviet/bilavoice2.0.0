"""Run the Vietnamese F5 CLI in its own Python environment."""
import os
from pathlib import Path
import shutil
import subprocess

from fastapi import HTTPException


def synthesize(text: str, reference: Path, transcript: str, output: Path):
    cli = shutil.which(os.getenv("BILAVOICE_F5_CLI", "f5-tts_infer-cli"))
    checkpoint = Path(os.getenv("BILAVOICE_F5_CHECKPOINT", ""))
    vocab = Path(os.getenv("BILAVOICE_F5_VOCAB", ""))
    if not cli or not checkpoint.is_file() or not vocab.is_file():
        raise HTTPException(503, "Kiểm tra cấu hình F5 CLI, checkpoint ViVoice và vocab trên máy chủ.")
    try:
        subprocess.run([
            cli, "--model", "F5TTS_Base", "--vocoder_name", "vocos",
            "--ckpt_file", str(checkpoint.resolve()), "--vocab_file", str(vocab.resolve()),
            "--ref_audio", str(reference), "--ref_text=" + transcript,
            "--gen_text=" + text, "--output_dir", str(output.parent), "--output_file", output.name,
        ], check=True, timeout=300, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, "F5 vượt thời gian xử lý 5 phút.") from exc
