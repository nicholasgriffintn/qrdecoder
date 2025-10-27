const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const copyNoteEl = $('copied-note');
const img = $('preview');
const fileInput = $('file');
const dropZone = $('drop');
const parseButton = $('parse');
const uriInput = $('uri');
const copyCodeBtn = $('copy-code');
const uploadRow = $('upload-row');
const noUploadMsg = $('no-upload');
const supportWarning = $('support-warning');
const previewGroup = $('preview-group');
const previewContainer = $('preview-container');
const previewOverlay = $('preview-overlay');
const revealPreviewBtn = $('reveal-preview');
const codeEl = $('code');
const codeOverlay = $('code-overlay');
const revealCodeBtn = $('reveal-code');
const countdownEl = $('countdown');

let parsed = null;
let showSecret = false;
let timer = null;
let currentObjectUrl = null;
let fileUploadEnabled = true;
let showPreview = false;
let showCode = false;
let currentCode = '';
let lastHighlightedCode = '';

function setStatus(t) {
  statusEl.textContent = t;
}

function note(el, t) {
  el.textContent = t;
  setTimeout(() => {
    el.textContent = '';
  }, 1200);
}

function setButtonCallout(button, active) {
  if (!button) return;
  button.classList.toggle('btn-callout', !!active);
}

function updatePreviewVisibility() {
  if (!previewContainer || !img) return;
  const hasImage = !!img.getAttribute('src');
  if (!hasImage) {
    img.style.display = 'none';
    img.classList.remove('is-blurred');
    previewOverlay?.classList.add('hidden');
    revealPreviewBtn?.classList.add('hidden');
    setButtonCallout(revealPreviewBtn, false);
    if (revealPreviewBtn) revealPreviewBtn.textContent = 'Reveal QR';
    return;
  }

  img.style.display = 'block';
  if (!fileUploadEnabled) {
    img.classList.remove('is-blurred');
    previewOverlay?.classList.add('hidden');
    revealPreviewBtn?.classList.add('hidden');
    setButtonCallout(revealPreviewBtn, false);
    if (revealPreviewBtn) revealPreviewBtn.textContent = 'Reveal QR';
    return;
  }

  revealPreviewBtn?.classList.remove('hidden');
  const hidden = !showPreview;
  img.classList.toggle('is-blurred', hidden);
  previewOverlay?.classList.toggle('hidden', !hidden);
  if (revealPreviewBtn) {
    revealPreviewBtn.textContent = hidden ? 'Reveal QR' : 'Hide QR';
    setButtonCallout(revealPreviewBtn, hidden);
  }
}

