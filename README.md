# BilaVoice 2.0.0 · Voice ↔ CVNSS4.0

**Tiếng Việt | Open research prototype | Long Ngo | November 2026**

Phòng thí nghiệm hai chiều trên GitHub Pages: **giọng nói → STT → Unicode → CVNSS4.0 → Base27/3 trit**, đồng thời **CVNSS4.0 → Unicode → TTS → giọng đọc**. Kiến trúc kế thừa mã kiểm toán của [Kiến Trúc Vòng](https://github.com/xulytiengviet/kientrucvong) và tích hợp tùy chọn [VieNeu voice cloning](https://docs.vieneu.io/vi/docs/sdk/voice-cloning/) trên backend cục bộ.

**Xem trang khi GitHub Pages đã được kích hoạt:** https://xulytiengviet.github.io/bilavoice2.0.0/

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

## Optional local VieNeu server

**GitHub Pages is static: it cannot execute Python models, safely hold API keys, or serve a native VieNeu voice-cloning engine.** This repository includes an *optional* FastAPI server; it must be run on a separate computer or private server with the model installed. Recommended local-only usage:

\`\`\`bash
python -m venv .venv
# Windows CMD: .venv\Scripts\activate.bat
# PowerShell: .venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate
pip install -r server/requirements.txt
python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
\`\`\`

Open **http://127.0.0.1:8000/** (same-origin frontend/backend), set the backend field to \`http://127.0.0.1:8000\`, and select a mono PCM16 WAV clip of 3–8 seconds. Check consent and click **Tạo giọng bằng VieNeu**. SDK/model artifacts may download on the first run; hardware capabilities and speed depend on available backend. The local application does not persist voice reference files or completed output files after successful delivery, but runtime caching and external system logs must be reviewed separately.

The example FastAPI server is deliberately **local-only**, has **no user authentication** and **no rate limiting**. Never expose it directly to the Internet. To integrate public GitHub Pages with a remote endpoint, deploy a **separately protected HTTPS backend**, explicit CORS policy, authentication/session protection, request limits, secure retention/deletion controls, and misuse prevention. Do not paste secrets into the browser URL.

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
