const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  CommercialsService,
  parseBlackIntervals,
  mergeBlackIntervals,
  chooseProgramBreaks,
  createCommercialSegments,
  markQuietBlacks,
  parseSilenceIntervals,
  targetCommercialSeconds,
  shouldUseBoundaryBreak
} = require('../commercials-service.cjs');

test('parses and merges FFmpeg black intervals without losing fade bounds', () => {
  const parsed = parseBlackIntervals([
    '[blackdetect] black_start:10.10 black_end:10.44 black_duration:0.34',
    '[blackdetect] black_start:10.50 black_end:10.80 black_duration:0.30',
    '[blackdetect] black_start:36.1 black_end:36.6 black_duration:0.5'
  ].join('\n'));
  assert.equal(parsed.length, 3);
  const merged = mergeBlackIntervals(parsed);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].start, 10.1);
  assert.equal(Number(merged[0].end.toFixed(2)), 10.8);
  assert.equal(merged[0].merged, true);
});

test('commercial breaks land only on black intervals near even targets', () => {
  const duration = 3600;
  const fades = [720, 1440, 2160, 2880].map(at => ({ start: at - 0.35, end: at + 0.35, duration: 0.7 }));
  const plan = chooseProgramBreaks(duration, fades);
  assert.equal(plan.breaks.length, 4);
  assert.deepEqual(plan.breaks.map(item => Math.round(item.at)), [720, 1440, 2160, 2880]);
  assert.equal(plan.targetAdSeconds, 808.2);
  assert.ok(plan.breaks.every(item => item.confidence >= 0.79 && item.reviewNeeded === false));
});

test('targets 11 ad minutes per 60 minutes of total viewing', () => {
  for (const programMinutes of [48, 49, 50]) {
    const programSeconds = programMinutes * 60;
    const ads = targetCommercialSeconds(programSeconds);
    const total = programSeconds + ads;
    assert.ok(Math.abs((ads / total) - (11 / 60)) < 0.0001);
  }
  assert.equal(targetCommercialSeconds(49 * 60), 660);
  const plan = chooseProgramBreaks(49 * 60, [735, 1470, 2205].map(at => ({ start: at - 0.35, end: at + 0.35, duration: 0.7 })));
  assert.equal(plan.targetAdSeconds, 660);
});

test('short episodes avoid mid-rolls and reserve the break for the next video', () => {
  assert.equal(shouldUseBoundaryBreak(899.9, true), true);
  assert.equal(shouldUseBoundaryBreak(900, true), false);
  assert.equal(shouldUseBoundaryBreak(899.9, false), false);
  const fades = [{ start: 400, end: 400.4, duration: 0.4 }];
  assert.deepEqual(chooseProgramBreaks(899.9, fades).breaks, []);
  assert.equal(chooseProgramBreaks(899.9, fades).targetAdSeconds, 0);
});

