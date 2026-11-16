"""VieNeu Cloud v4 adapter for BilaVoice, separate from local v3 SDK.
Never expose VIENEU_API_KEY in HTML/JavaScript, logs, or Git.
The MCP endpoint is for agent clients, not for direct /api/tts uploads.
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import time
from collections import defaultdict, deque
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/cloud", tags=["VieNeu Cloud"])
CLOUD = "https://api.vieneu.io/api/v1"
MAX_AUDIO_BYTES = 15 * 1024 * 1024
MAX_VOICES_BYTES = 512 * 1024
_window = defaultdict(deque)


class SpeechInput(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    voice: str = Field(default="", max_length=120)


def require_client_token(request: Request):
    access = os.environ.get("BILAVOICE_CLIENT_TOKEN", "").strip()
    if not access:
        raise HTTPException(503, "Backend chưa thiết lập BILAVOICE_CLIENT_TOKEN.")
    token = request.headers.get("X-BilaVoice-Token", "")
    if not secrets.compare_digest(token, access):
        raise HTTPException(401, "Thiếu token truy cập BilaVoice backend.")


def require_access(request: Request):
    require_client_token(request)
    key = os.environ.get("VIENEU_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Cloud backend chưa có VIENEU_API_KEY.")
    # Demonstration-level limit only. Use shared rate limits + real auth in production.
    now = time.monotonic()
    window = _window[request.client.host if request.client else "unknown"]
    while window and window[0] < now - 60:
        window.popleft()
    if len(window) >= 5:
        raise HTTPException(429, "Giới hạn thử nghiệm: tối đa 5 yêu cầu/phút.")
    window.append(now)
    return key

def _call_vieneu(path: str, api_key: str, body: dict | None, max_size: int):
    headers = {"X-API-Key": api_key, "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = UrlRequest(
        CLOUD + path,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None,
        headers=headers,
        method="POST" if body is not None else "GET",
    )
    try:
        with urlopen(req, timeout=100) as resp:
            content = resp.read(max_size + 1)
            if len(content) > max_size:
                raise HTTPException(502, "Phản hồi vượt giới hạn dung lượng của demo.")
            return content, resp.headers.get("Content-Type", "application/octet-stream")
    except HTTPError as err:
        # Never echo upstream response fields that might include request data.
        if err.code in (400, 401, 403, 404, 429):
            raise HTTPException(err.code, f"VieNeu API trả mã HTTP {err.code}. Kiểm tra key, voiceId, hạn mức hoặc nội dung.")
        raise HTTPException(502, f"VieNeu API lỗi HTTP {err.code}.")
    except (URLError, TimeoutError) as err:
        raise HTTPException(502, "Không kết nối được VieNeu API.") from err


@router.get("/health")
def health():
    return {
        "provider": "VieNeu",
        "cloud_engine": "v4",
        "mcp_url": "https://api.vieneu.io/mcp",
        "api_base_url": CLOUD,
        "configured": bool(os.environ.get("VIENEU_API_KEY") and os.environ.get("BILAVOICE_CLIENT_TOKEN")),
    }


@router.get("/voices")
async def list_voices(request: Request):
    key = require_access(request)
    raw, _ = await asyncio.to_thread(_call_vieneu, "/voices?engine=v4", key, None, MAX_VOICES_BYTES)
    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(502, "VieNeu trả dữ liệu danh sách giọng không hợp lệ.") from exc
    return {"voices": [
        {"id": str(v.get("id", "")), "name": str(v.get("name", v.get("id", ""))),
         "kind": str(v.get("kind", "catalog"))}
        for v in data.get("voices", []) if isinstance(v, dict) and v.get("id")
    ][:150]}


@router.post("/tts")
async def synthesize_cloud(payload: SpeechInput, request: Request):
    key = require_access(request)
    text = payload.text.strip()
    if len(text.split()) > 100:
        raise HTTPException(400, "Để phù hợp vn_test_, demo giới hạn 100 từ/lần.")
    data = {"model": "vieneu-v4", "input": text, "response_format": "mp3"}
    if payload.voice.strip():
        data["voice"] = payload.voice.strip()
    raw, content_type = await asyncio.to_thread(
        _call_vieneu, "/audio/speech", key, data, MAX_AUDIO_BYTES
    )
    if not raw or not (content_type.startswith("audio/") or raw.startswith(b"ID3") or raw[:1] == b"\xff"):
        raise HTTPException(502, "VieNeu không trả tệp âm thanh hợp lệ.")
    return Response(content=raw, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
