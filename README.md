# BilaVoice 3.0.0 · Voice ↔ CVNSS4.0

**Tiếng Việt | Open research prototype | Long Ngo | November 2026**

Phòng thí nghiệm hai chiều trên GitHub Pages: **giọng nói → STT → Unicode → CVNSS4.0 → Base27/3 trit**, đồng thời **CVNSS4.0 → Unicode → TTS → giọng đọc**. Kiến trúc kế thừa mã kiểm toán của [Kiến Trúc Vòng](https://github.com/xulytiengviet/kientrucvong) và tích hợp tùy chọn [VieNeu voice cloning](https://docs.vieneu.io/vi/docs/sdk/voice-cloning/) trên backend cục bộ.

**Xem trang khi GitHub Pages đã được kích hoạt:** https://xulytiengviet.github.io/bilavoice2.0.0/

## Phiên bản 3.0.0

Trong **Studio → Chọn bộ đọc**, VieNeu v3 Turbo có thể đọc bằng giọng mặc định hoặc theo mẫu. F5-ViVoice đọc theo mẫu WAV PCM16 mono 3–8 giây kèm bản chép lời. Điền URL backend và token dùng chung trước khi bấm **Tạo giọng cục bộ**. Trên Pages, giọng trình duyệt hoạt động độc lập với máy chủ Python.

| Giá trị `engine` gửi tới `POST /api/tts` | Dữ liệu ngoài `text` | Công tắc trên backend |
|---|---|---|
| `vieneu-preset` | Không cần mẫu | `BILAVOICE_ENABLE_LOCAL_SDK=1` |
| `vieneu` (mặc định cho client 2.x) | `reference`, `consent=true` | `BILAVOICE_ENABLE_LOCAL_SDK=1` |
| `f5` | `reference`, `ref_text`, `consent=true` | `BILAVOICE_ENABLE_F5=1` |

API nhận multipart/form-data, xác thực bằng header `X-BilaVoice-Token`, trả WAV. Cả hai bộ đọc nhận văn bản Unicode đã giải mã. Xem [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) và [trọng số v3 Turbo, Apache-2.0](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo).

### Cấu hình F5-ViVoice trên Windows

1. Chạy backend theo hướng dẫn Cloud bên dưới với `requirements-cloud.txt` và `BILAVOICE_CLIENT_TOKEN`. Riêng đường F5 không cần khóa VieNeu.
2. Trong môi trường Python 3.10 riêng, cài PyTorch phù hợp phần cứng, FFmpeg, SoX và bản fork [F5-TTS-Vietnamese](https://github.com/nguyenthienhy/F5-TTS-Vietnamese) theo hướng dẫn của tác giả. Xác nhận lệnh `f5-tts_infer-cli --help` hoạt động. CLI chạy tiến trình riêng cho mỗi yêu cầu và nạp lại trọng số.
3. Tải `model_last.pt` và `config.json` từ [hynt/F5-TTS-Vietnamese-ViVoice](https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice). Theo hướng dẫn của tác giả, lưu bản sao của `config.json` thành `vocab.txt`. Trọng số dùng cho nghiên cứu phi thương mại theo CC BY-NC-SA 4.0.
4. Trong PowerShell của backend, thay đường dẫn ví dụ bằng vị trí thực tế rồi khởi động lại backend:

```powershell
$env:BILAVOICE_ENABLE_F5 = '1'
$env:BILAVOICE_F5_CLI = 'C:/tts/f5-env/Scripts/f5-tts_infer-cli.exe'
$env:BILAVOICE_F5_CHECKPOINT = 'C:/tts/ViVoice/model_last.pt'
$env:BILAVOICE_F5_VOCAB = 'C:/tts/ViVoice/vocab.txt'
.\.venv\Scripts\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Lần chạy đầu cần tải thêm Vocos nếu máy chưa có cache. Để thử hai bộ đọc trên cùng một giọng, dùng cùng WAV, văn bản đích và bản chép lời chính xác cho F5.

## Chạy thử tại trình duyệt

1. Truy cập URL Pages (hoặc chạy \`python -m http.server 8000\` rồi mở http://localhost:8000).
2. Nhập câu tiếng Việt và bấm **Mã hóa**, hoặc thử **Bắt đầu nói** (chỉ hoạt động trên trình duyệt có Web Speech Recognition).
3. Xem mã CVNSS4.0, 3 trit mỗi ký hiệu Base27, vector góc trên 108 trạng thái và cảnh báo khi bộ giải mã canonical có nhiều ứng viên.
4. Chọn **CVNSS → Unicode**; bấm **Đọc bằng TTS** để dùng giọng được hỗ trợ bởi trình duyệt. Đây **không phải** nhân bản giọng.
5. Tại phần **27-FSK**, chọn **Tạo WAV tín hiệu** rồi **Giải mã & CRC** để thử kênh truyền dữ liệu số. Đây là âm tần chuyên chở ký hiệu, **không phải tiếng Việt được nói**.

Trang tĩnh không cần Node/npm hay Python để chạy. Bộ kiểm thử dùng Node.js >=18.

## Kiến trúc khoa học

\`\`\`text
Voice WAV / microphone ───> Web Speech ASR ───> Vietnamese Unicode
                                   |                    |
                                   v                    v
                           uncertain transcript  CVNSS4.0 v5
                                                        |
                            reversible UTF-8 envelope in Base27
                                                        |
                                     3 trits/char ↔ vectors/Ring-108
                                                        |
                      27-FSK / Goertzel / CRC16 (DATA channel only)

CVNSS4.0 ──> canonical Unicode ──> Browser speechSynthesis ──> Spoken voice
                                   ├──> F5-ViVoice + reference transcript ──> Cloned voice
                                   └──> VieNeu SDK with 3–8s reference ──> Cloned voice
\`\`\`

- **CVNSS4.0 v5:** converter audit-safe with 56 ambiguity groups and explicit canonical policy. It can be **many-to-one**. Hence \`decodeCVNSS(encodeCVNSS(t)) = t\` is not a universal identity.
- **Base27 envelope:** v1 prefix \`VR\`, length (4 Base27 digits), and two Base27 characters per UTF-8 byte \`b\`. Mapping \`b ↦ (b mod 27, floor(b/27))\` is invertible for 0..255. Payload cap 896 UTF-8 bytes; complete envelope at most 1798 characters, fitting in the 1800-symbol 27-FSK payload. The original 27-FSK encoder adds its own preamble, framing, and CRC-16.
- **Ring-108:** \`Z108 ≅ Z4 × Z27\` with 2 bits and 3 balanced trits; polar drawing is a *symbolic* visualization, NOT a phoneme model, a speaker embedding, a neural vocoder, or a guarantee about STT/TTS.
- **27-FSK:** 24 kHz mono, 100ms per symbol, frequencies 600 to 2680Hz in 80Hz steps, Goertzel decoder aligned to symbol boundaries. Only deterministic digital loopback is claimed. Browser limits FSK demonstration to 45 seconds to avoid excessive memory/time.
- **Web Speech STT:** Chrome/Edge availability depends on runtime and platform and may require a remote recognition service. Do not assume microphone audio stays on device.
- **Browser TTS:** \`speechSynthesis\` and system voices. Does not support training/cloning a speaker identity.

### Voice cloning: 3–8 seconds means *reference duration*

VieNeu v3 supports zero-shot reference-voice conditioning. Sample 3–8 seconds of a single speaker, typically without transcription/fine-tuning. This is **not** an end-to-end cloning-latency guarantee, and output fidelity is not universally proven. v3 Turbo can use \`tts.infer(text, ref_audio="my_voice.wav", denoise=True)\`; read current SDK docs for model and runtime requirements.

## VieNeu integration: Cloud v4 + local SDK

Public endpoint references (safe to put in HTML):

- **MCP agent endpoint**: `https://api.vieneu.io/mcp` — Streamable HTTP/OAuth for AI assistants; NOT a plain speech-generating API, and NOT the BilaVoice proxy endpoint.
- **Cloud TTS REST API**: `https://api.vieneu.io/api/v1/audio/speech` — accepts `POST` with `input`, `model: vieneu-v4`, optional `voice`, and returns MP3 bytes.
- **BilaVoice backend**: `/api/cloud/voices` and `/api/cloud/tts` (proxy) — keeps your VieNeu credential server-side and requires a separate `BILAVOICE_CLIENT_TOKEN`.
- **Local SDK**: `/api/tts` — for preset or 3–8 second reference WAV; only enabled when `BILAVOICE_ENABLE_LOCAL_SDK=1` and also requires the proxy client token.

VieNeu Cloud v4 clones are **enrolled in VieNeu Studio** (https://vieneu.io/#/clone) first, then appear under `GET /api/v1/voices` with `kind: cloned`. Uploading reference WAV directly to Cloud REST/MCP is not supported by the current API. By contrast, the local SDK v3 can generate from a 3–8s WAV directly. Cloud v3 was retired in September 2026 and must not be requested via REST.

### Run the Cloud proxy on Windows (no GPU or VieNeu model download)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server\requirements-cloud.txt
# Set VIENEU_API_KEY in the *server environment*, not HTML or GitHub:
$secure = Read-Host 'VieNeu API key' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:VIENEU_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$env:BILAVOICE_CLIENT_TOKEN = node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
# Copy the printed output locally into the website's 'BilaVoice backend token' field:
Write-Host $env:BILAVOICE_CLIENT_TOKEN
.\.venv\Scripts\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/ and use `http://127.0.0.1:8000` for the proxy URL. Paste **BILAVOICE_CLIENT_TOKEN** (not **VIENEU_API_KEY**) into the separate web form field. Click **Tải danh sách giọng Cloud**, select a voice, then generate. The browser never receives the VieNeu key. The proxy limits requests to 5/min per seen IP in-process and Cloud demo inputs to 100 words; these limits are only safeguards for a single-user demo.

### Run optional local VieNeu SDK (WAV cloning)

```powershell
.\.venv\Scripts\python.exe -m pip install -r server\requirements.txt
$env:BILAVOICE_ENABLE_LOCAL_SDK = '1'
# Keep BILAVOICE_CLIENT_TOKEN from above, or set it again securely in this terminal.
.\.venv\Scripts\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Choose a mono PCM16 WAV of 3–8 seconds with speaker consent, enter the same proxy URL and backend client token, and press **Tạo giọng cục bộ**. This is the SDK v3 pathway, NOT Cloud v4.

### Deployment to GitHub Pages

GitHub Pages is static and has no secret store for browser JS. The website can show **public** VieNeu URL strings, but cannot embed the `vn_test_...` or `vn_sk_...` key. A test key still consumes account tokens and enforces only a 100-word cap. Rotate any already shared key in VieNeu Developer settings and use a fresh key in the backend environment.

For the public site, deploy a separate HTTPS proxy and enter its URL in the **BilaVoice backend** input. Configure allowed CORS origins to include the GitHub Pages origin. The included `BILAVOICE_CLIENT_TOKEN` is a shared-demo access gate, **not sufficient public multi-user authentication**: put real user authentication, shared rate limiting, spending limits, audit logging without keys/audio, TLS, and abuse controls in front of the service. Do not expose the local backend to the Internet unchanged.
## GitHub Pages

\`.github/workflows/pages.yml\` runs \`npm test\` and \`node --check assets/app.js\`, then deploys the root static site. It attempts to enable Pages automatically.

If this workflow reports a Pages setup error, visit your own repository **Settings → Pages → Build and deployment → Source: GitHub Actions** and rerun the workflow in **Actions**. You only need to configure this once. Expected public URL (once deployed): https://xulytiengviet.github.io/bilavoice2.0.0/

## Validation and metrics

\`\`\`bash
npm test
npm run check
\`\`\`

Tested claims: 108-state CRT, Base27 ↔ 3 balanced trits, byte-exact transport envelope, zero-noise symbol→27-FSK→symbol, CRC error rejection, and converter self-test.

Not yet empirically established: practical microphone ASR word/character error rate and Vietnamese tone accuracy; VieNeu cloning mean opinion score, speaker similarity or real-time factor; cross-device FSK synchronization and robustness to recording noise. These require controlled datasets, participant consent, hardware profiles, confidence intervals and independent baselines.

## Files

- \`index.html\`, \`assets/style.css\`, \`assets/app.js\` — complete static UI and Web Speech/VieNeu client
- \`src/core.js\`, \`src/audio.js\` — Ring-108 and 27-FSK data channel (from Kiến Trúc Vòng)
- \`src/voice-bridge.js\` — CVNSS Unicode/Base27 UTF-8 envelope
- \`vendor/cvnss4_0_converter.v5.js\` — upstream audit-safe converter reused intact
- \`server/app.py\` — opt-in local VieNeu TTS backend (not deployed to Pages)
- \`tests/*.test.js\` — reproducible algebra and transport tests
- \`.github/workflows/pages.yml\` — CI validation and static site deployment

**License:** MIT for code authored or previously MIT-licensed in this project. Respect the original converter and VieNeu model/SDK licenses and the rights of the source speaker. No sample voice or user data is bundled.
