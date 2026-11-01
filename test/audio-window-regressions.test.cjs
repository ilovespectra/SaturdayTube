const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
const { readWindowBounds, restoreWindowBounds, writeWindowBounds } = require('../window-state.cjs');

const primary = { workArea: { x: 0, y: 25, width: 1440, height: 875 } };

test('window bounds persist and restore, including safe recovery from a disconnected display', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-tube-window-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const filePath = path.join(folder, 'window-bounds.json');
  const expected = { x: 180, y: 90, width: 1180, height: 760 };

  assert.equal(writeWindowBounds(filePath, expected), true);
  assert.deepEqual(readWindowBounds(filePath), expected);
  assert.deepEqual(restoreWindowBounds(readWindowBounds(filePath), {
    displays: [primary], primaryDisplay: primary
  }), expected);

  assert.deepEqual(restoreWindowBounds({ x: 4000, y: 100, width: 1500, height: 1200 }, {
    displays: [primary], primaryDisplay: primary
  }), { x: 0, y: 25, width: 1440, height: 875 });
});

test('Cmd+F toggles native fullscreen and normal bounds are saved across restarts', () => {
  assert.match(main, /before-input-event[\s\S]*?input\.meta[\s\S]*?String\(input\.key\)\.toLowerCase\(\) !== 'f'[\s\S]*?win\.setFullScreen\(!win\.isFullScreen\(\)\)/);
  assert.match(main, /restoreWindowBounds\(readWindowBounds\(windowBoundsPath\)/);
  assert.match(main, /title: app\.getName\(\)/);
  assert.match(main, /win\.on\('move', scheduleWindowBoundsSave\)/);
  assert.match(main, /win\.on\('resize', scheduleWindowBoundsSave\)/);
  assert.match(main, /win\.on\('close', saveWindowBounds\)/);
  assert.match(main, /if \(win\.isDestroyed\(\) \|\| win\.isMinimized\(\) \|\| win\.isMaximized\(\) \|\| win\.isFullScreen\(\)\) return/);
});

test('movie output and independent sound-effects audio unlock cleanly', () => {
  const playTrack = renderer.slice(renderer.indexOf('function playTrack(index'), renderer.indexOf('function removeTrack(index)'));
  assert.ok(playTrack.indexOf('unlockPlaybackAudio()') < playTrack.indexOf('beginTrackPlayback(index, restoreSession)'));
  const beginPlayback = renderer.slice(renderer.indexOf('function beginTrackPlayback(index'), renderer.indexOf('function playTrack(index'));
  assert.ok(beginPlayback.indexOf('video.pause()') < beginPlayback.indexOf('video.src = track.url'));
  assert.match(renderer, /async function startVideoPlayback\(\) \{\s*await unlockPlaybackAudio\(\);[\s\S]*?video\.muted = false;[\s\S]*?return video\.play\(\);/);
  assert.match(renderer, /mediaSource\.connect\(dryGain\);\s*dryGain\.connect\(masterGain\);/);
  assert.match(renderer, /mediaSource\.connect\(effectHighpass\);[\s\S]*?wetGain\.connect\(masterGain\)/);
  assert.match(renderer, /audioGraphFailed = true;[\s\S]*?mediaSource\.connect\(cleanOutput\);\s*masterGain = cleanOutput;/);
  assert.match(renderer, /source\.connect\(gain\);\s*gain\.connect\(soundEffectsLimiter\)/);
  assert.match(renderer, /let soundEffectsAudioContext = null;[\s\S]*?let audioContext = null;/);
  assert.match(renderer, /Promise\.all\(contexts\.map\(context => routeContextToOutput\(context, target\)\)\)/);
});

test('movie audio is unmuted by default and resumes before playback starts', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(renderer, /video\.defaultMuted = false;/);
  assert.match(renderer, /async function unlockPlaybackAudio\(\)[\s\S]*?await audioContext\.resume\(\)/);
  assert.match(renderer, /async function startVideoPlayback\(\)[\s\S]*?await unlockPlaybackAudio\(\);[\s\S]*?video\.muted = false;[\s\S]*?return video\.play\(\);/);
  assert.match(renderer, /video\.addEventListener\('play', \(\) => \{[\s\S]*?video\.muted = false;/);
  assert.match(html, /<span>FX BYPASS<\/span>/);
  assert.match(html, /movie audio stays enabled/);
});

test('clean movie audio uses native playback and effects create Web Audio only on request', () => {
  assert.match(renderer, /function needsAudioEffectGraph\(\) \{\s*return audioFiltersEnabled && selectedAudioEffect !== 'clean';\s*\}/);
  assert.match(renderer, /function ensureAudioGraph\(\) \{[\s\S]*?if \(!needsAudioEffectGraph\(\)\) return false;/);
  assert.match(renderer, /if \(save && needsAudioEffectGraph\(\) && !audioContext\) ensureAudioGraph\(\);/);
  const metadataHandler = renderer.slice(renderer.indexOf("video.addEventListener('loadedmetadata'"), renderer.indexOf("video.addEventListener('timeupdate'"));
  assert.doesNotMatch(metadataHandler, /ensureAudioGraph\(\);/);
  assert.match(renderer, /video\.volume = volume;\s*video\.muted = false;/);
});

test('audio output devices and captions have separate working selectors without a mute button', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const outputMarkup = html.match(/<select id="audioOutput"[^>]*>/)?.[0] || '';
  const captionsMarkup = html.match(/<select id="subtitleTracks"[^>]*>/)?.[0] || '';
  assert.ok(outputMarkup && !/\bdisabled\b/.test(outputMarkup));
  assert.ok(captionsMarkup && !/\bdisabled\b/.test(captionsMarkup));
  assert.doesNotMatch(html, /id="muteButton"/);
  assert.doesNotMatch(renderer, /isMuted|#muteButton/);
  assert.match(html, /<span>FX BYPASS<\/span>/);
  assert.match(html, /movie audio stays enabled/);
  assert.match(html, /<option value="default">System default<\/option>/);
  assert.match(html, /<option value="choose">Choose output device…<\/option>/);
  assert.match(renderer, /\.filter\(device => device\.kind === 'audiooutput'\)/);
  assert.match(renderer, /navigator\.mediaDevices\?\.addEventListener\?\.\('devicechange'/);
  assert.match(renderer, /if \(deviceId !== 'default'\) return context\.setSinkId\(deviceId\)/);
  assert.match(renderer, /if \(subtitleSelect\.value === 'load'\) \{ chooseSubtitle\(\); return; \}/);
  assert.match(renderer, /subtitleSelect\.add\(new Option\('Load captions…', 'load'\)\);[\s\S]*?subtitleSelect\.disabled = false;/);
});

test('WHOLE TV and Cmd+F share native fullscreen; SCREEN ONLY stays separate', () => {
  assert.match(renderer, /document\.querySelector\('#tvFullscreenButton'\)\.addEventListener\('click', \(\) => toggleNativeWindowFullscreen\(\)\)/);
  assert.match(renderer, /window\.tube\.toggleWindowFullscreen\(\)/);
  assert.match(renderer, /document\.querySelector\('#screenOnlyButton'\)\.addEventListener\('click', \(\) => toggleFullscreen\(stage\)\)/);
  assert.match(main, /win\.setFullScreen\(!win\.isFullScreen\(\)\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#tvSet:fullscreen/);
  assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#stage:fullscreen/);
});
