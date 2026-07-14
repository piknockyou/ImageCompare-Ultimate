const compare = document.getElementById('compare');
const leftLayer = document.getElementById('left-layer');
const slider = document.getElementById('slider');
const sliderHandle = document.querySelector('.slider-handle');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const modeInputs = document.querySelectorAll('input[name="slider-mode"]');
const animateToggleBtn = document.getElementById('animate-toggle-btn');
const speedInput = document.getElementById('speed-input');
const speedValue = document.getElementById('speed-value');
const zoomInput = document.getElementById('zoom-input');
const zoomValue = document.getElementById('zoom-value');
const panXInput = document.getElementById('pan-x-input');
const panXValue = document.getElementById('pan-x-value');
const panYInput = document.getElementById('pan-y-input');
const panYValue = document.getElementById('pan-y-value');
const exportFormat = document.getElementById('export-format');
const exportQuality = document.getElementById('export-quality');
const recordBtn = document.getElementById('record-btn');
const recordStatus = document.getElementById('record-status');
const recordProgressWrap = document.querySelector('.record-progress-wrap');
const recordProgress = document.getElementById('record-progress');
const recordProgressText = document.getElementById('record-progress-text');

const leftImage = document.getElementById('left-image');
const rightImage = document.getElementById('right-image');

const PLACEHOLDER_LEFT =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="%23bfdbfe"/><stop offset="100%" stop-color="%2393c5fd"/></linearGradient></defs><rect width="1200" height="750" fill="url(%23g)"/><circle cx="220" cy="190" r="70" fill="%23ffffff88"/><rect x="100" y="470" width="1000" height="200" rx="22" fill="%23ffffff66"/><text x="50%" y="52%" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" fill="%230f172a">Left Image</text></svg>';

const PLACEHOLDER_RIGHT =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="%23fef3c7"/><stop offset="100%" stop-color="%23fdba74"/></linearGradient></defs><rect width="1200" height="750" fill="url(%23g)"/><rect x="150" y="120" width="900" height="520" rx="30" fill="%23ffffff55"/><text x="50%" y="52%" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" fill="%237c2d12">Right Image</text></svg>';

const MIME_BY_FORMAT = {
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4'
};

const QUALITY_PRESETS = {
  low: {
    fps: 12,
    videoBitsPerSecond: 1500000,
    mp4Crf: 30,
    webpQv: 55
  },
  medium: {
    fps: 24,
    videoBitsPerSecond: 3000000,
    mp4Crf: 23,
    webpQv: 75
  },
  high: {
    fps: 36,
    videoBitsPerSecond: 6000000,
    mp4Crf: 18,
    webpQv: 90
  }
};

leftImage.src = PLACEHOLDER_LEFT;
rightImage.src = PLACEHOLDER_RIGHT;

let isDragging = false;
let sliderMode = document.querySelector('input[name="slider-mode"]:checked').value;
let animationFrameId = null;
let animationStartTime = 0;
let animationPhase = -Math.PI / 2;
let ffmpegInstance = null;
let isRecording = false;
let recordRtcReadyPromise = null;
let imageZoom = Number(zoomInput.value);
let imagePanX = Number(panXInput.value);
let imagePanY = Number(panYInput.value);

window.addEventListener('dragover', (event) => {
  event.preventDefault();
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function polygonFromPoints(points) {
  if (points.length === 0) {
    return 'polygon(0% 0%, 0% 0%, 0% 0%)';
  }
  const serial = points
    .map((point) => `${(point.x * 100).toFixed(2)}% ${(point.y * 100).toFixed(2)}%`)
    .join(', ');
  return `polygon(${serial})`;
}

function intersectEdge(a, b, av, bv) {
  const t = av / (av - bv);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function clipPolygonWithHalfPlane(points, evaluate) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const av = evaluate(current);
    const bv = evaluate(next);
    const currentInside = av <= 0;
    const nextInside = bv <= 0;

    if (currentInside && nextInside) {
      out.push(next);
    } else if (currentInside && !nextInside) {
      out.push(intersectEdge(current, next, av, bv));
    } else if (!currentInside && nextInside) {
      out.push(intersectEdge(current, next, av, bv));
      out.push(next);
    }
  }
  return out;
}

function getLeftClipPoints(split, mode = sliderMode) {
  const clampedSplit = clamp(split, 0, 1);
  const rectPolygon = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ];

  if (mode === 'vertical') {
    return [
      { x: 0, y: 0 },
      { x: clampedSplit, y: 0 },
      { x: clampedSplit, y: 1 },
      { x: 0, y: 1 }
    ];
  }

  if (mode === 'diagonal-slash') {
    const constant = clampedSplit * 2;
    return clipPolygonWithHalfPlane(rectPolygon, (p) => p.x + p.y - constant);
  }

  const offset = clampedSplit * 2 - 1;
  return clipPolygonWithHalfPlane(rectPolygon, (p) => p.y - p.x - offset);
}

