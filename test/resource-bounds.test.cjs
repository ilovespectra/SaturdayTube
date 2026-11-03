const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { Readable, PassThrough } = require('node:stream');

const read = file => readFileSync(path.join(__dirname, '..', file), 'utf8');
const main = read('main.cjs');
const renderer = read('renderer.js');
const pick = (source, name) => {
  const text = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(text, `${name} exists`);
  return text;
};

test('cursor visibility depends only on mouse activity, never remote commands or playback changes', () => {
  const classes = new Set(['cursor-idle']);
  const timers = new Map();
  let nextId = 0;
  const context = {
    cursorTimer: null, trackpadPoint: null, trackpadCursor: { hidePopover() {} },
    document: { body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } } },
    setTimeout(callback, delay) { assert.equal(delay, 1200); timers.set(++nextId, callback); return nextId; },
    clearTimeout(id) { timers.delete(id); }
  };
  const show = vm.runInNewContext(`${pick(renderer, 'showPlaybackCursor')}; showPlaybackCursor`, context);
  show({ pointerType: 'touch' });
  assert.ok(classes.has('cursor-idle'), 'touch/remote interaction does not expose a mouse');
  show({ pointerType: 'mouse' });
  assert.equal(classes.has('cursor-idle'), false);
  show({ pointerType: 'mouse' });
  assert.equal(timers.size, 1);
  timers.get(context.cursorTimer)();
  assert.ok(classes.has('cursor-idle'));
  assert.doesNotMatch(pick(renderer, 'handleRemoteCommand'), /showPlaybackCursor|cursor-idle/);
  assert.doesNotMatch(renderer, /clearPlaybackCursor/);
  const calls = renderer.match(/showPlaybackCursor\(\);/g) || [];
  assert.equal(calls.length, 2, 'only startup and actual trackpad input may arm the timer without a native pointer event');
  assert.match(renderer, /pointermove', showPlaybackCursor/);
  assert.match(renderer, /pointerdown', showPlaybackCursor/);
});

test('codec lookups coalesce concurrent requests and back off failed external-drive reads', async () => {
  let probes = 0;
  let finish;
  let fail = false;
  const context = {
    mediaStreamInfoJobs: new Map(), mediaStreamInfoFailures: new Map(), mediaStreamInfoControllers: new Map(), AbortController,
    readMediaStreamInfo: () => { probes++; return new Promise((resolve, reject) => { finish = () => fail ? reject(new Error('drive unavailable')) : resolve({ video: 'h264' }); }); }
  };
  const lookup = vm.runInNewContext(`${pick(main, 'mediaStreamInfo')}; mediaStreamInfo`, context);
  const jobs = Array.from({ length: 30 }, () => lookup('/show.mkv'));
  assert.equal(probes, 1);
  finish();
  await Promise.all(jobs);
  assert.equal(context.mediaStreamInfoJobs.size, 0);
  fail = true;
  const failed = lookup('/bad.mkv');
  finish();
  await assert.rejects(failed, /drive unavailable/);
  await assert.rejects(lookup('/bad.mkv'), /drive unavailable/);
  assert.equal(probes, 2, 'failure cooldown cannot spawn another probe every half second');
});

test('upcoming preparation runs once per path instead of every broadcast sync tick', async () => {
  const requests = [];
  const context = {
    upcomingChannelMediaJobs: new Map(),
    playbackGeneration: 1,
    channelPlaybackReadyForWarmup: () => true,
    window: { tube: { openChannelMedia: async id => { requests.push(id); return {}; } } }, console
  };
  const prepare = vm.runInNewContext(`${pick(renderer, 'prepareUpcomingChannelAudio')}; prepareUpcomingChannelAudio`, context);
  const queue = ['now', 'next', 'later'].map(id => ({ id, path: `/${id}.mkv`, segmentType: 'program' }));
  for (let tick = 0; tick < 40; tick++) prepare({ queue }, { segment: queue[0], index: 0 });
  assert.deepEqual(requests, ['next'], 'only the next distinct programme touches the drive');
  context.upcomingChannelMediaJobs.clear();
  requests.length = 0;
  context.channelPlaybackReadyForWarmup = () => false;
  prepare({ queue }, { segment: queue[0], index: 0 });
  assert.equal(requests.length, 0, 'loading/buffering never starts more optional probes');
});

