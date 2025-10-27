const $ = (id) => document.getElementById(id);
const img = $('preview');
const fileInput = $('file');
const dropZone = $('drop');
const parseButton = $('parse');
const uriInput = $('uri');
const copySecretBtn = $('copy-secret');
const copyUriBtn = $('copy-uri');
const copyCodeBtn = $('copy-code');
const uploadRow = $('upload-row');
const supportWarning = $('support-warning');
const bdNote = $('bd-note');
const openCameraBtn = $('open-camera');
const cameraModal = $('camera-modal');
const cameraVideo = $('camera-video');
const cameraCaptureBtn = $('camera-capture');
const cameraCloseBtn = $('camera-close');
const cameraCancelBtn = $('camera-cancel');
const cameraPermission = $('camera-permission');
const previewGroup = $('preview-group');
const previewContainer = $('preview-container');
const previewOverlay = $('preview-overlay');
const revealPreviewBtn = $('reveal-preview');
const secretValueEl = $('secret');
const revealSecretBtn = $('reveal');
const codeEl = $('code');
const codeOverlay = $('code-overlay');
const revealCodeBtn = $('reveal-code');
const countdownEl = $('countdown');
const toast = $('toast');

let parsed = null;
let showSecret = false;
let timer = null;
let currentObjectUrl = null;
let fileUploadEnabled = true;
let showPreview = false;
let showCode = false;
let currentCode = '';
let lastHighlightedCode = '';
let toastTimer = null;
let toastHideTimer = null;
let cameraStream = null;
let cameraModalVisible = false;
let barcodeDetectorAvailable = false;
let fallbackDecoderPromise = null;
let cameraScanActive = false;
let cameraScanRequestId = null;
let cameraScanPending = false;
let cameraScanCanvas = null;
let cameraScanContext = null;
let lastCameraScanTs = 0;
let lastCameraScanValue = '';
let lastCameraScanResetTimer = null;

const FALLBACK_DECODER_URL = '/vendor/jsqr@1.4.0.js';

function loadFallbackDecoder() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (fallbackDecoderPromise) return fallbackDecoderPromise;
  fallbackDecoderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[data-decoder="${FALLBACK_DECODER_URL}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.jsQR) resolve(window.jsQR);
        else reject(new Error('QR fallback failed to load'));
      });
      existing.addEventListener('error', () =>
        reject(new Error('QR fallback failed to load'))
      );
      return;
    }
    const script = document.createElement('script');
    script.src = FALLBACK_DECODER_URL;
    script.async = true;
    script.setAttribute('data-decoder', FALLBACK_DECODER_URL);
    script.onload = () => {
      if (window.jsQR) resolve(window.jsQR);
      else reject(new Error('QR fallback failed to load'));
    };
    script.onerror = () => reject(new Error('QR fallback failed to load'));
    document.head.appendChild(script);
  }).catch((error) => {
    fallbackDecoderPromise = null;
    throw error;
  });
  return fallbackDecoderPromise;
}

function showToast(message, duration = 2200) {
  if (!toast || !message) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  // force reflow so transition retriggers
  void toast.offsetWidth;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => toast.classList.add('hidden'), 200);
  }, duration);
}

function setStatus(message) {
  showToast(message, 2600);
}

function note(message) {
  showToast(message, 1800);
}

function setButtonCallout(button, active) {
  if (!button) return;
  button.classList.toggle('btn-callout', !!active);
}

function updateCameraAvailability() {
  if (!openCameraBtn) return;
  const cameraSupported = !!(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );
  const enabled = cameraSupported && fileUploadEnabled;
  const container = openCameraBtn.parentElement;
  if (container) container.classList.toggle('hidden', !enabled);
  openCameraBtn.disabled = !enabled;
}

function showCameraModal() {
  if (!cameraModal || cameraModalVisible) return;
  cameraModal.classList.remove('hidden');
  requestAnimationFrame(() => cameraModal.classList.add('is-visible'));
  cameraModalVisible = true;
}

