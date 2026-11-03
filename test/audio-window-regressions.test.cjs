const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
const { readWindowBounds, restoreWindowBounds, writeWindowBounds } = require('../window-state.cjs');

const primary = { workArea: { x: 0, y: 25, width: 1440, height: 875 } };

test('zero volume cancels pending gain ramps and silences playback exactly, including during fades', () => {
  const source = renderer.match(/function setMasterVolume\(fadeOnly = false\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  for (const fadeOnly of [false, true]) {
    const calls = [];
    const gain = {
      value: 0.6,
      cancelScheduledValues(time) { calls.push(['cancel', time]); },
      setValueAtTime(value, time) { this.value = value; calls.push(['set', value, time]); },
      setTargetAtTime() { assert.fail('silence must not use an asymptotic fade'); }
    };
    const context = {
      dialVolumeGain: () => 0,
      channelBreakFadeLevel: 1,
      playingAuthenticTape: false,
      AUTHENTIC_TAPE_VOLUME: 0.8,
      audioContext: { currentTime: 12 },
      masterGain: { gain },
      video: { volume: 1, muted: false, defaultMuted: false },
      smoothAudioParam: () => assert.fail('silence must be immediate')
    };
    vm.runInNewContext(`${source}\nsetMasterVolume(${fadeOnly});`, context);
    assert.equal(gain.value, 0);
    assert.deepEqual(calls, [['cancel', 12], ['set', 0, 12]]);
    context.masterGain = null;
    vm.runInNewContext('setMasterVolume();', context);
    assert.equal(context.video.volume, 0);
  }
});

test('startup reveals only a prepared renderer and still presents errors when initialization stalls', () => {
  const create = main.match(/function createWindow\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(create);
  function launch() {
    let window;
    const timers = new Set();
    class FakeWindow extends EventEmitter {
      constructor(options) {
        super();
        window = this;
        this.options = options;
        this.shows = 0;
        this.webContents = new EventEmitter();
        this.webContents.ipc = new EventEmitter();
        this.webContents.send = () => {};
        this.webContents.getURL = () => this.url;
        this.webContents.setWindowOpenHandler = () => {};
      }
      isDestroyed() { return false; }
      isFullScreen() { return false; }
      show() { this.shows += 1; }
      loadURL(url) { this.url = url; return Promise.resolve(); }
    }
    const context = {
      path, __dirname: root,
      televisionWindow: null, remoteServer: null,
      app: { getPath: () => '/qa', getName: () => 'Saturday Tube QA' },
      screen: { getAllDisplays: () => [primary], getPrimaryDisplay: () => primary },
      readWindowBounds: () => ({ width: 1024, height: 768 }),
      restoreWindowBounds: value => value,
      BrowserWindow: FakeWindow, logLaunch() {},
      setTimeout(callback, delay) { const timer = { callback, delay, unref() {} }; timers.add(timer); return timer; },
      clearTimeout(timer) { timers.delete(timer); }
    };
    vm.runInNewContext(`${create}; createWindow()`, context);
    return { window, timers };
  }
  const ready = launch();
  assert.equal(ready.window.options.show, false);
  assert.equal(ready.window.options.width, 1024);
  ready.window.webContents.emit('did-finish-load');
  assert.equal(ready.window.shows, 0, 'HTML loading alone cannot expose the unfinished cabinet');
  assert.equal(ready.timers.size, 1, 'renderer failures after HTML load still have a watchdog');
  ready.window.webContents.ipc.emit('renderer-ready');
  assert.equal(ready.window.shows, 1);
  assert.equal(ready.timers.size, 0);
  const stalled = launch();
  [...stalled.timers][0].callback();
  assert.match(stalled.window.url, /^data:text\/html/);
  stalled.window.webContents.emit('did-finish-load');
  assert.equal(stalled.window.shows, 1, 'timeout fallback remains visible');
  const failed = launch();
  failed.window.webContents.emit('did-fail-load', {}, -2, 'Loading failed', 'saturday://app/index.html');
  failed.window.webContents.emit('did-finish-load');
  assert.equal(failed.window.shows, 1);
  assert.equal(failed.timers.size, 0);
});

test('renderer readiness does not wait for animation frames while the window is hidden', () => {
  const signal = renderer.lastIndexOf('window.tube.notifyRendererReady()');
  assert.ok(signal > renderer.indexOf('setupSettingsOverlays();'));
  assert.ok(signal > renderer.indexOf('restoreControlPreferences();'));
  assert.ok(signal > renderer.lastIndexOf('if (!setupGL())'));
  assert.match(renderer, /window\.addEventListener\('load', finishRendererStartup, \{ once: true \}\)/);
  const startup = renderer.match(/function finishRendererStartup\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(startup);
  const calls = [];
  const context = {
    startStartupSequence() { calls.push('startup'); },
    console: { error() { calls.push('startup-error'); } },
    document: { body: { classList: { remove(name) { calls.push(`remove:${name}`); } } } },
    window: { tube: { notifyRendererReady() { calls.push('ready'); } } },
    requestAnimationFrame() { assert.fail('hidden-window RAF must not gate renderer readiness'); }
  };
  vm.runInNewContext(`${startup}\nfinishRendererStartup()`, context);
  assert.deepEqual(calls, ['startup', 'remove:starting', 'ready']);
  assert.equal((renderer.match(/startStartupSequence\(\);/g) || []).length, 1);
  assert.match(fs.readFileSync(path.join(root, 'preload.cjs'), 'utf8'), /notifyRendererReady: \(\) => ipcRenderer\.send\('renderer-ready'\)/);
});

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

test('Cmd+F steps through the fullscreen views and normal bounds are saved across restarts', () => {
  assert.match(main, /before-input-event[\s\S]*?input\.meta[\s\S]*?String\(input\.key\)\.toLowerCase\(\) !== 'f'[\s\S]*?win\.webContents\.send\('fullscreen-cycle-request'\)/);
  assert.match(renderer, /window\.tube\.onFullscreenCycleRequest\?\.\(\(\) => \{ void cycleFullscreen\(\); \}\);/);
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
  assert.ok(beginPlayback.indexOf('video.pause()') < beginPlayback.indexOf('loadPlaybackSource(track, restoreSession, sourceOptions)'));
  assert.match(renderer, /async function startVideoPlayback\(\) \{\s*if \(window\.SaturdayIntermission\?\.active\) return;\s*await unlockPlaybackAudio\(\);\s*if \(window\.SaturdayIntermission\?\.active\) return;[\s\S]*?video\.muted = false;[\s\S]*?return video\.play\(\);/);
  assert.match(renderer, /mediaSource\.connect\(levelerGain\);\s*levelerGain\.connect\(levelerCompressor\);\s*levelerCompressor\.connect\(dryGain\);\s*dryGain\.connect\(masterGain\);/);
  assert.match(renderer, /levelerCompressor\.connect\(effectHighpass\);[\s\S]*?wetGain\.connect\(masterGain\)/);
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
  assert.match(renderer, /function needsAudioEffectGraph\(\) \{\s*return \(audioFiltersEnabled && selectedAudioEffect !== 'clean'\) \|\| tvLevelerActive\(\) \|\| dialVolumeGain\(\) > 1;\s*\}/);
  assert.match(renderer, /function tvLevelerActive\(\) \{\s*return tvLevelerEnabled && selectedInput === 'tv';\s*\}/, 'VIDEO input keeps native clean playback');
  assert.match(renderer, /function ensureAudioGraph\(\) \{[\s\S]*?if \(!needsAudioEffectGraph\(\)\) return false;/);
  assert.match(renderer, /if \(save && needsAudioEffectGraph\(\) && !audioContext\) ensureAudioGraph\(\);/);
  const metadataHandler = renderer.slice(renderer.indexOf("video.addEventListener('loadedmetadata'"), renderer.indexOf("video.addEventListener('timeupdate'"));
  assert.doesNotMatch(metadataHandler, /ensureAudioGraph\(\);/);
  assert.match(renderer, /video\.volume = Math\.min\(1, volume\);\s*video\.muted = false;/);
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

test('WHOLE TV uses native fullscreen; SCREEN ONLY and DIM ROOM stay separate', () => {
  assert.match(renderer, /document\.querySelector\('#tvFullscreenButton'\)\.addEventListener\('click', \(\) => toggleNativeWindowFullscreen\(\)\)/);
  assert.match(renderer, /window\.tube\.toggleWindowFullscreen\(\)/);
  assert.match(renderer, /document\.querySelector\('#screenOnlyButton'\)\.addEventListener\('click', async \(\) => \{\n  window\.SaturdayScenes\.exit\(\);\n  if \(backdropDim\) await setBackdropDim\(false\);\n  await toggleFullscreen\(stage\);/);
  assert.match(renderer, /document\.querySelector\('#dimRoomButton'\)\.addEventListener\('click'/);
  assert.match(main, /window\.setFullScreen\(!window\.isFullScreen\(\)\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#tvSet:fullscreen/);
  assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /#stage:fullscreen/);
});