test('native first picture does not wait for a codec read; preparation never allocates a live encoder token', async () => {
  let probes = 0;
  const context = {
    AbortController, channelMediaController: null, mediaStreamInfoControllers: new Map(),
    mediaFiles: new Map([['native', '/show.mp4'], ['legacy', '/show.mkv']]),
    fs: { promises: { stat: async file => file.startsWith('/cache') ? null : { size: 10, mtimeMs: 20 } } },
    path, transcodeCacheLocation: () => ({ output: '/cache/converted.mp4' }),
    mediaStreamInfoCache: new Map(), LIVE_NATIVE_CONTAINERS: /\.(?:mp4|m4v|mov|webm)$/i,
    mediaStreamInfo: async () => { probes++; return { video: 'h264', audio: 'ac3' }; },
    liveStreamPlan: () => ({ native: false, copyVideo: true }),
    randomUUID: () => assert.fail('warm-up must not create a stream token'),
    liveMediaStreams: new Map()
  };
  const open = vm.runInNewContext(`${pick(main, 'openChannelMedia')}; openChannelMedia`, context);
  const obsolete = new AbortController();
  context.mediaStreamInfoControllers.set('/old-show.mkv', obsolete);
  const plan = await open(null, 'native', 600);
  assert.equal(obsolete.signal.aborted, true, 'tuning abandons another channel’s file probe');
  assert.equal(plan.native, true);
  assert.equal(plan.verifyAudio, true);
  assert.equal(probes, 0, 'a cold native tune never spawns or awaits ffprobe');
  const prepared = await open(null, 'legacy', 600, { prepareOnly: true });
  assert.equal(prepared.prepared, true);
  assert.equal(probes, 1);
  assert.equal(context.liveMediaStreams.size, 0);
  context.mediaStreamInfo = async () => { throw new Error('timed out reading the file'); };
  await assert.rejects(open(null, 'legacy', 600, { prepareOnly: true }), /timed out/, 'failed warm-up is not reported as prepared');
});

test('failed upcoming-file reads back off instead of retrying every 500ms', async () => {
  let probes = 0;
  let retry;
  const context = {
    upcomingChannelMediaJobs: new Map(), playbackGeneration: 1, channelPlaybackReadyForWarmup: () => true,
    console: { warn() {} },
    window: {
      tube: { openChannelMedia: async () => { probes++; throw new Error('drive read timed out'); } },
      setTimeout(callback, delay) { assert.equal(delay, 60_000); retry = callback; }
    }
  };
  const prepare = vm.runInNewContext(`${pick(renderer, 'prepareUpcomingChannelAudio')}; prepareUpcomingChannelAudio`, context);
  const queue = ['now', 'next'].map(id => ({ id, path: `/${id}.mkv`, segmentType: 'program' }));
  const position = { segment: queue[0], index: 0 };
  prepare({ queue }, position);
  await context.upcomingChannelMediaJobs.get('/next.mkv');
  for (let tick = 0; tick < 40; tick++) prepare({ queue }, position);
  assert.equal(probes, 1);
  retry();
  prepare({ queue }, position);
  await context.upcomingChannelMediaJobs.get('/next.mkv');
  assert.equal(probes, 2, 'a transient failure is retried after the cooldown');
});

test('cancelled codec reads are not remembered as damaged-file failures', async () => {
  const context = {
    AbortController, mediaStreamInfoControllers: new Map(), mediaStreamInfoJobs: new Map(), mediaStreamInfoFailures: new Map(),
    readMediaStreamInfo: (_source, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('changed channel'), { name: 'AbortError' })), { once: true });
    })
  };
  const lookup = vm.runInNewContext(`${pick(main, 'mediaStreamInfo')}; mediaStreamInfo`, context);
  const pending = lookup('/show.mkv');
  context.mediaStreamInfoControllers.get('/show.mkv').abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(context.mediaStreamInfoFailures.size, 0);
  assert.equal(context.mediaStreamInfoJobs.size, 0);
  assert.equal(context.mediaStreamInfoControllers.size, 0);
});