function updateCodeVisibility() {
  if (!codeEl) return;

  if (!parsed || !currentCode) {
    codeEl.textContent = parsed ? '———' : '— — — — — —';
    codeEl.classList.remove('is-blurred');
    codeOverlay?.classList.add('hidden');
    revealCodeBtn?.classList.add('hidden');
    if (revealCodeBtn) revealCodeBtn.textContent = 'Reveal Code';
    setButtonCallout(revealCodeBtn, false);
    setButtonCallout(copyCodeBtn, false);
    if (copyCodeBtn) copyCodeBtn.disabled = true;
    lastHighlightedCode = '';
    return;
  }

  revealCodeBtn?.classList.remove('hidden');
  const hidden = !showCode;
  codeEl.textContent = currentCode;
  codeEl.classList.toggle('is-blurred', hidden);
  codeOverlay?.classList.toggle('hidden', !hidden);
  if (revealCodeBtn) {
    revealCodeBtn.textContent = hidden ? 'Reveal Code' : 'Hide Code';
    setButtonCallout(revealCodeBtn, hidden);
  }

  if (copyCodeBtn) {
    copyCodeBtn.disabled = !currentCode;
    if (currentCode && currentCode !== lastHighlightedCode) {
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

  fileUploadEnabled = hasBD;

  if (hasBD) {
    fileInput.disabled = false;
    fileInput.removeAttribute('tabindex');
    dropZone?.classList.remove('drop-disabled');
    dropZone?.removeAttribute('aria-disabled');
    uploadRow?.classList.remove('hidden');
    noUploadMsg?.classList.add('hidden');
    previewContainer?.classList.remove('hidden');
    previewGroup?.classList.remove('hidden');
    supportWarning?.classList.add('hidden');
  } else {
    fileInput.disabled = true;
    fileInput.setAttribute('tabindex', '-1');
    fileInput.value = '';
    dropZone?.classList.add('drop-disabled');
    dropZone?.setAttribute('aria-disabled', 'true');
    uploadRow?.classList.add('hidden');
    noUploadMsg?.classList.remove('hidden');
    previewContainer?.classList.add('hidden');
    previewGroup?.classList.add('hidden');
    supportWarning?.classList.remove('hidden');
    setStatus('Paste an otpauth URI to decode');
    clearPreview();
  }

  updatePreviewVisibility();
  updateCodeVisibility();
})();

async function decodeQRFromImage(imgBlob) {
  if (!('BarcodeDetector' in window))
    throw new Error('BarcodeDetector not supported');
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  const bitmap = await createImageBitmap(await imgBlob);
  const cnv = document.createElement('canvas');
  cnv.width = bitmap.width;
  cnv.height = bitmap.height;
  cnv.getContext('2d').drawImage(bitmap, 0, 0);
  const barcodes = await detector.detect(cnv);
  if (!barcodes.length) throw new Error('No QR code found');
  return barcodes[0].rawValue;
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
  const key = await crypto.subtle.importKey('raw', keyBytes, subtleAlgo, false, [
    'sign',
  ]);
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

async function copyToClipboard(text, successMessage) {
  if (!navigator.clipboard?.writeText) {
    setStatus('Clipboard access is unavailable in this context');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    note(copyNoteEl, successMessage);
    return true;
  } catch (err) {
    setStatus('Failed to copy to clipboard');
    return false;
  }
}

function attemptParseFromInput() {
  const value = uriInput?.value.trim();
  if (!value) return;
  const parsedResult = parseOtpAuth(value);
  if (parsedResult.error) {
    resetParsedWithError(parsedResult.error);
    clearPreview();
    return;
  }
  clearPreview();
  applyParsed(parsedResult, 'URI parsed ✔');
}

function render() {
  $('type').textContent = parsed?.type || '—';
  $('label').textContent = parsed?.label || '—';
  $('issuer').textContent = parsed?.issuer || '—';
  $('algo').textContent = parsed?.algo || '—';
  $('digits').textContent = parsed?.digits ?? '—';
  $('period').textContent = parsed?.type === 'TOTP' ? parsed.period : '—';
  $('counter').textContent = parsed?.type === 'HOTP' ? parsed.counter : '—';
  $('secret').textContent = parsed
    ? showSecret
      ? parsed.secretB32
      : '•'.repeat(Math.min(parsed.secretB32.length, 24))
    : '—';
}

async function refreshCodeLoop() {
  clearInterval(timer);
  currentCode = '';
  updateCodeVisibility();
  if (countdownEl) countdownEl.textContent = '';
  if (!parsed) return;
  const update = async () => {
    const code = await generateOTP(parsed).catch(() => null);
    currentCode = code || '';
    updateCodeVisibility();
    if (parsed.type === 'TOTP') {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const left = parsed.period - (nowSeconds % parsed.period);
      if (countdownEl) countdownEl.textContent = `Refreshes in ${left}s`;
    }
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

$('copy-secret').addEventListener('click', async () => {
  if (!parsed) return;
  await copyToClipboard(parsed.secretB32 || '', 'Secret copied');
});

$('copy-uri').addEventListener('click', async () => {
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

$('reveal').addEventListener('click', () => {
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
  dropZone.addEventListener('dragend', () => dropZone.classList.remove('dragging'));

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