function getLeftClipPath(split, mode = sliderMode) {
  return polygonFromPoints(getLeftClipPoints(split, mode));
}

function getHandlePosition(split, mode = sliderMode) {
  const clampedSplit = clamp(split, 0, 1);

  if (mode === 'vertical') {
    return { x: clampedSplit, y: 0.5 };
  }

  if (mode === 'diagonal-slash') {
    return { x: clampedSplit, y: clampedSplit };
  }

  return { x: 1 - clampedSplit, y: clampedSplit };
}

function getSplitPercentageFromPoint(nx, ny, mode = sliderMode) {
  if (mode === 'vertical') {
    return clamp(nx * 100, 0, 100);
  }

  if (mode === 'diagonal-slash') {
    return clamp(((nx + ny) / 2) * 100, 0, 100);
  }

  return clamp(((ny - nx + 1) / 2) * 100, 0, 100);
}

function isPointOnLeftSide(nx, ny, split, mode = sliderMode) {
  const clampedSplit = clamp(split, 0, 1);

  if (mode === 'vertical') {
    return nx <= clampedSplit;
  }

  if (mode === 'diagonal-slash') {
    return nx + ny <= clampedSplit * 2;
  }

  return ny - nx <= clampedSplit * 2 - 1;
}

function updateSliderHandleIcon() {
  const rotations = {
    vertical: 0,
    'diagonal-slash': 45,
    'diagonal-backslash': -45
  };
  sliderHandle.textContent = '⇆';
  sliderHandle.style.transform = `rotate(${rotations[sliderMode] ?? 0}deg)`;
}

function setSplit(percentage) {
  const clampedPercentage = clamp(percentage, 0, 100);
  const split = clampedPercentage / 100;

  leftLayer.style.clipPath = getLeftClipPath(split, sliderMode);

  const handlePos = getHandlePosition(split, sliderMode);
  slider.style.left = `${handlePos.x * 100}%`;
  slider.style.top = `${handlePos.y * 100}%`;
  slider.setAttribute('aria-valuenow', Math.round(clampedPercentage).toString());
}

function setSliderByClientPoint(clientX, clientY) {
  const rect = compare.getBoundingClientRect();
  const x = clamp(clientX - rect.left, 0, rect.width);
  const y = clamp(clientY - rect.top, 0, rect.height);
  const nx = rect.width === 0 ? 0 : x / rect.width;
  const ny = rect.height === 0 ? 0 : y / rect.height;

  setSplit(getSplitPercentageFromPoint(nx, ny, sliderMode));
}

function onPointerMove(event) {
  if (!isDragging) return;
  setSliderByClientPoint(event.clientX, event.clientY);
}

function stopDragging() {
  isDragging = false;
}

function updateAnimationButton() {
  animateToggleBtn.textContent = animationFrameId === null ? 'Play Animation' : 'Stop Animation';
}

function updateSpeedLabel() {
  speedValue.textContent = `${Number(speedInput.value).toFixed(1)}s`;
}

function updateZoomLabel() {
  zoomValue.textContent = `${Number(imageZoom).toFixed(1)}x`;
}

function panLabel(value, negative, positive) {
  if (Math.abs(value) < 0.05) return 'Center';
  const strength = Math.round(Math.abs(value) * 100);
  if (value < 0) return `${negative} ${strength}%`;
  if (value > 0) return `${positive} ${strength}%`;
  return 'Center';
}

function updatePanLabels() {
  panXValue.textContent = panLabel(imagePanX, 'Left', 'Right');
  panYValue.textContent = panLabel(imagePanY, 'Top', 'Bottom');
}