test('native audio verification preserves silent files and only repairs the current generation', async () => {
  let codec = 'none';
  let repairs = 0;
  const context = {
    window: { tube: { getMediaAudioCodec: async () => codec } },
    channelAudioCompatibilityJobs: new Map(), channelAudioCodecVerified: new Set(), mediaWithoutAudio: new Set(),
    channelAudioCompatibilityFailures: new Map(), playbackGeneration: 7, activePlaybackPath: '/show.mp4',
    audioCodecNeedsConversion: name => name === 'ac3', restartChannelPlaybackLive: () => { repairs++; }, console
  };
  const verify = vm.runInNewContext(`${pick(renderer, 'verifyNativeChannelAudio')}; verifyNativeChannelAudio`, context);
  verify({ id: 'a', path: '/show.mp4' }, 7);
  await context.channelAudioCompatibilityJobs.get('/show.mp4');
  assert.ok(context.mediaWithoutAudio.has('/show.mp4'), 'silent programmes never trigger false sound repair');
  codec = 'ac3';
  verify({ id: 'a', path: '/show.mp4' }, 6);
  await context.channelAudioCompatibilityJobs.get('/show.mp4');
  assert.equal(repairs, 0, 'a late codec result cannot restart the new programme');
  verify({ id: 'a', path: '/show.mp4' }, 7);
  await context.channelAudioCompatibilityJobs.get('/show.mp4');
  assert.equal(repairs, 1, 'incompatible audio still switches to live AAC');
});

test('native response buffering is byte bounded and both request abort and body cancellation close the file', async () => {
  const streams = [];
  let strategy;
  const context = {
    fs: { createReadStream: (_path, options) => {
      assert.equal(options.highWaterMark, 256 * 1024);
      const stream = new PassThrough();
      streams.push(stream);
      return stream;
    } },
    Readable: { toWeb: (stream, options) => { strategy = options.strategy; return Readable.toWeb(stream, options); } }
  };
  const bodyFor = vm.runInNewContext(`${pick(main, 'mediaResponseBody')}; mediaResponseBody`, context);
  const controller = new AbortController();
  const first = bodyFor({ signal: controller.signal }, '/show.mp4');
  assert.equal(strategy.highWaterMark, 256 * 1024);
  assert.equal(strategy.size(Buffer.alloc(1024)), 1024, 'the queue counts bytes, not 256K chunks');
  controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(streams[0].destroyed, true);
  await first.cancel().catch(() => {});
  const second = bodyFor({ signal: new AbortController().signal }, '/show.mp4');
  await second.cancel();
  assert.equal(streams[1].destroyed, true);
});

test('optional warm-up waits for five stable seconds and scan completion', () => {
  const context = {
    channelPlaybackOnAir: () => true, channelStableSince: 1000, performance: { now: () => 5999 },
    channels: [{ scanning: false }]
  };
  const ready = vm.runInNewContext(`${pick(renderer, 'channelPlaybackReadyForWarmup')}; channelPlaybackReadyForWarmup`, context);
  assert.equal(ready({}), false);
  context.performance.now = () => 6000;
  assert.equal(ready({}), true);
  context.channels[0].scanning = true;
  assert.equal(ready({}), false);
  context.channels[0].scanning = false;
  context.channelStableSince = 0;
  assert.equal(ready({}), false, 'a waiting event resets the stable-playback interval');
});

test('restoring SAT at startup releases optional analysis even when the input has not changed', () => {
  const priorities = [];
  const context = {
    selectedInput: 'static', transitionStatic: false,
    window: { tube: { setPlaybackPriority: active => priorities.push(active) } }
  };
  const setInput = vm.runInNewContext(`${pick(renderer, 'setInputSource')}; setInputSource`, context);
  setInput('static', false);
  assert.deepEqual(priorities, [false]);
});

