(() => {
  const SCENES = [
    { id: 'kids-room', name: '1993 · KIDS ROOM', surface: 0.498, warm: '255 184 92', cool: '255 212 151', detail: true },
    { id: 'cyberpunk', name: 'NEON · RAINY APARTMENT', surface: 0.521, warm: '255 135 71', cool: '58 196 255', detail: true },
    { id: 'basement', name: '1988 · BASEMENT DEN', surface: 0.508, warm: '255 185 92', cool: '255 97 70', detail: true },
    { id: 'bedroom', name: '1991 · QUIET BEDROOM', surface: 0.501, warm: '255 209 146', cool: '169 199 224', detail: false },
    { id: 'attic', name: '1984 · ATTIC HIDEAWAY', surface: 0.537, warm: '255 175 79', cool: '103 161 216', detail: true }
  ];
  const DEFAULTS = { scene: 'kids-room', light: 65, zoom: 100, x: 0, y: 0 };
  const CABINET_SURFACE = 0.498;
  const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  function normalizeSettings(value) {
    const saved = value && typeof value === 'object' ? value : {};
    const scene = SCENES.some(item => item.id === saved.scene) ? saved.scene : DEFAULTS.scene;
    const positional = saved.cabinetPositions && typeof saved.cabinetPositions === 'object' ? saved.cabinetPositions : {};
    const fallback = {
      cabinetX: clamp(saved.cabinetX ?? positional[scene]?.cabinetX, -30, 30, 0),
      cabinetY: clamp(saved.cabinetY ?? positional[scene]?.cabinetY, -20, 20, 0)
    };
    const cabinetPositions = Object.fromEntries(SCENES.map(item => {
      const prior = positional[item.id] && typeof positional[item.id] === 'object' ? positional[item.id] : {};
      return [item.id, {
        cabinetX: clamp(prior.cabinetX ?? fallback.cabinetX, -30, 30, 0),
        cabinetY: clamp(prior.cabinetY ?? fallback.cabinetY, -20, 20, 0)
      }];
    }));
    const current = cabinetPositions[scene] || { ...fallback };
    const cabinetSizes = Object.fromEntries(SCENES.map(item => {
      const candidate = saved.cabinetSizes && typeof saved.cabinetSizes === 'object' ? saved.cabinetSizes[item.id] : undefined;
      const value = item.id === scene ? saved.cabinetSize ?? candidate : candidate;
      return [item.id, clamp(value, 20, 65, 36)];
    }));
    const cabinetSize = clamp(saved.cabinetSize ?? cabinetSizes[scene], 20, 65, 36);
    cabinetSizes[scene] = cabinetSize;
    return {
      scene,
      light: clamp(saved.roomLights?.[scene], 0, 100, clamp(saved.light, 0, 100, DEFAULTS.light)),
      zoom: clamp(saved.zoom, 25, 3200, DEFAULTS.zoom),
      x: clamp(saved.x, -0.8, 0.8, 0),
      y: clamp(saved.y, -0.8, 0.8, 0),
      cabinetPositions,
      cabinetSizes,
      cabinetAnchorSize: clamp(saved.cabinetAnchorSize ?? cabinetSize, 20, 65, 36),
      roomLights: Object.fromEntries(SCENES.map(item => [item.id,
        clamp(saved.roomLights?.[item.id], 0, 100, clamp(saved.light, 0, 100, DEFAULTS.light))
      ])),
      screenHeight: clamp(saved.screenHeight, 50, 150, 100),
      cabinetSize,
      cabinetX: current.cabinetX,
      cabinetY: current.cabinetY
    };
  }
  function roomPlateLayout(surface, { cabinetX = 0, cabinetY = 0 } = {}, relativeScale = 1) {
    const centerX = 0.5 - cabinetX / 100;
    const anchorY = CABINET_SURFACE - cabinetY / 100;
    const scale = Math.max(anchorY / surface, (1 - anchorY) / (1 - surface), centerX * 2, (1 - centerX) * 2) * relativeScale;
    return {
      width: 1536 * scale,
      height: 1024 * scale,
      left: 1536 * (centerX - scale / 2),
      top: 1024 * (anchorY - surface * scale)
    };
  }
  function sceneLayout(width, height, settings, focusY = 512) {
    const scale = Math.min(width / 1536, height / 1024) * settings.zoom / 100;
    const focus = Math.max(0, Math.min(1, (settings.zoom - 100) / 100));
    return {
      scale,
      x: width * (0.5 + settings.x),
      y: height * (0.5 + settings.y) + (512 - focusY) * scale * focus
    };
  }
  function anchoredScenePosition(zoom, anchor, viewportWidth, viewportHeight) {
    if (!anchor || ![zoom, anchor.worldX, anchor.worldY, anchor.focusY, anchor.screenX, anchor.screenY,
      viewportWidth, viewportHeight].every(Number.isFinite) || zoom <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return null;
    const scale = Math.min(viewportWidth / 1536, viewportHeight / 1024) * zoom / 100;
    const focus = Math.max(0, Math.min(1, (zoom - 100) / 100));
    return {
      x: (anchor.screenX - viewportWidth / 2 - (anchor.worldX - 768) * scale) / viewportWidth,
      y: (anchor.screenY - viewportHeight / 2 - (anchor.worldY - 512) * scale - (512 - anchor.focusY) * scale * focus) / viewportHeight
    };
  }
  const MAX_SCENE_ZOOM = 3200;
  const MAX_SCENE_CANVAS_PIXELS = 3_145_728;
  const MAX_SCENE_CANVAS_EDGE = 4096;
  function boundedCanvasSize(viewportWidth, viewportHeight, devicePixelRatio = 1, pixelBudget = MAX_SCENE_CANVAS_PIXELS, maxEdge = MAX_SCENE_CANVAS_EDGE) {
    if (![viewportWidth, viewportHeight, devicePixelRatio, pixelBudget, maxEdge].every(Number.isFinite) ||
        viewportWidth <= 0 || viewportHeight <= 0 || devicePixelRatio <= 0 || pixelBudget <= 0 || maxEdge <= 0) return null;
    const scale = Math.min(devicePixelRatio, Math.sqrt(pixelBudget / (viewportWidth * viewportHeight)), maxEdge / viewportWidth, maxEdge / viewportHeight);
    const width = Math.max(1, Math.floor(viewportWidth * scale));
    const height = Math.max(1, Math.floor(viewportHeight * scale));
    return { width, height, scaleX: width / viewportWidth, scaleY: height / viewportHeight, pixels: width * height };
  }
  function sceneImageViewportRect(plate, camera) {
    if (!plate || !camera || ![plate.left, plate.top, plate.width, plate.height, camera.x, camera.y, camera.scale].every(Number.isFinite) ||
        plate.width <= 0 || plate.height <= 0 || camera.scale <= 0) return null;
    const left = camera.x + (plate.left - plate.width / 2 - 768) * camera.scale;
    const top = camera.y + (plate.top - plate.height / 2 - 512) * camera.scale;
    const width = plate.width * 2 * camera.scale;
    const height = plate.height * 2 * camera.scale;
    return { left, top, right: left + width, bottom: top + height, width, height };
  }
  // The detail layer is the plate's centre half at twice its density (tools/scene-detail/build.py).
  const SCENE_DETAIL_FRAME = Object.freeze({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  // Plate pixels per canvas pixel at which the detail starts to show, and where it is fully in.
  const SCENE_DETAIL_DENSITY = Object.freeze({ start: 0.6, end: 1.1 });
  const SCENE_DETAIL_ADJUST_MS = 280;
  // Tilt-shift: sharp ellipse around the TV, blurring out toward the plate edges (fractions of plate width).
  const SCENE_FOCUS = Object.freeze({ inner: 0.13, outer: 0.36, aspect: 1.25, fullZoom: 55, clearZoom: 115, blurPx: 6, width: 1536 });
  const smoothstep = (edge0, edge1, value) => {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };
  function sceneDetailViewportRect(rect) {
    if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return null;
    const left = rect.left + rect.width * SCENE_DETAIL_FRAME.x;
    const top = rect.top + rect.height * SCENE_DETAIL_FRAME.y;
    const width = rect.width * SCENE_DETAIL_FRAME.width;
    const height = rect.height * SCENE_DETAIL_FRAME.height;
    return { left, top, right: left + width, bottom: top + height, width, height };
  }
  function detailFadeTarget(rect, canvasScale, plateSourceWidth) {
    if (!rect || ![rect.width, canvasScale, plateSourceWidth].every(Number.isFinite) || canvasScale <= 0 || plateSourceWidth <= 0) return 0;
    return smoothstep(SCENE_DETAIL_DENSITY.start, SCENE_DETAIL_DENSITY.end, rect.width * canvasScale / plateSourceWidth);
  }
  function easeDetailFade(current, target, elapsedMs, reducedMotion = false) {
    if (!Number.isFinite(target)) return 0;
    if (!Number.isFinite(current) || reducedMotion) return target;
    const step = 1 - Math.exp(-Math.max(0, Math.min(elapsedMs, 250)) / SCENE_DETAIL_ADJUST_MS);
    const next = current + (target - current) * step;
    return Math.abs(target - next) < 0.002 ? target : next;
  }
  function focusBlurStrength(zoom) {
    return Number.isFinite(zoom) ? 1 - smoothstep(SCENE_FOCUS.fullZoom, SCENE_FOCUS.clearZoom, zoom) : 0;
  }
  function screenFitLimit(currentZoom, screen, viewportWidth, viewportHeight) {
    if (!screen || !Number.isFinite(currentZoom) || currentZoom <= 0 ||
        !Number.isFinite(screen.width) || !Number.isFinite(screen.height) || screen.width <= 0 || screen.height <= 0 ||
        !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) return null;
    const widthRatio = viewportWidth / screen.width;
    const heightRatio = viewportHeight / screen.height;
    const ratio = Math.min(widthRatio, heightRatio);
    const axis = Math.abs(widthRatio - heightRatio) < 1e-10 ? 'both' : widthRatio < heightRatio ? 'width' : 'height';
    return { zoom: currentZoom * Math.max(1, ratio), ratio, axis, alreadyFits: ratio <= 1 };
  }
  function autoZoomStep(currentZoom, ratePercentPer60HzFrame, elapsedMs, screen, viewportWidth, viewportHeight) {
    const fit = screenFitLimit(currentZoom, screen, viewportWidth, viewportHeight);
    if (!fit) return { zoom: currentZoom, done: false, reason: null };
    if (fit.alreadyFits) return { zoom: currentZoom, done: true, reason: fit.axis };
    const rate = clamp(ratePercentPer60HzFrame, 0.1, 2, 0.1);
    const frameCount = clamp(elapsedMs, 0, 50, 0) * 60 / 1000;
    const proposed = currentZoom * (1 + rate / 100) ** frameCount;
    const limit = Math.min(fit.zoom, MAX_SCENE_ZOOM);
    const zoom = Math.min(proposed, limit);
    const done = zoom >= limit - Math.max(1e-10, limit * 1e-12);
    return { zoom, done, reason: done ? (fit.zoom <= MAX_SCENE_ZOOM ? fit.axis : 'max') : null };
  }
  function autoZoomOutStep(currentZoom, ratePercentPer60HzFrame, elapsedMs, minimumZoom) {
    if (!Number.isFinite(currentZoom) || currentZoom <= 0 || !Number.isFinite(minimumZoom)) return { zoom: currentZoom, done: false };
    const rate = clamp(ratePercentPer60HzFrame, 0.1, 2, 0.1);
    const frameCount = clamp(elapsedMs, 0, 50, 0) * 60 / 1000;
    const limit = Math.max(25, Math.min(currentZoom, minimumZoom));
    const proposed = currentZoom / (1 + rate / 100) ** frameCount;
    const zoom = Math.max(proposed, limit);
    return { zoom, done: zoom <= limit + Math.max(1e-10, limit * 1e-12) };
  }
  function backgroundFillFloor(currentZoom, background, anchor, viewportWidth, viewportHeight) {
    if (!Number.isFinite(currentZoom) || currentZoom <= 0 || !background || !anchor ||
        ![background.left, background.top, background.right, background.bottom,
          anchor.x, anchor.y, viewportWidth, viewportHeight].every(Number.isFinite) ||
        viewportWidth <= 0 || viewportHeight <= 0) return null;
    const ratios = [];
    if (background.left < anchor.x) ratios.push(anchor.x / (anchor.x - background.left));
    if (background.right > anchor.x) ratios.push((viewportWidth - anchor.x) / (background.right - anchor.x));
    if (background.top < anchor.y) ratios.push(anchor.y / (anchor.y - background.top));
    if (background.bottom > anchor.y) ratios.push((viewportHeight - anchor.y) / (background.bottom - anchor.y));
    if (!ratios.length || ratios.some(value => !Number.isFinite(value) || value < 0)) return null;
    const ratio = Math.max(...ratios);
    return { zoom: currentZoom * ratio, ratio, alreadyCovers: ratio <= 1 };
  }
  function compensateZoomAnchor(settings, before, after, viewportWidth, viewportHeight) {
    if (!before || !after || viewportWidth <= 0 || viewportHeight <= 0) return { x: settings.x, y: settings.y };
    const beforeX = before.left + before.width / 2;
    const beforeY = before.top + before.height / 2;
    const afterX = after.left + after.width / 2;
    const afterY = after.top + after.height / 2;
    return {
      x: settings.x + (beforeX - afterX) / viewportWidth,
      y: settings.y + (beforeY - afterY) / viewportHeight
    };
  }
  function screenLight(pixels) {
    let red = 0, green = 0, blue = 0;
    const count = pixels.length / 4;
    if (!count) return { color: '0 0 0', strength: 0 };
    for (let index = 0; index < pixels.length; index += 4) {
      red += pixels[index] ** 2;
      green += pixels[index + 1] ** 2;
      blue += pixels[index + 2] ** 2;
    }
    const rgb = [red, green, blue].map(value => Math.sqrt(value / count));
    const brightness = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255;
    const peak = Math.max(...rgb, 1);
    return { color: rgb.map(value => Math.round(value / peak * 255)).join(' '), strength: Math.min(1, brightness * 1.8) };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SCENES, normalizeSettings, sceneLayout, anchoredScenePosition, screenFitLimit, autoZoomStep, autoZoomOutStep, backgroundFillFloor, compensateZoomAnchor, screenLight, CABINET_SURFACE, roomPlateLayout, boundedCanvasSize, sceneImageViewportRect, MAX_SCENE_CANVAS_PIXELS, MAX_SCENE_CANVAS_EDGE,
      SCENE_DETAIL_FRAME, SCENE_DETAIL_DENSITY, SCENE_FOCUS, sceneDetailViewportRect, detailFadeTarget, easeDetailFade, focusBlurStrength };
    return;
  }

  const STORAGE_KEY = 'saturday-tube-scenes-v1';
  const viewport = document.querySelector('#sceneViewport');
  const world = document.querySelector('#sceneWorld');
  const image = document.querySelector('#sceneImage');
  const mount = document.querySelector('#sceneTVMount');
  const cabinet = document.querySelector('#tvSet');
  const stage = document.querySelector('#stage');
  const home = document.createComment('TV cabinet home');
  cabinet.before(home);
  const shade = document.createElement('div');
  shade.className = 'scene-cabinet-light';
  shade.setAttribute('aria-hidden', 'true');
  cabinet.append(shade);
  // The bezel lip's shadow on the recessed glass sits above the picture (scene-mode.css .scene-screen-lip).
  const screenLip = document.createElement('div');
  screenLip.className = 'scene-screen-lip';
  screenLip.setAttribute('aria-hidden', 'true');
  stage.append(screenLip);
  const select = document.querySelector('#sceneSelect');
  const light = document.querySelector('#sceneLight');
  const zoom = document.querySelector('#sceneZoom');
  const cabinetSize = document.querySelector('#sceneCabinetSize');
  const message = document.querySelector('#sceneMessage');
  let settings = normalizeSettings(null);
  let active = false;
  const developerAutoZoomPanel = document.querySelector('#sceneDeveloperAutoZoom');
  const autoZoomToggle = document.querySelector('#sceneAutoZoomEnabled');
  const autoZoomRate = document.querySelector('#sceneAutoZoomRate');
  const autoZoomRateValue = document.querySelector('#sceneAutoZoomRateValue');
  const autoZoomStatus = document.querySelector('#sceneAutoZoomStatus');
  const autoZoomMode = document.querySelector('#sceneAutoZoomMode');
  const autoZoomDirection = document.querySelector('#sceneAutoZoomDirection');
  const zoomValue = document.querySelector('#sceneZoomValue');
  const sceneCanvasContext = image.getContext('2d', { alpha: false, desynchronized: true });
  const developerBuild = window.tube?.isDeveloperBuild === true;
  let autoZoomRaf = null;
  let autoZoomLastTime = null;
  let autoZoomPhase = 'in';
  let autoZoomHoldUntil = null;
  let autoZoomOutFloor = null;
  let autoZoomAnchor = null;
  let autoZoomScreenBase = null;
  let autoZoomLastOverlayAt = -Infinity;
  let sceneImageAsset = null;
  let sceneDetailAsset = null;
  let sceneDetailScene = null;
  let detailFade = 0;
  let detailFadeGoal = 0;
  let detailFadeFrame = null;
  let sceneFocusBlur = null;
  let sceneFocusLayer = null;
  let scenePlate = null;
  let currentCamera = null;
  let sceneGlowAnchorWorld = { x: 768, y: CABINET_SURFACE * 1024 - 160 };
  let screenLightColor = '0 0 0';
  let screenLightStrength = 0;
  let screenLightReach = 1;
  developerAutoZoomPanel.hidden = !developerBuild;
  autoZoomToggle.disabled = !developerBuild;
  autoZoomRate.disabled = !developerBuild;
  const CHROME_IDLE_MS = 2500;
  let chromeIdleTimer = null;
  let loadGeneration = 0;
  let drag = null;
  const touches = new Map();
  let pinch = null;
  let gestureZoom = null;
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = lightCanvas.height = 16;
  const lightContext = lightCanvas.getContext('2d', { willReadFrequently: true });
  let lastLightSample = -Infinity;
  let lightSampleFailed = false;
  try { settings = normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
  catch (error) { console.warn('Room scene preferences could not be restored', error); }

  function save() {
    try {
      const active = settings.cabinetPositions[settings.scene] || { cabinetX: 0, cabinetY: 0 };
      settings.cabinetX = active.cabinetX;
      settings.cabinetY = active.cabinetY;
      settings.cabinetSize = clamp(settings.cabinetSizes?.[settings.scene] ?? settings.cabinetSize, 20, 65, 36);
      settings.cabinetSizes = { ...settings.cabinetSizes, [settings.scene]: settings.cabinetSize };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
    catch (error) { console.warn('Room scene preferences could not be saved', error); }
  }
  function scene() { return SCENES.find(item => item.id === settings.scene); }
  function cinematicLockEnabled() { return developerBuild && autoZoomToggle.checked; }
  function setCinematicControlsLocked(locked) {
    for (const id of ['#sceneZoom', '#sceneCabinetSize', '#sceneScreenHeight', '#sceneCabinetX', '#sceneCabinetY', '#sceneCabinetReset', '#sceneReset']) {
      const control = document.querySelector(id);
      if (control) control.disabled = locked;
    }
  }
  function stopAutoZoom(reason = 'OFF') {
    if (autoZoomRaf !== null) window.cancelAnimationFrame(autoZoomRaf);
    autoZoomRaf = null;
    autoZoomLastTime = null;
    autoZoomHoldUntil = null;
    autoZoomAnchor = null;
    autoZoomScreenBase = null;
    autoZoomToggle.checked = false;
    setCinematicControlsLocked(false);
    const labels = {
      OFF: 'OFF', width: 'STOPPED · PICTURE FIT WIDTH', height: 'STOPPED · PICTURE FIT HEIGHT',
      both: 'STOPPED · WIDTH + HEIGHT FIT', max: 'STOPPED · MAX ZOOM',
      min: 'STOPPED · MINIMUM ZOOM · BLACK REVEAL'
    };
    autoZoomStatus.textContent = labels[reason] || labels.OFF;
    if (active) {
      updateScreenCutout();
      window.dispatchEvent(new CustomEvent('scene-layout-change'));
    }
  }
  function captureAutoZoomGeometry(target = null) {
    const screen = stage.getBoundingClientRect();
    const outer = cabinet.getBoundingClientRect();
    if (!screen.width || !screen.height) return false;
    const screenCenter = outer.height > 0
      ? (screen.bottom - screen.width / 2 - outer.top) / outer.height * cabinet.offsetHeight
      : cabinet.offsetHeight / 2;
    const focusY = CABINET_SURFACE * 1024 - (cabinet.offsetHeight - screenCenter) * settings.cabinetAnchorSize / 100;
    const camera = sceneLayout(window.innerWidth, window.innerHeight, settings, focusY);
    if (!camera.scale) return false;
    const centerX = screen.left + screen.width / 2;
    const centerY = screen.top + screen.height / 2;
    const worldX = (centerX - camera.x) / camera.scale + 768;
    const worldY = (centerY - camera.y) / camera.scale + 512;
    autoZoomAnchor = {
      worldX, worldY, focusY,
      screenX: target?.x ?? centerX,
      screenY: target?.y ?? centerY
    };
    sceneGlowAnchorWorld = { x: worldX, y: worldY };
    const currentScale = settings.zoom / 100;
    autoZoomScreenBase = { width: screen.width / currentScale, height: screen.height / currentScale };
    return true;
  }
  function applyZoomAnchored(nextZoom) {
    if (!active || !Number.isFinite(nextZoom) || Math.abs(nextZoom - settings.zoom) < 1e-12) return;
    settings.zoom = nextZoom;
    const anchored = anchoredScenePosition(nextZoom, autoZoomAnchor, window.innerWidth, window.innerHeight);
    if (anchored) {
      settings.x = anchored.x;
      settings.y = anchored.y;
    }
    layout({ refreshDecorations: false, focusYOverride: autoZoomAnchor?.focusY });
    zoom.value = String(settings.zoom);
    zoomValue.textContent = `${settings.zoom.toFixed(1)}%`;
  }
  function roomBackgroundFloor() {
    if (!scenePlate || !autoZoomAnchor) return null;
    const camera = sceneLayout(window.innerWidth, window.innerHeight, settings, autoZoomAnchor.focusY);
    const rect = sceneImageViewportRect(scenePlate, camera);
    const bounds = backgroundFillFloor(settings.zoom, rect, { x: autoZoomAnchor.screenX, y: autoZoomAnchor.screenY }, window.innerWidth, window.innerHeight);
    return bounds ? Math.max(25, Math.min(MAX_SCENE_ZOOM, bounds.zoom)) : null;
  }
  function stopAnimationForRestart() {
    if (autoZoomRaf !== null) window.cancelAnimationFrame(autoZoomRaf);
    autoZoomRaf = null;
    autoZoomLastTime = null;
    autoZoomHoldUntil = null;
  }
  function autoZoomFrame(now) {
    autoZoomRaf = null;
    if (!developerBuild || !autoZoomToggle.checked || !active) return;
    if (autoZoomHoldUntil !== null) {
      if (now < autoZoomHoldUntil) {
        autoZoomLastTime = now;
        autoZoomRaf = window.requestAnimationFrame(autoZoomFrame);
        return;
      }
      autoZoomHoldUntil = null;
      autoZoomLastTime = now;
    }
    const elapsed = autoZoomLastTime === null ? 1000 / 60 : now - autoZoomLastTime;
    autoZoomLastTime = now;
    const mode = autoZoomMode.value;
    const screen = autoZoomScreenBase
      ? { width: autoZoomScreenBase.width * settings.zoom / 100, height: autoZoomScreenBase.height * settings.zoom / 100 }
      : stage.getBoundingClientRect();
    let step;
    if (mode === 'boomerang' && autoZoomPhase === 'out') {
      step = autoZoomOutStep(settings.zoom, Number(autoZoomRate.value), elapsed, autoZoomOutFloor ?? 25);
    } else if (mode === 'original' && autoZoomDirection.value === 'out') {
      step = autoZoomOutStep(settings.zoom, Number(autoZoomRate.value), elapsed, 25);
    } else {
      step = autoZoomStep(settings.zoom, Number(autoZoomRate.value), elapsed, screen, window.innerWidth, window.innerHeight);
    }
    if (Math.abs(step.zoom - settings.zoom) > 1e-12) applyZoomAnchored(step.zoom);
    if (now - autoZoomLastOverlayAt >= 100 || step.done) {
      window.dispatchEvent(new CustomEvent('scene-layout-change'));
      autoZoomLastOverlayAt = now;
    }
    if (step.done) {
      if (mode === 'boomerang') {
        if (autoZoomPhase === 'in') {
          autoZoomPhase = 'out';
          autoZoomHoldUntil = now + 10_000;
          autoZoomStatus.textContent = 'SCREEN-SIZE HOLD · 10 SEC';
        } else {
          autoZoomPhase = 'in';
          autoZoomHoldUntil = now + 3_000;
          autoZoomStatus.textContent = 'BACKGROUND-EDGE HOLD · 3 SEC';
          save();
        }
      } else {
        stopAutoZoom(autoZoomPhase === 'out' ? 'min' : step.reason || 'max');
        save();
        return;
      }
    } else {
      autoZoomStatus.textContent = autoZoomPhase === 'out' ? 'ZOOMING OUT · BACKGROUND LOCKED' : 'ZOOMING IN · TV CENTER LOCKED';
    }
    autoZoomRaf = window.requestAnimationFrame(autoZoomFrame);
  }
  function startAutoZoom() {
    if (!developerBuild || !autoZoomToggle.checked) return;
    if (!active) {
      autoZoomStatus.textContent = 'ARMED · ENTER SCENE';
      return;
    }
    if (autoZoomRaf !== null) return;
    setCinematicControlsLocked(true);
    autoZoomPhase = 'in';
    autoZoomHoldUntil = null;
    autoZoomLastOverlayAt = -Infinity;
    if (!captureAutoZoomGeometry()) {
      stopAutoZoom('OFF');
      return;
    }
    autoZoomOutFloor = autoZoomMode.value === 'boomerang' ? roomBackgroundFloor() : null;
    if (autoZoomMode.value === 'boomerang' && autoZoomOutFloor !== null && settings.zoom < autoZoomOutFloor) {
      applyZoomAnchored(autoZoomOutFloor);
      save();
    }
    autoZoomLastTime = null;
    autoZoomStatus.textContent = autoZoomMode.value === 'boomerang' ? 'BOOMERANG · TV CENTER LOCKED' : 'ORIGINAL · TV CENTER LOCKED';
    autoZoomRaf = window.requestAnimationFrame(autoZoomFrame);
  }
  function showSceneChrome() {
    window.clearTimeout(chromeIdleTimer);
    chromeIdleTimer = null;
    viewport.classList.remove('scene-ui-idle');
    if (!active) return;
    chromeIdleTimer = window.setTimeout(() => {
      chromeIdleTimer = null;
      viewport.classList.add('scene-ui-idle');
    }, CHROME_IDLE_MS);
  }
  function ensureSceneCanvasSize() {
    if (!sceneCanvasContext) return null;
    const size = boundedCanvasSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    if (!size) return null;
    if (image.width !== size.width) image.width = size.width;
    if (image.height !== size.height) image.height = size.height;
    return size;
  }
  function drawEllipseGlow(x, y, radiusX, radiusY, color, strength) {
    if (!sceneCanvasContext || radiusX <= 0 || radiusY <= 0 || strength <= 0) return;
    const gradient = sceneCanvasContext.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgb(${color} / ${Math.min(1, strength)})`);
    gradient.addColorStop(0.55, `rgb(${color} / ${Math.min(1, strength * 0.48)})`);
    gradient.addColorStop(1, `rgb(${color} / 0)`);
    sceneCanvasContext.save();
    sceneCanvasContext.translate(x, y);
    sceneCanvasContext.scale(radiusX, radiusY);
    sceneCanvasContext.fillStyle = gradient;
    sceneCanvasContext.fillRect(-1, -1, 2, 2);
    sceneCanvasContext.restore();
  }
  function scheduleDetailFade() {
    if (detailFadeFrame !== null || !active || detailFade === detailFadeGoal) return;
    const started = performance.now();
    detailFadeFrame = requestAnimationFrame(now => {
      detailFadeFrame = null;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      detailFade = easeDetailFade(detailFade, detailFadeGoal, now - started, reduced);
      drawSceneBackground();
    });
  }
  function drawSceneDetail(rect, canvasSize) {
    const ready = sceneDetailAsset && sceneDetailScene === settings.scene;
    detailFadeGoal = ready ? detailFadeTarget(rect, canvasSize.scaleX, sceneImageAsset.naturalWidth || sceneImageAsset.width) : 0;
    if (!ready) detailFade = 0;
    scheduleDetailFade();
    if (!ready || detailFade < 0.004) return;
    const detail = sceneDetailViewportRect(rect);
    sceneCanvasContext.globalAlpha = detailFade;
    sceneCanvasContext.drawImage(sceneDetailAsset, detail.left, detail.top, detail.width, detail.height);
    sceneCanvasContext.globalAlpha = 1;
  }
  function makeSceneFocusBlur(source) {
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;
    if (!sourceWidth || !sourceHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = SCENE_FOCUS.width;
    canvas.height = Math.round(SCENE_FOCUS.width * sourceHeight / sourceWidth);
    const context = canvas.getContext('2d');
    if (!context) return null;
    const pad = SCENE_FOCUS.blurPx * 4;
    context.filter = `blur(${SCENE_FOCUS.blurPx}px)`;
    // A stretched underlay keeps the blurred plate opaque at its own edges.
    context.drawImage(source, -pad, -pad, canvas.width + pad * 2, canvas.height + pad * 2);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  function sceneFocusMask(u, v) {
    const key = `${u.toFixed(3)},${v.toFixed(3)}`;
    if (sceneFocusLayer?.key === key) return sceneFocusLayer.canvas;
    const canvas = sceneFocusLayer?.canvas || document.createElement('canvas');
    canvas.width = sceneFocusBlur.width;
    canvas.height = sceneFocusBlur.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(sceneFocusBlur, 0, 0);
    context.globalCompositeOperation = 'destination-in';
    const radiusX = SCENE_FOCUS.outer * canvas.width;
    const radiusY = radiusX / SCENE_FOCUS.aspect;
    const inner = SCENE_FOCUS.inner / SCENE_FOCUS.outer;
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, 'rgb(0 0 0 / 0)');
    for (let step = 0; step <= 8; step += 1) {
      const t = step / 8;
      gradient.addColorStop(inner + (1 - inner) * t, `rgb(0 0 0 / ${(t * t * (3 - 2 * t)).toFixed(4)})`);
    }
    context.translate(u * canvas.width, v * canvas.height);
    context.scale(radiusX, radiusY);
    context.fillStyle = gradient;
    context.fillRect(-u * canvas.width / radiusX, -v * canvas.height / radiusY, canvas.width / radiusX, canvas.height / radiusY);
    sceneFocusLayer = { key, canvas };
    return canvas;
  }
  function drawSceneFocus(rect, anchor) {
    const strength = focusBlurStrength(settings.zoom);
    if (!sceneFocusBlur || strength < 0.004) return;
    const layer = sceneFocusMask((anchor.x - rect.left) / rect.width, (anchor.y - rect.top) / rect.height);
    if (!layer) return;
    sceneCanvasContext.globalAlpha = strength;
    sceneCanvasContext.drawImage(layer, rect.left, rect.top, rect.width, rect.height);
    sceneCanvasContext.globalAlpha = 1;
  }
  function drawSceneBackground(camera = currentCamera) {
    if (!active || !sceneCanvasContext || !camera) return;
    const canvasSize = ensureSceneCanvasSize();
    if (!canvasSize) return;
    sceneCanvasContext.setTransform(canvasSize.scaleX, 0, 0, canvasSize.scaleY, 0, 0);
    sceneCanvasContext.globalAlpha = 1;
    sceneCanvasContext.fillStyle = '#000';
    sceneCanvasContext.fillRect(0, 0, window.innerWidth, window.innerHeight);
    if (sceneImageAsset && scenePlate) {
      const rect = sceneImageViewportRect(scenePlate, camera);
      if (rect) {
        const glow = { x: camera.x + (sceneGlowAnchorWorld.x - 768) * camera.scale, y: camera.y + (sceneGlowAnchorWorld.y - 512) * camera.scale };
        sceneCanvasContext.drawImage(sceneImageAsset, rect.left, rect.top, rect.width, rect.height);
        drawSceneDetail(rect, canvasSize);
        drawSceneFocus(rect, glow);
        // Dimming after compositing equals drawing the room at this alpha over black.
        const roomAlpha = 0.025 + settings.light / 100 * 0.975;
        if (roomAlpha < 1) {
          sceneCanvasContext.globalAlpha = 1 - roomAlpha;
          sceneCanvasContext.fillStyle = '#000';
          sceneCanvasContext.fillRect(0, 0, window.innerWidth, window.innerHeight);
          sceneCanvasContext.globalAlpha = 1;
        }
        // GLOW sets how far the set's light throws as well as how bright it is (see updateGlow).
        const reach = camera.scale * screenLightReach;
        drawEllipseGlow(glow.x, glow.y, 506.88 * reach, 307.2 * reach, screenLightColor, screenLightStrength * 0.32);
        drawEllipseGlow(glow.x, glow.y, 552.96 * reach, 358.4 * reach, screenLightColor, screenLightStrength * (1 - settings.light / 100 * 0.75) * 0.16);
        const floor = camera.y + (CABINET_SURFACE * 1024 - 512) * camera.scale;
        drawEllipseGlow(camera.x, floor, 540 * settings.cabinetAnchorSize / 100 * camera.scale, 12 * camera.scale, '0 0 0', 0.45);
      }
    }
  }
  // The hole must follow the tube's rounded corners; a square hole leaves unshaded bezel showing behind each corner.
  function screenCutoutPath(outer, screen) {
    const width = cabinet.offsetWidth;
    const height = cabinet.offsetHeight;
    if (!width || !height) return '';
    const sx = width / outer.width;
    const sy = height / outer.height;
    const x = (screen.left - outer.left) * sx;
    const y = (screen.top - outer.top) * sy;
    const w = screen.width * sx;
    const h = screen.height * sy;
    const style = getComputedStyle(stage);
    const radius = (value, size) => {
      const amount = parseFloat(value) || 0;
      return Math.min(size / 2, String(value).trim().endsWith('%') ? amount / 100 * size : amount);
    };
    const corner = (property) => {
      const [horizontal, vertical = horizontal] = style[property].split(/\s+/);
      return [radius(horizontal, w), radius(vertical, h)];
    };
    const [tlx, tly] = corner('borderTopLeftRadius');
    const [trx, try_] = corner('borderTopRightRadius');
    const [brx, bry] = corner('borderBottomRightRadius');
    const [blx, bly] = corner('borderBottomLeftRadius');
    const n = (value) => Math.round(value * 100) / 100;
    return `path(evenodd, "M0 0H${n(width)}V${n(height)}H0Z`
      + `M${n(x + tlx)} ${n(y)}H${n(x + w - trx)}A${n(trx)} ${n(try_)} 0 0 1 ${n(x + w)} ${n(y + try_)}`
      + `V${n(y + h - bry)}A${n(brx)} ${n(bry)} 0 0 1 ${n(x + w - brx)} ${n(y + h)}`
      + `H${n(x + blx)}A${n(blx)} ${n(bly)} 0 0 1 ${n(x)} ${n(y + h - bly)}`
      + `V${n(y + tly)}A${n(tlx)} ${n(tly)} 0 0 1 ${n(x + tlx)} ${n(y)}Z")`;
  }
  function updateScreenCutout() {
    if (!active) return;
    const outer = cabinet.getBoundingClientRect();
    const screen = stage.getBoundingClientRect();
    if (!outer.width || !outer.height) return;
    const left = (screen.left - outer.left) / outer.width * 100;
    const right = (screen.right - outer.left) / outer.width * 100;
    const top = (screen.top - outer.top) / outer.height * 100;
    const bottom = (screen.bottom - outer.top) / outer.height * 100;
    // Exclude the live picture from the cabinet sheen; room light is painted on the bounded viewport canvas.
    shade.style.setProperty('--screen-center', `${(left + right) / 2}% ${(top + bottom) / 2}%`);
    shade.style.setProperty('--screen-span-x', `${(right - left) / 2}%`);
    shade.style.setProperty('--screen-span-y', `${(bottom - top) / 2}%`);
    shade.style.clipPath = screenCutoutPath(outer, screen);
    const camera = currentCamera;
    if (!camera) return;
    if (camera.scale) sceneGlowAnchorWorld = {
      x: (screen.left + screen.width / 2 - camera.x) / camera.scale + 768,
      y: (screen.top + screen.height / 2 - camera.y) / camera.scale + 512
    };
    drawSceneBackground(camera);
  }
  function layout({ refreshDecorations = true, focusYOverride = null } = {}) {
    if (!active) return;
    let focusY = focusYOverride;
    if (!Number.isFinite(focusY)) {
      const outer = cabinet.getBoundingClientRect();
      const screen = stage.getBoundingClientRect();
      const screenCenter = outer.height > 0
        ? (screen.bottom - screen.width / 2 - outer.top) / outer.height * cabinet.offsetHeight
        : cabinet.offsetHeight / 2;
      focusY = CABINET_SURFACE * 1024 - (cabinet.offsetHeight - screenCenter) * settings.cabinetAnchorSize / 100;
    }
    currentCamera = sceneLayout(window.innerWidth, window.innerHeight, settings, focusY);
    mount.style.left = `${currentCamera.x}px`;
    mount.style.top = `${currentCamera.y + (CABINET_SURFACE * 1024 - 512) * currentCamera.scale}px`;
    mount.style.transform = `translate(-50%, -100%) scale(${settings.cabinetAnchorSize / 100 * currentCamera.scale})`;
    if (refreshDecorations) {
      updateScreenCutout();
      window.dispatchEvent(new CustomEvent('scene-layout-change'));
    } else drawSceneBackground(currentCamera);
  }
  function sync() {
    const selected = scene();
    const position = settings.cabinetPositions[selected.id] || { cabinetX: 0, cabinetY: 0 };
    const sizeValue = settings.cabinetSizes?.[selected.id] ?? settings.cabinetSize ?? 36;
    const size = Number.isFinite(sizeValue) ? Math.min(65, Math.max(20, sizeValue)) : 36;
    settings.cabinetSize = size;
    settings.cabinetSizes = { ...settings.cabinetSizes, [selected.id]: size };
    settings.cabinetX = position.cabinetX;
    settings.cabinetY = position.cabinetY;
    settings.light = settings.roomLights[selected.id];
    select.value = settings.scene;
    light.value = String(settings.light);
    zoom.value = String(settings.zoom);
    cabinetSize.value = String(settings.cabinetSize);
    document.querySelector('#sceneScreenHeight').value = String(settings.screenHeight);
    document.querySelector('#sceneScreenHeightValue').textContent = `${settings.screenHeight}%`;
    for (const axis of ['X', 'Y']) {
      const value = position[`cabinet${axis}`];
      document.querySelector(`#sceneCabinet${axis}`).value = String(value);
      document.querySelector(`#sceneCabinet${axis}Value`).textContent = value === 0 ? 'CENTER' : `${value > 0 ? '+' : ''}${value}%`;
    }
    document.querySelector('#sceneCabinetSizeValue').textContent = `${Math.round(settings.cabinetSize)}%`;
    document.querySelector('#sceneLightValue').textContent = `${Math.round(settings.light)}%`;
    document.querySelector('#sceneZoomValue').textContent = `${settings.zoom.toFixed(1)}%`;
    document.querySelector('#sceneHudName').textContent = selected.name;
    document.querySelector('#sceneEnter').textContent = active ? 'LEAVE SCENE' : 'ENTER SCENE';
    const url = `saturday://app/assets/scenes/${selected.id}.jpg`;
    const preview = document.querySelector('#scenePreview');
    if (preview.getAttribute('src') !== url) preview.src = url;
    world.style.setProperty('--scene-surface', `${CABINET_SURFACE * 100}%`);
    world.style.setProperty('--scene-screen-height', String(settings.screenHeight));
    scenePlate = roomPlateLayout(selected.surface, position, settings.cabinetAnchorSize / size);
    world.style.setProperty('--scene-screen-height', String(settings.screenHeight));
    world.style.setProperty('--scene-light', String(settings.light / 100));
    world.style.setProperty('--scene-warm', selected.warm);
    world.style.setProperty('--scene-cool', selected.cool);
    layout();
  }
  async function loadImage() {
    const generation = ++loadGeneration;
    const url = `saturday://app/assets/scenes/${settings.scene}.jpg`;
    const next = new Image();
    next.src = url;
    try { await next.decode(); }
    catch (error) {
      if (generation !== loadGeneration) return false;
      message.textContent = 'ROOM IMAGE UNAVAILABLE · SELECT ANOTHER SCENE';
      console.error('Room scene image could not load', error);
      throw error;
    }
    if (generation !== loadGeneration) return false;
    sceneImageAsset = next;
    try { sceneFocusBlur = makeSceneFocusBlur(next); }
    catch (error) {
      sceneFocusBlur = null;
      console.warn('Room focus blur unavailable', error);
    }
    sceneFocusLayer = null;
    if (sceneDetailScene !== settings.scene) {
      sceneDetailAsset = null;
      sceneDetailScene = null;
      detailFade = 0;
      if (scene().detail) loadSceneDetail(generation, settings.scene);
    }
    message.textContent = '';
    if (active) drawSceneBackground();
    return true;
  }
  async function loadSceneDetail(generation, id) {
    const next = new Image();
    next.src = `saturday://app/assets/scenes/detail/${id}.webp`;
    try { await next.decode(); }
    catch (error) {
      console.warn('Room detail layer could not load; showing the plate only', error);
      return;
    }
    if (generation !== loadGeneration || settings.scene !== id) return;
    sceneDetailAsset = next;
    sceneDetailScene = id;
    detailFade = 0;
    drawSceneBackground();
  }
  async function enter() {
    if (active) return;
    if (!await loadImage()) return;
    mount.append(cabinet);
    active = true;
    showSceneChrome();
    viewport.hidden = false;
    document.body.classList.add('scene-mode');
    sync();
    requestAnimationFrame(updateScreenCutout);
    if (autoZoomToggle.checked) startAutoZoom();
  }
  function updateGlow(source, now, overlay = null) {
    if (!active || !lightContext || lightSampleFailed || now - lastLightSample < 100) return;
    lastLightSample = now;
    try {
      lightContext.drawImage(source, 0, 0, 16, 16);
      // An on-screen menu is HTML above the picture, so its light is painted into the sample here.
      const menu = typeof overlay === 'function' ? overlay() : overlay;
      if (menu?.color && menu.rect) {
        lightContext.fillStyle = `rgb(${menu.color})`;
        lightContext.fillRect(menu.rect.x * 16, menu.rect.y * 16, menu.rect.width * 16, menu.rect.height * 16);
      }
      const pixels = lightContext.getImageData(0, 0, 16, 16).data;
      menu?.adjust?.(pixels);
      const sample = screenLight(pixels);
      const glowDial = document.querySelector('#glow');
      const glowLevel = glowDial ? Number(glowDial.getAttribute('aria-valuenow') || glowDial.value || 2) / 100 : 0.02;
      const ambient = Math.min(2.2, sample.strength * (0.7 + glowLevel * 1.4) * (1 + glowLevel * 0.6));
      screenLightColor = sample.color;
      screenLightStrength = ambient;
      screenLightReach = 1 + glowLevel * 0.3;
      // The same light falls on the cabinet face (scene-mode.css #tvSet::after and the stage spill).
      cabinet.style.setProperty('--screen-light-rgb', sample.color);
      cabinet.style.setProperty('--screen-light', ambient.toFixed(3));
      cabinet.style.setProperty('--screen-light-reach', screenLightReach.toFixed(3));
      drawSceneBackground();
    } catch (error) {
      lightSampleFailed = true;
      console.error('TV room illumination could not sample the picture', error);
      message.textContent = 'TV ROOM GLOW UNAVAILABLE';
    }
  }
  function exit() {
    ++loadGeneration;
    if (!active) return;
    stopAutoZoom('OFF');
    active = false;
    showSceneChrome();
    drag = null;
    touches.clear();
    pinch = null;
    gestureZoom = null;
    document.body.classList.remove('scene-mode', 'scene-dragging');
    home.after(cabinet);
    for (const name of ['--screen-light-rgb', '--screen-light', '--screen-light-reach']) cabinet.style.removeProperty(name);
    viewport.hidden = true;
    shade.style.clipPath = '';
    sync();
  }
  for (const item of SCENES) select.add(new Option(item.name, item.id));
  async function chooseScene(id) {
    const previous = settings.scene;
    const anchorBefore = active && cinematicLockEnabled() ? stage.getBoundingClientRect() : null;
    settings.scene = id;
    const placement = settings.cabinetPositions[settings.scene] || { cabinetX: 0, cabinetY: 0 };
    const previousSize = settings.cabinetSizes?.[settings.scene] ?? settings.cabinetSize ?? 36;
    const nextSize = Number.isFinite(previousSize) ? Math.min(65, Math.max(20, previousSize)) : 36;
    settings.cabinetSize = nextSize;
    settings.cabinetSizes = { ...settings.cabinetSizes, [settings.scene]: settings.cabinetSize };
    settings.cabinetX = placement.cabinetX;
    settings.cabinetY = placement.cabinetY;
    try {
      if (active && !await loadImage()) return;
    } catch (error) {
      settings.scene = previous;
      sync();
      throw error;
    }
    sync();
    if (anchorBefore) {
      const anchored = compensateZoomAnchor(settings, anchorBefore, stage.getBoundingClientRect(), window.innerWidth, window.innerHeight);
      settings.x = anchored.x;
      settings.y = anchored.y;
      layout();
      captureAutoZoomGeometry({ x: anchorBefore.left + anchorBefore.width / 2, y: anchorBefore.top + anchorBefore.height / 2 });
      if (autoZoomMode.value === 'boomerang') autoZoomOutFloor = roomBackgroundFloor();
    }
    save();
  }
  async function nextScene() {
    await chooseScene(SCENES[(SCENES.findIndex(item => item.id === settings.scene) + 1) % SCENES.length].id);
  }
  select.addEventListener('change', async () => {
    try { await chooseScene(select.value); }
    catch { window.dispatchEvent(new CustomEvent('scene-image-error')); }
  });
  light.addEventListener('input', () => {
    settings.roomLights[settings.scene] = Number(light.value);
    sync();
    save();
  });
  zoom.addEventListener('input', () => { settings.zoom = Number(zoom.value); sync(); save(); });
  autoZoomToggle.addEventListener('change', () => {
    if (autoZoomToggle.checked) startAutoZoom();
    else stopAutoZoom('OFF');
  });
  const restartAutoZoom = () => {
    if (!autoZoomToggle.checked) return;
    stopAnimationForRestart();
    startAutoZoom();
  };
  autoZoomMode.addEventListener('change', () => {
    autoZoomDirection.disabled = autoZoomMode.value === 'boomerang';
    restartAutoZoom();
  });
  autoZoomDirection.addEventListener('change', restartAutoZoom);
  autoZoomDirection.disabled = autoZoomMode.value === 'boomerang';
  autoZoomRate.addEventListener('input', () => {
    autoZoomRateValue.textContent = `${Number(autoZoomRate.value).toFixed(1)}% / 60 HZ`;
  });
  cabinetSize.addEventListener('input', () => {
    const nextSize = Number(cabinetSize.value);
    const clampedSize = Number.isFinite(nextSize) ? Math.min(65, Math.max(20, nextSize)) : 36;
    settings.cabinetSizes = { ...settings.cabinetSizes, [settings.scene]: clampedSize };
    settings.cabinetSize = clampedSize;
    sync();
    save();
  });
  document.querySelector('#sceneScreenHeight').addEventListener('input', event => {
    settings.screenHeight = Number(event.target.value);
    sync();
    save();
  });
  for (const axis of ['X', 'Y']) {
    const control = document.querySelector(`#sceneCabinet${axis}`);
    control.addEventListener('input', () => {
      const selected = settings.scene;
      settings.cabinetPositions[selected] = {
        ...settings.cabinetPositions[selected],
        [`cabinet${axis}`]: Number(control.value)
      };
      settings.cabinetX = settings.cabinetPositions[selected].cabinetX;
      settings.cabinetY = settings.cabinetPositions[selected].cabinetY;
      sync();
      save();
    });
  }
  document.querySelector('#sceneCabinetReset').addEventListener('click', () => {
    settings.cabinetPositions[settings.scene] = { cabinetX: 0, cabinetY: 0 };
    settings.cabinetX = 0;
    settings.cabinetY = 0;
    sync();
    save();
  });
  document.querySelector('#sceneReset').addEventListener('click', () => {
    settings = { ...settings, zoom: 100, x: 0, y: 0 };
    sync();
    save();
  });
  document.querySelector('#sceneHudSettings').addEventListener('click', () => window.dispatchEvent(new CustomEvent('scene-open-settings')));
  function zoomBy(factor) {
    if (!active || cinematicLockEnabled()) return;
    settings.zoom = clamp(settings.zoom * factor, 25, 3200, 100);
    sync();
    save();
  }
  viewport.addEventListener('pointerdown', event => {
    if (!active || cinematicLockEnabled() || event.button !== 0 || event.target.closest('button, input, select, a')) return;
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      viewport.setPointerCapture(event.pointerId);
      if (touches.size === 2) {
        const [first, second] = [...touches.values()];
        pinch = { distance: Math.hypot(first.x - second.x, first.y - second.y), zoom: settings.zoom };
        drag = null;
        document.body.classList.remove('scene-dragging');
        event.preventDefault();
        return;
      }
    }
    if (event.target.closest('.stage') || touches.size > 1) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: settings.x, offsetY: settings.y };
    viewport.setPointerCapture(event.pointerId);
    document.body.classList.add('scene-dragging');
    event.preventDefault();
  });
  viewport.addEventListener('pointermove', event => {
    if (cinematicLockEnabled()) return;
    if (touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && touches.size >= 2 && pinch.distance > 0) {
        const [first, second] = [...touches.values()];
        settings.zoom = clamp(pinch.zoom * Math.hypot(first.x - second.x, first.y - second.y) / pinch.distance, 25, 3200, 100);
        sync();
        event.preventDefault();
        return;
      }
    }
    if (!drag || drag.id !== event.pointerId) return;
    settings.x = clamp(drag.offsetX + (event.clientX - drag.x) / window.innerWidth, -0.8, 0.8, 0);
    settings.y = clamp(drag.offsetY + (event.clientY - drag.y) / window.innerHeight, -0.8, 0.8, 0);
    layout();
  });
  const stopDrag = event => {
    touches.delete(event.pointerId);
    if (touches.size < 2) pinch = null;
    drag = null;
    document.body.classList.remove('scene-dragging');
    save();
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(event, stopDrag);
  viewport.addEventListener('wheel', event => {
    if (!active || event.target.closest('dialog, #sceneHud, input, select')) return;
    if (cinematicLockEnabled()) { event.preventDefault(); return; }
    event.preventDefault();
    zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });
  viewport.addEventListener('gesturestart', event => {
    if (!active) return;
    if (cinematicLockEnabled()) { event.preventDefault(); return; }
    event.preventDefault();
    gestureZoom = settings.zoom;
  }, { passive: false });
  viewport.addEventListener('gesturechange', event => {
    if (!active || gestureZoom === null || cinematicLockEnabled()) return;
    event.preventDefault();
    settings.zoom = clamp(gestureZoom * event.scale, 25, 3200, 100);
    sync();
  }, { passive: false });
  viewport.addEventListener('gestureend', () => {
    if (gestureZoom === null) return;
    gestureZoom = null;
    save();
  });
  for (const event of ['pointermove', 'pointerdown', 'wheel', 'keydown']) {
    window.addEventListener(event, showSceneChrome, { passive: true });
  }
  window.addEventListener('beforeunload', save);
  window.addEventListener('pagehide', save);
  document.querySelector('#sceneHud').addEventListener('focusin', showSceneChrome);
  window.addEventListener('resize', () => {
    layout();
    if (active && cinematicLockEnabled()) {
      const target = autoZoomAnchor ? { x: autoZoomAnchor.screenX, y: autoZoomAnchor.screenY } : null;
      captureAutoZoomGeometry(target);
      if (autoZoomMode.value === 'boomerang') autoZoomOutFloor = roomBackgroundFloor();
    }
  });
  new ResizeObserver(() => {
    if (!cinematicLockEnabled()) layout();
  }).observe(stage);
  sync();
  window.SaturdayScenes = {
    enter, exit, updateGlow, zoomBy,
    next: nextScene,
    get active() { return active; },
    get name() { return scene().name; }
  };
})();
