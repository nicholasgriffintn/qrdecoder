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
const otpTypeEl = $('type');
const otpLabelEl = $('label');
const otpIssuerEl = $('issuer');
const otpAlgoEl = $('algo');
const otpDigitsEl = $('digits');
const otpPeriodEl = $('period');
const otpCounterEl = $('counter');
const detailsPanel = $('details-panel');
const otpDetails = $('otp-details');
const genericDetails = $('generic-details');
const genericFormatEl = $('generic-format');
const genericSummaryEl = $('generic-summary');
const genericDetailsListEl = $('generic-details-list');
const genericRawEl = $('generic-raw');
const codePanel = codeEl?.closest('.panel') || null;

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
const EMPTY_VALUE = '—';
const GENERIC_DETAILS_PLACEHOLDER = 'No structured fields detected.';

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
        const handled = handleDecodedPayload(text, {
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

  const isOtp = parsed?.format === 'OTP';

  if (!isOtp) {
    if (updateText) {
      codeEl.textContent = '— — — — — —';
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

  if (!currentCode) {
    if (updateText) {
      codeEl.textContent = '———';
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
    !hidden && parsed?.format === 'OTP' && parsed?.type === 'TOTP'
      ? 'polite'
      : 'off'
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
  }

  updateCameraAvailability();

  setStatus('Drop a QR, scan with camera, or paste content to begin!');

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

function safeDecode(value) {
  if (typeof value !== 'string') return value;
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

function parseWifiPayload(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.toUpperCase().startsWith('WIFI:')) return null;
  const body = trimmed.slice(5);
  const segments = [];
  let current = '';
  let escaping = false;
  for (const ch of body) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\') {
      escaping = true;
      continue;
    }
    if (ch === ';') {
      segments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) segments.push(current);
  const params = {};
  for (const segment of segments) {
    if (!segment) continue;
    const [key, ...valueParts] = segment.split(':');
    if (!key) continue;
    const value = valueParts.join(':');
    params[key.toUpperCase()] = value;
  }
  const unescapeWifi = (value = '') =>
    value.replace(/\\([\\;,":])/g, '$1').trim();
  const ssid = unescapeWifi(params.S || '');
  const password = unescapeWifi(params.P || '');
  const security = (params.T || 'nopass').toUpperCase();
  const hiddenFlag = (params.H || '').toLowerCase();
  const hidden =
    hiddenFlag === 'true' ||
    hiddenFlag === '1' ||
    hiddenFlag === 'yes' ||
    hiddenFlag === 'y';
  return {
    format: 'WiFi',
    raw,
    title: ssid || 'Wi-Fi network',
    summary: ssid ? `Wi-Fi network ${ssid}` : 'Wi-Fi network',
    wifi: {
      ssid,
      password,
      security,
      hidden,
    },
    fields: [
      { label: 'SSID', value: ssid || EMPTY_VALUE },
      { label: 'Security', value: security || 'NOPASS' },
      { label: 'Password', value: password || EMPTY_VALUE },
      { label: 'Hidden', value: hidden ? 'Yes' : 'No' },
    ],
  };
}

function parseMeCardPayload(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.toUpperCase().startsWith('MECARD:')) return null;
  const body = trimmed.slice(7);
  const segments = [];
  let current = '';
  let escaping = false;
  for (const ch of body) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\') {
      escaping = true;
      continue;
    }
    if (ch === ';') {
      segments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) segments.push(current);
  const params = {};
  for (const segment of segments) {
    if (!segment) continue;
    const [key, ...valueParts] = segment.split(':');
    if (!key) continue;
    const keyUpper = key.toUpperCase();
    const value = valueParts.join(':').trim();
    if (!value) continue;
    if (!params[keyUpper]) {
      params[keyUpper] = [];
    }
    params[keyUpper].push(value);
  }
  const pick = (key) => (params[key]?.[0] ? safeDecode(params[key][0]) : '');
  const name = pick('N');
  const org = pick('ORG');
  const title = pick('TITLE');
  const note = pick('NOTE');
  const email = pick('EMAIL');
  const phoneValues = (params.TEL || []).map((v) => safeDecode(v));
  const addr = pick('ADR')
    .replace(/;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const summaryPieces = [name, org].filter(Boolean);
  const summary = summaryPieces.length
    ? `Contact ${summaryPieces.join(' - ')}`
    : 'Contact';
  const fields = [];
  if (name) fields.push({ label: 'Name', value: name });
  if (org) fields.push({ label: 'Organization', value: org });
  if (title) fields.push({ label: 'Title', value: title });
  phoneValues.forEach((value, idx) =>
    fields.push({
      label: phoneValues.length > 1 ? `Phone ${idx + 1}` : 'Phone',
      value,
    })
  );
  if (email) fields.push({ label: 'Email', value: email });
  if (addr) fields.push({ label: 'Address', value: addr });
  if (note) fields.push({ label: 'Note', value: safeDecode(note) });
  return {
    format: 'Contact',
    raw,
    title: name || org || 'Contact',
    summary,
    contact: {
      name,
      organization: org,
      title,
      phones: phoneValues,
      emails: email ? [email] : [],
      address: addr,
      note,
    },
    fields,
  };
}

function parseVCardPayload(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^BEGIN:VCARD/i.test(trimmed)) return null;
  const lines = trimmed.split(/\r?\n/);
  const unfolded = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += line.replace(/^[ \t]+/, '');
    } else {
      unfolded.push(line);
    }
  }
  const data = {
    phones: [],
    emails: [],
    urls: [],
  };
  for (const line of unfolded) {
    const [lhs, ...rhsParts] = line.split(':');
    if (!lhs || !rhsParts.length) continue;
    const value = safeDecode(rhsParts.join(':').trim());
    const key = lhs.toUpperCase();
    if (key.startsWith('FN')) data.fn = value;
    else if (key === 'N') data.n = value.replace(/;/g, ' ').trim();
    else if (key.startsWith('ORG')) data.org = value;
    else if (key.startsWith('TITLE')) data.title = value;
    else if (key.startsWith('TEL')) data.phones.push(value);
    else if (key.startsWith('EMAIL')) data.emails.push(value);
    else if (key.startsWith('ADR'))
      data.address = value
        .replace(/;/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    else if (key.startsWith('URL')) data.urls.push(value);
    else if (key.startsWith('NOTE')) data.note = value;
  }
  const name = data.fn || data.n || '';
  const fields = [];
  if (name) fields.push({ label: 'Name', value: name });
  if (data.org) fields.push({ label: 'Organization', value: data.org });
  if (data.title) fields.push({ label: 'Title', value: data.title });
  data.phones.forEach((value, idx) =>
    fields.push({
      label: data.phones.length > 1 ? `Phone ${idx + 1}` : 'Phone',
      value,
    })
  );
  data.emails.forEach((value, idx) =>
    fields.push({
      label: data.emails.length > 1 ? `Email ${idx + 1}` : 'Email',
      value,
    })
  );
  if (data.address) fields.push({ label: 'Address', value: data.address });
  data.urls.forEach((value, idx) =>
    fields.push({
      label: data.urls.length > 1 ? `URL ${idx + 1}` : 'URL',
      value,
    })
  );
  if (data.note) fields.push({ label: 'Note', value: data.note });
  const summaryParts = [name, data.org].filter(Boolean);
  return {
    format: 'Contact',
    raw,
    title: name || data.org || 'Contact card',
    summary: summaryParts.length
      ? `Contact ${summaryParts.join(' - ')}`
      : 'Contact card',
    contact: {
      name,
      organization: data.org || '',
      title: data.title || '',
      phones: data.phones,
      emails: data.emails,
      address: data.address || '',
      note: data.note || '',
      urls: data.urls,
    },
    fields,
  };
}

function parseEventPayload(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  let block = null;
  if (/^BEGIN:VEVENT/i.test(trimmed)) {
    block = trimmed;
  } else if (/^BEGIN:VCALENDAR/i.test(trimmed)) {
    const match = trimmed.match(/BEGIN:VEVENT[\s\S]*END:VEVENT/i);
    if (match) block = match[0];
  }
  if (!block) return null;
  const lines = block.split(/\r?\n/);
  const unfolded = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += line.replace(/^[ \t]+/, '');
    } else {
      unfolded.push(line);
    }
  }
  const event = {};
  for (const line of unfolded) {
    const [lhs, ...rhsParts] = line.split(':');
    if (!lhs || !rhsParts.length) continue;
    const key = lhs.toUpperCase();
    const value = safeDecode(rhsParts.join(':').trim());
    if (key.startsWith('SUMMARY')) event.summary = value;
    else if (key.startsWith('LOCATION')) event.location = value;
    else if (key.startsWith('DTSTART')) event.start = value;
    else if (key.startsWith('DTEND')) event.end = value;
    else if (key.startsWith('DESCRIPTION')) event.description = value;
  }
  const fields = [];
  if (event.summary) fields.push({ label: 'Summary', value: event.summary });
  if (event.location) fields.push({ label: 'Location', value: event.location });
  if (event.start) fields.push({ label: 'Starts', value: event.start });
  if (event.end) fields.push({ label: 'Ends', value: event.end });
  if (event.description)
    fields.push({ label: 'Description', value: event.description });
  if (!fields.length) return null;
  return {
    format: 'Calendar Event',
    raw,
    title: event.summary || 'Calendar event',
    summary: event.summary || 'Calendar event',
    event,
    fields,
  };
}

function parseGeoPayload(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith('geo:')) return null;
  const body = trimmed.slice(4);
  const [coordPart, query = ''] = body.split('?');
  const [latStr, lngStr, altStr] = coordPart.split(',');
  const lat = Number.parseFloat(latStr);
  const lng = Number.parseFloat(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const altitude =
    altStr && Number.isFinite(Number.parseFloat(altStr))
      ? Number.parseFloat(altStr)
      : null;
  const params = new URLSearchParams(query);
  const q = params.get('q') || '';
  const summary =
    q || `Coordinates ${lat.toFixed(5)}, ${lng.toFixed(5)}`.trim();
  const fields = [
    { label: 'Latitude', value: String(lat) },
    { label: 'Longitude', value: String(lng) },
  ];
  if (altitude !== null) {
    fields.push({ label: 'Altitude', value: String(altitude) });
  }
  if (q) fields.push({ label: 'Query', value: q });
  return {
    format: 'Geo',
    raw,
    title: 'Geolocation',
    summary,
    geo: { lat, lng, altitude, query: q },
    fields,
  };
}

function parseMailPayload(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith('mailto:')) return null;
  const [, rest] = trimmed.split(':', 2);
  const [addrPart, queryPart = ''] = rest.split('?', 2);
  const to = addrPart
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const params = new URLSearchParams(queryPart);
  const cc = params.get('cc') || '';
  const bcc = params.get('bcc') || '';
  const subject = safeDecode(params.get('subject') || '');
  const body = safeDecode(params.get('body') || '');
  const fields = [];
  if (to.length) {
    fields.push({
      label: to.length > 1 ? 'To (comma separated)' : 'To',
      value: to.join(', '),
    });
  }
  if (cc) fields.push({ label: 'CC', value: safeDecode(cc) });
  if (bcc) fields.push({ label: 'BCC', value: safeDecode(bcc) });
  if (subject) fields.push({ label: 'Subject', value: subject });
  if (body) fields.push({ label: 'Body', value: body });
  return {
    format: 'Email',
    raw,
    title: 'Email link',
    summary: subject
      ? `Email: ${subject}`
      : to.length
      ? `Email ${to.join(', ')}`
      : 'Email link',
    email: {
      to,
      subject,
      body,
      cc: cc
        ? cc
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : [],
      bcc: bcc
        ? bcc
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : [],
    },
    fields,
  };
}

function parseSmsPayload(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const prefixMatch = trimmed.match(/^(SMSTO|SMS):/i);
  if (!prefixMatch) return null;
  const [, rest] = trimmed.split(':', 2);
  const [toPart = '', messagePart = ''] = rest.split(':', 2);
  const to = toPart
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const message = safeDecode(messagePart || '');
  const fields = [];
  if (to.length) {
    fields.push({
      label: to.length > 1 ? 'Recipients' : 'Recipient',
      value: to.join(', '),
    });
  }
  if (message) fields.push({ label: 'Message', value: message });
  return {
    format: 'SMS',
    raw,
    title: 'SMS message',
    summary: to.length ? `SMS to ${to.join(', ')}` : 'SMS message',
    sms: { to, message },
    fields,
  };
}

function parseUrlPayload(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const fields = [{ label: 'URL', value: url.href }];
    if (url.username || url.password) {
      fields.push({
        label: 'Credentials',
        value: `${url.username}:${url.password}`,
      });
    }
    if (url.search) fields.push({ label: 'Query', value: url.search });
    if (url.hash) fields.push({ label: 'Fragment', value: url.hash });
    return {
      format: 'URL',
      raw,
      title: url.hostname || url.href,
      summary: url.href,
      url: url.href,
      fields,
    };
  } catch {
    return null;
  }
}

