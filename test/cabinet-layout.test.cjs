const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const renderer = readFileSync(path.join(root, 'renderer.js'), 'utf8');
const css = readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const functionText = name => {
  const text = renderer.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(text, `${name} exists`);
  return text;
};

test('a cached landing texture still draws animated shader frames on every refresh', () => {
  const times = [];
  let draws = 0;
  let uploads = 0;
  let introDraws = 0;
  let schedules = 0;
  const uniformValues = new Map();
  const gl = {
    viewport() {}, clearColor() {}, clear() {}, useProgram() {}, activeTexture() {}, bindTexture() {},
    texImage2D() { uploads += 1; },
    texSubImage2D() { uploads += 1; },
    getUniformLocation(_program, name) { return name; },
    uniform1i() {}, uniform2f() {},
    uniform1f(name, value) {
      uniformValues.set(name, value);
      if (name === 'time') times.push(value);
    },
    getParameter() { return 4096; },
    drawArrays() { draws += 1; }
  };
  let menuSyncs = 0;
  const canvas = { clientWidth: 320, clientHeight: 240, width: 0, height: 0 };
  const context = {
    gl, canvas, glProgram: {}, texture: {}, textureWidth: 1, textureHeight: 1,
    frameLoopRequest: null, libraryDialog: { open: false }, pictureVisible: true, lastPictureFrame: -Infinity,
    scheduleFrameLoop() { schedules += 1; },
    updateChannelBreakFade() {}, syncSettingsScreenStyle() { menuSyncs += 1; }, roomLightSample() {},
    compositeContext: { fillRect() {} }, compositeCanvas: { width: 0, height: 0 },
    window: { devicePixelRatio: 1, SaturdayScenes: { active: false } }, pictureFallback: false, glContextLost: false,
    selectedInput: 'video', transitionStatic: false, hasVideo: false,
    video: { readyState: 0 }, staticPicture: { readyState: 0 }, tvSet: { dataset: { input: 'video' } },
    lastCompositeHasFrame: false, lastRenderedSource: null,
    lastUploadedTime: -1, lastCompositePaused: null, lastRenderedExtension: null,
    startupIntroActive: true, shuttingOff: false, pictureFiltersEnabled: true, playingAuthenticTape: false, displayMode: 'crt',
    curveDial: {}, scanlineDial: {}, edgeBlurDial: {}, hueDial: {}, vhsScanDial: {},
    glitchDial: {}, brokenTapeDial: {}, glowDial: {}, brightnessDial: {},
    selectedPictureMode: 'color', dialValue() { return 50; },
    drawIntroPicture() { introDraws += 1; },
    drawOsdLayer() { return false; }, osdLayerVisible: false, osdTexture: {}, osdTextureWidth: 1, osdTextureHeight: 1, osdCanvas: {}
  };
  const frameLoop = vm.runInNewContext(`${functionText('pictureRenderSize')}\n${functionText('frameLoop')}; frameLoop`, context);
  frameLoop(1000);
  frameLoop(2000);
  frameLoop(3000);
  assert.deepEqual(times, [1, 2, 3]);
  assert.equal(draws, 3);
  assert.equal(schedules, 3);
  assert.equal(introDraws, 1, 'the static intro texture need not be repainted to animate its shader');
  assert.equal(uploads, 1, 'cached texture uploads stay optimized');
  context.pictureFiltersEnabled = false;
  frameLoop(4000);
  for (const name of ['vhsScan', 'glitch', 'broken', 'scan', 'strength', 'edgeBlur', 'glow', 'pictureMode', 'rearProjection', 'vignette', 'chroma']) assert.equal(uniformValues.get(name), 0, `${name} is off in bypass`);
  assert.equal(uniformValues.get('hueShift'), 0.5, 'hue is neutral in bypass');
  frameLoop(4008);
  assert.equal(draws, 4, '120Hz refreshes cannot double GPU work');
  frameLoop(4017);
  assert.equal(draws, 5, 'effects keep animating at 60Hz even with no new source frame');
  context.pictureVisible = false;
  const scheduled = schedules;
  frameLoop(5000);
  assert.equal(draws, 5);
  assert.equal(schedules, scheduled, 'minimized windows stop requesting frames');
  context.pictureVisible = true;
  context.window.SaturdayScenes.active = true;
  let glowSamples = 0;
  context.window.SaturdayScenes.updateGlow = (source, now, sample) => {
    glowSamples += 1;
    assert.equal(source, context.compositeCanvas, 'room glow does not read back the WebGL framebuffer');
    assert.equal(sample, context.roomLightSample, 'room light sample gets the picture look and open menu');
  };
  frameLoop(6000);
  assert.equal(glowSamples, 1);
  assert.ok(menuSyncs > 0, 'the settings menu look follows the picture controls every frame');
  assert.doesNotMatch(css.match(/\.crt-glass \{[\s\S]*?\n\}/)?.[0] || '', /repeating-linear-gradient/);
});

