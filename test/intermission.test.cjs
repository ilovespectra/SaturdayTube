const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizeSettings, advanceWatching, resumedBroadcastStart, MESSAGES } = require('../intermission.js');
const { reconcileChannelPlayback } = require('../channels-service.cjs');
const renderer = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
const source = fs.readFileSync(require.resolve('../intermission.js'), 'utf8');
const extract = name => renderer.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))[0];

test('intermission preferences are opt-in, bounded whole minutes', () => {
  assert.deepEqual(normalizeSettings(null), { enabled: false, intervalMinutes: 60, durationMinutes: 15 });
  assert.deepEqual(normalizeSettings({ enabled: true, intervalMinutes: 999, durationMinutes: 0 }),
    { enabled: true, intervalMinutes: 480, durationMinutes: 1 });
  assert.deepEqual(normalizeSettings({ intervalMinutes: NaN, durationMinutes: 2.5 }),
    { enabled: false, intervalMinutes: 60, durationMinutes: 3 });
  assert.ok(MESSAGES.some(message => message.includes('WATER')));
});

test('enabled timer counts the entire elapsed interval, including delayed background ticks', () => {
  assert.equal(advanceWatching(1500, 250, true, false), 1750);
  assert.equal(advanceWatching(1500, 60000, false, false), 1500);
  assert.equal(advanceWatching(1500, 60000, true, true), 1500);
  assert.equal(advanceWatching(1500, 60000, true, false), 61500);
  assert.equal(advanceWatching(1500, -250, true, false), 1500);
});

test('every broadcast freezes and resumes with no elapsed break time, including clocks created during a break', () => {
  const context = { window: { SaturdayIntermission: { active: true, startedAt: 10000 } } };
  vm.runInNewContext(`${extract('broadcastElapsed')}; this.elapsed = broadcastElapsed;`, context);
  const channels = [
    { broadcast: { startedAtMs: 1000, initialOffsetSeconds: 30 } },
    { broadcast: { startedAtMs: 12000, initialOffsetSeconds: 0 } },
    { restorePending: true, broadcast: { startedAtMs: 9000, initialOffsetSeconds: 50 } }
  ];
  assert.deepEqual(channels.map(channel => context.elapsed(channel, 70000)), [39, 0, 50]);
  for (const channel of channels) channel.broadcast.startedAtMs = resumedBroadcastStart(channel.broadcast.startedAtMs, 10000, 70000);
  context.window.SaturdayIntermission.active = false;
  assert.deepEqual(channels.map(channel => context.elapsed(channel, 70000)), [39, 0, 50]);
  assert.deepEqual(channels.map(channel => context.elapsed(channel, 71000)), [40, 1, 50]);
});

function controller(storage = new Map(), enabled = true) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      listeners: {}, value: '', checked: false, textContent: '', open: false,
      addEventListener(name, callback) { this.listeners[name] = callback; },
      showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
      contains() { return false; }
    });
    return elements.get(id);
  };
  let now = 100000;
  let tick;
  const context = {
    document: { querySelector: element, addEventListener() {}, body: { classList: { add() {}, remove() {} } } },
    performance: { now: () => now },
    Date: { now: () => now },
    localStorage: {
      getItem: key => storage.get(key) || (key === 'saturday-tube-intermission-v1' ? JSON.stringify({ enabled, intervalMinutes: 1, durationMinutes: 1 }) : null),
      setItem: (key, value) => storage.set(key, value)
    },
    console, window: { addEventListener() {}, setInterval(callback) { tick = callback; } }
  };
  vm.runInNewContext(source, context);
  return { api: context.window.SaturdayIntermission, element, step(ms = 250) { now += ms; tick(); } };
}

