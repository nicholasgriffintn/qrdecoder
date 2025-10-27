# QR Decoder

A progressive web app that decodes QR codes directly in your browser. Drop an image, paste the payload, or scan with your device camera to inspect the contents. When the QR encodes an `otpauth://` URI the app exposes HOTP/TOTP metadata and generates fresh codes locally—otherwise it surfaces a readable summary with the raw payload right beside it.

- Works offline after the first load
- Drag & drop images or upload
- Paste QR payloads directly
- Recognises common formats (`otpauth://`, Wi-Fi configs, URLs, contacts, calendar events, geo links, mailto/SMS intents) and falls back to plain-text presentation for everything else
- Decodes using the browser's built-in `BarcodeDetector` API when available, with an automatic [`jsQR`](https://github.com/cozmo/jsQR) fallback for other browsers
- Camera capture for quick scanning on supported devices
- Blur/reveal toggles for OTP secrets and codes, plus copy helpers for all payloads

## Getting Started

You can try the app online at [qr-decoder.app](https://qr-decoder.app).

To run locally:

```bash
pnpm install
pnpm run dev
```

Then open the printed local URL (default http://127.0.0.1:8787) in your browser. The app registers itself as a PWA, so you can "Install" it from the browser menu for an app-like experience.

To build or deploy to Cloudflare Workers:

```bash
pnpm run deploy
```