test('wear and damage controls and overlays are removed while the slot stays fixed', () => {
  assert.doesNotMatch(html, /cabinetWear|cabinetDamage|case-patina|case-damage/);
  assert.doesNotMatch(renderer, /setCabinetCondition|cabinetWear|cabinetDamage/);
  assert.doesNotMatch(css, /case-patina|case-damage|case-wear/);
  const cabinet = css.slice(css.indexOf('/* A one-piece'));
  assert.match(cabinet, /cassette-port \{ flex-shrink:0; width:min\(400px,100%\); height:62px;/);
  assert.match(cabinet, /\.cabinet-console \{[^}]*zoom:var\(--cab-zoom,1\)/);
  assert.doesNotMatch(html, /class="deck-brand"/);
  assert.doesNotMatch(cabinet, /grid-template-columns:1fr minmax\(/);
});

test('texture skin selection preserves finish and persists through the control preference store', () => {
  let saves = 0;
  let warnings = 0;
  const context = {
    cabinetSkin: 'molded', cabinetSkinSelect: {},
    tvSet: { dataset: { finish: 'wood' } },
    saveControlPreferences() { saves += 1; },
    console: { warn() { warnings += 1; } }
  };
  const setSkin = vm.runInNewContext(`${functionText('setCabinetSkin')}; setCabinetSkin`, context);
  for (const name of ['molded', 'smooth', 'woodgrain', 'field']) {
    setSkin(name);
    assert.equal(context.tvSet.dataset.skin, name);
    assert.equal(context.cabinetSkinSelect.value, name);
    assert.equal(context.tvSet.dataset.finish, 'wood');
  }
  setSkin('invalid');
  assert.equal(saves, 4);
  assert.equal(warnings, 1);
  const save = functionText('saveControlPreferences');
  assert.match(save, /cabinetSkin,/);
  const restore = functionText('restoreControlPreferences');
  assert.match(restore, /setCabinetSkin\(saved\.cabinetSkin, false\)/);
  assert.match(restore, /setFinish\(legacyFinish \? 'wood' : saved\.finish, false\)/);
});

test('legacy remote tracking uses the retained VHS dial, with no redundant cabinet buttons', () => {
  const dial = {};
  let value = 2;
  let saves = 0;
  const context = {
    vhsScanDial: dial, Math,
    dialValue(control) { assert.equal(control, dial); return value; },
    setDialValue(control, next) { assert.equal(control, dial); value = Math.max(0, Math.min(100, next)); },
    saveControlPreferences() { saves += 1; }
  };
  const adjust = vm.runInNewContext(`${functionText('adjustTracking')}; adjustTracking`, context);
  adjust(-1);
  assert.equal(value, 0);
  adjust(-1);
  assert.equal(saves, 1);
  value = 98;
  adjust(1);
  assert.equal(value, 100);
  adjust(1);
  assert.equal(saves, 2);
  assert.doesNotMatch(html, /trackingDownButton|trackingUpButton|trackingReadout/);
  assert.doesNotMatch(renderer, /syncTrackingControls/);
  assert.match(html, /id="vhsScan"/, 'the picture effect dial is retained');
});

test('TV input hides the Guide and tape settings while the loader switches to video', () => {
  const sync = functionText('syncBypassControls');
  assert.doesNotMatch(html, /id="tvGuideButton"/);
  assert.match(sync, /visibleInput !== 'tv' && tvGuideDialog\.open\) tvGuideDialog\.close\(\)/);
  assert.match(sync, /tapesTab\.hidden = visibleInput === 'tv'/);
  assert.match(sync, /tapesTab\.hidden && tapesTab\.hasAttribute\('aria-current'\)\) selectSettingsTab\('video'\)/);
  assert.match(renderer, /async function openLibrary\(\) \{\s*if \(selectedInput === 'tv'\) setInputSource\('video'\)/);
  assert.match(functionText('openTVGuide'), /tvSet\.dataset\.input !== 'tv'/);
  assert.match(html, /class="control-panel cabinet-console"/);
  assert.match(css, /\.simple-tv-controls > button\[hidden\] \{ display:none; \}/);
});
