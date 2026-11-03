const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { screenLight } = require('../scene-mode.js');
const read = file => fs.readFileSync(require.resolve(`../${file}`), 'utf8');

test('room illumination follows screen color and backlight without lighting a black picture', () => {
  const source = read('scene-mode.js').match(/  function updateGlow\(source, now, overlay = null\) \{[\s\S]*?\n  \}/)[0];
  let pixels = [255, 0, 0, 255];
  let glow = 0;
  let redraws = 0;
  const context = {
    active: true, lightSampleFailed: false, lastLightSample: -Infinity,
    screenLight, screenLightColor: '0 0 0', screenLightStrength: 0,
    lightContext: { drawImage() {}, getImageData: () => ({ data: pixels }) },
    document: { querySelector: () => ({ getAttribute: () => String(glow) }) },
    cabinet: { style: { setProperty() {} } },
    drawSceneBackground() { redraws += 1; }
  };
  const update = vm.runInNewContext(`${source}; updateGlow`, context);
  update({}, 100);
  assert.equal(context.screenLightColor, '255 0 0');
  const initial = context.screenLightStrength;
  glow = 200;
  update({}, 200);
  assert.ok(context.screenLightStrength > initial);
  pixels = [0, 0, 255, 255];
  update({}, 300);
  assert.equal(context.screenLightColor, '0 0 255');
  pixels = [0, 0, 0, 255];
  update({}, 400);
  assert.equal(context.screenLightStrength, 0);
  assert.equal(redraws, 4, 'each sampled TV image redraws the viewport canvas');
});

test('GLOW drives room light reach and an open menu is painted into the light sample', () => {
  const source = read('scene-mode.js').match(/  function updateGlow\(source, now, overlay = null\) \{[\s\S]*?\n  \}/)[0];
  let glow = 0;
  const fills = [];
  const lightContext = { fillStyle: '', drawImage() {}, fillRect(...rect) { fills.push([this.fillStyle, ...rect]); }, getImageData: () => ({ data: [200, 200, 200, 255] }) };
  const context = {
    active: true, lightSampleFailed: false, lastLightSample: -Infinity, screenLight, screenLightColor: '0 0 0', screenLightStrength: 0, screenLightReach: 1,
    lightContext, document: { querySelector: () => ({ getAttribute: () => String(glow) }) }, drawSceneBackground() {},
    cabinet: { style: { setProperty(name, value) { cabinetLight[name] = value; } } }
  };
  const cabinetLight = {};
  const update = vm.runInNewContext(`${source}; updateGlow`, context);
  update({}, 100, () => ({ color: '22 58 196', rect: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, adjust: data => { data[0] = 0; } }));
  assert.deepEqual(fills, [['rgb(22 58 196)', 4, 8, 8, 4]]);
  assert.equal(context.screenLightColor, '0 255 255', 'the picture look adjusts the sample');
  const [dimStrength, dimReach] = [context.screenLightStrength, context.screenLightReach];
  glow = 200;
  update({}, 200);
  assert.ok(context.screenLightStrength > dimStrength * 2);
  assert.ok(context.screenLightReach > dimReach);
  assert.equal(cabinetLight['--screen-light'], context.screenLightStrength.toFixed(3), 'the cabinet face gets the same light as the room');
  assert.equal(cabinetLight['--screen-light-rgb'], context.screenLightColor);
  assert.match(read('scene-mode.css'), /\.scene-cabinet-light \{[\s\S]*rgb\(var\(--screen-light-rgb[^)]*\) \/ min\(\.8, calc\(var\(--screen-light,0\) \* 1\.05\)\)\) 70%,transparent\)/, 'the screen floods the bezel walls around the glass');
  assert.match(read('scene-mode.css'), /\.scene-cabinet-light \{[\s\S]*rgb\(var\(--screen-light-rgb[^)]*\) \/ min\(\.45, calc\(var\(--screen-light,0\) \* \.2\)\)\)/, 'a softer bounce reaches the cabinet face');
});

test('the settings menu and room light take on the picture filters', () => {
  const renderer = read('renderer.js');
  const fn = name => renderer.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  const dials = { hue: 50, curve: 60, scan: 40, glow: 100, brightness: 50 };
  const context = {
    pictureFiltersEnabled: true, displayMode: 'crt', selectedPictureMode: 'bw',
    hueDial: 'hue', curveDial: 'curve', scanlineDial: 'scan', glowDial: 'glow', brightnessDial: 'brightness', dialValue: dial => dials[dial]
  };
  const { pictureLook, settingsScreenStyle, applyPictureLook } = vm.runInNewContext(`${fn('tvBacklight')}\n${fn('pictureLook')}\n${fn('settingsScreenStyle')}\n${fn('applyPictureLook')}; ({ pictureLook, settingsScreenStyle, applyPictureLook })`, context);
  let style = settingsScreenStyle(pictureLook());
  assert.match(style.filter, /^url\(#settingsScreenCurve\) grayscale\(1\) brightness\(1\.060\) drop-shadow/);
  assert.equal(style.scan, '0.400');
  assert.equal(style.vignette, '0.600');
  assert.equal(style.curve, '0.0900');
  const gray = applyPictureLook([255, 0, 0, 255], pictureLook());
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  context.selectedPictureMode = 'lowstim';
  context.displayMode = 'rear';
  style = settingsScreenStyle(pictureLook());
  assert.match(style.filter, /saturate\(0\.32\) sepia\(0\.16\) contrast\(0\.82\) brightness\(0\.9\)/);
  assert.equal(style.scan, '0.000', 'scan lines and curve are CRT-only, like the shader');
  assert.doesNotMatch(style.filter, /settingsScreenCurve/);
  const muted = applyPictureLook([255, 0, 0, 255], pictureLook());
  assert.ok(muted[0] < 255 && muted[1] > 0, 'low stim desaturates the room light');
  context.pictureFiltersEnabled = false;
  style = settingsScreenStyle(pictureLook());
  assert.equal(style.filter, 'brightness(1)');
  assert.deepEqual(applyPictureLook([255, 0, 0, 255], pictureLook()), [255, 0, 0, 255], 'bypass leaves the light untouched at neutral brightness');
  dials.brightness = 100;
  const bright = applyPictureLook([100, 100, 100, 255, 0, 0, 0, 255], pictureLook());
  assert.ok(bright[0] > 130, 'BRIGHTNESS is the backlight, so it brightens the room light even with picture FX off');
  assert.ok(bright[4] > 0, 'a turned-up tube lifts its blacks');
  dials.brightness = 0;
  assert.ok(applyPictureLook([100, 100, 100, 255], pictureLook())[0] < 70);
  assert.match(read('styles.css'), /filter:brightness\(var\(--tv-backlight,1\)\) contrast\(var\(--tv-black-lift,1\)\)/);
  assert.match(read('styles.css'), /#tvSettingsDialog \{[^}]*var\(--settings-screen-filter/);
  assert.match(read('styles.css'), /#tvSettingsDialog::after \{[\s\S]*var\(--settings-scan/);
});