function applyImageViewportTransform() {
  // Positive pan means "show more right/bottom", so the image must move left/up.
  const shiftXPercent = -imagePanX * Math.max(0, imageZoom - 1) * 50;
  const shiftYPercent = -imagePanY * Math.max(0, imageZoom - 1) * 50;
  compare.style.setProperty('--image-zoom', imageZoom.toString());
  compare.style.setProperty('--image-pan-shift-x', `${shiftXPercent.toFixed(3)}%`);
  compare.style.setProperty('--image-pan-shift-y', `${shiftYPercent.toFixed(3)}%`);
}

function animationStep(timestamp) {
  if (animationFrameId === null) return;

  const oneWaySeconds = Number(speedInput.value);
  const omega = Math.PI / oneWaySeconds;
  const elapsed = (timestamp - animationStartTime) / 1000;
  const split = 50 + 50 * Math.sin(omega * elapsed + animationPhase);
  setSplit(split);

  animationFrameId = requestAnimationFrame(animationStep);
}

function stopAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    updateAnimationButton();
  }
}

function startAnimation() {
  if (animationFrameId !== null) return;

  const currentSplit = Number(slider.getAttribute('aria-valuenow'));
  const normalized = clamp((currentSplit - 50) / 50, -1, 1);
  animationPhase = Math.asin(normalized);
  animationStartTime = performance.now();
  animationFrameId = requestAnimationFrame(animationStep);
  updateAnimationButton();
}

function toggleAnimation() {
  if (animationFrameId === null) {
    startAnimation();
  } else {
    stopAnimation();
  }
}

function setRecordStatus(message) {
  recordStatus.textContent = message;
}

function setRecordProgressVisible(isVisible) {
  recordProgressWrap.classList.toggle('is-hidden', !isVisible);
}

function setRecordProgress(percent) {
  const clamped = clamp(percent, 0, 100);
  recordProgress.value = clamped;
  recordProgressText.textContent = `${Math.round(clamped)}%`;
}

function setRecordingUi(isBusy) {
  recordBtn.disabled = isBusy;
  animateToggleBtn.disabled = isBusy;
  speedInput.disabled = isBusy;
  zoomInput.disabled = isBusy;
  panXInput.disabled = isBusy;
  panYInput.disabled = isBusy;
  exportFormat.disabled = isBusy;
  exportQuality.disabled = isBusy;
  modeInputs.forEach((input) => {
    input.disabled = isBusy;
  });
  setRecordProgressVisible(isBusy);
}

function getQualitySettings() {
  const key = exportQuality.value;
  return QUALITY_PRESETS[key] || QUALITY_PRESETS.medium;
}

function loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${url}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.src = url;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)));
    document.head.appendChild(script);
  });
}

async function ensureRecordRTC() {
  if (window.RecordRTC) return window.RecordRTC;
  if (!recordRtcReadyPromise) {
    recordRtcReadyPromise = loadScriptOnce('https://cdn.jsdelivr.net/npm/recordrtc@5.6.2/RecordRTC.min.js');
  }
  await recordRtcReadyPromise;
  if (!window.RecordRTC) {
    throw new Error('RecordRTC is not available after loading.');
  }
  return window.RecordRTC;
}

function drawImageContain(ctx, image, width, height, zoom = 1, panX = 0, panY = 0) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.min(width / sourceWidth, height / sourceHeight) * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const overflowX = Math.max(0, width * zoom - width);
  const overflowY = Math.max(0, height * zoom - height);
  const clampedPanX = clamp(panX, -2, 2);
  const clampedPanY = clamp(panY, -2, 2);
  const drawX = (width - drawWidth) / 2 - (overflowX / 2) * clampedPanX;
  const drawY = (height - drawHeight) / 2 - (overflowY / 2) * clampedPanY;

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function clipPointsToPath(ctx, points, width, height) {
  if (points.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x * width, points[i].y * height);
  }
  ctx.closePath();
}

function drawComparisonFrame(ctx, width, height, split, mode, zoom = 1, panX = 0, panY = 0) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#eef2f7';
  ctx.fillRect(0, 0, width, height);
  drawImageContain(ctx, rightImage, width, height, zoom, panX, panY);

  const leftPoints = getLeftClipPoints(split, mode);
  if (leftPoints.length > 0) {
    ctx.save();
    clipPointsToPath(ctx, leftPoints, width, height);
    ctx.clip();
    drawImageContain(ctx, leftImage, width, height, zoom, panX, panY);
    ctx.restore();
  }
}

