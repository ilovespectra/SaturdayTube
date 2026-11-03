const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  ChannelBreakFinder,
  breakAnalysisWindow,
  chooseBreakPoint,
  parseBreakAnalysis,
  pcmLevels
} = require('../channel-breaks.cjs');
const { reconcileChannelPlayback } = require('../channels-service.cjs');

const read = file => require('node:fs').readFileSync(path.join(__dirname, '..', file), 'utf8');

test('FFmpeg black and silence reports are parsed into absolute source times', () => {
  const stderr = [
    '[Parsed_blackdetect_2 @ 0x1] black_start:12.5 black_end:13.3 black_duration:0.8',
    '[Parsed_silencedetect_0 @ 0x2] silence_start: 40.1',
    '[Parsed_silencedetect_0 @ 0x2] silence_end: 41.0 | silence_duration: 0.9',
    '[Parsed_silencedetect_1 @ 0x3] silence_start: 70',
    '[Parsed_silencedetect_1 @ 0x3] silence_end: 70.6 | silence_duration: 0.6',
    '[Parsed_silencedetect_1 @ 0x3] silence_start: 205'
  ].join('\n');
  const parsed = parseBreakAnalysis(stderr, 600, 210);
  assert.deepEqual(parsed.blacks, [{ start: 612.5, end: 613.3 }]);
  assert.deepEqual(parsed.silences.map(item => [item.tier, +item.start.toFixed(1), +item.end.toFixed(1)]), [
    [0, 640.1, 641], [1, 670, 670.6], [1, 805, 810]
  ]);
});

// 20 ms power frames from 600 s: speech with brief gaps between words, plus any quiet spans requested.
function speech(quiet = []) {
  return Array.from({ length: 210 / 0.02 }, (_, index) => {
    const seconds = 600 + index * 0.02;
    const span = quiet.find(item => seconds >= item.start && seconds < item.end);
    if (span) return span.power;
    return index % 15 < 3 ? 0.0005 : 0.1;
  });
}

test('PCM audio becomes 20 ms loudness frames', () => {
  const buffer = Buffer.alloc(8000 * 2);
  for (let index = 0; index < 4000; index += 1) buffer.writeInt16LE(16384, index * 2);
  const levels = pcmLevels(buffer);
  assert.equal(levels.length, 50);
  assert.ok(Math.abs(levels[0] - 0.25) < 1e-9);
  assert.equal(levels[49], 0);
});

test('breaks land in a real pause, never between words, and prefer a quiet fade to black', () => {
  const base = { targetSeconds: 660, levelsStartSeconds: 600 };
  const pauses = [{ start: 630, end: 631.5, power: 1e-7 }, { start: 690, end: 691.5, power: 1e-7 }];
  const black = chooseBreakPoint({ ...base, levels: speech(pauses), blacks: [{ start: 630.2, end: 631.2 }] });
  assert.equal(black.kind, 'black');
  assert.ok(Math.abs(black.seconds - 630.7) < 0.01);

  const silence = chooseBreakPoint({ ...base, levels: speech(pauses) });
  assert.equal(silence.kind, 'silence');
  assert.ok(silence.seconds > 690 && silence.seconds < 691.5, 'among equal pauses it waits rather than cutting early');

  const lull = chooseBreakPoint({ ...base, levels: speech([{ start: 672, end: 673, power: 0.006 }]) });
  assert.equal(lull.kind, 'lull');
  assert.ok(lull.seconds > 672 && lull.seconds < 673, 'a dip between sentences beats every gap inside a word');

  const loudBlack = chooseBreakPoint({ ...base, levels: speech([{ start: 690, end: 691.5, power: 1e-7 }]), blacks: [{ start: 650, end: 650.3 }] });
  assert.equal(loudBlack.kind, 'silence', 'a flash of black over dialogue loses to a real pause');

  assert.deepEqual(chooseBreakPoint({ targetSeconds: 660 }), { seconds: 660, kind: 'nominal' });
  assert.equal(chooseBreakPoint({ targetSeconds: 660, maxSeconds: 650, blacks: [{ start: 700, end: 701 }] }).kind, 'nominal',
    'cuts never leave a segment shorter than its neighbours allow');
  const bounded = chooseBreakPoint({ ...base, minSeconds: 700, levels: speech(pauses) });
  assert.ok(bounded.seconds >= 700, 'cuts stay after the point the picture has already reached');
  assert.deepEqual(breakAnalysisWindow(660, 700), { start: 600, durationSeconds: 100 });
});