function hideCameraModal({ returnFocus } = {}) {
  if (!cameraModal || !cameraModalVisible) return;
  cameraModal.classList.remove('is-visible');
  setTimeout(() => cameraModal?.classList.add('hidden'), 180);
  cameraModalVisible = false;
  cameraPermission?.classList.add('hidden');
  stopCameraStream();
  if (returnFocus) openCameraBtn?.focus();
}

function stopCameraStream() {
  stopCameraScan();
  if (!cameraStream) return;
  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  if (cameraVideo) cameraVideo.srcObject = null;
}

function stopCameraScan() {
  cameraScanActive = false;
  if (cameraScanRequestId) {
    cancelAnimationFrame(cameraScanRequestId);
    cameraScanRequestId = null;
  }
  cameraScanPending = false;
  lastCameraScanValue = '';
  clearTimeout(lastCameraScanResetTimer);
  lastCameraScanResetTimer = null;
}

function ensureCameraCanvas() {
  if (cameraScanCanvas && cameraScanContext) return;
  cameraScanCanvas = document.createElement('canvas');
  cameraScanContext = cameraScanCanvas.getContext('2d', {
    willReadFrequently: true,
  });
}

function startCameraScan() {
  if (!cameraVideo || !cameraStream) return;
  ensureCameraCanvas();
  if (!cameraScanCanvas || !cameraScanContext) {
    setStatus('Unable to start camera scanner');
    return;
  }

  cameraScanActive = true;
  cameraScanPending = false;
  lastCameraScanTs = 0;
  lastCameraScanValue = '';
  clearTimeout(lastCameraScanResetTimer);
  lastCameraScanResetTimer = null;

  const loop = () => {
    if (!cameraScanActive) return;
    cameraScanRequestId = requestAnimationFrame(loop);
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) return;

    const now = performance.now();
    if (cameraScanPending || now - lastCameraScanTs < 260) return;
    lastCameraScanTs = now;
    cameraScanPending = true;

    cameraScanCanvas.width = cameraVideo.videoWidth;
    cameraScanCanvas.height = cameraVideo.videoHeight;
    cameraScanContext.drawImage(
      cameraVideo,
      0,
      0,
      cameraScanCanvas.width,
      cameraScanCanvas.height
    );

    decodeQRFromCanvas(cameraScanCanvas, cameraScanContext, { strict: false })
      .then((text) => {
        if (!text) return;
        if (text === lastCameraScanValue) return;
        lastCameraScanValue = text;
        clearTimeout(lastCameraScanResetTimer);
        lastCameraScanResetTimer = setTimeout(() => {
          lastCameraScanValue = '';
          lastCameraScanResetTimer = null;
        }, 2200);
        const handled = handleDecodedOtp(text, {
          message: 'QR scanned ✔',
          previewCanvas: cameraScanCanvas,
        });
        if (handled) {
          stopCameraScan();
          hideCameraModal();
        }
      })
      .catch(() => {})
      .finally(() => {
        cameraScanPending = false;
      });
  };

  if (cameraScanRequestId) {
    cancelAnimationFrame(cameraScanRequestId);
  }
  cameraScanRequestId = requestAnimationFrame(loop);
  setStatus('Aim your QR code at the camera to scan');
}

async function openCamera() {
  if (!openCameraBtn) return;
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    setStatus('Camera not supported in this browser');
    return;
  }
  try {
    cameraPermission?.classList.remove('hidden');
    showCameraModal();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    cameraStream = stream;
    if (cameraVideo) {
      cameraVideo.srcObject = stream;
      await cameraVideo.play().catch(() => {});
      if (cameraVideo.readyState >= 2) {
        cameraPermission?.classList.add('hidden');
        startCameraScan();
      } else {
        cameraVideo.addEventListener(
          'loadeddata',
          () => {
            cameraPermission?.classList.add('hidden');
            startCameraScan();
          },
          { once: true }
        );
      }
    }
  } catch (err) {
    hideCameraModal({ returnFocus: true });
    stopCameraStream();
    setStatus('Unable to access camera');
  }
}