test('automatic break includes paused time, counts down, ends automatically, and restarts the interval', async () => {
  const app = controller();
  let playing = true;
  const events = [];
  app.api.init({
    isPlaying: () => playing,
    pause: () => { events.push('pause'); playing = false; },
    keepPaused: () => {},
    prepareResume: async () => { events.push('prepare'); },
    shiftClocks: () => events.push('shift'),
    resume: async () => { events.push('resume'); playing = true; },
    error: () => assert.fail('should resume')
  });
  for (let index = 0; index < 236; index++) app.step();
  playing = false;
  for (let index = 0; index < 3; index++) app.step();
  assert.equal(app.api.active, false);
  app.step();
  assert.equal(app.api.active, true);
  assert.equal(app.element('#intermissionDialog').open, true);
  assert.equal(app.element('#intermissionCountdown').textContent, '01:00');
  for (let index = 0; index < 240; index++) app.step();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.api.active, false);
  assert.equal(app.element('#intermissionDialog').open, false);
  assert.deepEqual(events, ['pause', 'prepare', 'shift', 'resume']);
  app.step();
  assert.equal(app.api.active, false);
});

test('manual early dismissal is single-shot even when Enter and the timer race', async () => {
  const app = controller();
  let resumed = 0;
  app.api.init({
    isPlaying: () => false, pause() {}, keepPaused() {},
    prepareResume: async () => {}, shiftClocks() {},
    resume: async () => { resumed++; }, error: () => assert.fail('unexpected error')
  });
  app.element('#intermissionStart').listeners.click();
  assert.equal(app.api.active, true);
  await Promise.all([app.api.end(), app.api.end()]);
  assert.equal(resumed, 1);
  assert.equal(app.api.active, false);
});

test('Guide Enter tunes the current page and off-air channels cannot be tuned', () => {
  const calls = [];
  const context = {
    channels: [{ id: 'one' }, { id: 'two', enabled: false }], tvGuidePageIndex: 0,
    selectedInput: 'tv', tvGuideDialog: { close: () => calls.push('close') },
    tvGuideLineup: () => [
      ...context.channels.map(channel => ({ kind: 'local', id: channel.id, channel })),
      { kind: 'youtube', id: 'starter' }
    ],
    selectActiveChannel: id => calls.push(id), selectYoutubeStarter: id => calls.push(`youtube:${id}`), setStatus: text => calls.push(text)
  };
  vm.runInNewContext(`${extract('tuneGuideChannel')}; this.tune = tuneGuideChannel;`, context);
  context.tune();
  assert.deepEqual(calls, ['close', 'one']);
  context.tvGuidePageIndex = 1;
  context.tune();
  assert.equal(calls.length, 3);
  assert.match(calls[2], /OFF AIR/);
  context.tvGuidePageIndex = 2;
  context.tune();
  assert.deepEqual(calls, ['close', 'one', 'CHANNEL OFF AIR · ENABLE IT IN THE GUIDE', 'close', 'youtube:starter']);
  assert.match(renderer, /case 'enter': if \(tvGuideDialog\.open\) tuneGuideChannel\(\)/);
});

test('ad-free reconciliation removes ads without moving the programme source position', () => {
  const shows = [{ path: '/show', name: 'Show', episodes: [{ path: '/episode', url: 'media', durationSeconds: 100 }] }];
  const commercials = [{ path: '/ad', url: 'ad', durationSeconds: 20 }];
  const queue = [
    { path: '/episode', segmentType: 'program', durationSeconds: 50, sourceStartSeconds: 0 },
    { path: '/ad', segmentType: 'commercial', durationSeconds: 20 },
    { path: '/episode', segmentType: 'program', durationSeconds: 50, sourceStartSeconds: 50 }
  ];
  const restored = reconcileChannelPlayback(shows, [], { queue, elapsedSeconds: 80 });
  assert.equal(restored.queue.length, 2);
  assert.equal(restored.elapsedSeconds, 60);
  assert.equal(restored.queue[1].sourceStartSeconds + restored.elapsedSeconds - 50, 60);
  const inAd = reconcileChannelPlayback(shows, [], { queue, elapsedSeconds: 60 });
  assert.equal(inAd.elapsedSeconds, 50, 'an on-air commercial skips to the next programme segment');
  assert.equal(reconcileChannelPlayback(shows, commercials, { queue, elapsedSeconds: 80 }).queue.length, 3);
  assert.match(renderer, /adFree: channel\.adFree === true/);
  assert.match(renderer, /adFree: item\.adFree === true/);
  assert.match(renderer, /channelCommercials\(channel\)\.map/);
  assert.match(renderer, /if \(channel\.adFree && segment\.segmentType === 'commercial'\) continue/);
});

