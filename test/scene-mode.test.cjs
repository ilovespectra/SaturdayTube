const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { SCENES, normalizeSettings, sceneLayout, anchoredScenePosition, screenFitLimit, autoZoomStep, autoZoomOutStep, backgroundFillFloor, compensateZoomAnchor, screenLight, CABINET_SURFACE, roomPlateLayout, boundedCanvasSize, sceneImageViewportRect, MAX_SCENE_CANVAS_PIXELS, MAX_SCENE_CANVAS_EDGE, SCENE_DETAIL_FRAME, sceneDetailViewportRect, detailFadeTarget, easeDetailFade, focusBlurStrength } = require('../scene-mode.js');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('room controls fade together after inactivity, reappear on activity, and clear their timer on exit', () => {
  const source = read('scene-mode.js');
  const timers = new Map();
  const classes = new Set();
  let nextId = 0;
  const context = {
    active: true, CHROME_IDLE_MS: 2500, chromeIdleTimer: null,
    viewport: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
    window: {
      setTimeout(callback, delay) {
        assert.equal(delay, 2500);
        timers.set(++nextId, callback);
        return nextId;
      },
      clearTimeout(id) { timers.delete(id); }
    }
  };
  const fn = source.match(/  function showSceneChrome\(\) \{[\s\S]*?\n  \}/)[0];
  const show = vm.runInNewContext(`${fn}; showSceneChrome`, context);
  show();
  assert.equal(classes.has('scene-ui-idle'), false);
  show();
  assert.equal(timers.size, 1, 'activity resets one timer rather than creating multiple hides');
  const id = context.chromeIdleTimer;
  const hide = timers.get(id);
  timers.delete(id);
  hide();
  assert.equal(classes.has('scene-ui-idle'), true);
  show();
  assert.equal(classes.has('scene-ui-idle'), false);
  context.active = false;
  show();
  assert.equal(timers.size, 0, 'leaving the scene cancels idle work');
  assert.equal(classes.has('scene-ui-idle'), false);
  assert.match(source, /active = true;\s*showSceneChrome\(\)/);
  assert.match(source, /active = false;\s*showSceneChrome\(\)/);
  assert.match(source, /\['pointermove', 'pointerdown', 'wheel', 'keydown'\]/);
  const css = read('scene-mode.css');
  assert.match(css, /\.scene-ui-idle :is\(#sceneHud, #sceneHint\) \{ opacity:0; pointer-events:none;/);
  assert.match(css, /#sceneHud:has\(:focus-visible\) \{ opacity:1; pointer-events:auto;/, 'keyboard focus keeps the selector discoverable');
});

test('settings always fits the visible tube, including tiny, zoomed and partially offscreen room cabinets; Guide stays unchanged', () => {
  const source = read('renderer.js');
  const fn = source.match(/function setScreenDialogBounds\(dialog\) \{[\s\S]*?\n\}/)[0];
  const settings = { open: true, style: {} };
  const guide = { open: true, style: {} };
  let rect;
  const context = {
    tvSettingsDialog: settings,
    stage: { getBoundingClientRect: () => rect },
    window: { innerWidth: 1200, innerHeight: 800, SaturdayScenes: { active: true } },
    SCREEN_DIALOG_DESIGN: { settings: { width: 520, height: 380 }, guide: { width: 1000, height: 640 } }
  };
  const bounds = vm.runInNewContext(`${fn}; setScreenDialogBounds`, context);
  const actual = dialog => {
    const zoom = Number(dialog.style.zoom);
    const left = parseFloat(dialog.style.left) * zoom;
    const top = parseFloat(dialog.style.top) * zoom;
    return {
      left, top,
      right: left + parseFloat(dialog.style.width) * zoom,
      bottom: top + parseFloat(dialog.style.height) * zoom,
      zoom
    };
  };
  for (const active of [false, true]) {
    context.window.SaturdayScenes.active = active;
    for (const [left, top, width, height] of [
      [100, 40, 1000, 700], [500, 300, 180, 180], [590, 390, 20, 20],
      [-200, -100, 450, 450], [1100, 700, 500, 500], [0, 0, 1200, 800]
    ]) {
      rect = { left, top, width, height, right: left + width, bottom: top + height };
      bounds(settings);
      const box = actual(settings);
      assert.ok(box.left >= Math.max(0, left) && box.top >= Math.max(0, top));
      assert.ok(box.right <= Math.min(1200, rect.right) && box.bottom <= Math.min(800, rect.bottom));
      assert.ok(box.right > box.left && box.bottom > box.top);
      assert.ok(Math.abs((box.right - box.left) / (box.bottom - box.top) - 520 / 380) < 1e-8, 'settings content scales without cropping');
      bounds(guide);
      const guideBox = actual(guide);
      assert.ok(Math.abs(guideBox.left - 12) < 1e-8);
      assert.ok(Math.abs(guideBox.top - 23.68) < 1e-8);
      assert.ok(Math.abs(guideBox.right - 1188) < 1e-8, 'Guide remains window-sized, not tube-sized');
    }
  }
});

test('trackpad and touch pinches scale only the shared room zoom, with limits and persistence', () => {
  const source = read('scene-mode.js');
  const handlers = {};
  const settings = { zoom: 100, x: 0, y: 0, cabinetSize: 36 };
  let saved;
  const context = {
    settings, active: true, drag: null, pinch: null, gestureZoom: null, touches: new Map(), cinematicLockEnabled: () => false,
    viewport: { addEventListener(name, callback) { handlers[name] = callback; }, setPointerCapture() {} },
    document: { body: { classList: { add() {}, remove() {} } } },
    window: { innerWidth: 1000, innerHeight: 700 },
    clamp: (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback,
    sync() {}, layout() {}, save() { saved = structuredClone(settings); }
  };
  vm.runInNewContext(source.slice(source.indexOf('  function zoomBy('), source.indexOf("  for (const event of ['pointermove'")), context);
  const event = (id, x, extra = {}) => ({
    pointerId: id, clientX: x, clientY: 100, pointerType: 'touch', button: 0,
    target: { closest() { return false; } }, preventDefault() { this.prevented = true; }, ...extra
  });
  const wheel = event(0, 0, { deltaY: -30, ctrlKey: true });
  handlers.wheel(wheel);
  assert.equal(wheel.prevented, true);
  assert.ok(settings.zoom > 100);
  const baseZoom = settings.zoom;
  handlers.pointerdown(event(1, 100));
  handlers.pointerdown(event(2, 300));
  handlers.pointermove(event(2, 400));
  assert.ok(Math.abs(settings.zoom - baseZoom * 1.5) < 0.0001);
  assert.equal(settings.cabinetSize, 36);
  handlers.pointerup(event(1, 100));
  handlers.pointerup(event(2, 400));
  assert.equal(saved.cabinetSize, 36);
  assert.equal(saved.zoom, settings.zoom);
  handlers.wheel(event(0, 0, { deltaY: -10000, ctrlKey: true }));
  assert.equal(settings.zoom, 3200);
  handlers.gesturestart(event(0, 0));
  handlers.gesturechange(event(0, 0, { scale: 2 }));
  assert.equal(settings.zoom, 3200);
  handlers.gestureend();
  handlers.wheel(event(0, 0, { deltaY: 10000, ctrlKey: true }));
  assert.equal(settings.zoom, 25);
  assert.equal(settings.x, 0);
  assert.equal(settings.y, 0);
});

test('five original high-resolution room plates are served and have calibrated furniture anchors', () => {
  assert.equal(SCENES.length, 5);
  assert.equal(new Set(SCENES.map(scene => scene.id)).size, 5);
  for (const scene of SCENES) {
    const file = `assets/scenes/${scene.id}.jpg`;
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(bytes.readUInt16BE(0), 0xffd8, 'a real JPEG, not a placeholder');
    let offset = 2;
    let dimensions = null;
    while (offset < bytes.length) {
      const marker = bytes.readUInt16BE(offset);
      if ([0xffc0, 0xffc1, 0xffc2].includes(marker)) {
        dimensions = [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
        break;
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    assert.deepEqual(dimensions, [6144, 4096], `${scene.id} uses the upscaled zoom-friendly resolution`);
    assert.ok(scene.surface > 0.48 && scene.surface < 0.65);
    assert.ok(fs.existsSync(path.join(root, 'assets/scenes/originals', `${scene.id}.jpg`)), 'the original art is retained');
    assert.ok(read('main.cjs').includes(`'${file}': { file: '${file}', type: 'image/jpeg' }`));
    const detail = `assets/scenes/detail/${scene.id}.webp`;
    assert.equal(fs.existsSync(path.join(root, detail)), scene.detail, `${scene.id} detail layer presence matches SCENES`);
    if (scene.detail) {
      const webp = fs.readFileSync(path.join(root, detail));
      assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
      assert.equal(webp.toString('ascii', 12, 16), 'VP8X', 'extended WebP so the layer carries alpha');
      assert.ok(webp[20] & 0x10, 'alpha flag set');
      assert.deepEqual([1 + webp.readUIntLE(24, 3), 1 + webp.readUIntLE(27, 3)], [6144, 4096], 'detail covers the plate centre half at 2x density');
      assert.ok(read('main.cjs').includes(`'${detail}': { file: '${detail}', type: 'image/webp' }`));
    }
  }
});

test('scene preferences preserve zero light and clamp invalid or obsolete saved values', () => {
  const placement = { cabinetPositions: Object.fromEntries(SCENES.map(scene => [scene.id, { cabinetX: 0, cabinetY: 0 }])), screenHeight: 100, cabinetX: 0, cabinetY: 0 };
  const cabinetSize = 36;
  placement.cabinetAnchorSize = 36;
  const lights = value => Object.fromEntries(SCENES.map(scene => [scene.id, value]));
  const defaultSizes = Object.fromEntries(SCENES.map(scene => [scene.id, 36]));
  assert.deepEqual(normalizeSettings(null), { scene: 'kids-room', light: 65, zoom: 100, x: 0, y: 0, ...placement, roomLights: lights(65), cabinetSizes: defaultSizes, cabinetSize });
  assert.deepEqual(normalizeSettings({ scene: 'cyberpunk', light: 0, zoom: 25, x: 0.2, y: -0.3 }),
    { scene: 'cyberpunk', light: 0, zoom: 25, x: 0.2, y: -0.3, ...placement, roomLights: lights(0), cabinetSizes: defaultSizes, cabinetSize });
  assert.deepEqual(normalizeSettings({ scene: '../other', light: -12, zoom: Infinity, x: 4, y: NaN }),
    { scene: 'kids-room', light: 0, zoom: 100, x: 0.8, y: 0, ...placement, roomLights: lights(0), cabinetSizes: defaultSizes, cabinetSize });
  const cabinetSizes = { bedroom: 42, attic: 9, basement: 80 };
  assert.equal(normalizeSettings({ scene: 'bedroom', cabinetSizes }).cabinetSize, 42);
  assert.equal(normalizeSettings({ scene: 'attic', cabinetSizes }).cabinetSize, 20);
  assert.equal(normalizeSettings({ scene: 'basement', cabinetSizes }).cabinetSize, 65);
  assert.equal(normalizeSettings({ scene: 'bedroom', cabinetSize: 50, cabinetSizes }).cabinetSize, 50);
  assert.deepEqual(normalizeSettings({ scene: 'bedroom', cabinetSizes }).cabinetSizes.bedroom, 42);
  assert.equal(normalizeSettings({ scene: 'bedroom', cabinetSizes }).cabinetSizes.attic, 20, 'other rooms keep their own size after clamping');
  assert.equal(normalizeSettings({ scene: 'bedroom', cabinetX: 12, cabinetY: -4 }).cabinetPositions.bedroom.cabinetX, 12);
  assert.equal(normalizeSettings({ scene: 'bedroom', cabinetX: 12, cabinetY: -4 }).cabinetPositions['kids-room'].cabinetY, -4);
});

test('cinematic auto-zoom chooses the first picture-screen fit edge', () => {
  assert.deepEqual(screenFitLimit(100, { width: 400, height: 200 }, 1200, 800),
    { zoom: 300, ratio: 3, axis: 'width', alreadyFits: false });
  assert.deepEqual(screenFitLimit(100, { width: 300, height: 400 }, 1200, 800),
    { zoom: 200, ratio: 2, axis: 'height', alreadyFits: false });
  assert.deepEqual(screenFitLimit(100, { width: 300, height: 200 }, 1200, 800),
    { zoom: 400, ratio: 4, axis: 'both', alreadyFits: false });
  assert.deepEqual(autoZoomStep(175, 0.1, 16.667, { width: 1200, height: 900 }, 1200, 800),
    { zoom: 175, done: true, reason: 'height' }, 'already-filled screens stop immediately without overshooting');
  assert.equal(screenFitLimit(100, { width: 0, height: 200 }, 1200, 800), null);
});

test('cinematic auto-zoom advances smoothly at the selected frame rate and clamps to the exact fit', () => {
  const oneFrame = autoZoomStep(100, 0.1, 1000 / 60, { width: 400, height: 200 }, 1200, 800);
  assert.ok(Math.abs(oneFrame.zoom - 100.1) < 1e-9);
  assert.equal(oneFrame.done, false);
  const normalDelta = autoZoomStep(100, 0.1, 50, { width: 400, height: 200 }, 1200, 800);
  const stalledDelta = autoZoomStep(100, 0.1, 10_000, { width: 400, height: 200 }, 1200, 800);
  assert.equal(stalledDelta.zoom, normalDelta.zoom, 'a delayed frame cannot cause a large catch-up jump');
  const exactFit = autoZoomStep(100, 2, 1000, { width: 1150, height: 500 }, 1200, 900);
  assert.deepEqual(exactFit, { zoom: 100 * 1200 / 1150, done: true, reason: 'width' });
  assert.equal(1150 * exactFit.zoom / 100, 1200, 'picture reaches viewport width exactly on the stopping frame');
  assert.deepEqual(autoZoomStep(3200, 0.1, 16.667, { width: 400, height: 200 }, 1200, 800),
    { zoom: 3200, done: true, reason: 'max' });
});

test('the live animation loop holds the picture center and stops at the first viewport edge', () => {
  const source = read('scene-mode.js');
  const start = source.indexOf('  function stopAutoZoom(');
  const end = source.indexOf('  function showSceneChrome(', start);
  const loopSource = source.slice(start, end);
  const settings = { zoom: 100, x: 0, y: 0 };
  const viewportWidth = 1200;
  const viewportHeight = 800;
  const frames = new Map();
  const anchoredCenters = [];
  let nextFrameId = 0;
  let saved = 0;
  const autoZoomAnchor = { worldX: 768, worldY: 512, focusY: 512, screenX: viewportWidth / 2, screenY: viewportHeight / 2 };
  const screenRect = () => {
    const width = 700 * settings.zoom / 100;
    const height = 400 * settings.zoom / 100;
    const centerX = viewportWidth / 2 + settings.x * viewportWidth;
    const centerY = viewportHeight / 2 + settings.y * viewportHeight;
    return { left: centerX - width / 2, top: centerY - height / 2, width, height };
  };
  const toggle = { checked: true };
  const context = {
    developerBuild: true, active: true, settings,
    autoZoomToggle: toggle,
    autoZoomRate: { value: '2' },
    autoZoomStatus: { textContent: '' },
    autoZoomRaf: null, autoZoomLastTime: null, autoZoomPhase: 'in', autoZoomHoldUntil: null, autoZoomOutFloor: null,
    autoZoomMode: { value: 'original' }, autoZoomDirection: { value: 'in' },
    autoZoomAnchor, autoZoomScreenBase: { width: 700, height: 400 }, autoZoomLastOverlayAt: -Infinity,
    zoom: { value: '100' }, zoomValue: { textContent: '' },
    setCinematicControlsLocked() {}, updateScreenCutout() {},
    stage: { getBoundingClientRect: screenRect },
    window: {
      innerWidth: viewportWidth, innerHeight: viewportHeight,
      requestAnimationFrame(callback) { const id = ++nextFrameId; frames.set(id, callback); return id; },
      cancelAnimationFrame(id) { frames.delete(id); },
      dispatchEvent() {}
    },
    CustomEvent: class {},
    autoZoomStep, autoZoomOutStep, backgroundFillFloor, compensateZoomAnchor, anchoredScenePosition,
    sync() {},
    layout() { const rect = screenRect(); anchoredCenters.push([rect.left + rect.width / 2, rect.top + rect.height / 2]); },
    save() { saved += 1; }
  };
  const autoZoomFrame = vm.runInNewContext(`${loopSource}; autoZoomFrame`, context);
  let now = 1000;
  autoZoomFrame(now);
  for (let count = 0; toggle.checked && count < 100; count += 1) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    now += 1000 / 60;
    callback(now);
  }
  assert.equal(toggle.checked, false, 'the runtime turns itself off at the stop point');
  assert.equal(context.autoZoomStatus.textContent, 'STOPPED · PICTURE FIT WIDTH');
  assert.ok(Math.abs(screenRect().width - viewportWidth) < 1e-8, 'the picture reaches the first-fit width exactly');
  assert.ok(screenRect().height < viewportHeight, 'height was not allowed to overshoot before width fit');
  assert.ok(anchoredCenters.length > 1);
  for (const center of anchoredCenters) {
    assert.ok(Math.abs(center[0] - viewportWidth / 2) < 1e-8);
    assert.ok(Math.abs(center[1] - viewportHeight / 2) < 1e-8);
  }
  assert.equal(saved, 1, 'the final fit is persisted once, not on every animation frame');
  assert.equal(frames.size, 0, 'no animation frame remains scheduled after stopping');
});

test('zoom-out advances in smooth tenth-percent steps and stops on the exact requested floor', () => {
  const oneFrame = autoZoomOutStep(100, 0.1, 1000 / 60, 50);
  assert.ok(Math.abs(oneFrame.zoom - (100 / 1.001)) < 1e-9);
  assert.equal(oneFrame.done, false);
  const normal = autoZoomOutStep(100, 0.1, 50, 50);
  const stalled = autoZoomOutStep(100, 0.1, 10000, 50);
  assert.equal(stalled.zoom, normal.zoom, 'delayed frames cannot cause a sudden zoom-out jump');
  const exactFloor = autoZoomOutStep(50.01, 2, 1000, 50);
  assert.deepEqual(exactFloor, { zoom: 50, done: true });
  assert.deepEqual(autoZoomOutStep(25, 0.1, 16.667, 10), { zoom: 25, done: true }, 'the absolute minimum remains bounded');
});

test('boomerang zoom-out floor keeps the image covering the full viewport at its edge', () => {
  const anchor = { x: 400, y: 300 };
  const floor = backgroundFillFloor(100, { left: -400, right: 1200, top: -300, bottom: 900 }, anchor, 800, 600);
  assert.deepEqual(floor, { zoom: 50, ratio: 0.5, alreadyCovers: true });
  const roomStillTooSmall = backgroundFillFloor(25, { left: 100, right: 700, top: 100, bottom: 500 }, anchor, 800, 600);
  assert.ok(roomStillTooSmall.zoom > 25, 'the floor can move inward to prevent black bars');
  assert.equal(backgroundFillFloor(100, null, anchor, 800, 600), null);
});

test('boomerang holds 10 seconds at screen fit, returns to the image edge, holds 3 seconds, and repeats', () => {
  const source = read('scene-mode.js');
  const start = source.indexOf('  function cinematicLockEnabled(');
  const end = source.indexOf('  function showSceneChrome(', start);
  const runtime = source.slice(start, end);
  const settings = { zoom: 100, x: 0, y: 0, cabinetAnchorSize: 36 };
  const frames = new Map();
  const viewportWidth = 800;
  const viewportHeight = 600;
  let nextId = 0;
  let now = 0;
  const focusY = CABINET_SURFACE * 1024 - 500 * 36 / 100;
  const centeredRect = (width, height, centerX = 400, centerY = 300) => ({ left: centerX - width / 2, top: centerY - height / 2, width, height, right: centerX + width / 2, bottom: centerY + height / 2 });
  const sceneCenter = () => {
    const scale = Math.min(viewportWidth / 1536, viewportHeight / 1024) * settings.zoom / 100;
    const focus = Math.max(0, Math.min(1, (settings.zoom - 100) / 100));
    return { x: viewportWidth / 2 + settings.x * viewportWidth, y: viewportHeight / 2 + settings.y * viewportHeight + (512 - focusY) * scale * focus };
  };
  const screenRect = () => { const center = sceneCenter(); return centeredRect(400 * settings.zoom / 100, 200 * settings.zoom / 100, center.x, center.y); };
  const imageRect = () => sceneImageViewportRect(context.scenePlate, sceneLayout(viewportWidth, viewportHeight, settings, context.autoZoomAnchor?.focusY ?? focusY));
  const toggle = { checked: true };
  const context = {
    developerBuild: true, active: true, settings, autoZoomToggle: toggle,
    autoZoomRate: { value: '2' }, autoZoomStatus: { textContent: '' },
    autoZoomMode: { value: 'boomerang' }, autoZoomDirection: { value: 'in', disabled: true },
    autoZoomRaf: null, autoZoomLastTime: null, autoZoomPhase: 'in', autoZoomHoldUntil: null, autoZoomOutFloor: null,
    autoZoomAnchor: null, autoZoomScreenBase: null, autoZoomLastOverlayAt: -Infinity,
    scenePlate: roomPlateLayout(CABINET_SURFACE),
    zoom: { value: '100' }, zoomValue: { textContent: '' },
    stage: { getBoundingClientRect: screenRect },
    cabinet: { offsetHeight: 700, getBoundingClientRect: () => ({ top: 0, height: 700 }) },
    CABINET_SURFACE, sceneLayout, sceneImageViewportRect, roomPlateLayout,
    window: {
      innerWidth: viewportWidth, innerHeight: viewportHeight,
      requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
      cancelAnimationFrame(id) { frames.delete(id); },
      dispatchEvent() {}
    },
    document: { querySelector() { return { disabled: false }; } },
    CustomEvent: class {},
    autoZoomStep, autoZoomOutStep, backgroundFillFloor, compensateZoomAnchor, anchoredScenePosition,
    sync() {}, layout() {}, save() {},
    MAX_SCENE_ZOOM: 3200, clamp: (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback,
    setCinematicControlsLocked() {}
  };
  const startLoop = vm.runInNewContext(`${runtime}; startAutoZoom`, context);
  const advance = delta => {
    now += delta;
    const [, callback] = frames.entries().next().value;
    frames.clear();
    callback(now);
  };
  startLoop();
  assert.ok(Math.abs(context.autoZoomOutFloor - 56.25) < 1e-8, 'the room-image floor is calculated from the bounded canvas background');
  for (let i = 0; context.autoZoomPhase !== 'out' && i < 120; i += 1) advance(50);
  assert.equal(context.autoZoomPhase, 'out');
  assert.equal(context.autoZoomHoldUntil, now + 10_000);
  assert.equal(context.autoZoomStatus.textContent, 'SCREEN-SIZE HOLD · 10 SEC');
  assert.ok(Math.abs(settings.zoom - 200) < 1e-9, 'the TV reaches the first fit edge without overshoot');
  advance(10_001);
  for (let i = 0; context.autoZoomPhase !== 'in' && context.autoZoomHoldUntil === null && i < 120; i += 1) advance(50);
  assert.equal(context.autoZoomPhase, 'in');
  assert.ok(Math.abs(settings.zoom - 56.25) < 1e-8, 'zoom-out stops exactly at the background-cover edge');
  const roomEdge = imageRect();
  assert.ok(roomEdge.left <= 0 && roomEdge.top <= 0);
  assert.ok(roomEdge.right >= viewportWidth && roomEdge.bottom >= viewportHeight, 'the visible room image covers all viewport edges with no black');
  assert.equal(context.autoZoomHoldUntil, now + 3_000);
  assert.equal(context.autoZoomStatus.textContent, 'BACKGROUND-EDGE HOLD · 3 SEC');
  advance(3_001);
  advance(50);
  assert.ok(settings.zoom > 50, 'the next in-cycle begins after the 3-second hold');
  assert.equal(toggle.checked, true, 'boomerang remains enabled indefinitely');
});

test('cinematic lock disables framing controls and blocks manual pan, wheel and pinch zoom', () => {
  const source = read('scene-mode.js');
  const controls = new Map();
  const context = {
    developerBuild: true, autoZoomToggle: { checked: true },
    document: { querySelector(id) { if (!controls.has(id)) controls.set(id, { disabled: false }); return controls.get(id); } }
  };
  const lockFn = source.match(/  function setCinematicControlsLocked\(locked\) \{[\s\S]*?\n  \}/)[0];
  const setLock = vm.runInNewContext(`${lockFn}; setCinematicControlsLocked`, context);
  setLock(true);
  for (const id of ['#sceneZoom', '#sceneCabinetSize', '#sceneScreenHeight', '#sceneCabinetX', '#sceneCabinetY', '#sceneCabinetReset', '#sceneReset']) {
    assert.equal(controls.get(id).disabled, true, `${id} locks while cinematic mode runs`);
  }
  assert.equal(controls.has('#sceneSelect'), false, 'room browsing remains available');
  setLock(false);
  for (const [, control] of controls) assert.equal(control.disabled, false);

  const handlers = {};
  const settings = { zoom: 300, x: 0, y: 0 };
  let captures = 0;
  Object.assign(context, {
    settings, active: true, drag: null, pinch: null, gestureZoom: null, touches: new Map(),
    cinematicLockEnabled: () => true,
    viewport: { addEventListener(name, callback) { handlers[name] = callback; }, setPointerCapture() { captures += 1; } },
    document: { body: { classList: { add() {}, remove() {} } } },
    window: { innerWidth: 800, innerHeight: 600 },
    clamp: (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback,
    sync() {}, layout() {}, save() {}
  });
  vm.runInNewContext(`${source.slice(source.indexOf('  function zoomBy('), source.indexOf("  for (const event of ['pointermove'"))}; this.zoomBy = zoomBy;`, context);
  context.zoomBy(2);
  assert.equal(settings.zoom, 300);
  const event = extra => ({ pointerId: 1, clientX: 20, clientY: 30, pointerType: 'touch', button: 0, target: { closest: () => false }, preventDefault() { this.prevented = true; }, ...extra });
  const wheel = event({ deltaY: 1000, ctrlKey: true });
  handlers.wheel(wheel);
  assert.equal(wheel.prevented, true);
  assert.equal(settings.zoom, 300);
  handlers.pointerdown(event());
  assert.equal(context.drag, null);
  assert.equal(captures, 0);
});

test('auto-zoom compensates the live TV picture center so scale changes do not move it', () => {
  const settings = { x: 0.1, y: -0.1 };
  const before = { left: 400, top: 300, width: 200, height: 100 };
  const after = { left: 350, top: 250, width: 300, height: 150 };
  const anchored = compensateZoomAnchor(settings, before, after, 1000, 800);
  const correctedCenter = {
    x: after.left + after.width / 2 + (anchored.x - settings.x) * 1000,
    y: after.top + after.height / 2 + (anchored.y - settings.y) * 800
  };
  assert.deepEqual(correctedCenter, { x: 500, y: 350 });
  assert.deepEqual(compensateZoomAnchor(settings, before, after, 0, 800), settings);
});

test('automatic zoom UI stays developer-only and shows tenth-percent increments', () => {
  const html = read('index.html');
  const script = read('scene-mode.js');
  assert.match(html, /id="sceneDeveloperAutoZoom" class="scene-auto-zoom" hidden/);
  assert.match(html, /id="sceneAutoZoomRate" type="range" min="0\.1" max="2" step="0\.1"/);
  assert.match(html, /id="sceneAutoZoomMode"[\s\S]*value="boomerang"/);
  assert.match(html, /id="sceneAutoZoomDirection"[\s\S]*value="out"/);
  assert.match(html, /room-image edge without black/);
  assert.match(html, /id="sceneZoom"[^>]*step="0\.1"/);
  assert.match(script, /window\.tube\?\.isDeveloperBuild === true/);
  assert.match(script, /developerAutoZoomPanel\.hidden = !developerBuild/);
  assert.match(script, /sceneZoomValue'\)\.textContent = `\$\{settings\.zoom\.toFixed\(1\)\}%`/);
  assert.match(script, /window\.requestAnimationFrame\(autoZoomFrame\)/);
});

test('TV room illumination follows frame brightness and colour, including true black', () => {
  assert.deepEqual(screenLight(new Uint8ClampedArray([0, 0, 0, 255])), { color: '0 0 0', strength: 0 });
  assert.deepEqual(screenLight(new Uint8ClampedArray([255, 255, 255, 255])), { color: '255 255 255', strength: 1 });
  const red = screenLight(new Uint8ClampedArray([255, 0, 0, 255]));
  assert.equal(red.color, '255 0 0');
  assert.ok(red.strength > 0);
  const blue = screenLight(new Uint8ClampedArray([0, 0, 255, 255]));
  assert.equal(blue.color, '0 0 255');
  assert.ok(blue.strength > 0 && blue.strength < red.strength);
  assert.ok(screenLight(new Uint8ClampedArray([12, 12, 12, 255])).strength < 0.1);
});

test('room size and lighting edits survive reload without changing the persistent TV anchor', () => {
  const settings = normalizeSettings({ scene: 'bedroom', cabinetSize: 45, screenHeight: 125 });
  const before = structuredClone(settings);
  settings.cabinetSizes.bedroom = 65;
  settings.cabinetSize = 65;
  settings.cabinetPositions.bedroom = { cabinetX: 24, cabinetY: -10 };
  settings.roomLights.bedroom = 0;
  const restored = normalizeSettings(JSON.parse(JSON.stringify(settings)));
  assert.equal(restored.cabinetAnchorSize, 45);
  assert.equal(restored.screenHeight, 125);
  for (const scene of SCENES.filter(scene => scene.id !== 'bedroom')) {
    assert.equal(restored.cabinetSizes[scene.id], before.cabinetSizes[scene.id]);
    assert.deepEqual(restored.cabinetPositions[scene.id], before.cabinetPositions[scene.id]);
    assert.equal(restored.roomLights[scene.id], before.roomLights[scene.id]);
  }
  assert.equal(restored.roomLights.bedroom, 0);
  const surface = SCENES.find(scene => scene.id === 'bedroom').surface;
  const original = roomPlateLayout(surface);
  const smallerFurniture = roomPlateLayout(surface, {}, restored.cabinetAnchorSize / 65);
  assert.ok(Math.abs(smallerFurniture.width / original.width - 45 / 65) < 1e-10);
});

test('TV placement sliders reframe only the background and save independently of room framing', () => {
  const source = read('scene-mode.js');
  const settings = normalizeSettings({ x: 0.12, y: -0.2, zoom: 450, cabinetX: 10, cabinetY: -5 });
  const original = structuredClone(settings);
  const handlers = {};
  const controls = {
    '#sceneCabinetX': { value: '-12.5' },
    '#sceneCabinetY': { value: '7.5' },
    '#sceneCabinetReset': {}
  };
  for (const [id, control] of Object.entries(controls)) {
    control.addEventListener = (name, callback) => { handlers[`${id}:${name}`] = callback; };
  }
  let saved;
  const context = {
    settings, document: { querySelector: id => controls[id] },
    sync() {}, save() { saved = JSON.stringify(settings); }
  };
  const start = source.indexOf("  for (const axis of ['X', 'Y']) {", source.indexOf("  cabinetSize.addEventListener"));
  const end = source.indexOf("  document.querySelector('#sceneReset')", start);
  vm.runInNewContext(source.slice(start, end), context);
  handlers['#sceneCabinetX:input']();
  handlers['#sceneCabinetY:input']();
  const restored = normalizeSettings(JSON.parse(saved));
  assert.equal(restored.cabinetPositions['kids-room'].cabinetX, -12.5);
  assert.equal(restored.cabinetPositions['kids-room'].cabinetY, 7.5);
  assert.deepEqual(restored.cabinetPositions.bedroom, original.cabinetPositions.bedroom, 'moving this room leaves another unchanged');
  assert.equal(restored.x, original.x);
  assert.equal(restored.y, original.y);
  assert.equal(restored.zoom, original.zoom);
  assert.equal(restored.cabinetSize, original.cabinetSize);
  handlers['#sceneCabinetReset:click']();
  assert.equal(settings.cabinetPositions['kids-room'].cabinetX, 0);
  assert.equal(settings.cabinetPositions['kids-room'].cabinetY, 0);
  assert.deepEqual(settings.cabinetPositions.bedroom, original.cabinetPositions.bedroom, 'centering only affects the selected room');
  assert.equal(settings.zoom, 450, 'centering the TV does not reset room zoom');
  assert.equal(settings.x, original.x);
  settings.scene = 'bedroom';
  controls['#sceneCabinetX'].value = '18';
  handlers['#sceneCabinetX:input']();
  assert.equal(settings.cabinetPositions.bedroom.cabinetX, 18);
  assert.equal(settings.cabinetPositions['kids-room'].cabinetX, 0, 'adjusting a second room leaves the first room centered');
  const persisted = normalizeSettings(JSON.parse(saved));
  assert.equal(persisted.cabinetPositions.bedroom.cabinetX, 18);
  assert.equal(persisted.cabinetPositions['kids-room'].cabinetX, 0);
  assert.equal(normalizeSettings({ cabinetX: Infinity, cabinetY: NaN }).cabinetPositions['kids-room'].cabinetX, 0);
  assert.equal(normalizeSettings({ cabinetX: 100, cabinetY: -100 }).cabinetPositions['kids-room'].cabinetX, 30);
  assert.equal(normalizeSettings({ cabinetX: 100, cabinetY: -100 }).cabinetPositions['kids-room'].cabinetY, -20);
  assert.match(source, /scenePlate = roomPlateLayout\(selected\.surface, position, settings\.cabinetAnchorSize \/ size\)/);
  const movedPlate = roomPlateLayout(SCENES[0].surface, { cabinetX: -12.5, cabinetY: 7.5 }, settings.cabinetAnchorSize / settings.cabinetSize);
  assert.notEqual(movedPlate.left + movedPlate.width / 2, roomPlateLayout(SCENES[0].surface).left + roomPlateLayout(SCENES[0].surface).width / 2, 'placement shifts the room image, not the viewport canvas');
  const layout = source.match(/  function layout\([^)]*\) \{[\s\S]*?\n  \}/)[0];
  assert.match(layout, /mount\.style\.left/);
  assert.doesNotMatch(layout, /scenePlate|world\.style\.transform/);
});

test('screen height saves across restarts without changing cabinet size, placement or room framing', () => {
  const source = read('scene-mode.js');
  const settings = normalizeSettings({ cabinetX: 12, cabinetY: -3, cabinetSize: 45, zoom: 350 });
  let handler;
  let saved;
  const context = {
    settings,
    document: { querySelector: id => {
      assert.equal(id, '#sceneScreenHeight');
      return { addEventListener: (name, callback) => { assert.equal(name, 'input'); handler = callback; } };
    } },
    sync() {}, save() { saved = JSON.stringify(settings); }
  };
  const start = source.indexOf("  document.querySelector('#sceneScreenHeight').addEventListener");
  vm.runInNewContext(source.slice(start, source.indexOf("  for (const axis", start)), context);
  handler({ target: { value: '75' } });
  assert.deepEqual(normalizeSettings(JSON.parse(saved)), { ...normalizeSettings({ cabinetX: 12, cabinetY: -3, cabinetSize: 45, zoom: 350 }), screenHeight: 75 });
  assert.equal(normalizeSettings({ screenHeight: 1 }).screenHeight, 50);
  assert.equal(normalizeSettings({ screenHeight: 500 }).screenHeight, 150);
  assert.equal(normalizeSettings({ screenHeight: NaN }).screenHeight, 100);
  assert.match(read('scene-mode.css'), /aspect-ratio:100 \/ var\(--scene-screen-height,100\)/);
  assert.match(read('renderer.js'), /if \(mediaAspect > viewAspect\)[^\n]*viewHeight = Math\.round\(width \/ mediaAspect\)/, 'video retains automatic letterbox/pillarbox fitting');
});

test('changing screen height never changes the world framing, even at deep zoom', () => {
  const source = read('scene-mode.js');
  const fn = source.match(/  function layout\([^)]*\) \{[\s\S]*?\n  \}/)[0];
  for (const zoom of [100, 350, 1600]) {
    let height = 900;
    const bottom = 1150;
    const context = {
      active: true, settings: normalizeSettings({ zoom }), CABINET_SURFACE, sceneLayout,
      cabinet: {
        get offsetHeight() { return height + 250; },
        getBoundingClientRect: () => ({ top: bottom - height - 250, height: height + 250 })
      },
      stage: { getBoundingClientRect: () => ({ top: bottom - height - 150, bottom: bottom - 150, width: 900, height }) },
      mount: { style: {} }, window: { innerWidth: 1920, innerHeight: 1080, dispatchEvent() {} },
      CustomEvent: class {}, drawSceneBackground() {}, updateScreenCutout() {}
    };
    const layout = vm.runInNewContext(`${fn}; layout`, context);
    layout();
    const expected = { ...context.mount.style };
    for (height of [450, 1350, 900]) {
      layout();
      assert.deepEqual(context.mount.style, expected, `screen height ${height} cannot shift the controls at ${zoom}% zoom`);
    }
  }
});

test('zooming in brings the cabinet toward the display centre instead of cutting its top off', () => {
  const settings = { ...normalizeSettings(null), zoom: 200 };
  const layout = sceneLayout(1920, 1080, settings, 300);
  const transformedTVCenter = layout.y + (300 - 512) * layout.scale;
  assert.equal(transformedTVCenter, 540);
  const shifted = sceneLayout(1920, 1080, { ...settings, y: 0.1 }, 300);
  assert.equal(shifted.y - layout.y, 108);
});

test('maximum scene zoom can fill the display with the screen even at the smallest cabinet size', () => {
  const settings = normalizeSettings({ zoom: 3200, cabinetSize: 20 });
  assert.equal(settings.zoom, 3200, 'deep zoom survives preference restoration');
  assert.equal(normalizeSettings({ zoom: 10000 }).zoom, 3200);
  assert.match(read('index.html'), /id="sceneZoom"[^>]*max="3200"/);
  const source = read('scene-mode.js');
  const layoutFunction = source.match(/  function layout\([^)]*\) \{[\s\S]*?\n  \}/)[0];
  for (const [width, height] of [[1920, 1080], [3440, 1440], [5120, 1440], [1024, 1366]]) {
    const context = {
      active: true, settings, CABINET_SURFACE, sceneLayout,
      cabinet: { offsetHeight: 1150, getBoundingClientRect: () => ({ top: 100, height: 230 }) },
      stage: { getBoundingClientRect: () => ({ top: 110, bottom: 290, height: 180, width: 180 }) },
      mount: { style: {} }, window: { innerWidth: width, innerHeight: height, dispatchEvent() {} },
      CustomEvent: class {}, drawSceneBackground() {}, updateScreenCutout() {}
    };
    const layout = vm.runInNewContext(`${layoutFunction}; layout`, context);
    layout();
    const outer = context.cabinet.getBoundingClientRect();
    const screen = context.stage.getBoundingClientRect();
    const screenCenter = (screen.bottom - screen.width / 2 - outer.top) / outer.height * context.cabinet.offsetHeight;
    const focusY = CABINET_SURFACE * 1024 - (context.cabinet.offsetHeight - screenCenter) * settings.cabinetAnchorSize / 100;
    const projected = sceneLayout(width, height, settings, focusY);
    assert.equal(context.mount.style.left, `${projected.x}px`);
    assert.equal(context.mount.style.top, `${projected.y + (CABINET_SURFACE * 1024 - 512) * projected.scale}px`);
    assert.equal(context.mount.style.transform, `translate(-50%, -100%) scale(${settings.cabinetAnchorSize / 100 * projected.scale})`);
  }
});

test('default scenes fit all monitor shapes without cropping the TV; zoom and drag move one world', () => {
  for (const [width, height] of [[1920, 1080], [3440, 1440], [1024, 1366], [1280, 820]]) {
    const settings = normalizeSettings(null);
    const normal = sceneLayout(width, height, settings);
    assert.ok(1536 * normal.scale <= width + 0.001);
    assert.ok(1024 * normal.scale <= height + 0.001);
    assert.ok(Math.abs(1536 * normal.scale - width) < 0.001 || Math.abs(1024 * normal.scale - height) < 0.001);
    assert.equal(normal.x, width / 2);
    assert.equal(normal.y, height / 2);
    const small = sceneLayout(width, height, { ...settings, zoom: 25, x: 0.1, y: -0.1 });
    assert.equal(small.scale, normal.scale / 4);
    assert.equal(small.x, width * 0.6);
    assert.equal(small.y, height * 0.4);
    assert.ok(1536 * small.scale < width && 1024 * small.scale < height, 'black surroundings at minimum zoom');
  }
});

test('all room plates align their furniture to the same anchor and still cover the entire room', () => {
  for (const scene of SCENES) {
    const plate = roomPlateLayout(scene.surface);
    assert.ok(Math.abs(plate.top + scene.surface * plate.height - CABINET_SURFACE * 1024) < 1e-8);
    assert.ok(plate.left <= 1e-8 && plate.top <= 1e-8);
    assert.ok(plate.left + plate.width >= 1536 - 1e-8);
    assert.ok(plate.top + plate.height >= 1024 - 1e-8);
    assert.ok(Math.abs(plate.width / plate.height - 1.5) < 1e-8, 'background art retains its aspect ratio');
  }
});

test('background placement moves the furniture opposite the controls and never exposes plate edges', () => {
  for (const scene of SCENES) {
    for (const cabinetX of [-30, -10, 0, 10, 30]) {
      for (const cabinetY of [-20, -5, 0, 5, 20]) {
        const plate = roomPlateLayout(scene.surface, { cabinetX, cabinetY });
        assert.ok(Math.abs(plate.left + plate.width / 2 - 1536 * (0.5 - cabinetX / 100)) < 1e-8);
        assert.ok(Math.abs(plate.top + scene.surface * plate.height - 1024 * (CABINET_SURFACE - cabinetY / 100)) < 1e-8);
        assert.ok(plate.left <= 1e-8 && plate.top <= 1e-8);
        assert.ok(plate.left + plate.width >= 1536 - 1e-8);
        assert.ok(plate.top + plate.height >= 1024 - 1e-8);
        assert.ok(Math.abs(plate.width / plate.height - 1.5) < 1e-8);
      }
    }
  }
});

test('switching scenes restores per-room background placement without moving the cabinet at any zoom', async () => {
  const source = read('scene-mode.js');
  const extract = name => source.match(new RegExp(`  (?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}`))[0];
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', getAttribute: () => '', style: {} });
    return nodes.get(id);
  };
  const properties = new Map();
  const settings = normalizeSettings({ scene: 'bedroom', cabinetSizes: { bedroom: 45, attic: 33 }, cabinetX: 12, cabinetY: -4 });
  const context = {
    SCENES, CABINET_SURFACE, roomPlateLayout, sceneLayout,
    settings, cinematicLockEnabled: () => false, developerBuild: false, autoZoomToggle: { checked: false },
    active: true, select: {}, light: {}, zoom: {}, cabinetSize: {},
    cabinet: { offsetHeight: 1150, getBoundingClientRect: () => ({ top: 0, height: 1150 }) },
    stage: { getBoundingClientRect: () => ({ top: 50, bottom: 950, height: 900, width: 900 }) },
    world: { style: { setProperty: (key, value) => properties.set(key, value) } },
    mount: { style: {} }, scenePlate: null, drawSceneBackground() {},
    document: { querySelector: node },
    window: { innerWidth: 1920, innerHeight: 1080, dispatchEvent() {} },
    CustomEvent: class {},
    updateScreenCutout() {}, loadImage: async () => true, save() {}
  };
  for (const [index, scene] of SCENES.entries()) {
    context.settings.cabinetPositions[scene.id] = { cabinetX: index * 3, cabinetY: index ? -index * 2 : 0 };
    context.settings.roomLights[scene.id] = index * 20;
  }
  const restored = normalizeSettings(JSON.parse(JSON.stringify(context.settings)));
  assert.deepEqual(restored.cabinetPositions, context.settings.cabinetPositions, 'all room positions survive restart independently');
  context.scene = () => SCENES.find(item => item.id === context.settings.scene);
  vm.createContext(context);
  vm.runInContext(['scene', 'layout', 'sync', 'chooseScene'].map(extract).join('\n'), context);
  for (const zoom of [25, 100, 175, 240, 1000, 3200]) {
    context.settings.zoom = zoom;
    context.settings.x = 0.13;
    context.settings.y = -0.07;
    let geometry;
    for (const selected of [...SCENES, SCENES[0]]) {
      await context.chooseScene(selected.id);
      const size = context.settings.cabinetSizes[selected.id] ?? 36;
      const actual = [context.mount.style.left, context.mount.style.top, context.mount.style.transform, properties.get('--scene-screen-height')];
      geometry ??= actual;
      assert.deepEqual(actual, geometry, 'TV position, height and scale stay exactly fixed across all rooms');
      assert.equal(settings.light, restored.roomLights[selected.id]);
      assert.equal(context.settings.cabinetSize, size, 'scene size is retained per room and does not leak to other scenes');
      const plate = roomPlateLayout(selected.surface, restored.cabinetPositions[selected.id], settings.cabinetAnchorSize / size);
      for (const [key, value] of Object.entries(plate)) assert.ok(Math.abs(context.scenePlate[key] - value) < 1e-8, `${selected.id} ${key} follows its saved room placement`);
      assert.equal(node('#sceneCabinetX').value, String(restored.cabinetPositions[selected.id].cabinetX));
      assert.equal(node('#sceneCabinetY').value, String(restored.cabinetPositions[selected.id].cabinetY));
    }
  }
});

test('scene lighting excludes the picture, and room settings remain reachable from the HUD and remote', () => {
  const js = read('scene-mode.js');
  assert.match(js, /mount\.append\(cabinet\)/);
  assert.match(js, /home\.after\(cabinet\)/, 'leaving restores the existing cabinet instead of cloning playback');
  assert.match(js, /shade\.style\.clipPath = screenCutoutPath\(outer, screen\)/);
  assert.match(js, /screenLip\.className = 'scene-screen-lip';[\s\S]*?stage\.append\(screenLip\)/);
  const css = read('scene-mode.css');
  assert.match(css, /body\.scene-mode \.scene-screen-lip \{[^}]*inset 7px 10px 14px -4px rgb\(0 0 0 \/ calc\(var\(--scene-light,\.65\) \* \.55 \* \(1 - min\(1, var\(--screen-light/, 'the bezel lip shades the glass until the picture outshines it');
  assert.match(css, /body\.scene-mode #tvSet \.screen-bezel \{[^}]*5px 8px 10px -1px rgb\(0 0 0 \/ calc\(\.16 \+ var\(--scene-light/, 'the raised bezel casts away from the key light');
  assert.match(css, /linear-gradient\(to top,rgb\(0 0 0 \/ \.32\)/, 'ambient occlusion at the cabinet base');
  assert.match(js, /function screenCutoutPath[\s\S]*?getComputedStyle\(stage\)[\s\S]*?borderTopLeftRadius[\s\S]*?path\(evenodd, "M0 0H/, 'the shade hole follows the rounded tube corners');
  assert.match(js, /new ResizeObserver\(\(\) => \{[\s\S]*?if \(!cinematicLockEnabled\(\)\) layout\(\);[\s\S]*?\}\)\.observe\(stage\)/);
  assert.match(js, /const sceneCanvasContext = image\.getContext\('2d', \{ alpha: false, desynchronized: true \}\)/);
  assert.match(read('scene-mode.css'), /#sceneViewport \{[^}]*position:fixed; inset:0;[^}]*background:#000/);
  assert.match(read('scene-mode.css'), /#sceneImage \{[^}]*position:absolute; inset:0;[^}]*width:100%; height:100%/);
  assert.match(read('scene-mode.css'), /#sceneHud \{ position:fixed/);
  assert.match(read('renderer.js'), /'audio', 'video', 'cabinet', 'scenes', 'breaks', 'tapes', 'channels', 'remote'/);
  assert.match(read('remote/index.html'), /data-action="scene-next"/);
});

test('room canvas has a bounded fixed backing store and paints in viewport coordinates', () => {
  for (const [width, height, dpr] of [[1920, 1080, 2], [5120, 1440, 3], [900, 4096, 2], [7680, 4320, 4]]) {
    const size = boundedCanvasSize(width, height, dpr);
    assert.ok(size.pixels <= MAX_SCENE_CANVAS_PIXELS);
    assert.ok(size.width <= MAX_SCENE_CANVAS_EDGE && size.height <= MAX_SCENE_CANVAS_EDGE);
    assert.ok(size.scaleX <= dpr && size.scaleY <= dpr);
  }
  assert.equal(boundedCanvasSize(0, 1080, 2), null);
  assert.equal(boundedCanvasSize(1920, 1080, Infinity), null);
  const source = read('scene-mode.js');
  const css = read('scene-mode.css');
  const html = read('index.html');
  assert.ok(html.includes('<canvas id="sceneImage" aria-hidden="true"></canvas>'));
  assert.ok(css.includes('#sceneWorld { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; contain:strict; background:#000;'));
  const canvasRule = css.split('\n').find(line => line.startsWith('#sceneImage '));
  assert.doesNotMatch(canvasRule, /transform:|filter:|mix-blend-mode/);
  assert.ok(source.includes('mount.style.transform = `translate(-50%, -100%) scale('));
  const layoutStart = source.indexOf('  function layout(');
  const layout = source.slice(layoutStart, source.indexOf('\n  }', layoutStart) + 4);
  assert.ok(!layout.includes('world.style.transform'));

  const drawStart = source.indexOf('  function ensureSceneCanvasSize()');
  const draw = source.slice(drawStart, source.indexOf('\n  function updateScreenCutout()', drawStart));
  const draws = [];
  const ctx = {
    setTransform: (...args) => draws.push(['transform', ...args]),
    fillRect: (...args) => draws.push(['fill', ...args]),
    drawImage: (...args) => draws.push(['image', ...args]),
    createRadialGradient() { return { addColorStop() {} }; },
    save() {}, translate() {}, scale() {}, restore() {}
  };
  const canvas = { width: 0, height: 0 };
  const settings = { ...normalizeSettings(null), light: 65 };
  const plate = roomPlateLayout(CABINET_SURFACE);
  const camera = sceneLayout(1920, 1080, settings);
  const room = { src: 'room' };
  const context = {
    image: canvas, sceneCanvasContext: ctx,
    window: { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 2 },
    boundedCanvasSize, sceneImageViewportRect, MAX_SCENE_CANVAS_PIXELS, MAX_SCENE_CANVAS_EDGE,
    active: true, currentCamera: camera, sceneImageAsset: room, scenePlate: plate,
    sceneDetailAsset: null, sceneDetailScene: null, detailFade: 0, detailFadeGoal: 0, detailFadeFrame: null,
    sceneFocusBlur: null, sceneFocusLayer: null, focusBlurStrength, detailFadeTarget, easeDetailFade, sceneDetailViewportRect,
    scene: () => SCENES[0], performance: { now: () => 0 }, requestAnimationFrame: () => 1,
    sceneGlowAnchorWorld: { x: 768, y: 512 }, screenLightColor: '0 0 0', screenLightStrength: 0, screenLightReach: 1,
    settings, CABINET_SURFACE
  };
  vm.runInNewContext(`${draw}; drawSceneBackground`, context)(camera);
  const expected = sceneImageViewportRect(plate, camera);
  assert.ok(canvas.width * canvas.height <= MAX_SCENE_CANVAS_PIXELS);
  assert.ok(canvas.width <= MAX_SCENE_CANVAS_EDGE && canvas.height <= MAX_SCENE_CANVAS_EDGE);
  assert.deepEqual(draws.find(call => call[0] === 'transform'), ['transform', canvas.width / 1920, 0, 0, canvas.height / 1080, 0, 0]);
  assert.deepEqual(draws.find(call => call[0] === 'fill'), ['fill', 0, 0, 1920, 1080]);
  assert.deepEqual(draws.find(call => call[0] === 'image'), ['image', room, expected.left, expected.top, expected.width, expected.height]);
});

test('drag, screen edits and lighting redraws use the same committed camera without background jumps', () => {
  const source = read('scene-mode.js');
  const layoutSource = source.match(/  function layout\([^)]*\) \{[\s\S]*?\n  \}/)[0];
  const cutoutSource = source.match(/  function updateScreenCutout\(\) \{[\s\S]*?\n  \}/)[0];
  for (const zoom of [100, 150, 220, 350, 1600]) {
    let screenHeight = 900;
    let renderedOuter;
    let renderedScreen;
    const paints = [];
    const settings = normalizeSettings({ zoom });
    const context = {
      active: true, settings, CABINET_SURFACE, sceneLayout, currentCamera: null,
      cabinet: {
        get offsetHeight() { return screenHeight + 250; },
        getBoundingClientRect: () => renderedOuter
      },
      stage: { getBoundingClientRect: () => renderedScreen },
      mount: { style: {} },
      shade: { style: { setProperty() {} } },
      screenCutoutPath: () => 'path(evenodd, "")',
      window: { innerWidth: 1920, innerHeight: 1080, dispatchEvent() {} },
      CustomEvent: class {},
      drawSceneBackground(camera = context.currentCamera) { paints.push(camera); }
    };
    const geometry = () => {
      const camera = context.currentCamera || sceneLayout(1920, 1080, settings);
      const scale = settings.cabinetAnchorSize / 100 * camera.scale;
      const bottom = camera.y + (CABINET_SURFACE * 1024 - 512) * camera.scale;
      const left = camera.x - 1000 * scale / 2;
      renderedOuter = { left, top: bottom - (screenHeight + 250) * scale, width: 1000 * scale, height: (screenHeight + 250) * scale };
      renderedScreen = {
        left: left + 50 * scale, right: left + 950 * scale,
        top: bottom - (screenHeight + 150) * scale, bottom: bottom - 150 * scale,
        width: 900 * scale, height: screenHeight * scale
      };
    };
    geometry();
    const { layout, updateScreenCutout } = vm.runInNewContext(`${layoutSource}\n${cutoutSource}; ({ layout, updateScreenCutout })`, context);
    for (const height of [900, 450, 1350, 900]) {
      screenHeight = height;
      for (let step = 0; step < 4; step += 1) {
        settings.x = step * 0.02;
        settings.y = step * -0.03;
        geometry();
        paints.length = 0;
        layout();
        assert.equal(paints.length, 1, 'a layout paints once, not once per camera calculation');
        const committed = context.currentCamera;
        geometry();
        updateScreenCutout();
        context.drawSceneBackground(); // A subsequent picture-light/detail redraw.
        assert.ok(paints.every(camera => camera === committed), `all paints use the TV camera at ${zoom}% zoom / height ${height}`);
        const expected = sceneImageViewportRect(roomPlateLayout(CABINET_SURFACE), committed);
        for (const camera of paints) {
          assert.deepEqual(sceneImageViewportRect(roomPlateLayout(CABINET_SURFACE), camera), expected);
        }
        assert.ok(Math.abs(committed.y + (context.sceneGlowAnchorWorld.y - 512) * committed.scale -
          (renderedScreen.top + renderedScreen.height / 2)) < 1e-8, 'illumination stays centred on the rendered screen');
        paints.length = 0;
        layout({ refreshDecorations: false, focusYOverride: 300 });
        assert.equal(paints.length, 1, 'cinematic zoom still paints without updating the cutout');
        assert.equal(paints[0], context.currentCamera);
      }
    }
  }
});

test('room cycling wraps, preserves shared sizing and rolls back an unavailable image', async () => {
  const source = read('scene-mode.js');
  const choose = source.match(/  async function chooseScene\(id\) \{[\s\S]*?\n  \}/)[0];
  const next = source.match(/  async function nextScene\(\) \{[\s\S]*?\n  \}/)[0];
  const settings = normalizeSettings({ cabinetSizes: { bedroom: 45, attic: 33 } });
  let saved = 0;
  let fail = false;
  const context = {
    SCENES, settings, active: true, cinematicLockEnabled: () => false,
    loadImage: async () => { if (fail) throw new Error('unavailable'); return true; },
    sync() {}, save() { saved += 1; }
  };
  vm.createContext(context);
  vm.runInContext(`${choose}\n${next}\nthis.next = nextScene;`, context);
  for (const scene of [...SCENES.slice(1), SCENES[0]]) {
    await context.next();
    assert.equal(settings.scene, scene.id);
  }
  assert.equal(saved, 5);
  assert.equal(settings.cabinetSize, 36);
  fail = true;
  await assert.rejects(context.next(), /unavailable/);
  assert.equal(settings.scene, 'kids-room');
  assert.equal(saved, 5, 'failed scene selection does not overwrite preferences');
  assert.equal(settings.cabinetSizes['kids-room'], 36);
  assert.equal(settings.cabinetSizes.cyberpunk, 36);
  assert.equal(settings.cabinetSizes.basement, 36);
  assert.equal(settings.cabinetSizes.bedroom, 45);
  assert.equal(settings.cabinetSizes.attic, 33);
});

test('room detail layer sits exactly on the plate centre, fades in with display density and the tilt-shift clears as you zoom in', () => {
  assert.deepEqual({ ...SCENE_DETAIL_FRAME }, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  const rect = { left: -100, top: 40, width: 4000, height: 2666.6667 };
  const detail = sceneDetailViewportRect(rect);
  assert.equal(detail.left, 900);
  assert.equal(detail.width, 2000);
  assert.ok(Math.abs(detail.top - (40 + 2666.6667 / 4)) < 1e-9);
  assert.equal(detailFadeTarget({ width: 6144 * 0.3 }, 1, 6144), 0, 'zoomed out: plate only');
  assert.equal(detailFadeTarget({ width: 6144 * 1.5 }, 1, 6144), 1, 'zoomed in past native density: detail fully in');
  const middle = detailFadeTarget({ width: 6144 * 0.85 }, 1, 6144);
  assert.ok(middle > 0 && middle < 1);
  let fade = 0;
  for (let frame = 0; frame < 6; frame += 1) fade = easeDetailFade(fade, 1, 16);
  assert.ok(fade > 0 && fade < 1, 'eyes adjust over several frames rather than snapping');
  for (let frame = 0; frame < 300; frame += 1) fade = easeDetailFade(fade, 1, 16);
  assert.equal(fade, 1, 'converges and stops scheduling frames');
  assert.equal(easeDetailFade(0.2, 1, 16, true), 1, 'reduced motion snaps');
  assert.equal(focusBlurStrength(25), 1);
  assert.equal(focusBlurStrength(100) > 0 && focusBlurStrength(100) < 1, true);
  assert.equal(focusBlurStrength(200), 0);
  const source = read('scene-mode.js');
  assert.match(source, /drawImage\(sceneImageAsset[\s\S]*?drawSceneDetail\(rect, canvasSize\);\s*drawSceneFocus\(rect, glow\);/, 'plate, then detail, then focus blur, then dimming');
  assert.match(source, /if \(generation !== loadGeneration \|\| settings\.scene !== id\) return;/, 'stale detail loads are discarded');
});