function isBlobForFormat(blob, format) {
  if (!blob) return false;
  if (format === 'gif') return blob.type.includes('gif');
  if (format === 'webp') return blob.type.includes('webp');
  if (format === 'mp4') return blob.type.includes('mp4');
  return false;
}

async function recordWithRecordRTC({ format, fps, durationSec, mode, width, height, zoom, panX, panY, quality, onProgress }) {
  const RecordRTC = await ensureRecordRTC();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(fps);

  let recorderOptions;
  if (format === 'gif') {
    recorderOptions = {
      type: 'gif',
      mimeType: 'image/gif',
      recorderType: window.GifRecorder,
      frameRate: fps,
      width,
      height
    };
  } else if (format === 'mp4') {
    recorderOptions = {
      type: 'video',
      mimeType: 'video/mp4',
      recorderType: window.MediaStreamRecorder,
      frameRate: fps,
      bitsPerSecond: quality.videoBitsPerSecond,
      videoBitsPerSecond: quality.videoBitsPerSecond
    };
  } else {
    recorderOptions = {
      type: 'video',
      mimeType: 'image/webp',
      recorderType: window.MediaStreamRecorder,
      frameRate: fps,
      bitsPerSecond: quality.videoBitsPerSecond,
      videoBitsPerSecond: quality.videoBitsPerSecond
    };
  }

  const recorder = new RecordRTC(stream, recorderOptions);
  const startTime = performance.now();
  let rafId = null;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      stream.getTracks().forEach((track) => track.stop());
    };

    const loop = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = clamp(elapsed / durationSec, 0, 1);
      const split = (Math.sin(progress * 2 * Math.PI - Math.PI / 2) + 1) / 2;
      drawComparisonFrame(ctx, width, height, split, mode, zoom, panX, panY);
      onProgress?.(progress);

      if (progress >= 1) {
        try {
          recorder.stopRecording(() => {
            const blob = recorder.getBlob();
            cleanup();
            if (!blob || blob.size === 0) {
              reject(new Error('RecordRTC produced an empty recording.'));
              return;
            }
            resolve(blob);
          });
        } catch (error) {
          cleanup();
          reject(error);
        }
        return;
      }

      rafId = requestAnimationFrame(loop);
    };

    try {
      recorder.startRecording();
      loop();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to render frame.'));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}

async function renderAnimationFrames({ width, height, fps, durationSec, mode, zoom, panX, panY, onProgress }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const frameCount = Math.max(2, Math.ceil(durationSec * fps) + 1);
  const frames = [];

  for (let i = 0; i < frameCount; i += 1) {
    const t = i / (frameCount - 1);
    const split = (Math.sin(t * 2 * Math.PI - Math.PI / 2) + 1) / 2;
    drawComparisonFrame(ctx, width, height, split, mode, zoom, panX, panY);
    frames.push(await canvasToPngBytes(canvas));
    onProgress?.((i + 1) / frameCount);

    if (i % 10 === 0 || i === frameCount - 1) {
      setRecordStatus(`Rendering frames ${i + 1}/${frameCount}...`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return frames;
}

async function fetchAsBlobURL(url, mimeType, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}`);
  }

  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    const raw = await response.arrayBuffer();
    onProgress?.(1);
    return URL.createObjectURL(new Blob([raw], { type: mimeType }));
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total > 0) {
      onProgress?.(loaded / total);
    }
  }

  if (total === 0) {
    onProgress?.(1);
  }

  return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
}

async function ensureFFmpeg(onProgress) {
  if (ffmpegInstance) return ffmpegInstance;

  setRecordStatus('Loading encoder... (first time can take a while)');

  const [{ FFmpeg }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'),
  ]);

  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
  const classWorkerURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js';
  const ffmpeg = new FFmpeg();

  const progressState = { core: 0, wasm: 0, worker: 0 };
  const weights = { core: 0.15, wasm: 0.8, worker: 0.05 };
  const emitLoadProgress = () => {
    const total =
      progressState.core * weights.core +
      progressState.wasm * weights.wasm +
      progressState.worker * weights.worker;
    onProgress?.(total);
  };

  const [coreURL, wasmURL, workerBlobURL] = await Promise.all([
    fetchAsBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript', (p) => {
      progressState.core = p;
      emitLoadProgress();
    }),
    fetchAsBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm', (p) => {
      progressState.wasm = p;
      emitLoadProgress();
    }),
    fetchAsBlobURL(classWorkerURL, 'text/javascript', (p) => {
      progressState.worker = p;
      emitLoadProgress();
    })
  ]);

  await ffmpeg.load({
    coreURL,
    wasmURL,
    classWorkerURL: workerBlobURL
  });

  onProgress?.(1);
  ffmpegInstance = ffmpeg;
  return ffmpegInstance;
}

async function encodeFrames(frames, fps, format, quality, onProgress) {
  const ffmpeg = await ensureFFmpeg((p) => onProgress?.(0.55 + p * 0.25));

  const frameNames = frames.map((_, index) => `frame${String(index + 1).padStart(4, '0')}.png`);
  for (let i = 0; i < frameNames.length; i += 1) {
    await ffmpeg.writeFile(frameNames[i], frames[i]);
    onProgress?.(0.8 + ((i + 1) / frameNames.length) * 0.1);
  }

  const outputName = `output.${format}`;
  const commandByFormat = {
    gif: ['-framerate', String(fps), '-i', 'frame%04d.png', '-loop', '0', outputName],
    webp: ['-framerate', String(fps), '-i', 'frame%04d.png', '-loop', '0', '-q:v', String(quality.webpQv), '-an', outputName],
    mp4: ['-framerate', String(fps), '-i', 'frame%04d.png', '-crf', String(quality.mp4Crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputName]
  };

  onProgress?.(0.92);
  await ffmpeg.exec(commandByFormat[format]);
  onProgress?.(0.99);
  const outputData = await ffmpeg.readFile(outputName);

  const cleanup = [...frameNames, outputName];
  await Promise.all(
    cleanup.map(async (file) => {
      try {
        await ffmpeg.deleteFile(file);
      } catch {
        // Ignore cleanup errors.
      }
    })
  );

  onProgress?.(1);
  return new Blob([outputData.buffer], { type: MIME_BY_FORMAT[format] });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function recordOneCycle() {
  if (isRecording) return;

  isRecording = true;
  stopAnimation();
  setRecordingUi(true);
  setRecordProgress(0);

  try {
    const format = exportFormat.value;
    const quality = getQualitySettings();
    const fps = quality.fps;
    const oneWaySeconds = Number(speedInput.value);
    const durationSec = oneWaySeconds * 2;
    const modeAtStart = sliderMode;
    const zoomAtStart = imageZoom;
    const panXAtStart = imagePanX;
    const panYAtStart = imagePanY;

    const rect = compare.getBoundingClientRect();
    const width = Math.max(2, Math.round(rect.width));
    const height = Math.max(2, Math.round(rect.height));
    let recordRtcError = '';

    try {
      setRecordStatus(`Recording with RecordRTC...`);
      const recordRtcBlob = await recordWithRecordRTC({
        format,
        fps,
        durationSec,
        mode: modeAtStart,
        width,
        height,
        zoom: zoomAtStart,
        panX: panXAtStart,
        panY: panYAtStart,
        quality,
        onProgress: (p) => setRecordProgress(p * 80)
      });

      if (!isBlobForFormat(recordRtcBlob, format)) {
        throw new Error(`RecordRTC output type '${recordRtcBlob.type || 'unknown'}' does not match ${format}.`);
      }

      const filename = `swipe-${modeAtStart}-${Date.now()}.${format}`;
      downloadBlob(recordRtcBlob, filename);
      setRecordProgress(100);
      setRecordStatus(`Done with RecordRTC. Downloaded ${filename}`);
      return;
    } catch (error) {
      recordRtcError = error instanceof Error ? error.message : String(error);
    }

    setRecordStatus(`RecordRTC failed, using FFmpeg fallback...`);
    setRecordProgress(0);

    const frames = await renderAnimationFrames({
      width,
      height,
      fps,
      durationSec,
      mode: modeAtStart,
      zoom: zoomAtStart,
      panX: panXAtStart,
      panY: panYAtStart,
      onProgress: (p) => setRecordProgress(p * 55)
    });

    setRecordStatus(`Encoding ${format.toUpperCase()} with FFmpeg fallback...`);
    const blob = await encodeFrames(frames, fps, format, quality, (p) => setRecordProgress(55 + p * 45));
    const filename = `swipe-${modeAtStart}-${Date.now()}.${format}`;
    downloadBlob(blob, filename);

    setRecordProgress(100);
    setRecordStatus(`Done with FFmpeg fallback. Downloaded ${filename}${recordRtcError ? ` (RecordRTC: ${recordRtcError})` : ''}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setRecordStatus(`Recording failed: ${message}`);
  } finally {
    isRecording = false;
    setRecordingUi(false);
    setRecordProgress(0);
  }
}

async function toggleFullscreen() {
  const isFullscreen = document.fullscreenElement === compare;
  try {
    if (isFullscreen) {
      await document.exitFullscreen();
    } else {
      await compare.requestFullscreen();
    }
  } catch {
    // No-op: Fullscreen API is not available in some contexts.
  }
}

function updateFullscreenButtonLabel() {
  const isFullscreen = document.fullscreenElement === compare;
  fullscreenBtn.textContent = isFullscreen ? 'Exit Full Screen' : 'Full Screen';
}

fullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', updateFullscreenButtonLabel);
animateToggleBtn.addEventListener('click', toggleAnimation);
speedInput.addEventListener('input', updateSpeedLabel);
zoomInput.addEventListener('input', () => {
  imageZoom = Number(zoomInput.value);
  updateZoomLabel();
  applyImageViewportTransform();
});
panXInput.addEventListener('input', () => {
  imagePanX = Number(panXInput.value);
  updatePanLabels();
  applyImageViewportTransform();
});
panYInput.addEventListener('input', () => {
  imagePanY = Number(panYInput.value);
  updatePanLabels();
  applyImageViewportTransform();
});
recordBtn.addEventListener('click', recordOneCycle);

slider.addEventListener('pointerdown', (event) => {
  stopAnimation();
  isDragging = true;
  slider.setPointerCapture(event.pointerId);
  setSliderByClientPoint(event.clientX, event.clientY);
});

compare.addEventListener('pointerdown', (event) => {
  if (event.target === slider || slider.contains(event.target)) return;
  stopAnimation();
  setSliderByClientPoint(event.clientX, event.clientY);
});

compare.addEventListener('pointermove', onPointerMove);
compare.addEventListener('pointerup', stopDragging);
compare.addEventListener('pointercancel', stopDragging);
compare.addEventListener('pointerleave', stopDragging);

slider.addEventListener('keydown', (event) => {
  const current = Number(slider.getAttribute('aria-valuenow'));
  const step = event.shiftKey ? 10 : 2;

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    stopAnimation();
    setSplit(current - step);
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    stopAnimation();
    setSplit(current + step);
  }
});

modeInputs.forEach((modeInput) => {
  modeInput.addEventListener('change', () => {
    if (!modeInput.checked) return;
    stopAnimation();
    sliderMode = modeInput.value;
    updateSliderHandleIcon();
    setSplit(Number(slider.getAttribute('aria-valuenow')));
  });
});

function readImageFile(file, imageElement) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  imageElement.src = url;
}