test('slow native loads cannot enter a broadcast-clock seek loop', () => {
  const segment = { path: '/show.mp4', sequence: 1, segmentType: 'program', sourceStartSeconds: 100 };
  const channel = { id: 'a', queue: [segment], broadcast: { totalDurationSeconds: 10000 } };
  const position = { segment, index: 0, offsetSeconds: 20 };
  const shifts = [];
  let seeks = 0;
  const video = { paused: false, seeking: true, readyState: 1, set currentTime(_value) { seeks++; } };
  const context = {
    window: {}, activeChannel: () => channel, selectedInput: 'tv', activeChannelId: 'a', channelTuneToken: 1,
    broadcastElapsed: () => 120, locateChannelSegment: () => position, holdBroadcastForPlayingSegment: () => false,
    pruneCompletedChannelQueue: () => position, isUnplayableChannelMedia: () => false, hasVideo: true,
    activePlaybackChannelId: 'a', activePlaybackTuneToken: 1, activePlaybackPath: segment.path, currentIndex: 0, video,
    playbackSourceTime: () => 100, shiftBroadcastClock: (_channel, delta) => shifts.push(delta),
    prepareUpcomingChannelAudio() {}, channelPlaybackReadyForWarmup: () => false
  };
  const sync = vm.runInNewContext(`${pick(renderer, 'channelPlaybackOnAir')}\n${pick(renderer, 'syncActiveBroadcast')}; syncActiveBroadcast`, context);
  for (let tick = 0; tick < 40; tick++) sync();
  assert.equal(seeks, 0, '500ms sync ticks never interrupt a disk seek');
  assert.deepEqual(shifts, [], 'loading is not counted as on-air viewing');
  video.seeking = false;
  video.readyState = 4;
  sync();
  assert.deepEqual(shifts, [-20], 'even a 20-second delay moves the clock, not the file position');
  assert.equal(seeks, 0);
});

test('loading reports schedule work separately from playback buffering and keeps the background animated', () => {
  const channel = { enabled: true, scanComplete: true, scanning: false };
  const context = {
    selectedInput: 'tv', startupIntroActive: false, channels: [channel], activeChannel: () => channel,
    channelsStartupReady: true, hasVideo: true, video: { readyState: 2, seeking: false }, channelLoadPhase: 'LOADING VIDEO...'
  };
  const status = vm.runInNewContext(`${pick(renderer, 'channelLoadingStatus')}; channelLoadingStatus`, context);
  const progress = vm.runInNewContext(`${pick(renderer, 'channelPreparationStatus')}; channelPreparationStatus`, context);
  assert.equal(status(), 'BUFFERING...');
  assert.equal(progress(), '');
  channel.scanning = true;
  assert.equal(status(), 'READING CHANNEL FILES...');
  assert.equal(progress(), 'UPDATING CHANNELS 0/1');
  channel.scanning = false;
  channel.broadcastInitPromise = {};
  assert.equal(status(), 'BUILDING SCHEDULE...');
  channel.broadcastInitPromise = null;
  context.video.readyState = 0;
  assert.equal(status(), 'LOADING VIDEO...');
  const colours = [];
  const draw = vm.runInNewContext(`${pick(renderer, 'drawChannelLoadingPicture')}; drawChannelLoadingPicture`, {
    compositeContext: { set fillStyle(value) { colours.push(value); }, fillRect() {} }
  });
  draw(1280, 960, 1000);
  const first = colours.splice(0);
  draw(1280, 960, 1100);
  assert.notDeepEqual(colours, first, 'the tuning backdrop refreshes even when the video has no new frames');
});

test('metadata-only channel stalls recover instead of searching indefinitely', () => {
  let failures = 0;
  let check;
  const context = {
    selectedInput: 'tv', activePlaybackChannelId: 'channel', activePlaybackUrl: '/media',
    playbackGeneration: 5, isCurrentChannelPlayback: () => true,
    video: { readyState: 1, error: null }, CHANNEL_LOAD_STALL_MS: 15000,
    activePlaybackPath: '/episode.mp4', console: { warn() {} },
    window: { setTimeout(callback) { check = callback; } },
    handlePlaybackFailure() { failures++; }
  };
  const watch = vm.runInNewContext(`${pick(renderer, 'watchChannelLoad')}; watchChannelLoad`, context);
  watch(5);
  check();
  assert.equal(failures, 1, 'metadata with no decoded picture triggers recovery');
  context.video.readyState = 2;
  watch(5);
  check();
  assert.equal(failures, 1, 'loaded pictures are left playing');
  context.playbackGeneration = 6;
  context.video.readyState = 1;
  check();
  assert.equal(failures, 1, 'a stale timeout cannot restart the new channel');
});

