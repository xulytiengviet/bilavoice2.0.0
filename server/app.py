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

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from server import f5
from server.cloud import router as cloud_router, require_client_token
from starlette.background import BackgroundTask

ROOT = Path(__file__).resolve().parents[1]
MAX_UPLOAD = 10 * 1024 * 1024
app = FastAPI(title="BilaVoice local + Cloud VieNeu bridge", version="3.0.0", docs_url="/api/docs", redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://xulytiengviet.github.io",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-BilaVoice-Token"],
)
app.include_router(cloud_router)


@lru_cache(maxsize=1)
def vieneu_engine():
    try:
        from vieneu import Vieneu
        return Vieneu(mode="v3turbo")
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
    return {"status": "ready", "mode": "local", "model": "VieNeu SDK", "version": app.version,
            "enabled": {"vieneu": os.getenv("BILAVOICE_ENABLE_LOCAL_SDK") == "1",
                        "f5": os.getenv("BILAVOICE_ENABLE_F5") == "1"}}


@app.post("/api/tts")
def infer_tts(
    request: Request,
    text: str = Form(...),
    consent: bool = Form(False),
    reference: UploadFile | None = File(None),
    engine: str = Form("vieneu"),
    ref_text: str = Form(""),
):
    require_client_token(request)
    if engine not in ("vieneu", "vieneu-preset", "f5"):
        raise HTTPException(400, "Bộ đọc không hợp lệ.")
    flag = "BILAVOICE_ENABLE_F5" if engine == "f5" else "BILAVOICE_ENABLE_LOCAL_SDK"
    if os.getenv(flag) != "1":
        raise HTTPException(503, f"Bộ đọc đang tắt. Bật {flag}=1 trên máy chủ.")
    if not text.strip() or len(text) > 2000:
        raise HTTPException(400, "Văn bản đầu vào cần 1–2000 ký tự.")
    if engine == "f5" and not 1 <= len(ref_text.strip()) <= 1000:
        raise HTTPException(400, "F5 cần bản chép lời mẫu dài 1–1000 ký tự.")
    needs_sample = engine != "vieneu-preset"
    if needs_sample and reference is None:
        raise HTTPException(400, "Cần tệp WAV tham chiếu.")
    if needs_sample and not consent:
        raise HTTPException(403, "Cần quyền sử dụng mẫu giọng.")
    ref_path = persist_pcm_reference(reference) if needs_sample else None
    output_path = None
    try:
        fd, path = tempfile.mkstemp(prefix="bv-out-", suffix=".wav")
        os.close(fd)
        output_path = Path(path)
        if engine == "f5":
            f5.synthesize(text, ref_path, ref_text.strip(), output_path)
        else:
            tts = vieneu_engine()
            options = {"ref_audio": str(ref_path), "denoise": True} if needs_sample else {}
            speech = tts.infer(text, **options)
            tts.save(speech, str(output_path))
        if not output_path.exists() or output_path.stat().st_size < 44:
            raise RuntimeError("Bộ đọc không tạo WAV hợp lệ.")
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
        if ref_path:
            ref_path.unlink(missing_ok=True)


# Same-origin local app works at http://127.0.0.1:8000/ without CORS or leaked API keys.
# Do not expose to public interface without authentication and other controls.
@app.get("/", include_in_schema=False)
def web_home():
    return FileResponse(str(ROOT / "index.html"), media_type="text/html")

# Serve only public assets. Do not expose /server, .git, private config files.
for public_dir in ("assets", "src", "vendor"):
    app.mount(
        "/" + public_dir,
        StaticFiles(directory=str(ROOT / public_dir)),
        name="static-" + public_dir,
    )