function getImageFiles(fileList) {
  return Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
}

compare.addEventListener('dragover', (event) => {
  event.preventDefault();
  compare.classList.add('dragover');
});

compare.addEventListener('dragleave', () => {
  compare.classList.remove('dragover');
});

compare.addEventListener('drop', (event) => {
  event.preventDefault();
  compare.classList.remove('dragover');
  stopAnimation();

  const files = getImageFiles(event.dataTransfer.files);
  if (files.length === 0) return;

  if (files.length >= 2) {
    readImageFile(files[0], leftImage);
    readImageFile(files[1], rightImage);
    return;
  }

  const rect = compare.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, rect.width);
  const y = clamp(event.clientY - rect.top, 0, rect.height);
  const nx = rect.width === 0 ? 0 : x / rect.width;
  const ny = rect.height === 0 ? 0 : y / rect.height;
  const split = Number(slider.getAttribute('aria-valuenow')) / 100;

  const targetImage = isPointOnLeftSide(nx, ny, split, sliderMode) ? leftImage : rightImage;
  readImageFile(files[0], targetImage);
});

updateFullscreenButtonLabel();
updateSliderHandleIcon();
updateSpeedLabel();
updateZoomLabel();
updatePanLabels();
applyImageViewportTransform();
updateAnimationButton();
setRecordStatus('');
setRecordProgress(0);
setRecordProgressVisible(false);
setSplit(50);