test('break analysis is cached, earliest-due first, and skips cuts already on the air', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tube-breaks-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const cachePath = path.join(root, 'channel-break-cache.json');
  const analysed = [];
  const resolved = [];
  const finder = new ChannelBreakFinder({
    cachePath,
    platform: 'linux',
    getExecutable: async () => '/usr/bin/ffmpeg',
    onResolved: filePath => resolved.push(filePath),
    run: async (_executable, args) => {
      if (args.includes('0:a:0')) return { stderr: '', stdout: Buffer.alloc(0) };
      analysed.push(args[args.indexOf('-i') + 1]);
      return { stderr: '[Parsed_blackdetect_2 @ 0x1] black_start:50 black_end:51 black_duration:1', stdout: Buffer.alloc(0) };
    }
  });
  const entry = (file, secondsUntil, extra = {}) => ({
    path: file, size: 10, modified: 20, targetSeconds: 660, mediaDurationSeconds: 1320,
    minSeconds: 120, maxSeconds: 1200, secondsUntil, ...extra
  });
  const first = await finder.resolve([entry('/tv/late.mkv', 3000), entry('/tv/soon.mkv', 600), entry('/tv/airing.mkv', 5)]);
  assert.deepEqual(first, [null, null, null]);
  while (finder.working || finder.pending.size) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(analysed, ['/tv/soon.mkv', '/tv/late.mkv']);
  assert.deepEqual(resolved, ['/tv/soon.mkv', '/tv/late.mkv']);
  const cached = await finder.resolve([entry('/tv/soon.mkv', 600)]);
  assert.deepEqual(cached, [{ seconds: 650.5, kind: 'black' }]);
  await finder.flush();

  const restarted = new ChannelBreakFinder({ cachePath, getExecutable: async () => null, run: async () => assert.fail('cache should answer') });
  assert.deepEqual(await restarted.resolve([entry('/tv/late.mkv', 100)]), [{ seconds: 650.5, kind: 'black' }]);
  assert.deepEqual(await restarted.resolve([entry('/tv/late.mkv', 100, { modified: 21 })]), [null], 'an edited file is analysed again');
});

test('refined break points survive a restart', () => {
  const shows = [{ name: 'Show', path: '/tv/Show', episodes: [{ path: '/tv/Show/e1.mkv', durationSeconds: 1320, url: 'u' }] }];
  const commercials = [{ path: '/ads/a.mp4', durationSeconds: 30, url: 'a' }];
  const restored = reconcileChannelPlayback(shows, commercials, {
    elapsedSeconds: 10,
    queue: [
      { path: '/tv/Show/e1.mkv', segmentType: 'program', sourceStartSeconds: 0, durationSeconds: 650.5, endCutKind: 'black' },
      { path: '/ads/a.mp4', segmentType: 'commercial', durationSeconds: 30 },
      { path: '/tv/Show/e1.mkv', segmentType: 'program', sourceStartSeconds: 650.5, durationSeconds: 669.5, breakTargetSeconds: 660, startCutKind: 'black' }
    ]
  });
  assert.equal(restored.queue[0].endCutKind, 'black');
  assert.equal(restored.queue[2].startCutKind, 'black');
  assert.equal(restored.queue[2].breakTargetSeconds, 660);
  assert.equal(restored.queue[2].sourceStartSeconds, 650.5);
});