async function captureFromCamera() {
  if (!cameraVideo || !cameraStream) {
    setStatus('Camera is not ready');
    return;
  }
  stopCameraScan();
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    setStatus('Camera is warming up');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) {
    setStatus('Unable to capture frame');
    return;
  }
  ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(
    async (blob) => {
      if (!blob) {
        setStatus('Failed to capture image');
        return;
      }
      const file = new File([blob], 'camera-capture.png', {
        type: blob.type || 'image/png',
      });
      await handleFile(file);
      hideCameraModal({ returnFocus: true });
    },
    'image/png',
    0.92
  );
}

function updatePreviewVisibility() {
  if (!previewContainer || !img) return;
  const hasImage = !!img.getAttribute('src');
  if (!hasImage) {
    img.style.display = 'none';
    img.classList.remove('is-blurred');
    previewOverlay?.classList.add('hidden');
    previewOverlay?.setAttribute('aria-hidden', 'true');
    revealPreviewBtn?.classList.add('hidden');
    setButtonCallout(revealPreviewBtn, false);
    if (revealPreviewBtn) {
      revealPreviewBtn.textContent = 'Reveal QR preview';
      revealPreviewBtn.setAttribute('aria-pressed', 'false');
    }
    return;
  }

  img.style.display = 'block';
  if (!fileUploadEnabled) {
    img.classList.remove('is-blurred');
    previewOverlay?.classList.add('hidden');
    previewOverlay?.setAttribute('aria-hidden', 'true');
    revealPreviewBtn?.classList.add('hidden');
    setButtonCallout(revealPreviewBtn, false);
    if (revealPreviewBtn) {
      revealPreviewBtn.textContent = 'Reveal QR preview';
      revealPreviewBtn.setAttribute('aria-pressed', 'false');
    }
    return;
  }

  revealPreviewBtn?.classList.remove('hidden');
  const hidden = !showPreview;
  img.classList.toggle('is-blurred', hidden);
  previewOverlay?.classList.toggle('hidden', !hidden);
  previewOverlay?.setAttribute('aria-hidden', hidden ? 'false' : 'true');
  if (revealPreviewBtn) {
    revealPreviewBtn.textContent = hidden
      ? 'Reveal QR preview'
      : 'Hide QR preview';
    revealPreviewBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    setButtonCallout(revealPreviewBtn, hidden);
  }
}

function updateCodeVisibility(options = {}) {
  const { updateText = true } = options;
  if (!codeEl) return;

  if (!parsed || !currentCode) {
    if (updateText) {
      codeEl.textContent = parsed ? '———' : '— — — — — —';
    }
    codeEl.classList.remove('is-blurred');
    codeOverlay?.classList.add('hidden');
    codeOverlay?.setAttribute('aria-hidden', 'true');
    revealCodeBtn?.classList.add('hidden');
    if (revealCodeBtn) {
      revealCodeBtn.textContent = 'Reveal code';
      revealCodeBtn.setAttribute('aria-pressed', 'false');
    }
    setButtonCallout(revealCodeBtn, false);
    setButtonCallout(copyCodeBtn, false);
    if (copyCodeBtn) copyCodeBtn.disabled = true;
    lastHighlightedCode = '';
    codeEl.setAttribute('aria-live', 'off');
    return;
  }

  revealCodeBtn?.classList.remove('hidden');
  const hidden = !showCode;
  if (updateText) {
    const hiddenValue =
      currentCode && currentCode.length
        ? '•'.repeat(currentCode.length)
        : '———';
    codeEl.textContent = hidden ? hiddenValue : currentCode;
  }
  codeEl.classList.toggle('is-blurred', hidden);
  codeOverlay?.classList.toggle('hidden', !hidden);
  codeOverlay?.setAttribute('aria-hidden', hidden ? 'false' : 'true');
  if (revealCodeBtn) {
    revealCodeBtn.textContent = hidden ? 'Reveal code' : 'Hide code';
    revealCodeBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    setButtonCallout(revealCodeBtn, hidden);
  }
  codeEl.setAttribute(
    'aria-live',
    !hidden && parsed?.type === 'TOTP' ? 'polite' : 'off'
  );

  if (copyCodeBtn) {
    copyCodeBtn.disabled = !currentCode;
    if (updateText && currentCode && currentCode !== lastHighlightedCode) {
      setButtonCallout(copyCodeBtn, true);
      lastHighlightedCode = currentCode;
    }
  }
}