function parsePlainTextPayload(raw) {
  if (typeof raw !== 'string') {
    return {
      format: 'Text',
      raw: String(raw),
      title: 'Text payload',
      summary: String(raw),
      fields: [],
      text: String(raw),
    };
  }
  const trimmed = raw.trim();
  const summaryLine = trimmed.split(/\r?\n/)[0] || '';
  const summary = summaryLine.slice(0, 140) || 'Text payload';
  return {
    format: 'Text',
    raw,
    title: 'Text payload',
    summary,
    fields: [],
    text: trimmed,
  };
}

function parseQrContent(text) {
  if (text == null) return { error: 'QR payload is empty' };
  const raw = String(text);
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'QR payload is empty' };

  if (trimmed.toLowerCase().startsWith('otpauth://')) {
    const otp = parseOtpAuth(trimmed);
    if (otp.error) return { error: otp.error };
    return { format: 'OTP', raw, ...otp, original: otp.original || raw };
  }

  const parsers = [
    parseWifiPayload,
    parseMeCardPayload,
    parseVCardPayload,
    parseEventPayload,
    parseGeoPayload,
    parseMailPayload,
    parseSmsPayload,
    parseUrlPayload,
  ];

  for (const fn of parsers) {
    const result = fn(raw);
    if (result) return { ...result, original: raw };
  }

  const fallback = parsePlainTextPayload(raw);
  return { ...fallback, original: raw };
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
  showSecret = false;
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
    setStatus('QR decoding is unavailable. Paste the QR content instead.');
    return;
  }
  setPreviewFromFile(file);
  fileInput.value = '';
  setStatus('Decoding QR…');
  try {
    const text = await decodeQRFromImage(file);
    const parsedResult = parseQrContent(text);
    if (parsedResult.error) throw new Error(parsedResult.error);
    applyParsed(parsedResult, 'QR decoded ✔');
    if (uriInput)
      uriInput.value = parsedResult.original || parsedResult.raw || text;
  } catch (err) {
    resetParsedWithError(err.message || 'Failed to decode');
  }
}