test('foreground playback cancels optional analysis without losing or caching its pending cut', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tube-break-priority-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let started;
  let finish;
  let calls = 0;
  let aborts = 0;
  const running = new Promise(resolve => { started = resolve; });
  const finder = new ChannelBreakFinder({
    cachePath: path.join(root, 'breaks.json'), getExecutable: async () => '/ffmpeg',
    run: async (_executable, _args, _timeout, signal) => {
      calls++;
      started();
      if (calls <= 2) return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborts++;
          reject(Object.assign(new Error('foreground playback'), { name: 'AbortError' }));
        }, { once: true });
      });
      return { stderr: '', stdout: Buffer.alloc(0) };
    },
    onResolved: () => finish?.()
  });
  finder.setPaused(true);
  const entry = { path: '/show.mkv', targetSeconds: 660, mediaDurationSeconds: 1320, secondsUntil: 600 };
  await finder.resolve([entry]);
  assert.equal(calls, 0, 'the selected video input does not start background disk reads');
  finder.setPaused(false);
  await running;
  finder.setPaused(true);
  while (finder.working) await new Promise(resolve => setImmediate(resolve));
  assert.equal(aborts, 2, 'both video and audio analysis readers are cancelled');
  assert.equal(finder.cache.size, 0, 'cancellation cannot permanently save an inaccurate nominal cut');
  assert.equal(finder.pending.size, 1, 'the job remains available after playback');
  const resolved = new Promise(resolve => { finish = resolve; });
  finder.setPaused(false);
  await resolved;
  assert.equal(calls, 4);
  assert.equal(finder.cache.size, 1);
  finder.setPaused(true);
  assert.deepEqual(await finder.resolve([entry]), [{ seconds: 660, kind: 'nominal' }], 'cached answers work during playback');
  await finder.flush();
});

test('playback dips to black and silence around cuts that are not already black', () => {
  const renderer = read('renderer.js');
  assert.match(renderer, /segment\.endCutKind !== 'black'/);
  assert.match(renderer, /segment\.startCutKind !== 'black'/);
  assert.match(renderer, /breakFadeOverlay\.style\.opacity = String\(1 - level\);\n    setMasterVolume\(true\);/);
  assert.match(renderer, /const volume = dialVolumeGain\(\) \* channelBreakFadeLevel \*/);
  assert.match(renderer, /lastPictureFrame = now;\n  updateChannelBreakFade\(\);/);
  assert.match(renderer, /minSeconds = Math\.max\(minSeconds, Math\.ceil\(\(playingSeconds \+ 25\) \/ 30\) \* 30\);/, 'an on-air cut only moves ahead of the picture');
  assert.match(renderer, /cut - \(beforeStart \+ livePosition\.offsetSeconds\) < 3\) return;/);
  assert.match(renderer, /after\.cutVersion = CHANNEL_BREAK_CUT_VERSION;/, 'cuts planned by older analysis are refined again');
  assert.match(renderer, /before\.durationSeconds = cut - beforeStart;\n        after\.sourceStartSeconds = cut;\n        after\.durationSeconds = afterEnd - cut;/);
  assert.match(read('index.html'), /<canvas id="picture"[^>]*><\/canvas>\n\s*<canvas id="genesisPicture"[^>]*><\/canvas>\n\s*<div id="breakFade" class="break-fade" aria-hidden="true"><\/div>/);
  assert.match(read('styles.css'), /\.break-fade \{[^}]*background: #000; opacity: 0; pointer-events: none;/);
  const main = read('main.cjs');
  assert.match(main, /ipcMain\.handle\('resolve-channel-breaks'/);
  assert.match(main, /roots\.some\(root => insideRoot\(root, path\.resolve\(entry\.path\)\)\)/, 'only trusted channel folders are analysed');
});

test('the broadcast clock waits for the picture so ads and programmes are never cut short or started part-way', () => {
  const renderer = read('renderer.js');
  assert.match(renderer, /if \(!forceTune && holdBroadcastForPlayingSegment\(channel, position\)\) return;/);
  assert.match(renderer, /if \(current\.segmentType === 'commercial' && Number\.isFinite\(playbackSourceDuration\(\)\)\) \{\n    end = Math\.max\(end, Math\.min\(playbackSourceDuration\(\), scheduledEnd \+ CHANNEL_CLOCK_HOLD_MAX_SECONDS\)\);/, 'an ad plays to its last frame');
  assert.match(renderer, /if \(Math\.abs\(delta\) > 0\.05 && channelPlaybackOnAir\(channel\)\) shiftBroadcastClock\(channel, delta\);/);
});