(async function initSupport() {
  let hasBD = false;
  if ('BarcodeDetector' in window) {
    try {
      if (typeof BarcodeDetector.getSupportedFormats === 'function') {
        const formats = await BarcodeDetector.getSupportedFormats();
        hasBD = formats.includes('qr_code');
      } else {
        hasBD = true;
      }
    } catch {
      hasBD = true;
    }
  }

  barcodeDetectorAvailable = hasBD;
  fileUploadEnabled = true;

  if (bdNote) {
    bdNote.textContent = '(or drag & drop)';
  }

  fileInput.disabled = false;
  fileInput.removeAttribute('tabindex');
  dropZone?.classList.remove('drop-disabled');
  dropZone?.removeAttribute('aria-disabled');
  uploadRow?.classList.remove('hidden');
  previewContainer?.classList.remove('hidden');
  previewGroup?.classList.remove('hidden');

  if (supportWarning && !hasBD) {
    supportWarning.textContent =
      'BarcodeDetector is unavailable. Falling back to an embedded decoder — scans may take a little longer.';
    supportWarning.classList.toggle('hidden', hasBD);
  }

  updateCameraAvailability();

  setStatus('Drop a QR, scan with camera, or paste a URI to begin!');

  updatePreviewVisibility();
  updateCodeVisibility();
})();

async function decodeQRFromCanvas(canvas, ctx, { strict = true } = {}) {
  if (!canvas || !ctx) {
    throw new Error('Unable to prepare image for decoding');
  }

  if (barcodeDetectorAvailable && 'BarcodeDetector' in window) {
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const barcodes = await detector.detect(canvas);
      if (barcodes.length && barcodes[0]?.rawValue) {
        return barcodes[0].rawValue;
      }
    } catch (err) {
      console.warn('BarcodeDetector failed, falling back to jsQR.', err);
    }
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const jsQR = await loadFallbackDecoder();
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  if (!result || !result.data) {
    if (!strict) return null;
    throw new Error('No QR code found');
  }
  return result.data;
}

async function decodeQRFromImage(imgBlob) {
  const bitmap = await createImageBitmap(await imgBlob);
  const cnv = document.createElement('canvas');
  cnv.width = bitmap.width;
  cnv.height = bitmap.height;
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to prepare image for decoding');
  ctx.drawImage(bitmap, 0, 0);
  return decodeQRFromCanvas(cnv, ctx, { strict: true });
}