test('SAT is the visible name for the existing static input without changing saved input IDs', () => {
  const sync = pick(renderer, 'syncBypassControls');
  assert.match(sync, /selectedInput === 'static' \? 'SAT'/);
  assert.match(sync, /Input is \$\{selectedInput === 'static' \? 'SAT'/);
  assert.match(read('remote/remote.js'), /lcdMain\.textContent = 'INPUT · SAT'/);
  assert.doesNotMatch(renderer, /'STATIC INPUT|'TV STATIC INPUT/);
});

test('explicit reshuffle discards stale episode bags and avoids the previous opening programme', () => {
  const first = { segmentType: 'program', showPath: '/show', path: '/show/episode1.mp4' };
  const context = { unwrapChannelSchedule(channel) { channel.queue = []; channel.broadcast = null; } };
  const reset = vm.runInNewContext(`${pick(renderer, 'resetChannelShuffle')}; resetChannelShuffle`, context);
  const channel = { queue: [first], rotation: { episodeBags: { '/show': ['/deleted.mp4'] } }, playHistory: { old: 1 } };
  reset(channel);
  assert.equal(channel.rotation.lastShowPath, first.showPath);
  assert.equal(channel.rotation.lastEpisodeByShow[first.showPath], first.path);
  assert.equal(channel.rotation.episodeBags, undefined);
  assert.equal(channel.nextSequence, 0);
});

test('CRT backing surfaces preserve aspect within a 1080p pixel budget at every zoom', () => {
  const size = vm.runInNewContext(`${pick(renderer, 'pictureRenderSize')}; pictureRenderSize`);
  for (const [width, height] of [[5120, 2880], [7680, 4320], [2000, 2000], [3440, 1440], [1440, 2560], [640, 480], [0, 0]]) {
    const output = size(width, height);
    assert.ok(output.width * output.height <= 1920 * 1080);
    assert.ok(Math.max(output.width, output.height) <= 1920);
    assert.ok(output.width >= 1 && output.height >= 1);
    if (height && width) assert.ok(Math.abs(output.width / output.height - width / height) < 0.005);
  }
  assert.equal(size(5120, 2880).width, 1920);
  assert.equal(size(5120, 2880).height, 1080);
  assert.equal(size(640, 480).width, 640);
});

test('live input is paced with a small startup allowance in copy and encode modes without changing A/V seeking', () => {
  const argsFor = vm.runInNewContext(`${pick(main, 'liveMediaArgs')}; liveMediaArgs`);
  for (const mode of ['copy', 'encode']) {
    const args = Array.from(argsFor({ mode, source: '/programme.mkv', startSeconds: 30, videoTag: 'avc1' }));
    assert.equal(args[args.indexOf('-readrate') + 1], '1');
    assert.equal(args[args.indexOf('-readrate_initial_burst') + 1], '6');
    assert.equal(args[args.indexOf('-readrate_catchup') + 1], '1.5');
    assert.ok(args.indexOf('-readrate') < args.indexOf('-i'));
    assert.ok(args.indexOf('-ss') < args.indexOf('-i'));
    assert.equal(args.includes('-noaccurate_seek'), mode === 'copy');
    assert.equal(args[args.indexOf('-ss') + 1], mode === 'copy' ? '30.010' : '30.000');
    assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
  }
});

test('duplicate live GETs replace encoders, HEAD spawns none, and abort/cancel close the producer', async t => {
  const children = [];
  const entries = new Map([['token', { source: '/programme.mkv' }]]);
  const context = {
    intermissionActive: false, televisionWindow: { isDestroyed: () => false },
    liveMediaStreams: entries, liveMediaChildren: new Map(),
    transcodeExecutableCandidates: () => ['ffmpeg'], liveMediaArgs: () => [],
    spawn() {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kills = 0;
      child.kill = () => { child.kills += 1; };
      children.push(child);
      return child;
    },
    Response, Readable, path, logLaunch() {}
  };
  vm.createContext(context);
  vm.runInContext(`${pick(main, 'stopLiveMedia')}\n${pick(main, 'serveLiveMedia')}\nthis.serve = serveLiveMedia;`, context);
  t.after(() => { for (const child of children) { child.stdout.destroy(); child.stderr.destroy(); child.emit('close', 0); } });
  const head = context.serve(new Request('http://localhost/live', { method: 'HEAD' }), 'token');
  assert.equal(head.status, 200);
  assert.equal(children.length, 0);
  const controller = new AbortController();
  const request = new Request('http://localhost/live', { signal: controller.signal });
  const first = context.serve(request, 'token');
  const second = context.serve(request, 'token');
  assert.equal(children.length, 2);
  assert.ok(children[0].kills > 0);
  assert.equal(children[0].stdout.destroyed, true);
  controller.abort();
  assert.ok(children[1].kills > 0);
  assert.equal(children[1].stdout.destroyed, true);
  assert.equal(context.serve(request, 'token').status, 499);
  assert.equal(children.length, 2, 'already-aborted requests cannot create encoders');
  const third = context.serve(new Request('http://localhost/live'), 'token');
  await third.body.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(children[2].kills > 0, 'cancelling the response body terminates FFmpeg');
  assert.equal(children[2].stdout.destroyed, true);
  await Promise.allSettled([first.body.cancel(), second.body.cancel()]);
});

test('house key enters the saved room then cycles rooms without moving through other fullscreen views', async () => {
  const actions = [];
  const scenes = { active: false, next: async () => actions.push('next') };
  const context = {
    fullscreenTransition: false, window: { SaturdayScenes: scenes },
    enterSceneFullscreen: async () => { scenes.active = true; actions.push('enter'); },
    syncFullscreenButtonState() {}, setStatus() {}, console
  };
  const change = vm.runInNewContext(`${pick(renderer, 'changeRoom')}; changeRoom`, context);
  await change();
  await change();
  assert.deepEqual(actions, ['enter', 'next']);
  context.fullscreenTransition = true;
  await change();
  assert.deepEqual(actions, ['enter', 'next'], 'rapid presses cannot overlap fullscreen transitions');
  assert.match(renderer, /case 'scene-next': void changeRoom\(\); break;/);
  const remote = read('remote/index.html');
  assert.match(remote, /data-action="scene-next"/);
  assert.doesNotMatch(remote, /data-action="track-(?:up|down)"/);
});

test('picture visibility suspends drawing only, leaving audio and schedule timers running', () => {
  const callback = renderer.match(/window\.tube\.onPictureVisibilityChange\?\.\(visible => \{[\s\S]*?\n\}\);/)[0];
  let pending = null;
  const context = {
    pictureVisible: true, lastPictureFrame: 25, frameLoopRequest: null,
    window: { tube: { onPictureVisibilityChange(callback) { context.visibility = callback; } } },
    requestAnimationFrame: () => { pending = 1; return 1; },
    cancelAnimationFrame: () => { pending = null; }, frameLoop() {}
  };
  vm.runInNewContext(`${pick(renderer, 'scheduleFrameLoop')}\n${pick(renderer, 'pauseFrameLoop')}\n${callback}`, context);
  context.visibility(false);
  assert.equal(context.pictureVisible, false);
  context.visibility(true);
  assert.equal(context.lastPictureFrame, -Infinity);
  assert.equal(pending, 1);
  context.visibility(false);
  assert.equal(pending, null);
  assert.equal(context.frameLoopRequest, null);
  assert.match(main, /win\.on\('minimize', \(\) => sendPictureVisibility\(false\)\)/);
  assert.match(main, /win\.on\('restore', \(\) => sendPictureVisibility\(true\)\)/);
  assert.match(main, /backgroundThrottling: false/);
});

test('scene rendering uses one bounded viewport canvas without full-room filter targets', () => {
  const css = read('scene-mode.css');
  const js = read('scene-mode.js');
  const canvas = css.split('\n').find(line => line.startsWith('#sceneImage '));
  assert.ok(canvas.includes('position:absolute; inset:0;'));
  assert.ok(canvas.includes('width:100%; height:100%'));
  assert.doesNotMatch(canvas, /transform:|filter:|mix-blend-mode/);
  assert.ok(css.includes('#sceneWorld { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; contain:strict;'));
  assert.doesNotMatch(css, /#sceneScreenSpill|#sceneRoomBounce/);
  assert.ok(js.includes('MAX_SCENE_CANVAS_PIXELS = 3_145_728'));
  assert.ok(js.includes('MAX_SCENE_CANVAS_EDGE = 4096'));
  assert.ok(js.includes('boundedCanvasSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)'));
  assert.ok(js.includes('sceneCanvasContext.setTransform(canvasSize.scaleX, 0, 0, canvasSize.scaleY, 0, 0)'));
  assert.ok(js.includes('sceneCanvasContext.drawImage(sceneImageAsset, rect.left, rect.top, rect.width, rect.height)'));
  assert.ok(js.includes('mount.style.transform = `translate(-50%, -100%) scale('));
});