test('break integration stops live streams, blocks playback/remote commands, and exposes a full-window pixel card', () => {
  const main = fs.readFileSync(require.resolve('../main.cjs'), 'utf8');
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const css = fs.readFileSync(require.resolve('../intermission.css'), 'utf8');
  assert.match(main, /ipcMain\.handle\('set-intermission-active'[\s\S]*if \(intermissionActive\) stopLiveMedia\(\)/);
  assert.match(main, /if \(intermissionActive\) return new Response\('Intermission'/);
  assert.match(extract('startVideoPlayback'), /SaturdayIntermission\?\.active/);
  assert.match(extract('syncActiveBroadcast'), /SaturdayIntermission\?\.active/);
  assert.match(extract('handleRemoteCommand'), /SaturdayIntermission\?\.active[\s\S]*\['enter', 'ok', 'back'\]/);
  assert.match(html, /id="intermissionEnd"[^>]*>END BREAK EARLY/);
  assert.match(css, /width:100vw; height:100dvh/);
  assert.match(css, /font-family:var\(--osd-font\)/);
  assert.match(css, /animation:intermission-breathe/);
});

test('renderer resumes native, paused, loading and live playback at the captured source point', async () => {
  const start = renderer.lastIndexOf('window.SaturdayIntermission.init({');
  const init = renderer.slice(start, renderer.indexOf('\nscheduleFrameLoop();', start));
  for (const mode of ['native', 'paused', 'loading', 'live']) {
    let hooks;
    const calls = [];
    const track = { path: '/episode', url: 'media', durationSeconds: 100 };
    const channel = { broadcast: { startedAtMs: 1000, initialOffsetSeconds: 0 }, queue: [track] };
    const context = {
      window: {
        SaturdayIntermission: { init(value) { hooks = value; } },
        clearTimeout() {},
        tube: { setIntermissionActive: async value => calls.push(['stream', value]) }
      },
      remoteGamepadReleaseTimer: null,
      selectedInput: 'tv', channels: [channel], hasVideo: true, switchingTracks: false,
      video: {
        paused: mode === 'paused' || mode === 'loading', ended: false, readyState: mode === 'loading' ? 0 : 4,
        pause() { this.paused = true; }, removeAttribute(name) { calls.push(['remove', name]); }, load() {}
      },
      staticPicture: { paused: true, pause() {}, async play() {} },
      intermissionPlayback: null, livePlayback: mode === 'live' ? { baseSeconds: 40, options: {} } : null,
      pendingPlaybackRestore: mode === 'loading' ? { wasPlaying: true } : null,
      activeChannel: () => channel, channelPlaybackSnapshot: () => ({ elapsedSeconds: 52 }),
      activePlaylist: () => ({ tracks: [track] }), currentIndex: 0, activePlaybackPath: track.path,
      playbackSourceTime: () => 52, playbackGeneration: 1, activePlaybackUrl: 'media',
      syncLoopingSoundEffects() {}, saveChannelPlaybackState() {}, reportRemoteState() {}, setStatus() {},
      soundEffectAudio: new Map(), stopSoundEffect() {},
      startVideoPlayback: async () => calls.push(['play']),
      beginTrackPlayback: (...args) => calls.push(['reload', ...args])
    };
    vm.runInNewContext(init, context);
    hooks.pause(10000);
    assert.equal(context.video.paused, true);
    assert.equal(channel.broadcast.initialOffsetSeconds, 52);
    await hooks.prepareResume();
    hooks.shiftClocks(10000, 70000, resumedBroadcastStart);
    assert.equal(channel.broadcast.startedAtMs, 70000);
    await hooks.resume();
    assert.deepEqual(calls.filter(call => call[0] === 'stream'), [['stream', true], ['stream', false]]);
    if (mode === 'live') {
      const reload = calls.find(call => call[0] === 'reload');
      assert.equal(reload[2].currentTime, 52);
      assert.equal(reload[2].wasPlaying, true);
      assert.equal(reload[4].forceEncode, true, 'resume seeks exactly, not back to an earlier copied keyframe');
      assert.equal(reload[4].forceLive, true);
    } else {
      assert.equal(calls.some(call => call[0] === 'play'), mode !== 'paused', mode);
    }
  }
});

test('automatic intermissions fire on every input without requiring decoded playback', () => {
  for (const input of ['tv', 'video', 'static']) {
    const app = controller();
    let pauses = 0;
    app.api.init({
      pause: () => pauses++, keepPaused() {},
      prepareResume: async () => {}, shiftClocks() {}, resume: async () => {}, error() {}
    });
    for (let index = 0; index < 239; index++) app.step();
    assert.equal(app.api.active, false);
    app.step();
    assert.equal(app.api.active, true, `${input} must trigger without isPlaying or decoder readiness`);
    assert.equal(pauses, 1);
    assert.equal(app.element('#intermissionSchedule').textContent, 'INTERMISSION IN PROGRESS');
  }
});

test('timer progress survives refresh and changing duration does not postpone the next break', () => {
  const storage = new Map();
  const hooks = { pause() {}, keepPaused() {}, prepareResume: async () => {}, shiftClocks() {}, resume: async () => {}, error() {} };
  const first = controller(storage);
  first.api.init(hooks);
  for (let index = 0; index < 120; index++) first.step();
  assert.equal(storage.get('saturday-tube-intermission-progress-v1'), '30000');
  first.element('#intermissionDuration').value = '2';
  first.element('#intermissionDuration').listeners.change();
  assert.equal(storage.get('saturday-tube-intermission-progress-v1'), '30000');
  const restarted = controller(storage);
  restarted.api.init(hooks);
  for (let index = 0; index < 119; index++) restarted.step();
  assert.equal(restarted.api.active, false);
  restarted.step();
  assert.equal(restarted.api.active, true);
  assert.equal(restarted.element('#intermissionCountdown').textContent, '02:00');
});

test('disabled intermissions stay off on every input until explicitly enabled', () => {
  const app = controller(new Map(), false);
  app.api.init({ pause: () => assert.fail('disabled breaks must not run') });
  for (let index = 0; index < 500; index++) app.step();
  assert.equal(app.api.active, false);
  assert.equal(app.element('#intermissionSchedule').textContent, 'AUTOMATIC BREAKS OFF');
});

test('a delayed renderer tick still triggers the scheduled break instead of discarding elapsed time', () => {
  const app = controller();
  let pauses = 0;
  app.api.init({ pause: () => pauses++, keepPaused() {} });
  app.step(61000);
  assert.equal(app.api.active, true);
  assert.equal(pauses, 1);
});

test('a late source plan cannot start live conversion or replace the picture during an intermission', () => {
  const calls = [];
  const context = {
    window: { SaturdayIntermission: { active: true } },
    intermissionPlayback: {}, activePlaybackUrl: 'old',
    video: { set src(value) { calls.push(value); }, load() { calls.push('load'); } },
    watchChannelLoad: generation => calls.push(generation)
  };
  const attach = vm.runInNewContext(`${extract('attachPlaybackUrl')}; attachPlaybackUrl`, context);
  attach('live-stream', 7);
  assert.deepEqual(calls, []);
  assert.equal(context.intermissionPlayback.deferredSource.url, 'live-stream');
  context.window.SaturdayIntermission.active = false;
  attach('live-stream', 7);
  assert.deepEqual(calls, ['live-stream', 'load', 7]);
  assert.match(extract('startStaticPicture'), /SaturdayIntermission\?\.active/);
  assert.match(extract('playSoundEffect'), /SaturdayIntermission\?\.active/);
});