function parseOtpAuth(uri) {
  try {
    const u = new URL(uri);
    if (u.protocol !== 'otpauth:') throw new Error('Not an otpauth:// URI');
    const type = u.hostname.toUpperCase();
    if (!['TOTP', 'HOTP'].includes(type)) {
      throw new Error(`Unsupported OTP type: ${type || 'unknown'}`);
    }
    const label = decodeURIComponent(u.pathname.replace(/^\//, ''));
    const issuer = u.searchParams.get('issuer') || '';
    const secretB32 = (u.searchParams.get('secret') || '')
      .replace(/\s+/g, '')
      .toUpperCase();
    if (!secretB32) throw new Error('Missing secret');

    const algo = (u.searchParams.get('algorithm') || 'SHA1').toUpperCase();
    if (!['SHA1', 'SHA256', 'SHA512'].includes(algo)) {
      throw new Error(`Unsupported algorithm: ${algo}`);
    }

    const digits = Number.parseInt(u.searchParams.get('digits') || '6', 10);
    if (!Number.isInteger(digits) || digits < 4 || digits > 10) {
      throw new Error('Digits must be an integer between 4 and 10');
    }

    let period = null;
    let counter = null;

    if (type === 'TOTP') {
      period = Number.parseInt(u.searchParams.get('period') || '30', 10);
      if (!Number.isInteger(period) || period <= 0 || period > 86400) {
        throw new Error('Period must be a positive integer less than 86400');
      }
    } else {
      counter = Number.parseInt(u.searchParams.get('counter') || '0', 10);
      if (!Number.isInteger(counter) || counter < 0) {
        throw new Error('Counter must be a non-negative integer');
      }
    }

    return {
      type,
      label,
      issuer,
      secretB32,
      algo,
      digits,
      period,
      counter,
      original: uri,
    };
  } catch (e) {
    return { error: e.message || 'Failed to parse otpauth URI' };
  }
}

function base32ToBytes(b32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = b32.replace(/=+$/, '');
  let bits = '';
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function hmac(algo, keyBytes, msgBytes) {
  const subtleAlgo = { name: 'HMAC', hash: { name: algo } };
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    subtleAlgo,
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes));
}

function intToBytesBE(num) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const hi = Math.floor(num / 2 ** 32);
  const lo = num >>> 0;
  view.setUint32(0, hi);
  view.setUint32(4, lo);
  return new Uint8Array(buf);
}

function dtToCounter(period) {
  return Math.floor(Date.now() / 1000 / period) >>> 0;
}

function truncateCode(hmacBytes) {
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const p =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);
  return p >>> 0;
}

async function generateOTP({ type, secretB32, algo, digits, period, counter }) {
  const algoMap = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };
  const hash = algoMap[algo] || 'SHA-1';
  const key = base32ToBytes(secretB32);
  const ctr = type === 'TOTP' ? dtToCounter(period) : counter ?? 0;
  const msg = intToBytesBE(ctr);
  const mac = await hmac(hash, key, msg);
  const bin = truncateCode(mac);
  const mod = 10 ** digits;
  return String(bin % mod).padStart(digits, '0');
}

function clearPreview() {
  setButtonCallout(revealPreviewBtn, false);
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  showPreview = false;
  img.src = '';
  img.removeAttribute('src');
  img.style.display = 'none';
  updatePreviewVisibility();
}

function setPreviewFromFile(file) {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }
  currentObjectUrl = URL.createObjectURL(file);
  img.src = currentObjectUrl;
  img.style.display = 'block';
  previewContainer?.classList.remove('hidden');
  showPreview = false;
  updatePreviewVisibility();
}

function applyParsed(result, message) {
  parsed = result;
  showSecret = false;
  showPreview = false;
  showCode = false;
  currentCode = '';
  setButtonCallout(copyCodeBtn, false);
  setStatus(message);
  setUriValidity('');
  render();
  updatePreviewVisibility();
  updateCodeVisibility();
  refreshCodeLoop();
}

function resetParsedWithError(message) {
  parsed = null;
  render();
  refreshCodeLoop();
  setStatus(message);
  setButtonCallout(revealCodeBtn, false);
  setButtonCallout(copyCodeBtn, false);
  showPreview = false;
  showCode = false;
  currentCode = '';
  updatePreviewVisibility();
  updateCodeVisibility();
}

