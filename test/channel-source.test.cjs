const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { scanChannelFolder, isChannelFolder, createBroadcastSchedule } = require('../channels-service.cjs');

const read = file => readFileSync(path.join(__dirname, '..', file), 'utf8');
const registerMedia = filePath => ({ id: filePath, url: 'fixture', title: path.basename(filePath), path: filePath });

async function makeSource(t) {
  const source = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-source-')));
  t.after(() => fs.rm(source, { recursive: true, force: true }));
  return source;
}

test('loose videos in a channel folder air as a programme block named after the channel', async t => {
  const source = await makeSource(t);
  const root = path.join(source, 'VH1');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'Video 2.mp4'), 'x');
  await fs.writeFile(path.join(root, 'Video 1.mp4'), 'x');
  await fs.writeFile(path.join(root, 'notes.txt'), 'x');
  assert.equal(await isChannelFolder(root), true, 'a folder of loose videos is discovered as a channel');
  const scanned = await scanChannelFolder(root, { registerMedia, probeDuration: async () => 180 });
  assert.equal(scanned.showCount, 1);
  assert.equal(scanned.shows[0].name, 'VH1');
  assert.equal(scanned.shows[0].path, root);
  assert.deepEqual(scanned.shows[0].episodes.map(item => item.title), ['Video 1.mp4', 'Video 2.mp4']);
  assert.equal(scanned.commercialCount, 0);
});

test('loose videos sit alongside show folders and never pull in commercials', async t => {
  const source = await makeSource(t);
  const root = path.join(source, 'MTV');
  await fs.mkdir(path.join(root, 'Commercials'), { recursive: true });
  await fs.mkdir(path.join(root, 'Daria'));
  await fs.writeFile(path.join(root, 'Commercials', 'ad.mp4'), 'x');
  await fs.writeFile(path.join(root, 'Daria', 'S01E01.mp4'), 'x');
  await fs.writeFile(path.join(root, 'Music Video.mp4'), 'x');
  const scanned = await scanChannelFolder(root, { registerMedia, probeDuration: async () => 60 });
  assert.deepEqual(scanned.shows.map(show => show.name).sort(), ['Daria', 'MTV']);
  const loose = scanned.shows.find(show => show.path === root);
  assert.deepEqual(loose.episodes.map(item => item.title), ['Music Video.mp4']);
  assert.equal(scanned.commercialCount, 1);
});

test('a channel without a Commercials folder builds a programme-only schedule', async t => {
  const source = await makeSource(t);
  const root = path.join(source, 'Ghibli');
  await fs.mkdir(path.join(root, 'Totoro'), { recursive: true });
  await fs.writeFile(path.join(root, 'Totoro', 'movie.mp4'), 'x');
  assert.equal(await isChannelFolder(root), true);
  const scanned = await scanChannelFolder(root, { registerMedia, probeDuration: async () => 300 });
  assert.equal(scanned.commercialsRoot, null);
  const schedule = createBroadcastSchedule(scanned.shows, scanned.commercials, {}, 0, () => 0.5);
  assert.ok(schedule.queue.length > 0);
  assert.ok(schedule.queue.every(item => item.segmentType === 'program'), 'no commercial segments are scheduled');
});

test('a remembered channel source folder is rescanned for new channel folders', () => {
  const main = read('main.cjs');
  const preload = read('preload.cjs');
  const renderer = read('renderer.js');
  assert.match(main, /async function discoverSiblingChannels\(_event, savedRoots, sourceRoot\)/);
  assert.match(main, /ipcMain\.handle\('choose-channel-source', chooseChannelSource\)/);
  assert.match(main, /const looseRootShow = !movieOnly && showPath === root/);
  assert.match(preload, /chooseChannelSource: \(\) => ipcRenderer\.invoke\('choose-channel-source'\)/);
  assert.match(preload, /discoverSiblingChannels: \(roots, sourceRoot\) =>/);
  assert.match(renderer, /const CHANNEL_SOURCE_KEY = 'saturdayTube\.channelSource\.v1'/);
  assert.match(renderer, /discoverSiblingChannels\(channels\.map\(channel => channel\.root\), savedChannelSource\(\)\)/);
  assert.match(renderer, /async function loadChannels\(\)[\s\S]*?await discoverNewChannels\(\);/);
  assert.match(renderer, /async function rescanActiveChannel\([^\n]*\)[\s\S]*?await discoverNewChannels\(\)/);
});