function handleDecodedPayload(text, { message, previewCanvas } = {}) {
  const parsedResult = parseQrContent(text);
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
  if (uriInput)
    uriInput.value = parsedResult.original || parsedResult.raw || text;
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
    setUriValidity('Enter QR content to parse.');
    setStatus('Enter QR content to parse.');
    uriInput?.focus();
    return;
  }
  const parsedResult = parseQrContent(value);
  if (parsedResult.error) {
    setUriValidity(parsedResult.error);
    resetParsedWithError(parsedResult.error);
    clearPreview();
    return;
  }
  setUriValidity('');
  clearPreview();
  applyParsed(parsedResult, 'Content parsed ✔');
  if (uriInput) {
    uriInput.value = parsedResult.original || parsedResult.raw || value;
  }
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
  const hasParsed = !!parsed;
  const isOtp = parsed?.format === 'OTP';
  const showOtpSection = isOtp;
  const showGenericSection = !isOtp;

  otpDetails?.classList.toggle('hidden', !showOtpSection);
  genericDetails?.classList.toggle('hidden', !showGenericSection);

  if (otpTypeEl) otpTypeEl.textContent = isOtp ? parsed.type : EMPTY_VALUE;
  if (otpLabelEl)
    otpLabelEl.textContent = isOtp ? parsed.label || EMPTY_VALUE : EMPTY_VALUE;
  if (otpIssuerEl)
    otpIssuerEl.textContent = isOtp
      ? parsed.issuer || EMPTY_VALUE
      : EMPTY_VALUE;
  if (otpAlgoEl)
    otpAlgoEl.textContent = isOtp ? parsed.algo || EMPTY_VALUE : EMPTY_VALUE;
  if (otpDigitsEl)
    otpDigitsEl.textContent =
      isOtp && typeof parsed.digits === 'number'
        ? String(parsed.digits)
        : EMPTY_VALUE;
  if (otpPeriodEl)
    otpPeriodEl.textContent =
      isOtp && parsed.type === 'TOTP' ? String(parsed.period) : EMPTY_VALUE;
  if (otpCounterEl)
    otpCounterEl.textContent =
      isOtp && parsed.type === 'HOTP'
        ? String(parsed.counter ?? EMPTY_VALUE)
        : EMPTY_VALUE;

  if (secretValueEl) {
    if (isOtp && parsed?.secretB32) {
      const secret = parsed.secretB32;
      secretValueEl.textContent = showSecret
        ? secret
        : '•'.repeat(Math.min(secret.length, 24));
    } else {
      secretValueEl.textContent = EMPTY_VALUE;
    }
  }

  if (revealSecretBtn) {
    const canReveal = !!(parsed && isOtp);
    revealSecretBtn.classList.toggle('hidden', !canReveal);
    revealSecretBtn.disabled = !canReveal;
    const pressed = canReveal && !!showSecret;
    revealSecretBtn.textContent = pressed ? 'Hide secret' : 'Reveal secret';
    revealSecretBtn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    revealSecretBtn.setAttribute(
      'aria-label',
      pressed ? 'Hide secret value' : 'Reveal secret value'
    );
    if (!canReveal) {
      setButtonCallout(revealSecretBtn, false);
    }
  }

  if (copySecretBtn) {
    const canCopySecret = !!(parsed && isOtp);
    copySecretBtn.classList.toggle('hidden', !canCopySecret);
    copySecretBtn.disabled = !canCopySecret;
    if (!canCopySecret) {
      setButtonCallout(copySecretBtn, false);
    }
  }

  if (copyUriBtn) {
    copyUriBtn.textContent = isOtp ? 'Copy otpauth URI' : 'Copy payload';
    copyUriBtn.disabled = !parsed;
  }

  if (genericFormatEl) {
    if (!showGenericSection) {
      genericFormatEl.textContent = EMPTY_VALUE;
    } else if (!parsed) {
      genericFormatEl.textContent = '—';
    } else {
      genericFormatEl.textContent = parsed.format || 'Unknown';
    }
  }

  if (genericSummaryEl) {
    if (!showGenericSection) {
      genericSummaryEl.textContent = EMPTY_VALUE;
    } else if (!parsed) {
      genericSummaryEl.textContent = 'Scan or drop a QR code to view details.';
    } else {
      genericSummaryEl.textContent =
        parsed.summary || parsed.title || parsed.raw || EMPTY_VALUE;
    }
  }

  if (genericDetailsListEl) {
    if (showGenericSection) {
      const fields = Array.isArray(parsed?.fields) ? parsed.fields : [];
      if (!fields.length) {
        genericDetailsListEl.textContent = GENERIC_DETAILS_PLACEHOLDER;
        genericDetailsListEl.classList.add('is-placeholder');
      } else {
        genericDetailsListEl.classList.remove('is-placeholder');
        genericDetailsListEl.innerHTML = '';
        fields.forEach(({ label, value }) => {
          const row = document.createElement('div');
          row.className = 'detail-row';
          const labelEl = document.createElement('div');
          labelEl.className = 'detail-label';
          labelEl.textContent = label || 'Field';
          const valueEl = document.createElement('div');
          valueEl.className = 'detail-value';
          valueEl.textContent =
            value === undefined || value === null || value === ''
              ? EMPTY_VALUE
              : String(value);
          row.appendChild(labelEl);
          row.appendChild(valueEl);
          genericDetailsListEl.appendChild(row);
        });
      }
    } else {
      genericDetailsListEl.textContent = GENERIC_DETAILS_PLACEHOLDER;
      genericDetailsListEl.classList.add('is-placeholder');
    }
  }

  if (genericRawEl) {
    genericRawEl.textContent =
      showGenericSection && parsed?.raw ? parsed.raw : EMPTY_VALUE;
  }

  const hideCodePanel = !isOtp;
  codePanel?.classList.toggle('hidden', hideCodePanel);
  detailsPanel?.classList.toggle('panel-full', hideCodePanel);
}

async function refreshCodeLoop() {
  clearInterval(timer);
  currentCode = '';
  updateCodeVisibility();
  if (countdownEl) countdownEl.textContent = '';
  if (!parsed || parsed.format !== 'OTP') return;
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
  setUriValidity('');
});

copySecretBtn?.addEventListener('click', async () => {
  if (!parsed || parsed.format !== 'OTP' || !parsed.secretB32) return;
  await copyToClipboard(parsed.secretB32, 'Secret copied');
});

copyUriBtn?.addEventListener('click', async () => {
  if (!parsed) return;
  const payload =
    parsed.format === 'OTP'
      ? parsed.original || parsed.raw || ''
      : parsed.raw || parsed.original || '';
  if (!payload) {
    setStatus('Nothing to copy');
    return;
  }
  const message =
    parsed.format === 'OTP' ? 'otpauth URI copied' : 'Payload copied';
  await copyToClipboard(payload, message);
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
      setStatus('QR decoding is unavailable. Paste the QR content instead.');
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
    setStatus('QR decoding is unavailable. Paste the QR content instead.');
  }
});

updatePreviewVisibility();
updateCodeVisibility();
render();