async function handleFile(file) {
  if (!file) return;
  if (!fileUploadEnabled) {
    setStatus('QR decoding is unavailable. Paste an otpauth URI instead.');
    return;
  }
  setPreviewFromFile(file);
  fileInput.value = '';
  setStatus('Decoding QR…');
  try {
    const text = await decodeQRFromImage(file);
    if (!text.startsWith('otpauth://')) {
      throw new Error('QR is not an otpauth URI');
    }
    const parsedResult = parseOtpAuth(text);
    if (parsedResult.error) throw new Error(parsedResult.error);
    applyParsed(parsedResult, 'QR decoded ✔');
  } catch (err) {
    resetParsedWithError(err.message || 'Failed to decode');
  }
}

function handleDecodedOtp(text, { message, previewCanvas } = {}) {
  if (!text.startsWith('otpauth://')) {
    setStatus('QR is not an otpauth URI');
    return false;
  }
  const parsedResult = parseOtpAuth(text);
  if (parsedResult.error) {
    setStatus(parsedResult.error);
    return false;
  }

  if (previewCanvas) {
    previewCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'camera-scan.png', {
          type: blob.type || 'image/png',
        });
        setPreviewFromFile(file);
      },
      'image/png',
      0.92
    );
  }

  applyParsed(parsedResult, message || 'QR decoded ✔');
  if (uriInput) uriInput.value = parsedResult.original || text;
  setUriValidity('');
  return true;
}

async function copyToClipboard(text, successMessage) {
  if (!navigator.clipboard?.writeText) {
    setStatus('Clipboard access is unavailable in this context');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    note(successMessage);
    return true;
  } catch (err) {
    setStatus('Failed to copy to clipboard');
    return false;
  }
}

function attemptParseFromInput() {
  const value = uriInput?.value.trim();
  if (!value) {
    setUriValidity('Enter an otpauth URI to parse.');
    setStatus('Enter an otpauth URI to parse.');
    uriInput?.focus();
    return;
  }
  if (!value.toLowerCase().startsWith('otpauth://')) {
    setUriValidity('URI must start with otpauth://');
    setStatus('URI must start with otpauth://');
    uriInput?.focus();
    return;
  }
  const parsedResult = parseOtpAuth(value);
  if (parsedResult.error) {
    setUriValidity(parsedResult.error);
    resetParsedWithError(parsedResult.error);
    clearPreview();
    return;
  }
  setUriValidity('');
  clearPreview();
  applyParsed(parsedResult, 'URI parsed ✔');
}

function setUriValidity(message) {
  if (!uriInput) return;
  uriInput.classList.toggle('field-invalid', !!message);
  if (typeof uriInput.setCustomValidity === 'function') {
    uriInput.setCustomValidity(message || '');
  }
  if (message) {
    uriInput.reportValidity?.();
  }
}

function render() {
  $('type').textContent = parsed?.type || '—';
  $('label').textContent = parsed?.label || '—';
  $('issuer').textContent = parsed?.issuer || '—';
  $('algo').textContent = parsed?.algo || '—';
  $('digits').textContent = parsed?.digits ?? '—';
  $('period').textContent = parsed?.type === 'TOTP' ? parsed.period : '—';
  $('counter').textContent = parsed?.type === 'HOTP' ? parsed.counter : '—';
  if (secretValueEl) {
    secretValueEl.textContent = parsed
      ? showSecret
        ? parsed.secretB32
        : '•'.repeat(Math.min(parsed.secretB32.length, 24))
      : '—';
  }
  if (revealSecretBtn) {
    const pressed = !!showSecret;
    revealSecretBtn.textContent = pressed ? 'Hide secret' : 'Reveal secret';
    revealSecretBtn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    revealSecretBtn.setAttribute(
      'aria-label',
      pressed ? 'Hide secret value' : 'Reveal secret value'
    );
    revealSecretBtn.disabled = !parsed;
  }
}

