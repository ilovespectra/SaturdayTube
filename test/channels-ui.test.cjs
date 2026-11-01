const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const main = readFileSync(path.join(root, 'main.cjs'), 'utf8');
const preload = readFileSync(path.join(root, 'preload.cjs'), 'utf8');
const renderer = readFileSync(path.join(root, 'renderer.js'), 'utf8');
const commercials = readFileSync(path.join(root, 'commercial-mode.js'), 'utf8');
const styles = readFileSync(path.join(root, 'styles.css'), 'utf8');

test('TV channel tools are integrated and input changes apply without a transition timer', () => {
  assert.match(html, /class="channel-surf-control"[\s\S]*id="addChannelButton"[\s\S]*id="rescanChannelButton"/);
  assert.doesNotMatch(html, /id="channelSelect"|<select[^>]*aria-label="Select TV channel"/);
  assert.doesNotMatch(html, /class="channel-panel"|TV CHANNELS/);
  assert.match(html, /aria-label="Cycle input: video, static, TV"/);
  assert.match(renderer, /\{ video: 'static', static: 'tv', tv: 'video' \}/);
  assert.match(renderer, /applyInput\(\);/);
  assert.doesNotMatch(renderer, /setTimeout\(applyInput, 340\)|inputTransitionTimer/);
  assert.match(renderer, /function activeChannel\(\)/);
  assert.match(renderer, /function loadChannels\(\)/);
  const load = renderer.match(/async function loadChannels\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(load, /const startupOrder = \[activeChannel\(\)/);
  assert.match(load, /for \(const channel of startupOrder\) await scanChannel\(channel\)/);
  assert.match(load, /channelsStartupReady = channels\.every\(channel => channel\.scanComplete\)/);
  assert.doesNotMatch(load, /break;/);
  assert.match(renderer, /if \(!channelsStartupReady\) \{\s*setTVSearching\(true\);\s*setStatus\('PREPARING TV CHANNELS'\)/);
  assert.doesNotMatch(renderer, /Promise\.all\(channels\.map\(async channel => \{[\s\S]*?scanChannel\(channel\)/);
});

test('Channel and volume use matched recessed cabinet pushbuttons', () => {
  const channelControls = html.match(/<section class="channel-surf-control"[\s\S]*?<\/section>/)?.[0] || '';
  const volumeControls = html.match(/<section class="volume-rocker-control"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(channelControls, /CH−[\s\S]*CH\+/);
  assert.match(volumeControls, /VOL−[\s\S]*VOL\+/);
  assert.doesNotMatch(channelControls, /←|→|PREVIOUS|NEXT/);
  assert.doesNotMatch(volumeControls, /←|→|DOWN|UP/);
  assert.match(html, /class="channel-surf-buttons rocker-buttons"/);
  assert.match(html, /class="volume-rocker-buttons rocker-buttons"/);
  assert.match(html, /class="channel-surf-control"[\s\S]*id="addChannelButton"[\s\S]*id="rescanChannelButton"/);
  assert.doesNotMatch(renderer, /channelSelect/);
  assert.match(renderer, /function cycleActiveChannel\(direction\) \{[\s\S]*?if \(!channelsStartupReady\) return;[\s\S]*?const available = channels\.filter\(channel => channel\.enabled !== false && channel\.scanComplete && !channel\.error\)/);
  assert.match(renderer, /selectActiveChannel\(nextChannelId\);\s*setInputSource\('tv'\)/);
  assert.match(renderer, /channelDownButton\.addEventListener\('click', \(\) => cycleActiveChannel\(-1\)\)/);
  assert.match(renderer, /channelUpButton\.addEventListener\('click', \(\) => cycleActiveChannel\(1\)\)/);
  assert.match(renderer, /volumeDownButton'\)\.addEventListener\('click', \(\) => adjustMasterVolume\(-1\)\)/);
  assert.match(renderer, /volumeUpButton'\)\.addEventListener\('click', \(\) => adjustMasterVolume\(1\)\)/);
  assert.match(styles, /\.channel-surf-control \{[\s\S]*border:0;[\s\S]*background:transparent/);
  assert.match(styles, /\.rocker-buttons \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\); gap:5px; \}/);
  assert.match(styles, /\.rocker-buttons button \{[\s\S]*min-height:24px;[\s\S]*border-radius:3px;/);
  assert.match(styles, /\.rocker-buttons button::before \{[\s\S]*position:absolute; inset:2px/);
  assert.match(styles, /\.rocker-buttons button:active:not\(:disabled\)::before/);
});

test('Guide and compact Input are pinned to the sidebar bottom on desktop', () => {
  assert.match(styles, /@media \(min-width: ?761px\) \{\s*\.simple-tv-controls \{ margin-top:auto; align-self:stretch; \}\s*\.control-panel > \.input-source-control \{ align-self:center; \}\s*\}/);
});

test('station folders add as channels with saved abbreviations and friendly recovery', () => {
  const restore = main.match(/async function restoreChannelFolder\(event, requestedRoot\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(restore, /realpath\(requestedRoot\)\.catch\(\(\) => null\)/);
  assert.match(restore, /This TV channel folder is unavailable/);
  const choose = main.match(/async function chooseChannelFolder\(event\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(choose, /return await scanChannelRoot\(root, event\)/);
  assert.match(choose, /commercialsRoot,[\s\S]*scanError: true/);
  const add = renderer.match(/async function addChannelFolder\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(add, /commercialsRoot: scanned\.commercialsRoot/);
  assert.match(add, /abbreviation: makeChannelAbbreviation\(scanned\.name/);
  assert.match(add, /channels\.push\(channel\)/);
  assert.match(add, /persistChannels\(\)/);
  assert.match(renderer, /abbreviation: channel\.abbreviation \|\| makeChannelAbbreviation\(channel\.name, channel\.root\)/);
  const scan = renderer.match(/async function scanChannel\(channel\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(scan, /channel\.error = userFacingChannelError\(error\)/);
  assert.doesNotMatch(scan, /channel\.error = error\.message/);
  const abbreviation = renderer.match(/function makeChannelAbbreviation\(name, root = ''\) \{[\s\S]*?\n\}/)?.[0] || '';
  const makeAbbreviation = vm.runInNewContext(`${abbreviation}; makeChannelAbbreviation`);
  assert.equal(makeAbbreviation('Cartoon Network', '/TV/Cartoon Network'), 'CN');
  assert.equal(makeAbbreviation('Nickelodeon', '/TV/Nickelodeon'), 'NICK');
});

test('channel and volume rockers share a row and Input matches their molded style', () => {
  assert.match(styles, /\.primary-dials \{\s*display:grid; grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(styles, /\.primary-dials \.channel-surf-control \{ grid-column:1;/);
  assert.match(styles, /\.primary-dials \.volume-rocker-control \{ grid-column:2;/);
  assert.match(styles, /#inputButton \{[\s\S]*min-height:31px;[\s\S]*linear-gradient\(180deg,#666a6b/);
  assert.match(styles, /#inputButton\[aria-pressed="true"\]/);
  assert.match(html, /id="inputButton"/);
});

test('rapid channel changes tune latest-first while prewarming stays bounded and off the decoder', () => {
  const selector = renderer.match(/function selectActiveChannel\(id\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(selector, /channelTuneToken \+= 1;[\s\S]*activeChannelId = id/);
  assert.doesNotMatch(selector, /await/);
  const sync = renderer.match(/function syncActiveBroadcast\(forceTune = false, expectedTuneToken = channelTuneToken\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(sync.indexOf('locateChannelSegment(channel, elapsed)') < sync.indexOf('playTrack(position.index'));
  assert.match(sync, /expectedTuneToken !== channelTuneToken/);
  const prewarm = renderer.match(/function prewarmAdjacentChannels\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(prewarm, /neighbors\.length < MAX_ADJACENT_CHANNELS_TO_PREWARM/);
  assert.match(prewarm, /channelPrewarmPromise/);
  assert.match(prewarm, /await prewarmChannelPlayback\(channel, request\.token\)/);
  assert.doesNotMatch(prewarm, /video\.(?:src|load|play)|playTrack\(/);
  assert.match(renderer, /function needsChannelTranscode\(track\)/);
  assert.match(renderer, /async function prewarmChannelPlayback\(channel, requestToken\)/);
  assert.match(renderer, /window\.tube\.transcodeMedia\(program\.id\)/);
  assert.match(renderer, /MAX_ADJACENT_CHANNELS_TO_PREWARM = 2/);
});

test('channel scans, schedule recovery, and episode rounds stay behind the sandboxed IPC bridge', () => {
  for (const method of ['chooseChannelFolder', 'discoverSiblingChannels', 'restoreChannelFolder', 'rescanChannelFolder', 'buildChannelRound', 'reconcileChannelPlayback']) {
    assert.match(preload, new RegExp(`${method}:`));
  }
  assert.match(renderer, /window\.tube\.discoverSiblingChannels\(channels\.map\(channel => channel\.root\)\)/);
  assert.match(main, /function discoverSiblingChannels\(_event, savedRoots\)/);
  for (const handler of ['choose-channel-folder', 'discover-sibling-channels', 'restore-channel-folder', 'rescan-channel-folder', 'build-channel-round']) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\(['"]${handler}['"]`));
  }
  assert.match(renderer, /const restoredRoot = await window\.tube\.restoreChannelFolder\(channel\.root\);\s*const scanned = await window\.tube\.rescanChannelFolder\(restoredRoot\)/);
  assert.match(renderer, /window\.tube\.buildChannelRound\([\s\S]*?remainingSeconds/);
  assert.match(renderer, /lastCommercialPath/);
  assert.match(renderer, /saturdayTube\.channels\.v1/);
  assert.match(main, /ipcMain\.handle\(['"]reconcile-channel-playback['"]/);
  assert.match(renderer, /playbackState: channelPlaybackSnapshot\(channel, now\)/);
  assert.match(renderer, /window\.tube\.reconcileChannelPlayback\(/);
  assert.match(renderer, /window\.addEventListener\('beforeunload',[\s\S]*?saveChannelPlaybackState\(\)/);
  assert.match(renderer, /CHANNEL_PLAYBACK_SAVE_INTERVAL_MS = 5000/);
  assert.match(renderer, /playHistory: Object\.fromEntries\(history\)/);
});

test('TV commercials come only from the selected eligible channel and retain short-episode breaks', () => {
  assert.match(renderer, /function activeChannelCommercials\(\) \{ return selectedInput === 'tv' \? \(activeChannel\(\)\?\.movieOnly \? \[\] : \(activeChannel\(\)\?\.commercials \|\| \[\]\)\) : null; \}/);
  assert.match(commercials, /if \(selectedInput === 'tv'\) \{\s*return \(activeChannelCommercials\(\) \|\| \[\]\)/);
  assert.match(commercials, /const MIN_MIDROLL_SECONDS = 15 \* 60/);
  assert.match(commercials, /startBoundaryBreak\(nextIndex\)/);
  assert.match(commercials, /AD_SECONDS_PER_PROGRAM_SECOND = 11 \/ 49/);
  assert.match(commercials, /selectedInput === 'static' \|\| selectedInput === 'tv'\) return/);
});

test('virtual broadcasts start at episode one and catch up through program and ad segments', () => {
  assert.match(renderer, /channel\.broadcast\.initialOffsetSeconds = 0/);
  assert.match(renderer, /function broadcastElapsed\(channel, now = Date\.now\(\)\)/);
  assert.match(renderer, /let position = locateChannelSegment\(channel, elapsed\)/);
  assert.match(renderer, /if \(tuneToken === channelTuneToken && selectedInput === 'tv' && activeChannelId === channel\.id\) startActiveChannel\(\)/);
  assert.match(renderer, /window\.setInterval\(\(\) => \{\s*if \(selectedInput === 'tv'\) void syncActiveBroadcast\(false\);/);
  assert.match(renderer, /const startupOrder = \[activeChannel\(\), \.\.\.channels\.filter/);
});

test('channel surfing preserves independent broadcasts and wall-clock time away', () => {
  const elapsed = renderer.match(/function broadcastElapsed\(channel, now = Date\.now\(\)\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(elapsed, /now - broadcast\.startedAtMs/);
  const selector = renderer.match(/function selectActiveChannel\(id\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(selector, /activeChannelId = id/);
  assert.match(selector, /void startActiveChannel\(\)/);
  assert.doesNotMatch(selector, /broadcast\s*=\s*null|initializeChannelBroadcast/);
  const sync = renderer.match(/function syncActiveBroadcast\(forceTune = false, expectedTuneToken = channelTuneToken\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(sync, /appendBroadcastCoverage\(channel, elapsed\)/);
  assert.doesNotMatch(sync, /await appendBroadcastCoverage/);
  assert.match(sync, /locateChannelSegment\(channel, elapsed\)/);
  assert.match(sync, /expectedTuneToken !== channelTuneToken/);
  assert.match(renderer, /MAX_ADJACENT_CHANNELS_TO_PREWARM = 2/);
  assert.match(renderer, /function prewarmAdjacentChannels\(\)/);
});

test('channel playback is not held behind first-time commercial imports', () => {
  const scanner = main.match(/async function scanChannelRoot\(root, event\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(scanner, 'channel scan handler exists');
  assert.match(scanner, /await restoreChannelDurationCache\(\)/);
  assert.match(scanner, /await persistChannelDurationCache\(\)/);
  assert.match(scanner, /probeCommercials: true/);
  assert.match(scanner, /const ready = await getReadyChannelCommercials\(originalAds\)/);
  assert.match(scanner, /selectDirectChannelCommercialSources\(originalAds, ready\.readySourcePaths\)/);
  assert.match(scanner, /scheduleChannelCommercialImports\(scanned\.commercialsRoot, originalAds\)/);
  assert.doesNotMatch(scanner, /await importChannelCommercialSources/);
  assert.match(main, /channel-duration-cache\.json/);
  assert.match(main, /commercialService\.listChannelSources\(\)/);
  assert.match(main, /if \(!clip\.enabled \|\| !clip\.reviewed \|\| clip\.needsReview\)/);
});

test('TV Settings is a compact two-page blue OSD with horizontal effect bars', () => {
  assert.match(html, /id="tvSettingsButton"[^>]*class="tv-settings-button"/);
  assert.match(html, /class="[^"]*tv-settings-osd"/);
  assert.match(html, /id="tvSettingsAudio"/);
  assert.match(html, /id="tvSettingsVideo"/);
  assert.equal((html.match(/data-settings-tab=/g) || []).length, 2);
  assert.doesNotMatch(html, /id="tvSettings(Picture|Cabinet|Display)"/);
  assert.match(html, /class="audio-control-group"/);
  assert.match(html, /id="soundEffectsVolume"/);
  assert.match(renderer, /const videoPane = document\.querySelector\('#tvSettingsVideo'\)/);
  assert.match(renderer, /for \(const id of \['scanlines', 'curve'\]\)[\s\S]*videoPane\.append\(control\)/);
  assert.match(renderer, /const volumeControl = document\.querySelector\('#volume'\)\?\.closest\('\.dial-control'\);\s*if \(volumeControl\) audioPane\.append\(volumeControl\)/);
  assert.match(renderer, /audioPane\.append\(document\.querySelector\('\.audio-control-group'\)\)/);
  assert.match(renderer, /videoPane\.append\([\s\S]*?\.finish-panel[\s\S]*?\.signal-settings[\s\S]*?\.view-section/);
  assert.match(renderer, /selectSettingsTab\('video'\)/);
  assert.match(renderer, /selectSettingsTab\('audio'\); showScreenDialog\(tvSettingsDialog\)/);
  assert.match(renderer, /dialog === tvSettingsDialog[\s\S]*?stageRect\.width \* 0\.52/);
  assert.match(renderer, /dial\.classList\.add\('dial-bar'\)/);
  assert.match(styles, /\.tv-settings-osd \.settings-pane \.dial\.dial-bar::before/);
  assert.match(styles, /\.tv-settings-osd \.settings-pane \.dial\.dial-bar::after/);
  assert.match(styles, /\.tv-settings-osd #volume\.dial\.dial-bar \{ width:100%; height:13px/);
  assert.match(styles, /linear-gradient\(145deg,#1748d9/);
});

test('movie channels stay feature-only and Comedy Central reuses 00s ad sources', () => {
  assert.match(main, /const originalAds = scanned\.movieOnly \? \[\] : \(scanned\.commercials \|\| \[\]\)/);
  assert.match(main, /if \(!scanned\.movieOnly\) scheduleChannelCommercialImports\(scanned\.commercialsRoot, originalAds\)/);
  assert.match(main, /const movieOnly = isMovieOnlyChannel\(root\)/);
  assert.match(main, /const commercialsRoot = movieOnly \? null : await resolveChannelCommercialsRoot\(root\)/);
  assert.match(main, /if \(!\(await isChannelFolder\(candidate\)\)\) continue/);
  assert.match(main, /isChannelFolder, discoverAdjacent666Channel, resolveChannelCommercialsRoot/);
  assert.match(main, /const adjacent666 = await discoverAdjacent666Channel\(parent\)/);
  assert.match(main, /!sourcePath \|\| !insideRoot\(commercialsRoot, sourcePath\)/);
  assert.match(main, /durationSeconds > 180/);
  assert.match(main, /!insideRoot\(commercialsRoot, actualPath\)/);
  assert.match(renderer, /channel\.movieOnly = scanned\.movieOnly === true/);
  assert.match(renderer, /MOVIES ONLY · NO COMMERCIALS OR TRAILERS/);
  assert.match(renderer, /if \(!track\.channelMedia && !trackOverride && !moviePrerollMoviePath\)/);
  assert.match(styles, /grid-column:1 \/ -1; display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.control-panel > \.input-source-control button \{ min-width:35px; min-height:18px/);
});

test('legacy TV formats use a complete FFmpeg fallback and failed decodes exit SEARCHING', () => {
  assert.match(main, /function systemFFmpegExecutable\(\)/);
  assert.match(main, /\/opt\/homebrew\/bin/);
  assert.match(main, /function transcodeExecutableCandidates\(\)/);
  assert.match(main, /app\.isPackaged \? \[bundled, system\] : \[system, bundled\]/);
  assert.match(main, /for \(const executable of executables\)/);
  assert.match(renderer, /const stopSearchingAfterFailure = \(\) => \{ if \(selectedInput === 'tv'\) setTVSearching\(false\); \}/);
  assert.match(renderer, /stopSearchingAfterFailure\(\);[\s\S]*TAPE ERROR/);
  const selector = renderer.match(/function selectActiveChannel\(id\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(selector, /activeChannelId = id;[\s\S]*?recordChannelTuneMetric\('click'\);[\s\S]*?persistChannels\(\);\s*renderChannels\(\);/);
});

test('stalled channel playback records bounded runtime diagnostics without retuning', () => {
  const diagnostic = renderer.match(/function scheduleChannelPlaybackDiagnostic\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(diagnostic, /if \(!isCurrentChannelPlayback\(\)\) return/);
  assert.match(diagnostic, /generation !== playbackGeneration \|\| tuneToken !== channelTuneToken/);
  assert.match(diagnostic, /readyState: video\.readyState[\s\S]*?networkState: video\.networkState[\s\S]*?errorCode: video\.error\?\.code/);
  assert.match(diagnostic, /\}, 5000\)/);
  const metricHandler = main.match(/ipcMain\.on\('channel-tune-metric',[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.match(metricHandler, /'play-stalled'/);
  assert.match(metricHandler, /boundedInteger\(metric\.readyState, 4\)/);
  assert.match(metricHandler, /boundedInteger\(metric\.networkState, 3\)/);
  assert.match(metricHandler, /boundedInteger\(metric\.errorCode, 4\)/);
  assert.match(metricHandler, /boundedSeconds\(metric\.currentTime\)/);
  assert.match(metricHandler, /boundedSeconds\(metric\.duration\)/);
});

test('brief TV buffering does not flash the searching indicator', () => {
  const functionText = renderer.match(/function setTVSearching\([^\n]*\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(functionText);
  assert.match(renderer, /const TV_SEARCHING_GRACE_MS = 900/);
  assert.match(functionText, /window\.clearTimeout\(tvSearchingTimer\)/);
  assert.match(renderer, /video\.addEventListener\('waiting', \(\) => \{[\s\S]*?setTVSearching\(true, TV_SEARCHING_GRACE_MS\)/);
  let timerId = 0;
  const timers = new Map();
  let cleared = false;
  const indicator = { hidden: true };
  const classes = { toggle() {} };
  const context = {
    tvSearching: false,
    tvSearchingTimer: null,
    selectedInput: 'tv',
    startupIntroActive: false,
    window: {
      setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
      clearTimeout(id) { cleared = timers.delete(id); }
    },
    document: { querySelector: selector => selector === '#searchingIndicator' ? indicator : null },
    stage: { classList: classes }
  };
  const setSearching = vm.runInNewContext(`${functionText}; setTVSearching`, context);
  setSearching(true, 900);
  assert.equal(indicator.hidden, true, 'the overlay stays hidden during the grace window');
  assert.equal(timers.get(timerId).delay, 900);
  setSearching(false);
  assert.equal(cleared, true, 'successful playback cancels a pending flash');
  assert.equal(indicator.hidden, true);
  setSearching(true, 900);
  timers.get(timerId).callback();
  assert.equal(indicator.hidden, false, 'a sustained stall still displays SEARCHING');
});

test('channel switching isolates lineup media and rejects stale playback events', () => {
  const extract = name => {
    const match = renderer.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(match, `${name} exists`);
    return match[0];
  };
  const ownsTrack = vm.runInNewContext(`${extract('channelOwnsPlaybackTrack')}; channelOwnsPlaybackTrack`);
  const nickelodeon = {
    movieOnly: false,
    shows: [{ path: '/TV-Channels/Nickelodeon/Bluey', enabled: true, episodes: [{ path: '/TV-Channels/Nickelodeon/Bluey/Bluey S01E01.mp4' }] }],
    commercials: [{ path: '/TV-Channels/Nickelodeon/Commercials/approved.mp4' }]
  };
  assert.equal(ownsTrack(nickelodeon, { channelMedia: true, path: '/TV-Channels/Nickelodeon/Bluey/Bluey S01E01.mp4' }), true);
  assert.equal(ownsTrack(nickelodeon, { channelMedia: true, path: '/TV-Channels/HBO/Movie/feature.mp4' }), false);
  assert.equal(ownsTrack(nickelodeon, { channelMedia: true, channelAd: true, path: '/TV-Channels/Nickelodeon/Commercials/approved.mp4' }), true);
  assert.equal(ownsTrack(nickelodeon, { channelMedia: true, channelAd: true, path: '/TV-Channels/HBO/Commercials/ad.mp4' }), false);
  assert.match(renderer, /function selectActiveChannel\(id\) \{[\s\S]*?if \(changed\) clearChannelVideoForInputChange\(\);[\s\S]*?setTVSearching\(true\)/);
  assert.match(renderer, /video\.addEventListener\('playing', \(\) => \{[\s\S]*?if \(isCurrentChannelPlayback\(\)\) \{\s*setTVSearching\(false\);/);
  assert.match(renderer, /video\.addEventListener\('waiting', \(\) => \{[\s\S]*?if \(isCurrentChannelPlayback\(\)\) setTVSearching\(true, TV_SEARCHING_GRACE_MS\);/);
  const context = { activePlaybackGeneration: 7, playbackGeneration: 7, activePlaybackUrl: 'saturday://nick/episode.mp4', source: 'saturday://nick/episode.mp4' };
  context.video = { getAttribute: () => context.source };
  const currentEvent = vm.runInNewContext(`${extract('isCurrentPlaybackEvent')}; isCurrentPlaybackEvent`, context);
  assert.equal(currentEvent(), true);
  context.playbackGeneration += 1;
  assert.equal(currentEvent(), false, 'a tune invalidates callbacks from the previous station');
  context.playbackGeneration = 8;
  context.activePlaybackGeneration = 8;
  context.source = 'saturday://hbo/feature.mp4';
  assert.equal(currentEvent(), false, 'a late event from the prior source is ignored');
});

test('surfing shows the requested corner abbreviations briefly', () => {
  assert.match(html, /id="channelSurfOverlay" class="channel-surf-overlay" hidden/);
  assert.match(renderer, /function channelSurfAbbreviation\(channel\)/);
  for (const label of ['CMDY', 'HBO', '00s', '90s', 'NICK', '666']) assert.ok(renderer.includes(`return '${label}'`), `${label} abbreviation is mapped`);
  assert.match(renderer, /showChannelSurfOverlay\(activeChannel\(\)\)/);
  assert.match(renderer, /\}, 1900\)/);
});

test('TV Guide logo, grouped RCA audio, and Settings gear are distinct controls', () => {
  assert.match(html, /class="tv-guide-logo"[\s\S]*>GUIDE</);
  assert.match(html, /id="audioRcaButton"[^>]*aria-label="Open audio settings"[\s\S]*class="rca-jacks"[\s\S]*rca-left-audio[\s\S]*rca-right-audio[\s\S]*<small>AUDIO<\/small>/);
  assert.match(html, /id="tvSettingsButton"[^>]*class="tv-settings-button"[\s\S]*class="settings-gear"[\s\S]*<svg/);
  assert.match(renderer, /document\.querySelector\('#audioRcaButton'\)\.addEventListener\('click', \(\) => \{ selectSettingsTab\('audio'\); showScreenDialog\(tvSettingsDialog\); \}\)/);
  assert.match(renderer, /document\.querySelector\('#tvGuideButton'\)\.addEventListener\('click', openTVGuide\)/);
  assert.match(styles, /\.rca-video|\.rca-socket/);
  assert.match(styles, /\.settings-gear svg/);
  assert.match(styles, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\); align-items:stretch; gap:clamp\(8px/);
});

test('TV Guide lists episodes only while commercial durations still shift show times', () => {
  assert.match(renderer, /const position = channel\.enabled !== false && !channel\.error \? locateChannelSegment\(channel, elapsed\) : null/);
  assert.match(renderer, /const segment = channel\.queue\[index\]/);
  assert.match(renderer, /const segmentStartSeconds = startSeconds;\s*startSeconds \+= Number\(segment\.durationSeconds\) \|\| 0;\s*if \(segment\.segmentType !== 'program'\) continue;/);
  assert.match(renderer, /const waitSeconds = Math\.max\(0, segmentStartSeconds - elapsed\)/);
  assert.doesNotMatch(renderer, /COMMERCIAL BREAK|is-commercial|Advertisement/);
  assert.doesNotMatch(renderer, /channelMeta\.textContent = `[^`]*ADS/);
  assert.match(renderer, /await appendBroadcastCoverage\(channel, elapsed \+ GUIDE_WINDOW_SECONDS\)/);
  assert.match(renderer, /guideRefreshTimer = window\.setInterval\([\s\S]*?5000\)/);
  assert.match(renderer, /channel\.guideSchedulePromise/);
  assert.doesNotMatch(renderer, /guide-hour-divider|const duration = document\.createElement\('small'\)/);
  assert.match(renderer, /row\.append\(when, kind, title\)/);
  assert.match(renderer, /toLocaleDateString\(\[\], \{ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' \}\)/);
  assert.match(styles, /\.guide-open-spread \{[\s\S]*grid-template-columns:minmax\(0,\.96fr\) minmax\(0,1\.04fr\)/);
  assert.match(styles, /\.guide-show-list \{[\s\S]*overflow:visible/);
  assert.doesNotMatch(styles, /\.guide-show-list \{[^}]*overflow-y:auto|\.guide-show-list \{ max-height:82px/);
  assert.match(styles, /\.guide-broadcast-list \{[\s\S]*max-height:none;[\s\S]*overflow-y:auto/);
});
