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
  assert.match(html, /aria-label="Cycle input: video, static, TV, AUX"/);
  assert.match(renderer, /\{ video: 'static', static: 'tv', tv: 'aux', aux: 'video' \}/);
  assert.match(renderer, /applyInput\(\);/);
  assert.doesNotMatch(renderer, /setTimeout\(applyInput, 340\)|inputTransitionTimer/);
  assert.match(renderer, /function activeChannel\(\)/);
  assert.match(renderer, /function loadChannels\(\)/);
  const load = renderer.match(/async function loadChannels\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(load, /const startupOrder = \[activeChannel\(\)/);
  assert.match(load, /for \(const channel of startupOrder\) \{[\s\S]*?await scanChannel\(channel\);[\s\S]*?break; \}/);
  assert.match(load, /channelsStartupReady = true;/);
  assert.match(load, /void warmChannelsInBackground\(\);/);
  assert.match(renderer, /if \(!channelsStartupReady\) \{\s*setTVSearching\(true\);\s*setStatus\('PREPARING TV CHANNELS'\)/);
  assert.doesNotMatch(renderer, /Promise\.all\(channels\.map\(async channel => \{[\s\S]*?scanChannel\(channel\)/);
});

test('Settings has a distinct, non-interrupting shuffle action for all channel lineups', () => {
  const tools = html.match(/<div class="channel-tools">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(tools, /id="rescanChannelButton"[^>]*>↻ REFRESH/);
  assert.match(tools, /id="channelShuffleButton"[^>]*>⤨ SHUFFLE LINEUPS/);
  assert.match(html, /id="channelShuffleStatus"[^>]*role="status"/);
  assert.match(renderer, /channelShuffleButton\.addEventListener\('click', \(\) => \{ void shuffleAllChannels\(\); \}\)/);
  const shuffle = renderer.match(/async function shuffleAllChannels\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(shuffle, /shuffleChannelScheduleTail/);
  assert.match(shuffle, /channelProgramGroupEnd/);
  assert.doesNotMatch(shuffle, /clearChannelVideoForInputChange|resetChannelShuffle|startActiveChannel|channelTuneToken/,
    'shuffling never resets the active video or starts a fresh broadcast');
  assert.match(renderer, /function updateGuideShuffleControls\(\) \{[\s\S]*?channelShuffleButton\.disabled = unavailable/);
});

test('shuffle preserves the on-air episode, randomizes series, and keeps each series ordered', () => {
  const groupEnd = renderer.match(/function channelProgramGroupEnd\(queue, currentIndex\) \{[\s\S]*?\n\}/)?.[0] || '';
  const numbered = renderer.match(/function channelEpisodeIsNumbered\(item\) \{[\s\S]*?\n\}/)?.[0] || '';
  const shuffleItems = renderer.match(/function shuffleChannelItems\(items, random = Math\.random\) \{[\s\S]*?\n\}/)?.[0] || '';
  const poolCycles = renderer.match(/function shuffleChannelPoolCycles\(groups, random = Math\.random\) \{[\s\S]*?\n\}/)?.[0] || '';
  const shuffleTail = renderer.match(/function shuffleChannelScheduleTail\(queue, preserveThroughIndex, shows = \[\], random = Math\.random\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(groupEnd && numbered && shuffleItems && poolCycles && shuffleTail, 'shuffle queue helpers exist');
  const helpers = vm.runInNewContext(`${groupEnd}\n${numbered}\n${shuffleItems}\n${poolCycles}\n${shuffleTail}; ({ channelProgramGroupEnd, shuffleChannelScheduleTail })`);
  const queue = [
    { segmentType: 'program', path: '/tv/A/S01E01a.mp4', showPath: '/tv/A', programSequence: 10, sequence: 1 },
    { segmentType: 'commercial', path: '/ads/ad1.mp4', programSequence: 10, breakSequence: 2, sequence: 2 },
    { segmentType: 'program', path: '/tv/A/S01E01b.mp4', showPath: '/tv/A', programSequence: 10, sequence: 3 },
    { segmentType: 'commercial', path: '/ads/ad2.mp4', programSequence: 10, breakSequence: 4, sequence: 4 },
    { segmentType: 'program', path: '/tv/A/S01E02.mp4', showPath: '/tv/A', programSequence: 11, sequence: 5 },
    { segmentType: 'commercial', path: '/ads/ad3.mp4', programSequence: 11, breakSequence: 6, sequence: 6 },
    { segmentType: 'program', path: '/tv/B/S01E01.mp4', showPath: '/tv/B', programSequence: 12, sequence: 7 },
    { segmentType: 'program', path: '/tv/A/S01E03.mp4', showPath: '/tv/A', programSequence: 13, sequence: 8 },
    ...['Alpha', 'Beta', 'Gamma', 'Alpha', 'Beta', 'Gamma'].map((name, index) => ({
      segmentType: 'program', path: `/tv/Loose/${name}.mp4`, showPath: '/tv/Loose', programSequence: 14 + index, sequence: 9 + index
    }))
  ];
  const preserveThrough = helpers.channelProgramGroupEnd(queue, 2);
  assert.equal(preserveThrough, 3, 'preserves every part and the full break for the airing episode');
  assert.equal(helpers.channelProgramGroupEnd(queue, 1), 3, 'shuffling during an ad break leaves that programme intact');
  const shows = [
    { path: '/tv/A', episodes: [{ path: '/tv/A/S01E01.mp4' }, { path: '/tv/A/S01E02.mp4' }, { path: '/tv/A/S01E03.mp4' }] },
    { path: '/tv/B', episodes: [{ path: '/tv/B/S01E01.mp4' }] },
    { path: '/tv/Loose', loose: true, episodes: ['Alpha', 'Beta', 'Gamma'].map(name => ({ path: `/tv/Loose/${name}.mp4` })) }
  ];
  const result = helpers.shuffleChannelScheduleTail(queue, preserveThrough, shows, () => 0);
  assert.ok(result.queue.slice(0, 4).every((item, index) => item === queue[index]), 'the current episode and ad break stay untouched');
  const programs = result.queue.slice(4).filter(item => item.segmentType === 'program');
  const aEpisodes = programs.filter(item => item.showPath === '/tv/A').map(item => item.path);
  assert.deepEqual(JSON.parse(JSON.stringify(aEpisodes)), ['/tv/A/S01E02.mp4', '/tv/A/S01E03.mp4'], 'series episodes remain in order');
  const looseEpisodes = programs.filter(item => item.showPath === '/tv/Loose').map(item => item.path);
  assert.deepEqual(new Set(JSON.parse(JSON.stringify(looseEpisodes.slice(0, 3)))), new Set(['Alpha', 'Beta', 'Gamma'].map(name => `/tv/Loose/${name}.mp4`)),
    'loose movie/video pools still use every title once before the next cycle');
  assert.notDeepEqual(programs.map(item => item.path), queue.slice(4).filter(item => item.segmentType === 'program').map(item => item.path),
    'the future lineup is actually shuffled');
  const tailSequences = JSON.parse(JSON.stringify(result.queue.slice(4).map(item => item.sequence)));
  assert.deepEqual(tailSequences, [...tailSequences].sort((a, b) => a - b), 'reordered items keep sequence IDs monotonic');
  assert.equal(result.nextSequence, result.queue.at(-1).sequence + 1);
  assert.equal(result.nextProgrammeSequence, result.queue.at(-1).programSequence);
});

test('commercials are channel-scoped with no shared WATCH-folder watcher', () => {
  assert.doesNotMatch(main, /COMMERCIAL_SOURCE_ROOT/);
  assert.doesNotMatch(main, /commercialService\.startWatchingFolder\(/);
  assert.match(main, /importChannelCommercialSources\(/);
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
  assert.match(renderer, /function cycleActiveChannel\(direction\) \{[\s\S]*?if \(!channelsStartupReady\) return;[\s\S]*?const lineup = \[[\s\S]*?configuredYoutubeStarters\(\)/);
  assert.match(renderer, /if \(next\.kind === 'youtube'\) \{\s*selectYoutubeStarter\(next\.id\);/);
  assert.match(renderer, /selectActiveChannel\(next\.id\);[\s\S]*?if \(selectedInput !== 'tv'\) setInputSource\('tv'\)/);
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

test('Guide and Input occupy the integrated lower cabinet rail, not a sidebar', () => {
  assert.match(styles, /grid-template-areas:"deck deck deck deck" "ports transport rockers input"/);
  assert.match(styles, /\.cabinet-console \.simple-tv-controls \{\s*grid-area:ports; position:static/);
  assert.match(styles, /\.cabinet-console > \.input-source-control \{\s*grid-area:input/);
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
  const scan = renderer.match(/async function scanChannel\(channel, \{ force = false \} = \{\}\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(scan, /channel\.error = userFacingChannelError\(error\)/);
  assert.doesNotMatch(scan, /channel\.error = error\.message/);
  const abbreviation = renderer.match(/function makeChannelAbbreviation\(name, root = ''\) \{[\s\S]*?\n\}/)?.[0] || '';
  const folderName = renderer.match(/function channelFolderName\(root\) \{[\s\S]*?\n\}/)?.[0] || '';
  const prefix = renderer.match(/const CHANNEL_ORDER_PREFIX = [^\n]+/)?.[0] || '';
  const makeAbbreviation = vm.runInNewContext(`${prefix}\n${folderName}\n${abbreviation}; makeChannelAbbreviation`);
  const numbered = { '3_00s': '00s', '4_ 666': '666', '10_Cartoon Network': 'CN', '12_HBO': 'HBO', '11_HBO Kids': 'HBOK', '9_Disney': 'DSNY' };
  for (const [folder, label] of Object.entries(numbered)) {
    assert.equal(makeAbbreviation(folder.replace(/^\d+_\s*/, ''), `/media/TV-Channels/${folder}`), label, 'dial numbers never reach the label');
  }
  assert.equal(makeAbbreviation('Cartoon Network', '/TV/Cartoon Network'), 'CN');
  assert.equal(makeAbbreviation('Nickelodeon', '/TV/Nickelodeon'), 'NICK');
  const library = '/media/TV-Channels';
  const expected = {
    '00s': '00s', '666': '666', '90s': '90s', 'Cartoon Network': 'CN', 'Comedy Central': 'CMDY', Disney: 'DSNY', Ghibli: 'GHBL',
    'HBO Kids': 'HBOK', HBO: 'HBO', MTV: 'MTV', 'Nick-Jr': 'NKJR', Nickelodeon: 'NICK', VH1: 'VH1'
  };
  for (const [folder, label] of Object.entries(expected)) assert.equal(makeAbbreviation(folder, `${library}/${folder}`), label, folder);
  assert.equal(new Set(Object.values(expected)).size, Object.keys(expected).length, 'every real channel has its own label');
  assert.equal(makeAbbreviation('Old Movies', '/media/HBO/Old Movies'), 'OM', 'parent folders do not leak into labels');
  const assign = renderer.match(/function assignChannelAbbreviations\(\) \{[\s\S]*?\n\}/)[0];
  const context = { channels: [{ name: 'Fox', root: '/a/Fox' }, { name: 'FOX', root: '/b/FOX' }] };
  vm.runInNewContext(`${prefix}\n${folderName}\n${abbreviation}; ${assign}; assignChannelAbbreviations()`, context);
  assert.deepEqual(context.channels.map(channel => channel.abbreviation), ['FOX', 'FOX2']);
});

test('channel and volume share the uncluttered lower molded control bank', () => {
  assert.match(styles, /\.cabinet-console \.primary-dials \{\s*grid-area:rockers; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.primary-dials \.channel-surf-control \{ order:1;/);
  assert.match(styles, /\.primary-dials \.volume-rocker-control \{ order:2;/);
  assert.doesNotMatch(styles, /\.primary-dials \.tracking-control/);
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
  assert.match(renderer, /if \(typeof window\.tube\.openChannelMedia === 'function'\) await window\.tube\.openChannelMedia\(program\.id, 0, \{ prepareOnly: true \}\);/);
  assert.match(renderer, /MAX_ADJACENT_CHANNELS_TO_PREWARM = 2/);
});

test('channel scans, schedule recovery, and episode rounds stay behind the sandboxed IPC bridge', () => {
  for (const method of ['chooseChannelFolder', 'chooseChannelSource', 'discoverSiblingChannels', 'restoreChannelFolder', 'rescanChannelFolder', 'buildChannelRound', 'reconcileChannelPlayback']) {
    assert.match(preload, new RegExp(`${method}:`));
  }
  assert.match(renderer, /window\.tube\.discoverSiblingChannels\(channels\.map\(channel => channel\.root\), savedChannelSource\(\)\)/);
  assert.match(main, /function discoverSiblingChannels\(_event, savedRoots, sourceRoot\)/);
  for (const handler of ['choose-channel-folder', 'discover-sibling-channels', 'restore-channel-folder', 'rescan-channel-folder', 'build-channel-round']) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\(['"]${handler}['"]`));
  }
  assert.match(renderer, /const restoredRoot = await window\.tube\.restoreChannelFolder\(channel\.root\);\s*const scanned = await window\.tube\.rescanChannelFolder\(restoredRoot, \{ force \}\)/);
  assert.match(renderer, /window\.tube\.buildChannelRound\([\s\S]*?remainingSeconds/);
  assert.match(renderer, /lastCommercialPath/);
  assert.match(renderer, /saturdayTube\.channels\.v1/);
  assert.match(main, /ipcMain\.handle\(['"]reconcile-channel-playback['"]/);
  assert.match(renderer, /playbackState: channelPlaybackSnapshot\(channel, now, capturePlayback\)/);
  assert.match(renderer, /window\.tube\.reconcileChannelPlayback\(/);
  assert.match(renderer, /window\.addEventListener\('beforeunload',[\s\S]*?saveChannelPlaybackState\(\)/);
  assert.match(renderer, /CHANNEL_PLAYBACK_SAVE_INTERVAL_MS = 5000/);
  assert.match(renderer, /playHistory: Object\.fromEntries\(history\)/);
});

test('TV commercials come only from the selected eligible channel and retain short-episode breaks', () => {
  assert.match(renderer, /function activeChannelCommercials\(\) \{ return selectedInput === 'tv' \? \(activeChannel\(\)\?\.movieOnly \|\| activeChannel\(\)\?\.adFree \? \[\] : \(activeChannel\(\)\?\.commercials \|\| \[\]\)\) : null; \}/);
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
  const scanner = main.match(/async function scanChannelRoot\(root, event, \{ force = false \} = \{\}\) \{([\s\S]*?)\n\}\n\nasync function finishChannelScan\([^\n]*\) \{([\s\S]*?)\n\}/)?.slice(1).join('\n') || '';
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
  assert.match(main, /if \(!isChannelReadyClip\(clip\)\) \{/);
});

test('TV Settings retains audio and video controls and relocates tape options into a third page', () => {
  assert.match(html, /id="tvSettingsButton"[^>]*class="tv-settings-button"/);
  assert.match(html, /class="[^"]*tv-settings-osd"/);
  assert.match(html, /id="tvSettingsAudio"/);
  assert.match(html, /id="tvSettingsVideo"/);
  assert.equal((html.match(/data-settings-tab=/g) || []).length, 8, 'audio, video, cabinet, scenes, breaks, tapes, channels and remote pages');
  assert.match(html, /id="tvSettingsTapes"/);
  assert.match(renderer, /tapesPane\.append\([\s\S]*?\.playlist-panel[\s\S]*?\.deck-options[\s\S]*?\.commercial-controls/);
  assert.doesNotMatch(html, /id="tvSettings(Picture|Display)"/);
  assert.match(html, /data-settings-tab="video"[^>]*>VIDEO<\/button><button type="button" data-settings-tab="cabinet">CABINET</);
  assert.match(html, /id="tvSettingsCabinet" class="settings-pane"/);
  assert.match(renderer, /document\.querySelector\('#tvSettingsCabinet'\)\.append\(document\.querySelector\('\.finish-panel'\)\)/, 'cabinet finish, tint and skin get their own page');
  assert.match(html, /class="audio-control-group"/);
  assert.match(html, /id="soundEffectsVolume"/);
  assert.match(renderer, /const videoPane = document\.querySelector\('#tvSettingsVideo'\)/);
  assert.match(renderer, /for \(const id of \['scanlines', 'curve'\]\)[\s\S]*videoPane\.append\(control\)/);
  assert.match(renderer, /const volumeControl = document\.querySelector\('#volume'\)\?\.closest\('\.dial-control'\);\s*if \(volumeControl\) audioPane\.append\(volumeControl\)/);
  assert.match(renderer, /audioPane\.append\(document\.querySelector\('\.audio-control-group'\)\)/);
  assert.match(renderer, /videoPane\.append\(\s*document\.querySelector\('\.picture-control-group'\),\s*document\.querySelector\('\.signal-settings'\),\s*document\.querySelector\('\.view-section'\)/);
  assert.match(readFileSync(path.join(root, 'styles.css'), 'utf8'), /#tvSettingsDialog \.view-button small \{ font-size:16px !important;/, 'fullscreen mode labels read at menu size');
  assert.match(renderer, /selectSettingsTab\('video'\)/);
  assert.match(renderer, /selectSettingsTab\('audio'\); showScreenDialog\(tvSettingsDialog\)/);
  assert.match(renderer, /dialog === tvSettingsDialog[\s\S]*?anchor\.width \* 0\.94[\s\S]*?dialog\.style\.zoom = String\(zoom\)/);
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
  assert.match(main, /isChannelFolder, channelDisplayName, channelIdentity, compareChannelFolders, discoverAdjacent666Channel, resolveChannelCommercialsRoot/);
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
  assert.match(renderer, /function showChannelSurfText\(text, holdMs = 1900\)/);
  assert.match(renderer, /\}, holdMs\);/);
});

test('remote number entry waits on one digit and tunes at once on two, with on-screen digits', () => {
  const pick = name => renderer.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0] || '';
  const shown = [], tuned = [], timers = [];
  const context = {
    REMOTE_DIGIT_TIMEOUT_MS: 3000, remoteDigits: '', remoteDigitTimer: null, channelsStartupReady: true,
    channels: [9, 10, 12, 14].map(number => ({ number })), channelDialNumber: channel => channel.number,
    showChannelSurfText: (text, hold) => shown.push([text, hold]), tuneChannelNumber: number => tuned.push(number),
    window: { setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimeout() {} }
  };
  vm.runInNewContext(`${pick('commitRemoteDigits')}\n${pick('enterRemoteDigit')}\nthis.enter = enterRemoteDigit;`, context);
  context.enter(9);
  assert.deepEqual(tuned, [], 'a lone 9 waits for a possible second digit');
  assert.deepEqual(shown.at(-1), ['9-', 3300]);
  assert.equal(timers.at(-1)[1], 3000);
  timers.at(-1)[0]();
  assert.deepEqual(tuned, [9], 'the wait ends by tuning 9');
  context.enter(0); context.enter(9);
  assert.deepEqual(tuned, [9, 9], '0-9 tunes channel 9 at once');
  assert.deepEqual(shown.at(-1)[0], '09');
  context.enter(1); context.enter(2);
  assert.deepEqual(tuned, [9, 9, 12]);
});

test('volume ticks and MUTE are drawn on the screen, and surfing shows the channel number', () => {
  assert.match(html, /id="volumeOverlay" class="volume-overlay" hidden[\s\S]*class="volume-bar"[\s\S]*id="muteOverlay" class="mute-overlay" hidden[^>]*>MUTE</);
  assert.match(renderer, /showChannelSurfText\(`\$\{channelSurfAbbreviation\(channel\)\} \$\{channelDialNumber\(channel\)\}`\)/);
  assert.match(renderer, /function adjustMasterVolume\(direction, step = 5\) \{[\s\S]*?if \(mutedVolume !== null\) \{ setMuted\(false\); return; \}[\s\S]*?showVolumeOverlay\(\);/);
  assert.match(renderer, /case 'vol-up': adjustMasterVolume\(1, 1\); break;\s*case 'vol-down': adjustMasterVolume\(-1, 1\); break;/, 'the phone remote steps volume by 1');
  assert.match(renderer, /case 'page-prev': remotePage\(-1\); break;\s*case 'page-next': remotePage\(1\); break;/);
  assert.match(renderer, /function remotePage\(direction\) \{\s*const scope = remoteScope\(\);\s*if \(scope === tvGuideDialog\) \{\s*document\.querySelector\(direction > 0 \? '#tvGuideNext' : '#tvGuidePrevious'\)\?\.click\(\);/, 'PAGE turns guide pages while the arrows move the cursor');
  assert.match(renderer, /const near = lastRemoteFocusRect && remoteClosestTo\(lastRemoteFocusRect, items\);/, 'the cursor survives a guide re-render');
  assert.match(renderer, /case 'mute': toggleMute\(\); break;/);
  assert.match(renderer, /muted: mutedVolume !== null,/);
  assert.match(styles, /\.volume-bar i\.on \{/);
});

test('Guide is remote-only while RCA audio and Settings remain on the cabinet', () => {
  assert.doesNotMatch(html, /id="tvGuideButton"|class="tv-guide-logo"/);
  assert.match(html, /id="audioRcaButton"[^>]*aria-label="Open audio settings"[\s\S]*class="rca-jacks"[\s\S]*rca-left-audio[\s\S]*rca-right-audio[\s\S]*<small>AUDIO<\/small>/);
  assert.match(html, /id="tvSettingsButton"[^>]*class="tv-settings-button"[\s\S]*class="settings-gear"[\s\S]*<svg/);
  assert.match(renderer, /document\.querySelector\('#audioRcaButton'\)\.addEventListener\('click', \(\) => \{ selectSettingsTab\('audio'\); showScreenDialog\(tvSettingsDialog\); \}\)/);
  assert.doesNotMatch(renderer, /#tvGuideButton/);
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
  assert.match(renderer, /row\.append\(when, bug, kind, title\)/);
  assert.match(renderer, /title\.textContent = String\(segment\.title \|\| 'Episode'\)\.replace\(\/\\\.\(\?:mkv\|mp4/, 'guide titles drop the file extension');
  assert.match(renderer, /bug\.className = 'guide-channel-bug';\s*bug\.textContent = String\(channelDialNumber\(channel\)\)/);
  assert.match(renderer, /dateLabel\.textContent = windowStart\.toLocaleDateString\(\[\], \{ weekday: 'long' \}\)/);
  assert.match(renderer, /toLocaleDateString\(\[\], \{ month: 'long', day: 'numeric', year: 'numeric' \}\)/);
  assert.match(styles, /\.guide-open-spread \{[\s\S]*grid-template-columns:minmax\(0,\.96fr\) minmax\(0,1\.04fr\)/);
  assert.match(styles, /\.guide-show-list \{[\s\S]*overflow:visible/);
  assert.doesNotMatch(styles, /\.guide-show-list \{[^}]*overflow-y:auto|\.guide-show-list \{ max-height:82px/);
  assert.match(styles, /\.guide-broadcast-list \{[\s\S]*max-height:none;[\s\S]*overflow-y:auto/);
});

test('channel MP4s retain AAC compatibility without blocking native loading', () => {
  assert.match(renderer, /const CHANNEL_AUDIO_CHECK_EXTENSIONS = \/\\\.\(\?:mkv\|mp4\|m4v\|mov\|webm\|flv\|avi\|mpg\|mpeg\|ts\|wmv\)\$\/i;/);
  assert.match(renderer, /const BROWSER_SAFE_AUDIO_CODECS = new Set\(\['aac', 'mp3', 'opus', 'vorbis', 'flac'\]\);/);
  assert.doesNotMatch(renderer, /!\/\\\.mkv\$\/i\.test\(String\(track\.path/, 'the check is no longer limited to MKV files');
  assert.match(renderer, /if \(input === 'tv'\) return;/, 'channel sound uses its native verification or live AAC plan');
  assert.match(renderer, /if \(plan\?\.verifyAudio\) verifyNativeChannelAudio\(track, generation\);/);
  assert.match(renderer, /prepareUpcomingChannelAudio\(channel, position\);[\s\S]{0,150}if \(channel\.broadcast\.totalDurationSeconds - elapsed < 180\)/);
  assert.match(renderer, /beginTrackPlayback\(index, restoreSession, channelPlaybackSource\(track\)\)/);
});

const pickFunction = name => {
  const match = renderer.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} exists`);
  return match[0];
};

test('audio outside the codecs Chromium decodes is converted; missing audio is not', () => {
  const needs = vm.runInNewContext(`const BROWSER_SAFE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
${pickFunction('audioCodecNeedsConversion')}; audioCodecNeedsConversion`);
  for (const codec of ['ac3', 'eac3', 'dts', 'truehd', 'pcm_s16le', 'pcm_u8', 'mp2', 'wmav2', 'alac']) assert.equal(needs(codec), true, codec);
  for (const codec of ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'AAC', 'none', '', null]) assert.equal(needs(codec), false, String(codec));
  // A failed probe is retried later instead of leaving the file silent for the whole session.
  assert.match(renderer, /const channelAudioCompatibilityFailures = new Map\(\);/);
  assert.match(renderer, /Date\.now\(\) - \(channelAudioCompatibilityFailures\.get\(sourcePath\) \|\| -Infinity\) < AUDIO_PROBE_RETRY_MS/);
  // Tapes get the same check and reuse a converted copy next time they load.
  assert.match(pickFunction('prepareChannelAudioCompatibility'), /input !== 'tv' && input !== 'video'/);
  assert.match(renderer, /if \(!track\.channelMedia && !trackOverride\) track = channelPlaybackSource\(track\);/);
  assert.match(renderer, /fallbackAttempted = usingConvertedCopy;/);
});

test('main process reads the audio codec with FFmpeg when ffprobe is missing and keeps running in the background', () => {
  assert.match(main, /backgroundThrottling: false/);
  const fn = main.match(/async function getMediaAudioCodec\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(fn, /\(await mediaStreamInfo\(source\)\)\?\.audio/);
  assert.match(fn, /for \(const executable of transcodeExecutableCandidates\(\)\)/);
  const audioLine = /Stream #\d+:\d+[^:\n]*: Audio: ([a-z0-9_]+)/i;
  assert.equal('  Stream #0:1[0x2](eng): Audio: ac3 (ac-3 / 0x332D6361), 48000 Hz, 5.1(side)'.match(audioLine)?.[1], 'ac3');
  assert.equal('  Stream #0:0: Video: h264 (High), yuv420p\n  Stream #0:1(und): Audio: aac (LC)'.match(audioLine)?.[1], 'aac');
  assert.equal('  Stream #0:0[0x1](und): Video: h264 (avc1 / 0x31637661)'.match(audioLine), null);
});

test('audio watchdog keeps sound alive: fade timer, unmute, output stalls and undecodable audio', () => {
  assert.match(renderer, /window\.setInterval\(updateChannelBreakFade, 100\);/);
  assert.match(renderer, /window\.setInterval\(checkPlaybackAudio, AUDIO_WATCHDOG_MS\);/);
  const calls = [];
  const context = {
    console: { warn() {} },
    hasVideo: true, shuttingOff: false, switchingTracks: false, selectedInput: 'tv', currentIndex: 0,
    activePlaybackUrl: 'saturday://app/media/a', activeAudioOutputId: 'speaker',
    video: { paused: false, ended: false, seeking: false, readyState: 4, muted: true, defaultMuted: false, volume: 1, webkitAudioDecodedByteCount: 0, webkitVideoDecodedByteCount: 5000 },
    masterGain: { gain: { value: 0.5, cancelScheduledValues() {} } },
    levelerGain: null, levelerPower: null,
    audioContext: { state: 'running', currentTime: 10, resume: () => { calls.push('resume'); return Promise.resolve(); }, suspend: () => Promise.resolve() },
    mediaWithoutAudio: new Set(), channelAudioCompatibilityJobs: new Map(),
    activePlaylist: () => ({ tracks: [{ path: '/tv/show.mp4', id: 'x' }] }),
    setMasterVolume: () => { calls.push('volume'); context.video.muted = false; },
    setAudioOutputDevice: id => { calls.push(`route:${id}`); return Promise.resolve(true); },
    setStatus() {},
    repairPlaybackAudio: track => { calls.push(`repair:${track.path}`); return true; }
  };
  vm.createContext(context);
  vm.runInContext(`const AUDIO_SILENT_DECODE_TICKS = 4;
const audioWatchdog = { contextTime: -1, stalledTicks: 0, decodeUrl: '', silentTicks: 0, decodeOk: false };
${pickFunction('audioPlaybackExpected')}
${pickFunction('checkPlaybackAudio')}
this.tick = checkPlaybackAudio;`, context);
  context.tick();
  assert.equal(calls[0], 'volume', 'a muted element is unmuted');
  for (let i = 0; i < 6; i += 1) context.tick();
  assert.deepEqual(calls.filter(call => call.startsWith('route:')), ['route:speaker', 'route:default'], 'frozen audio clock re-routes then falls back to the system default');
  assert.deepEqual(calls.filter(call => call.startsWith('repair:')), ['repair:/tv/show.mp4'], 'picture without decoded audio is repaired once');

  calls.length = 0;
  context.activePlaybackUrl = 'saturday://app/media/b';
  context.video.webkitAudioDecodedByteCount = 2048;
  context.audioContext.state = 'suspended';
  for (let i = 0; i < 6; i += 1) context.tick();
  assert.ok(calls.includes('resume'), 'a suspended context is resumed');
  assert.equal(calls.some(call => call.startsWith('repair:')), false, 'decoding audio is left alone');

  calls.length = 0;
  context.activePlaybackUrl = 'saturday://app/media/c';
  context.video.webkitAudioDecodedByteCount = 0;
  context.mediaWithoutAudio.add('/tv/show.mp4');
  for (let i = 0; i < 6; i += 1) context.tick();
  assert.equal(calls.some(call => call.startsWith('repair:')), false, 'files with no audio track are not converted');
});

test('remote fullscreen key cycles screen only, whole TV, dimmed room, scenes, then back to the window', async () => {
  const remoteHtml = readFileSync(path.join(root, 'remote', 'index.html'), 'utf8');
  const remoteServer = readFileSync(path.join(root, 'remote-server.cjs'), 'utf8');
  const fullscreenKey = remoteHtml.match(/<button[^>]*id="fullscreenKey"[\s\S]*?<\/button>/)?.[0];
  assert.equal(fullscreenKey?.match(/<svg/g)?.length, 1, 'one fullscreen icon, not four tiny modes');
  assert.match(fullscreenKey, /id="fullscreenMode"/);
  assert.match(main, /backdropWindow\.setIgnoreMouseEvents\(true\);/, 'the dim sheet never catches clicks');
  assert.match(main, /owner\.isFullScreen\(\) && owner\.isFocused\(\)/, 'the sheet shows only while the TV window is the active app');
  assert.match(remoteServer, /'fullscreen'/);
  assert.match(renderer, /case 'fullscreen': void cycleFullscreen\(\); break;/);
  assert.match(preload, /setWindowFullscreen: \(fullscreen\) => ipcRenderer\.invoke\('set-window-fullscreen'/);
  assert.match(styles, /body\.screen-fill #stage \{ position: fixed; inset: 0;/);
  const classes = new Set();
  const context = {
    console, nativeWindowFullscreen: false, backdropDim: false, fullscreenTransition: false, stage: {}, canvas: {},
    document: { fullscreenElement: null, body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } } },
    window: {
      SaturdayScenes: { active: false, async enter() { this.active = true; }, exit() { this.active = false; } },
      tube: { setWindowFullscreen: async value => value, setBackdropDim: async value => value }
    },
    setStatus() {}, syncFullscreenButtonState() {}
  };
  vm.createContext(context);
  vm.runInContext(`${pickFunction('fullscreenMode')}\n${renderer.match(/async function setBackdropDim\(enabled\) \{[\s\S]*?\n\}/)[0]}\n${renderer.match(/async function enterSceneFullscreen\(\) \{[\s\S]*?\n\}/)[0]}\n${renderer.match(/async function cycleFullscreen\(\) \{[\s\S]*?\n\}/)[0]}\nthis.cycle = cycleFullscreen; this.mode = fullscreenMode;`, context);
  assert.equal(context.mode(), 'off');
  await context.cycle();
  assert.equal(context.mode(), 'screen');
  assert.equal(context.nativeWindowFullscreen, true);
  await context.cycle();
  assert.equal(context.mode(), 'tv');
  assert.equal(context.nativeWindowFullscreen, true);
  await context.cycle();
  assert.equal(context.mode(), 'dim');
  assert.equal(context.nativeWindowFullscreen, false);
  assert.equal(context.backdropDim, true);
  await context.cycle();
  assert.equal(context.mode(), 'scene');
  assert.equal(context.nativeWindowFullscreen, true);
  assert.equal(context.backdropDim, false);
  await context.cycle();
  assert.equal(context.mode(), 'off');
  assert.equal(context.backdropDim, false);
});

test('on-screen conversions jump the queue, keep H.264/HEVC pictures, and fit long episodes', () => {
  assert.match(main, /async function transcodeMedia\(_event, id, options = \{\}\)/);
  assert.match(main, /const foreground = options\?\.priority !== 'background';/);
  assert.match(main, /if \(backgroundTranscodeRunning \|\| foregroundTranscodes > 0\) return;/, 'warm-ups run one at a time and yield to the screen');
  assert.match(main, /if \(foreground && !existing\.started\) \{\n      existing\.foreground = true;\n      existing\.start\(\);/, 'a queued warm-up starts at once when tuned');
  assert.match(main, /if \(videoCodec === 'hevc'\) return \[\[\.\.\.common, '-c:v', 'copy', '-tag:v', 'hvc1', \.\.\.audioTail\], encode\];/);
  assert.match(main, /'-c:a', 'aac', '-ac', '2', '-b:a', '160k'/);
  assert.match(main, /convertedStat\.size > MAX_TRANSCODE_FILE_BYTES/);
  assert.match(main, /free >= MIN_FREE_DISK_BYTES/);
  assert.match(preload, /transcodeMedia: \(id, options\) => ipcRenderer\.invoke\('transcode-media', id,/);
  assert.match(renderer, /ensureChannelAudioCompatible\(track, 'foreground'\)/);
  assert.match(renderer, /window\.tube\.transcodeMedia\(track\.id, \{ priority: 'foreground' \}\)/);
  assert.match(renderer, /window\.tube\.openChannelMedia\(item\.id, 0, \{ prepareOnly: true \}\)/, 'upcoming programmes only have their codecs looked up');
  assert.match(renderer, /audioRepairAttempted\.delete\(sourcePath\);/, 'a failed sound repair is retried');
});

test('damaged channel files are skipped instead of hanging on LOADING', () => {
  assert.match(renderer, /const CHANNEL_LOAD_STALL_MS = 15000;/);
  assert.match(renderer, /function watchChannelLoad\(generation\)/);
  assert.match(renderer, /video\.load\(\);\n  watchChannelLoad\(generation\);/);
  assert.match(renderer, /if \(video\.readyState >= 2 \|\| video\.error\) return;[\s\S]{0,170}handlePlaybackFailure\(\);/);
  assert.match(renderer, /video\.addEventListener\('error', handlePlaybackFailure\);/);
  assert.equal((renderer.match(/if \(failCurrentChannelSegment\(\)\) return;/g) || []).length, 4, 'every final failure skips on TV');
  assert.match(renderer, /if \(isUnplayableChannelMedia\(position\.segment\)\) \{\n    skipUnplayableChannelSegment\(channel, position, expectedTuneToken\);/);
  assert.match(renderer, /channel\.broadcast\.initialOffsetSeconds = \(Number\(channel\.broadcast\.initialOffsetSeconds\) \|\| 0\) \+ skipSeconds;/);
  assert.match(renderer, /const UNPLAYABLE_RETRY_MS = 24 \* 60 \* 60 \* 1000;/);
});

test('skipping a damaged programme lands on the next playable programme', () => {
  const start = renderer.indexOf('function channelMediaIdentity(item)');
  const end = renderer.indexOf('function failCurrentChannelSegment()');
  const context = {
    Date, Number, Math, console: { warn() {} }, Object, JSON,
    window: { setTimeout() {} },
    localStorage: { setItem() {} },
    channelTuneToken: 1, selectedInput: 'tv', activeChannelId: 'c',
    unplayableSkipCount: { tuneToken: -1, count: 0 },
    MAX_UNPLAYABLE_SKIPS_PER_TUNE: 40, UNPLAYABLE_RETRY_MS: 86400000,
    status: '', setStatus(text) { context.status = text; }, setTVSearching() {}, syncActiveBroadcast() {}
  };
  vm.createContext(context);
  vm.runInContext(`var unplayableChannelMedia = {}; ${renderer.slice(start, end)} this.mark = markUnplayableChannelMedia; this.skip = skipUnplayableChannelSegment;`, context);
  const queue = [
    { path: '/bad.mkv', segmentType: 'program', durationSeconds: 800, size: 1, modified: 2 },
    { path: '/ad.mp4', segmentType: 'commercial', durationSeconds: 30 },
    { path: '/bad.mkv', segmentType: 'program', durationSeconds: 800, size: 1, modified: 2 },
    { path: '/good.mp4', segmentType: 'program', durationSeconds: 600 }
  ];
  const channel = { id: 'c', queue, broadcast: { initialOffsetSeconds: 100 } };
  context.mark(queue[0]);
  assert.equal(context.skip(channel, { index: 0, segment: queue[0], startSeconds: 0, offsetSeconds: 100 }, 1), true);
  assert.equal(channel.broadcast.initialOffsetSeconds, 1630, 'the clock lands on the first frame of /good.mp4');
  assert.match(context.status, /SKIPPING AHEAD/);
});

test('quitting stops every FFmpeg child so orphans never slow the next launch', () => {
  assert.ok(main.indexOf('childProcess.spawn = function trackedSpawn') < main.indexOf("require('./commercials-service.cjs')"), 'spawn is tracked before services load');
  assert.match(main, /app\.on\('will-quit', stopChildProcesses\);/);
  assert.match(main, /process\.once\('exit', stopChildProcesses\);/);
  assert.match(main, /for \(const signal of \['SIGTERM', 'SIGINT', 'SIGHUP'\]\)/);
});

test('copied live video and its audio start from the same demuxer landing point so sound never runs ahead', () => {
  assert.match(main, /\.\.\.\(entry\.mode === 'copy' \? \['-noaccurate_seek'\] : \[\]\), '-ss', seek\.toFixed\(3\)/);
  assert.match(main, /'-loglevel', 'error', \.\.\.seekArgs,\s*'-readrate', '1', '-readrate_initial_burst', '6', '-readrate_catchup', '1.5', '-i', entry\.source/);
});

test('channel files Chromium cannot play stream live from the broadcast position instead of waiting on a full copy', () => {
  assert.match(main, /if \(parts\[0\] === 'live' && parts\[1\]\) return serveLiveMedia\(request, parts\[1\]\);/);
  assert.match(main, /ipcMain\.handle\('open-channel-media', openChannelMedia\);/);
  assert.match(main, /'-movflags', 'frag_keyframe\+empty_moov\+default_base_moof'/);
  assert.match(main, /start - keyframeSeconds <= LIVE_COPY_MAX_PREROLL_SECONDS/, 'a copied picture only starts on a keyframe near the position');
  assert.match(main, /second request for the same token replaces the old encoder\.\s*stopLiveMedia\(\);/, 'only one live conversion runs at a time, even on duplicate requests');
  assert.match(preload, /openChannelMedia: \(id, startSeconds, options\) => ipcRenderer\.invoke\('open-channel-media'/);
  assert.match(renderer, /return \(livePlayback \? livePlayback\.baseSeconds : 0\) \+ \(Number\(video\.currentTime\) \|\| 0\);/);
  const sync = renderer.match(/function syncActiveBroadcast\([\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(sync, /video\.currentTime\s*=/, 'broadcast-clock correction never restarts a native seek or rereads a live stream');
  assert.match(renderer, /if \(!livePlayback\) \{\n      const end = Number\.isFinite\(video\.duration\)/);
  assert.match(renderer, /restartChannelPlaybackLive\(\{ forceEncode: encodeNext \}\)/);
});

test('hung probes and stalled conversions cannot block channel scans or the conversion queue', () => {
  const commercials = readFileSync(path.join(root, 'commercials-service.cjs'), 'utf8');
  assert.match(commercials, /timeoutMs = 0, signal \} = \{\}\) \{/);
  assert.match(commercials, /'format=duration'[^\n]*\{ timeoutMs: PROBE_TIMEOUT_MS \}\);/);
  assert.match(main, /rememberChannelDuration\(filePath, \{ size: stat\.size, modified: stat\.mtimeMs, duration: 0, failed: true \}\);/);
  assert.match(main, /if \(cached\.failed\) throw new Error/);
  assert.match(main, /await runFFmpeg\(executable, args, \{ outputPath: temporary \}\);/);
});

test('Esc leaves fullscreen unless a menu is open', () => {
  assert.match(renderer, /if \(event\.key === 'Escape' && fullscreenMode\(\) !== 'off' && !document\.querySelector\('dialog\[open\]'\)\) \{\n    event\.preventDefault\(\);\n    void exitFullscreenModes\(\);/);
  assert.match(renderer, /async function exitFullscreenModes\(\) \{[\s\S]*?document\.body\.classList\.remove\('screen-fill'\);[\s\S]*?window\.tube\.setWindowFullscreen\(false\)/);
});

test('genuine VHS commercials play at 80% volume without simulated hiss or VHS lines', () => {
  assert.match(renderer, /const AUTHENTIC_TAPE_VOLUME = 0\.8;/);
  assert.match(renderer, /channelBreakFadeLevel \* \(playingAuthenticTape \? AUTHENTIC_TAPE_VOLUME : 1\)/);
  assert.match(renderer, /selectedAudioEffect === 'clean' \|\| playingAuthenticTape \? 0 :/, 'audio tape effects are bypassed');
  assert.match(renderer, /'vhsScan'\), playingAuthenticTape \? 0 : videoScale \* dialValue\(vhsScanDial\)/, 'only the VHS lines are bypassed');
  assert.match(renderer, /const videoScale = pictureFiltersEnabled \? 1 : 0;/);
  assert.match(renderer, /setPlayingAuthenticTape\(isAuthenticTapeTrack\(track\)\);\n  loadPlaybackSource/);
  assert.equal(renderer.match(/setPlayingAuthenticTape\(false\);/g)?.length, 2, 'cleared whenever playback is cleared');
});

test('a set switched off while muted preserves its saved volume and mute state', () => {
  assert.match(renderer, /audioOutputId: preferredAudioOutputId,\n      volumeBeforeMute: mutedVolume\n/);
  assert.match(renderer, /mutedVolume = Number\.isFinite\(saved\.volumeBeforeMute\) && saved\.volumeBeforeMute > 0 \? saved\.volumeBeforeMute : null;/);
  assert.doesNotMatch(renderer, /STARTUP_VOLUME_AFTER_SILENCE/);
});

test('the volume dial tops out at a 120% boost that only Web Audio can deliver, like a real set driven past clean', () => {
  assert.match(renderer, /const TV_VOLUME_BOOST = 1\.2;/);
  assert.match(renderer, /return dialValue\(videoDial\) \/ 100 \* TV_VOLUME_BOOST;/);
  assert.match(renderer, /video\.volume = Math\.min\(1, volume\);/, 'native playback caps at full scale');
  assert.match(renderer, /if \(!audioContext && hasVideo && dialVolumeGain\(\) > 1\) ensureAudioGraph\(\);/);
  assert.match(renderer, /cleanOutput\.gain\.value = dialVolumeGain\(\);/);
});

test('the surf readout puts the channel number after the name so the number holds its place at the right', () => {
  assert.match(renderer, /showChannelSurfText\(`\$\{channelSurfAbbreviation\(channel\)\} \$\{channelDialNumber\(channel\)\}`\);/);
  assert.match(renderer, /drawOsdText\(context, text, safe\.x \+ safe\.width \* 0\.97, [^\n]*'right'\);/, 'the readout is right-aligned');
});