async function refreshCodeLoop() {
  clearInterval(timer);
  currentCode = '';
  updateCodeVisibility();
  if (countdownEl) countdownEl.textContent = '';
  if (!parsed) return;
  let lastRenderedCode = '';
  const update = async () => {
    const code = await generateOTP(parsed).catch(() => null);
    const normalized = code || '';
    const codeChanged = normalized !== lastRenderedCode;
    currentCode = normalized;
    updateCodeVisibility({ updateText: codeChanged });
    if (parsed.type === 'TOTP') {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const left = parsed.period - (nowSeconds % parsed.period);
      if (countdownEl) countdownEl.textContent = `Refreshes in ${left}s`;
    }
    lastRenderedCode = normalized;
  };
  await update();
  timer = setInterval(update, 1000);
}

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  handleFile(file);
});

parseButton?.addEventListener('click', attemptParseFromInput);

uriInput?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  attemptParseFromInput();
});

uriInput?.addEventListener('input', () => {
  if (!uriInput.value) {
    setUriValidity('');
    return;
  }
  if (uriInput.value.toLowerCase().startsWith('otpauth://')) {
    setUriValidity('');
  }
});

copySecretBtn?.addEventListener('click', async () => {
  if (!parsed) return;
  await copyToClipboard(parsed.secretB32 || '', 'Secret copied');
});

copyUriBtn?.addEventListener('click', async () => {
  if (!parsed) return;
  await copyToClipboard(parsed.original || '', 'URI copied');
});

copyCodeBtn?.addEventListener('click', async () => {
  if (!currentCode) return;
  const copied = await copyToClipboard(currentCode, 'Code copied');
  if (copied) {
    setButtonCallout(copyCodeBtn, false);
    lastHighlightedCode = currentCode;
  }
});

openCameraBtn?.addEventListener('click', openCamera);
cameraCaptureBtn?.addEventListener('click', captureFromCamera);
[cameraCloseBtn, cameraCancelBtn].forEach((btn) =>
  btn?.addEventListener('click', () => hideCameraModal({ returnFocus: true }))
);
cameraModal?.addEventListener('click', (event) => {
  if (event.target === cameraModal) hideCameraModal({ returnFocus: true });
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cameraModalVisible) {
    hideCameraModal({ returnFocus: true });
  }
});

revealSecretBtn?.addEventListener('click', () => {
  if (!parsed || revealSecretBtn.disabled) return;
  showSecret = !showSecret;
  render();
});

revealPreviewBtn?.addEventListener('click', () => {
  if (!img.getAttribute('src')) return;
  showPreview = !showPreview;
  updatePreviewVisibility();
});

revealCodeBtn?.addEventListener('click', () => {
  if (!currentCode) return;
  showCode = !showCode;
  updateCodeVisibility();
});

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

if (dropZone) {
  const onDragEnter = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    if (!fileUploadEnabled) return;
    dropZone.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (e) => {
    if (e.relatedTarget && dropZone.contains(e.relatedTarget)) return;
    dropZone.classList.remove('dragging');
  };

  dropZone.addEventListener('dragenter', onDragEnter);
  dropZone.addEventListener('dragover', onDragEnter);
  dropZone.addEventListener('dragleave', onDragLeave);
  dropZone.addEventListener('dragend', () =>
    dropZone.classList.remove('dragging')
  );

  dropZone.addEventListener('drop', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dropZone.classList.remove('dragging');
    if (!fileUploadEnabled) {
      setStatus('QR decoding is unavailable. Paste an otpauth URI instead.');
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    handleFile(file);
  });
}

window.addEventListener('dragover', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
});

window.addEventListener('drop', (e) => {
  if (!isFileDrag(e)) return;
  if (dropZone?.contains(e.target)) return;
  e.preventDefault();
  dropZone?.classList.remove('dragging');
  if (!fileUploadEnabled) {
    setStatus('QR decoding is unavailable. Paste an otpauth URI instead.');
  }
});

updatePreviewVisibility();
updateCodeVisibility();
render();