test('channel setup lives in its own always-visible CHANNELS settings tab', () => {
  const html = read('index.html');
  const renderer = read('renderer.js');
  assert.match(html, /data-settings-tab="channels">CHANNELS</);
  assert.match(html, /id="tvSettingsChannels"/);
  assert.match(html, /id="chooseChannelSourceButton"[^>]*>SET CHANNEL SOURCE…</);
  assert.match(html, /id="addChannelButton"[^>]*>＋ ADD ONE CHANNEL</);
  assert.match(renderer, /querySelector\('#tvSettingsChannels'\)\.append\(document\.querySelector\('\.channel-management'\)\)/);
  assert.doesNotMatch(renderer, /channelsTab\.hidden|\[data-settings-tab="channels"\]'\)\.hidden/);
});

test('channels warm in channel order in the background and remain surfable while warming', () => {
  const renderer = read('renderer.js');
  assert.match(renderer, /async function loadChannels\(\)[\s\S]*?if \(isPlayableChannel\(channel\)\) \{ firstPlayable = channel; break; \}[\s\S]*?void warmChannelsInBackground\(\);\n\}/);
  assert.match(renderer, /function warmChannelsInBackground\(\) \{[\s\S]*?while \(\(next = channels\.find\(channel => !channel\.scanComplete\)\)\)/);
  const warmup = renderer.match(/function warmChannelsInBackground\(\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(warmup, /selectedInput === 'tv'[\s\S]*?while/, 'warm-up does not wait for TV input');
  assert.match(renderer, /function cycleActiveChannel\(direction\) \{[\s\S]*?channels\.filter\(channel => channel\.enabled !== false && !channel\.error\)/);
  assert.match(renderer, /function selectActiveChannel\(id\) \{\n  if \(!channelsStartupReady \|\| !channels\.some\(channel => channel\.id === id && channel\.enabled !== false && !channel\.error\)\) return;/);
});

test('surfing past warming channels never fans out parallel scans', () => {
  const renderer = read('renderer.js');
  const start = renderer.match(/function startActiveChannel\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(start, /if \(!channel\.scanning\) prioritizeActiveChannelScan\(\);/);
  assert.doesNotMatch(start, /void scanChannel\(/);
  assert.match(renderer, /function prioritizeActiveChannelScan\(\) \{\n[^\n]*\n  if \(channelPriorityScanPromise\) return;/);
  assert.match(renderer, /if \(!channel\.scanComplete\) void warmChannelsInBackground\(\);\n    else void ensureGuideSchedule\(channel\);/);
});

test('generated channel playlists are saved and reused until folders change or Refresh is pressed', () => {
  const main = read('main.cjs');
  const renderer = read('renderer.js');
  const scanner = main.match(/async function scanChannelRoot\(root, event, \{ force = false \} = \{\}\) \{[\s\S]*?\n\}/)[0];
  assert.match(main, /channel-catalog-cache\.json/);
  assert.match(scanner, /if \(!force && fingerprint && cached\?\.fingerprint === fingerprint\) \{\n\s*return finishChannelScan\(restoredChannelCatalog\(cached\.catalog\)/);
  assert.ok(scanner.indexOf('restoredChannelCatalog') < scanner.indexOf('scanChannelFolder('), 'cached playlists skip the folder walk and duration probes');
  assert.match(scanner, /catalogs\.set\(root, \{ version: CHANNEL_CATALOG_VERSION, fingerprint, scannedAt: Date\.now\(\), catalog: storeableChannelCatalog\(scanned\) \}\)/);
  assert.match(main, /function restoredChannelCatalog\(catalog\) \{[\s\S]*?registerMediaFile\(item\.path\)/);
  assert.match(main, /scanChannelRoot\(root, event, \{ force: options\?\.force === true \}\)/);
  const refresh = renderer.match(/async function rescanActiveChannel\([^\n]*\) \{[\s\S]*?\n\}/)[0];
  assert.match(refresh, /await scanChannel\(channel, \{ force: true \}\)/);
  assert.match(refresh, /for \(const other of channels\.filter[\s\S]*?await scanChannel\(other, \{ force: true \}\)/);
  assert.match(refresh, /unwrapChannelSchedule\(channel\);\n\s*await scanChannel\(channel, \{ force: true \}\)/, 'refresh rewraps the tuned channel');
  assert.match(refresh, /unwrapChannelSchedule\(other\);\n\s*await scanChannel\(other, \{ force: true \}\)/, 'and every other channel');
  const load = renderer.match(/async function loadChannels\(\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(load, /force: true/, 'startup never forces a rebuild');
});

test('rewrapping returns unaired episodes to their shows so nothing is skipped', () => {
  const renderer = read('renderer.js');
  const pick = name => renderer.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  const context = { window: {} };
  vm.runInNewContext(`${pick('broadcastElapsed')}\n${pick('locateChannelSegment')}\n${pick('unwrapChannelSchedule')}\nthis.unwrap = unwrapChannelSchedule;`, context);
  const seg = (showPath, file, durationSeconds, segmentType = 'program') => ({ showPath, path: `${showPath}/${file}`, durationSeconds, segmentType });
  const channel = {
    queue: [seg('/A', 'e1', 100), seg('/B', 'e4', 100), seg('/C', 'ad', 30, 'commercial'), seg('/B', 'e4', 50), seg('/A', 'e2', 100), seg('/B', 'e5', 100)],
    broadcast: { startedAtMs: Date.now(), initialOffsetSeconds: 150 },
    rotation: { round: 3, episodeOrderVersion: 'season-episode-v1', episodeBags: { '/A': ['/A/e3', '/A/e4'], '/B': ['/B/e6', '/B/e5'] }, lastShowPath: '/B' },
    savedPlaybackState: { queue: [] }, cursor: 4
  };
  context.unwrap(channel);
  assert.deepEqual(JSON.parse(JSON.stringify(channel.rotation.episodeBags)), {
    '/A': ['/A/e2', '/A/e3', '/A/e4'],
    '/B': ['/B/e4', '/B/e5', '/B/e6']
  }, 'the part-aired e4 and queued episodes go back first, in order, without duplicates; aired e1 stays aired');
  assert.equal(channel.rotation.round, 3);
  assert.equal(channel.rotation.lastShowPath, '/B');
  assert.deepEqual([channel.queue.length, channel.broadcast, channel.savedPlaybackState, channel.cursor], [0, null, null, 0]);
});

test('a channel folder moved into the source is rewired instead of duplicated', () => {
  const renderer = read('renderer.js');
  const pick = name => renderer.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  const store = { 'saturdayTube.channelSource.v1': '/Drive/TV-Channels' };
  const context = {
    CHANNEL_SOURCE_KEY: 'saturdayTube.channelSource.v1',
    localStorage: { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = value; } },
    makeChannelAbbreviation: () => 'CH', persistChannels() {}, renderChannels() {},
    activeChannelId: 'old-666',
    channels: [
      { id: 'old-666', name: '666', root: '/Drive/666', error: 'This folder is unavailable.' },
      { id: 'new-666', name: '666', root: '/Drive/TV-Channels/666' },
      { id: 'old-mtv', name: 'MTV', root: '/Drive/MTV', error: 'This folder is unavailable.', savedPlaybackState: { keep: true } }
    ]
  };
  vm.createContext(context);
  vm.runInContext([renderer.match(/const CHANNEL_ORDER_PREFIX = [^\n]+/)[0], ...['channelFolderName', 'channelFolderOrder', 'sortChannelsByDial', 'channelFolderKey',
    'remapChannelPaths', 'adoptRenamedChannelFolder', 'insideChannelSource', 'reconcileMovedChannels', 'appendDiscoveredChannels'].map(pick)].join('\n'), context);
  const added = vm.runInContext(`appendDiscoveredChannels([{ root: '/Drive/TV-Channels/MTV', name: 'MTV' }])`, context);
  const channels = vm.runInContext('channels', context);
  assert.deepEqual(channels.map(channel => channel.id).sort(), ['new-666', 'old-mtv']);
  assert.equal(vm.runInContext('activeChannelId', context), 'new-666');
  const mtv = channels.find(channel => channel.id === 'old-mtv');
  assert.equal(mtv.root, '/Drive/TV-Channels/MTV');
  assert.equal(mtv.error, '');
  assert.deepEqual(JSON.parse(JSON.stringify(mtv.savedPlaybackState)), { keep: true }, 'moved channel keeps its resume point');
  assert.equal(added[0], mtv);
});

test('numbered channel folders set the dial order and renamed folders keep their channel and resume point', async t => {
  const { channelDisplayName, channelOrderNumber, compareChannelFolders, isMovieOnlyChannel, resolveChannelCommercialsRoot } = require('../channels-service.cjs');
  assert.equal(channelDisplayName('/TV/4_ 666'), '666');
  assert.equal(channelDisplayName('/TV/10_Cartoon Network'), 'Cartoon Network');
  assert.equal(channelDisplayName('/TV/90s'), '90s', 'a name that merely starts with digits is kept');
  assert.equal(channelOrderNumber('/TV/12_MTV'), 12);
  assert.equal(isMovieOnlyChannel('/TV/12_HBO'), true);
  assert.equal(isMovieOnlyChannel('/TV/4_ 666'), true);
  assert.equal(isMovieOnlyChannel('/TV/11_HBO Kids'), false);
  const folders = ['10_Cartoon Network', '2_90s', '12_MTV', '12_HBO', 'Unnumbered', '4_ 666'].map(name => ({ root: `/TV/${name}`, name: channelDisplayName(name) }));
  assert.deepEqual(folders.sort(compareChannelFolders).map(item => item.name), ['90s', '666', 'Cartoon Network', 'HBO', 'MTV', 'Unnumbered']);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tube-dial-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '3_00s', 'Commercials'), { recursive: true });
  await fs.mkdir(path.join(root, '6_Comedy Central'), { recursive: true });
  assert.equal(await resolveChannelCommercialsRoot(path.join(root, '6_Comedy Central')), await fs.realpath(path.join(root, '3_00s', 'Commercials')),
    'Comedy Central still shares the numbered 00s ads');

  const renderer = read('renderer.js');
  const pick = name => renderer.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  const context = {
    CHANNEL_SOURCE_KEY: 'source', localStorage: { getItem: () => '/Drive/TV-Channels', setItem() {} },
    makeChannelAbbreviation: () => 'CH', persistChannels() {}, renderChannels() {}, activeChannelId: 'mtv',
    channels: [
      { id: 'mtv', name: 'MTV', root: '/Drive/TV-Channels/MTV', disabledShowPaths: ['/Drive/TV-Channels/MTV/Hidden'],
        playHistory: { '/Drive/TV-Channels/MTV/Show/e1.mp4': 3 }, rotation: {},
        savedPlaybackState: { elapsedSeconds: 42, queue: [{ path: '/Drive/TV-Channels/MTV/Show/e1.mp4' }, { path: '/Library/clips/ad.mp4' }] } },
      { id: 'disney', name: 'Disney', root: '/Drive/TV-Channels/9_Disney' }
    ]
  };
  vm.createContext(context);
  vm.runInContext([renderer.match(/const CHANNEL_ORDER_PREFIX = [^\n]+/)[0], ...['channelFolderName', 'channelFolderOrder', 'sortChannelsByDial', 'channelFolderKey',
    'remapChannelPaths', 'adoptRenamedChannelFolder', 'insideChannelSource', 'reconcileMovedChannels', 'appendDiscoveredChannels'].map(pick)].join('\n'), context);
  vm.runInContext(`appendDiscoveredChannels([{ root: '/Drive/TV-Channels/12_MTV', name: 'MTV', renamedFrom: '/Drive/TV-Channels/MTV' }])`, context);
  const channels = vm.runInContext('channels', context);
  assert.deepEqual(channels.map(channel => channel.id), ['disney', 'mtv'], 'one channel per folder, in dial order');
  const mtv = channels[1];
  assert.equal(mtv.root, '/Drive/TV-Channels/12_MTV');
  assert.equal(mtv.savedPlaybackState.elapsedSeconds, 42);
  assert.deepEqual(mtv.savedPlaybackState.queue.map(item => item.path), ['/Drive/TV-Channels/12_MTV/Show/e1.mp4', '/Library/clips/ad.mp4']);
  assert.deepEqual(mtv.disabledShowPaths, ['/Drive/TV-Channels/12_MTV/Hidden']);
  assert.deepEqual(Object.keys(mtv.playHistory), ['/Drive/TV-Channels/12_MTV/Show/e1.mp4']);

  const main = read('main.cjs');
  assert.match(main, /channelIdentity\(root\) === channelIdentity\(folder\.root\)\);/);
  assert.match(main, /if \(!existing && await commercialService\.relinkMovedSource\(sourcePath, stat\)\) \{/, 'moved ads are relinked, not re-split');
});

test('commercial reels are split into single ads and never air whole', () => {
  const { isCommercialReel, isChannelReadyClip, selectDirectChannelCommercialSources } = require('../channels-service.cjs');
  const reel = { path: '/CN/Commercials/046 - Ed Edd n Eddy Powerhouse Bumpers [x].mp4', durationSeconds: 116 };
  const longSpot = { path: '/CN/Commercials/121 - Cartoon Network Shorties - Miss Understanding.mp4', durationSeconds: 128 };
  const hourReel = { path: '/Disney/Commercials/Disney Channel (February 2003).mp4', durationSeconds: 2400 };
  const spot = { path: '/CN/Commercials/010 - Sick Day.mp4', durationSeconds: 30 };
  assert.equal(isCommercialReel(reel), true);
  assert.equal(isCommercialReel(hourReel), true);
  assert.equal(isCommercialReel(longSpot), false, 'a long single interstitial is not chopped up');
  assert.equal(isCommercialReel(spot), false);
  assert.deepEqual(selectDirectChannelCommercialSources([reel, hourReel, longSpot, spot]).map(item => item.path), [longSpot.path, spot.path]);
  assert.equal(isChannelReadyClip({ enabled: true, reviewed: false, needsReview: true, durationSeconds: 6 }), true, 'auto-split bumpers air without manual review');
  assert.equal(isChannelReadyClip({ enabled: true, reviewed: false, needsReview: true, durationSeconds: 116 }), false, 'an uncut chunk stays off air');
  assert.equal(isChannelReadyClip({ enabled: false, reviewed: true, durationSeconds: 30 }), false, 'user-disabled clips stay off air');

  const main = read('main.cjs');
  assert.match(main, /if \(!source \|\| \(isCommercialReel\(item\) && !\(Number\(source\.splitVersion\) >= COMMERCIAL_MIN_USABLE_SPLIT_VERSION\)\)\) continue;/, 'reels split by an older version keep airing until re-split');
  assert.match(main, /const COMMERCIAL_SPLIT_VERSION = 2;/);
  assert.match(main, /\? await commercialService\.importCompilation\(sourcePath, \(\) => \{\}, \{ resplit: true, splitVersion: COMMERCIAL_SPLIT_VERSION \}\)/);
  assert.match(main, /if \(!result\?\.duplicate\) changed = true;/, 'duplicate files do not trigger a rescan every launch');
  assert.match(main, /channelCommercialImportChain = job;/);
  assert.match(main, /webContents\.send\('channel-commercials-updated', key\)/);
  assert.match(read('renderer.js'), /window\.tube\.onChannelCommercialsUpdated\(commercialsRoot => \{[\s\S]*?void scanChannel\(channel\);/);
});

test('a reel once stored whole is re-split and its whole-file clip retired', async t => {
  const { CommercialsService } = require('../commercials-service.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tube-resplit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'reel.mp4');
  await fs.writeFile(source, Buffer.alloc(70 * 1024, 1));
  const old = Date.now() / 1000 - 600;
  await fs.utimes(source, old, old);
  const service = new CommercialsService(path.join(root, 'library'), { stabilityMs: 0 });
  await service.ready();
  const sha256 = await service.hashFile(source);
  const storedFile = 'sources/whole-reel.mp4';
  await fs.mkdir(path.join(root, 'library', 'sources'), { recursive: true });
  await fs.copyFile(source, path.join(root, 'library', storedFile));
  service.database.sources.push({ id: 'whole', file: storedFile, sha256, status: 'complete', originalPath: source, clipCount: 1, durationSeconds: 30 });
  service.database.clips.push({ id: 'whole-clip', sourceId: 'whole', ordinal: 1, file: storedFile, sourceStart: 0, sourceEnd: 30, durationSeconds: 30, reviewed: true, enabled: true });
  const fakeFFmpeg = path.join(root, 'ffmpeg');
  await fs.writeFile(fakeFFmpeg, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  service.getFFmpegCapabilities = async () => ({ executable: fakeFFmpeg, videoEncoder: [] });
  service.probeDuration = async () => 30;
  service.detectBlackIntervals = async () => [{ start: 9.9, end: 10.1, duration: 0.2 }, { start: 19.9, end: 20.1, duration: 0.2 }];
  service.encodeClip = async (_source, _start, _end, output) => { await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, 'clip'); return 4; };
  const skipped = await service.importCompilation(source);
  assert.equal(skipped.duplicate, true, 'plain imports still treat the stored source as a duplicate');
  const result = await service.importCompilation(source, () => {}, { resplit: true, splitVersion: 1 });
  assert.equal(result.duplicate, false);
  assert.equal(result.clipCount, 3);
  const clips = service.database.clips.filter(clip => clip.sourceId === 'whole');
  assert.equal(clips.length, 3);
  assert.ok(!clips.some(clip => clip.id === 'whole-clip'), 'whole-file clip retired');
  await fs.access(path.join(root, 'library', storedFile));
  assert.equal((await service.listChannelSources())[0].splitVersion, 1);
  assert.equal((await service.importCompilation(source, () => {}, { resplit: true, splitVersion: 1 })).duplicate, true, 'a finished split is not repeated');
});

test('queues saved before a channel had ads get rotated breaks after each upcoming segment', () => {
  const { fillMissingCommercialBreaks, programSegmentsMissingBreaks } = require('../channels-service.cjs');
  const upcoming = [
    { path: '/Disney/movie.mkv', segmentType: 'program', durationSeconds: 800 },
    { path: '/Disney/movie.mkv', segmentType: 'program', durationSeconds: 800 },
    { path: '/ads/a.mp4', segmentType: 'commercial', durationSeconds: 30 },
    { path: '/Disney/next.mkv', segmentType: 'program', durationSeconds: 700 }
  ];
  assert.deepEqual(programSegmentsMissingBreaks(upcoming), [0, 3]);
  const ads = Array.from({ length: 30 }, (_, index) => ({ path: `/ads/${index}.mp4`, durationSeconds: 15 }));
  const filled = fillMissingCommercialBreaks(upcoming, ads, {}, () => 0.42);
  assert.deepEqual(filled.breaks.map(entry => entry.afterIndex), [0, 3]);
  const aired = filled.breaks.flatMap(entry => entry.segments.map(segment => segment.path));
  assert.equal(new Set(aired).size, aired.length, 'no ad repeats across backfilled breaks');
  assert.ok(filled.breaks[0].segments.reduce((sum, segment) => sum + segment.durationSeconds, 0) >= 800 * 11 / 49);
  assert.deepEqual(fillMissingCommercialBreaks(upcoming, [], {}).breaks, []);

  const renderer = read('renderer.js');
  assert.match(renderer, /await appendBroadcastCoverage\(channel, restored\.elapsedSeconds \|\| 0\);\n        \}\n        await fillChannelCommercialBreaks\(channel\);/);
  assert.match(renderer, /const startIndex = position \? position\.index : 0;/);
  assert.match(renderer, /channel\.queue\.splice\(startIndex, scheduled\.length, \.\.\.rebuilt\);/);
  assert.match(renderer, /scheduled\.slice\(keepCount\)\.filter\(entry => entry\.segmentType !== 'commercial'\)/, 'stale future breaks are re-dealt');
  assert.match(renderer, /mergedDurations\.set\(previous, durationOf\(previous\) \+ \(Number\(item\.durationSeconds\) \|\| 0\)\);/, 'split halves of short programmes are rejoined');
  assert.match(renderer, /item\.durationSeconds = durationSeconds;\n    delete item\.endCutKind;\n  \}\n  channel\.queue\.splice\(startIndex/, 'merges commit only with the rebuilt queue');
});
