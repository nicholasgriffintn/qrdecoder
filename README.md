# QR Decoder

A tiny progressive web app for decoding `otpauth://` QR codes completely in the browser. Drop an image, paste a URI, or scan with your device camera to inspect the secret and generate HOTP/TOTP codes locally.

- Works offline after the first load
- Drag & drop images or upload
- Paste otpauth URIs directly
- Decodes using the browser's built-in `BarcodeDetector` API for privacy and speed
- Camera capture for quick scanning on supported devices
- Blur/reveal toggles for secrets and codes
- Copy the secret, otpauth URI, and current OTP code to your clipboard

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