test('watched-folder discovery waits for stability and ignores download sidecars', async () => {
  const root = await fs.mkdtemp(path.join(__dirname, '..', `.commercials-scan-${process.pid}-`));
  try {
    const watched = path.join(root, 'watched');
    const library = path.join(root, 'library');
    await fs.mkdir(watched, { recursive: true });
    const stableFile = path.join(watched, '001 - finished.mp4');
    await fs.writeFile(stableFile, Buffer.alloc(128 * 1024, 7));
    await fs.writeFile(path.join(watched, 'active.temp.mp4'), Buffer.alloc(128 * 1024, 8));
    await fs.writeFile(path.join(watched, 'active.f135.mp4'), Buffer.alloc(128 * 1024, 9));
    const service = new CommercialsService(library, { stabilityMs: 30_000 });
    let imports = 0;
    service.importWatchedFile = async () => { imports += 1; return { imported: true, title: 'Finished' }; };
    const now = Date.now();
    await fs.utimes(stableFile, new Date(now), new Date(now));
    const first = await service.scanWatchedFolder(watched, () => {}, { now });
    assert.equal(first.imported, 0);
    assert.equal(first.pending, 1);
    assert.equal(imports, 0);
    const second = await service.scanWatchedFolder(watched, () => {}, { now: now + 30_001 });
    assert.equal(second.imported, 1);
    assert.equal(imports, 1);
    assert.equal(second.total, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a missing or non-Commercials watcher root is safely disabled', async t => {
  const root = await fs.mkdtemp(path.join(__dirname, '..', `.commercials-watch-${process.pid}-`));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = new CommercialsService(path.join(root, 'library'));
  const progress = [];
  assert.equal(service.startWatchingFolder(path.join(root, 'missing'), item => progress.push(item)), false);
  const channelRoot = path.join(root, 'TV-Channels');
  await fs.mkdir(channelRoot, { recursive: true });
  assert.equal(service.startWatchingFolder(channelRoot, item => progress.push(item)), false);
  assert.equal(service.watchTimer, null);
  assert.equal(service.watchedRoot, null);
  assert.deepEqual(progress, []);
});

test('does not invent a scene cut if no suitable fades are detected', () => {
  const plan = chooseProgramBreaks(1800, []);
  assert.equal(plan.breaks.length, 0);
  assert.equal(plan.candidateCount, 0);
});

test('split segments omit the black transition and flag short or uncertain clips', () => {
  const segments = createCommercialSegments(60, [
    { start: 0, end: 0.15 },
    { start: 10, end: 10.5 },
    { start: 10.55, end: 10.8 },
    { start: 21, end: 21.15 },
    { start: 27, end: 27.2 }
  ]);
  assert.equal(segments.length, 4);
  assert.equal(segments[0].sourceStart, 0);
  assert.equal(segments[0].sourceEnd, 10);
  assert.equal(segments[1].sourceStart, 10.8);
  assert.equal(segments[1].sourceEnd, 21);
  assert.equal(segments[2].needsReview, true);
  assert.equal(segments[2].enabled, true);
});

test('reels split only where black meets a pause in the sound', () => {
  const stderr = [
    '[silencedetect @ 0x1] silence_start: 29.8',
    '[silencedetect @ 0x1] silence_end: 30.4 | silence_duration: 0.6',
    '[silencedetect @ 0x1] silence_start: 89.9'
  ].join('\n');
  const silences = parseSilenceIntervals(stderr, 91);
  assert.deepEqual(silences, [{ start: 29.8, end: 30.4 }, { start: 89.9, end: 91 }]);
  // A 30 s spot, then a 60 s spot that fades to black at 45 s while its voice-over continues.
  const blacks = markQuietBlacks([{ start: 30, end: 30.2 }, { start: 45, end: 45.3 }], silences);
  assert.deepEqual(blacks.map(item => item.quiet), [true, false]);
  const segments = createCommercialSegments(90, blacks);
  assert.deepEqual(segments.map(item => [item.sourceStart, item.sourceEnd]), [[0, 30], [30.2, 90]], 'the fade inside the spot is not a split');

  const silentReel = Array.from({ length: 5 }, (_, index) => ({ start: 30 * (index + 1), end: 30 * (index + 1) + 0.2, quiet: false }));
  const rejoined = createCommercialSegments(180, silentReel);
  assert.equal(rejoined.length, 3);
  assert.ok(rejoined.every(item => item.durationSeconds <= 62), 'a reel with no quiet gaps still splits into spot-sized clips');
  assert.equal(markQuietBlacks([{ start: 1, end: 2 }], null)[0].quiet, undefined, 'files without sound split on black alone');
});

test('completed source paths are available to TV without leaking through the library summary', async () => {
  const root = await fs.mkdtemp(path.join(__dirname, '..', `.saturday-commercial-sources-${process.pid}-`));
  try {
    const service = new CommercialsService(root);
    await service.ready();
    service.database.sources.push(
      { id: 'ready-source', status: 'complete', originalPath: '/channel/Commercials/ad.mp4', sizeBytes: 123, mtimeMs: 456 },
      { id: 'incomplete-source', status: 'processing', originalPath: '/channel/Commercials/partial.mp4', sizeBytes: 1, mtimeMs: 2 }
    );
    await service.save();
    const sources = await service.listChannelSources();
    assert.deepEqual(sources, [{ id: 'ready-source', status: 'complete', originalPath: '/channel/Commercials/ad.mp4', sizeBytes: 123, mtimeMs: 456, clipCount: undefined, splitVersion: 0 }]);
    const library = await service.listLibrary();
    assert.equal(library.sources[0].originalPath, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('clip review state persists in the local library index', async () => {
  const root = await fs.mkdtemp(path.join(__dirname, '..', `.saturday-commercials-${process.pid}-`));
  try {
    const service = new CommercialsService(root, { ffmpegPath: '/not-used/ffmpeg' });
    await service.ready();
    await fs.mkdir(path.join(root, 'clips'), { recursive: true });
    await fs.writeFile(path.join(root, 'clips', 'sample.mp4'), Buffer.from('sample clip'));
    service.database.clips.push({ id: 'sample-id', ordinal: 1, title: 'Commercial 01', file: 'clips/sample.mp4', enabled: true, reviewed: false, needsReview: true });
    await service.save();
    await service.updateClip('sample-id', { reviewed: true, enabled: false });
    const reopened = new CommercialsService(root, { ffmpegPath: '/not-used/ffmpeg' });
    const library = await reopened.listLibrary();
    assert.equal(library.clips.length, 1);
    assert.equal(library.clips[0].reviewed, true);
    assert.equal(library.clips[0].needsReview, false);
    assert.equal(library.clips[0].enabled, false);
    assert.equal(library.reviewCount, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
