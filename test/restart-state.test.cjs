const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { reconcileChannelPlayback, locateBroadcastSegment } = require('../channels-service.cjs');

const renderer = readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
function extract(name) {
  const text = renderer.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(text, `${name} exists`);
  return text;
}

test('all channels persist and resume exact program and commercial positions after offline time', async () => {
  let now = 100000;
  const media = [
    { path: '/tv/show/episode.mp4', durationSeconds: 1800, url: 'episode' },
    { path: '/ads/commercial.mp4', durationSeconds: 30, url: 'ad' }
  ];
  const queue = [
    { ...media[0], segmentType: 'program', durationSeconds: 900, sourceStartSeconds: 0, sequence: 1 },
    { ...media[1], segmentType: 'commercial', sourceStartSeconds: 0, sequence: 2, breakSequence: 1, adBreakPosition: 1 },
    { ...media[0], segmentType: 'program', durationSeconds: 900, sourceStartSeconds: 900, sequence: 3 }
  ];
  const storage = new Map();
  const warnings = [];
  const channels = ['ad-channel', 'program-channel'].map((id, index) => ({
    id, name: id, root: `/tv/${id}`, enabled: true,
    queue, rotation: { round: 4 }, playHistory: {}, nextSequence: 4, nextProgrammeSequence: 1,
    broadcast: { startedAtMs: now, initialOffsetSeconds: index ? 1050.75 : 918, totalDurationSeconds: 1830 }
  }));
  const context = {
    Date: { now: () => now }, Math, Number, Object, Array, JSON,
    livePlayback: null, channels, activeChannelId: 'ad-channel', currentIndex: 1,
    activePlaybackPath: media[1].path, switchingTracks: false,
    video: { readyState: 4, seeking: false, currentTime: 12.625 },
    isCurrentChannelPlayback: () => true,
    MAX_SAVED_CHANNEL_QUEUE_ENTRIES: 6000, MAX_SAVED_CHANNEL_HISTORY_ENTRIES: 1000, CHANNEL_BREAK_KINDS: new Set(['black', 'silence', 'nominal']),
    CHANNELS_KEY: 'channels', CHANNEL_SOURCE_KEY: 'channelSource',
    localStorage: { setItem(key, value) { storage.set(key, value); }, getItem(key) { return storage.get(key) || null; } },
    makeChannelAbbreviation: () => 'CH',
    setStatus() {}, console: { warn(...args) { warnings.push(args); } },
    selectedInput: 'tv', channelsStartupReady: false, HAD_SAVED_CONTROL_PREFERENCES: true,
    setTVSearching() {}, renderChannels() {}, renderYoutubeStarterSetup() {}, configuredYoutubeStarters: () => [], activeYoutubeStarter: () => null,
    window: { tube: { async discoverSiblingChannels() { return []; } } },
    activeChannel() { return context.channels.find(channel => channel.id === context.activeChannelId); },
    tunedAt: null,
    async startActiveChannel() {
      context.tunedAt = { now, elapsed: context.broadcastElapsed(context.activeChannel()), programScanned: context.channels.find(channel => channel.id === 'program-channel').scanComplete === true };
    },
    channelWarmupPromise: null, prewarmAdjacentChannels() {},
    async scanChannel(channel) {
      const restored = reconcileChannelPlayback(
        [{ name: 'Show', path: '/tv/show', episodes: [media[0]] }], [media[1]], channel.savedPlaybackState
      );
      channel.queue = restored.queue;
      channel.broadcast = { startedAtMs: now, initialOffsetSeconds: restored.elapsedSeconds };
      channel.scanComplete = true;
      now += 30000;
      if (channel.savedPlaybackState) assert.equal(context.broadcastElapsed(channel), restored.elapsedSeconds, 'scanning does not consume saved playback time');
    }
  };
  vm.createContext(context);
  vm.runInContext([
    renderer.match(/const CHANNEL_ORDER_PREFIX = [^\n]+/)[0],
    ...['channelFolderName', 'channelFolderOrder', 'sortChannelsByDial'].map(extract),
    ...['playbackSourceTime', 'broadcastElapsed', 'locateChannelSegment', 'channelPlaybackSnapshot', 'persistChannels', 'saveChannelPlaybackState', 'savedChannelSource', 'channelFolderKey', 'insideChannelSource', 'reconcileMovedChannels', 'appendDiscoveredChannels', 'discoverNewChannels', 'loadChannels', 'isPlayableChannel', 'releaseChannelRestore', 'warmChannelsInBackground'].map(extract)
  ].join('\n'), context);
  assert.equal(context.channelPlaybackSnapshot(channels[0], now).elapsedSeconds, 918, 'ordinary scheduling snapshots retain the broadcast clock');
  context.video.seeking = true;
  assert.equal(context.channelPlaybackSnapshot(channels[0], now, true).elapsedSeconds, 918, 'an unfinished seek cannot overwrite the saved position');
  context.video.seeking = false;
  context.saveChannelPlaybackState();
  const stored = JSON.parse(storage.get('channels'));
  assert.equal(stored[0].playbackState.currentPosition.offsetSeconds, 12.625, 'actual media time wins over virtual clock drift');
  assert.equal(stored[1].playbackState.currentPosition.offsetSeconds, 120.75);
  now += 86400000;
  await context.loadChannels();
  assert.deepEqual(context.channels.map(channel => channel.name), ['ad-channel', 'program-channel'], 'startup keeps channels in stable dial order');
  assert.equal(context.activeChannelId, 'ad-channel');
  assert.equal(context.tunedAt.programScanned, false, 'the active channel tunes in before other channels finish scanning');
  const adChannel = context.channels.find(channel => channel.id === 'ad-channel');
  const programChannel = context.channels.find(channel => channel.id === 'program-channel');
  const adPosition = locateBroadcastSegment(adChannel.queue, context.tunedAt.elapsed);
  await context.channelWarmupPromise;
  assert.deepEqual(warnings, [], 'channel discovery and warm-up do not swallow errors');
  assert.equal(programChannel.scanComplete, true, 'remaining channels finish warming in the background');
  const programPosition = locateBroadcastSegment(programChannel.queue, context.broadcastElapsed(programChannel));
  assert.equal(adPosition.segment.segmentType, 'commercial');
  assert.equal(adPosition.offsetSeconds, 12.625);
  assert.equal(adPosition.segment.adBreakPosition, 1);
  assert.equal(programPosition.segment.sourceStartSeconds + programPosition.offsetSeconds, 1020.75);
  assert.equal(context.broadcastElapsed(adChannel), 912.625 + (now - context.tunedAt.now) / 1000, 'the tuned channel stays live while others warm');
  now += 2500;
  assert.equal(context.broadcastElapsed(context.channels[1]), 1053.25);
});

test('discovering a channel invokes the dial sorter and orders all channels', () => {
  const context = {
    CHANNEL_SOURCE_KEY: 'source',
    channels: [
      { id: 'vh1', name: 'VH1', root: '/TV/3_VH1' },
      { id: 'mtv', name: 'MTV', root: '/TV/2_MTV' }
    ],
    localStorage: { getItem: () => '' },
    makeChannelAbbreviation: () => 'CH',
    persistChannels() {}, renderChannels() {}
  };
  vm.createContext(context);
  vm.runInContext([
    renderer.match(/const CHANNEL_ORDER_PREFIX = [^\n]+/)[0],
    ...['channelFolderName', 'channelFolderOrder', 'sortChannelsByDial', 'channelFolderKey', 'insideChannelSource', 'reconcileMovedChannels', 'appendDiscoveredChannels'].map(extract)
  ].join('\n'), context);
  vm.runInContext("appendDiscoveredChannels([{ root: '/TV/1_Kids', name: 'Kids' }])", context);
  assert.deepEqual(context.channels.map(channel => channel.name), ['Kids', 'MTV', 'VH1']);
});

test('visual preferences round-trip across fresh renderer state without overwriting saved values', () => {
  const storage = new Map();
  const ids = ['volume', 'scanlines', 'curve', 'edgeBlur', 'hue', 'vhsScan', 'glitch', 'brokenTape', 'glow', 'brightness', 'fxAmount'];
  const values = [81, 29, 46, 17, 63, 38, 25, 14, 57, 22, 19];
  const context = {
    CONTROLS_KEY: 'controls', JSON, Object, Number,
    allDials: ids.map((id, index) => ({ id, value: values[index] })),
    dialValue: dial => dial.value,
    setDialValue: (dial, value) => { dial.value = value; },
    selectedAudioEffect: 'vhs', currentFinish: 'black', cabinetTint: '#408050', cabinetSkin: 'field',
    pictureFiltersEnabled: true, audioFiltersEnabled: false, tvLevelerEnabled: false, selectedPictureMode: 'lowstim', displayMode: 'rear',
    selectedInput: 'tv', soundEffectsEnabled: false, soundEffectsVolume: 125,
    activePlaylistId: 'playlist', preferredAudioOutputId: 'default', mutedVolume: null, STARTUP_VOLUME_AFTER_SILENCE: 50,
    get videoDial() { return this.allDials[0]; },
    pictureModeSelect: {}, displayModeSelect: {}, console,
    syncBypassControls() {}, syncSoundControls() {},
    localStorage: { setItem(key, value) { storage.set(key, value); }, getItem(key) { return storage.get(key) || null; } }
  };
  for (const [setter, key] of [
    ['setFinish', 'currentFinish'], ['setCabinetTint', 'cabinetTint'],
    ['setCabinetSkin', 'cabinetSkin'], ['setAudioEffect', 'selectedAudioEffect']
  ]) context[setter] = (value, save) => { assert.equal(save, false); context[key] = value; };
  vm.createContext(context);
  vm.runInContext([extract('saveControlPreferences'), extract('restoreControlPreferences')].join('\n'), context);
  context.saveControlPreferences();
  const expected = storage.get('controls');
  for (const dial of context.allDials) dial.value = 0;
  Object.assign(context, { currentFinish: 'grey', cabinetSkin: 'molded', selectedAudioEffect: 'clean', displayMode: 'crt', selectedPictureMode: 'color', selectedInput: 'video', audioFiltersEnabled: true, tvLevelerEnabled: true });
  context.restoreControlPreferences();
  context.saveControlPreferences();
  assert.deepEqual(JSON.parse(storage.get('controls')), JSON.parse(expected));
  assert.match(renderer, /beforeunload', \(\) => \{[\s\S]{0,250}saveControlPreferences\(\)/);
  context.allDials[0].value = 0;
  context.mutedVolume = 81;
  context.saveControlPreferences();
  context.allDials[0].value = 50;
  context.mutedVolume = null;
  context.restoreControlPreferences();
  assert.equal(context.allDials[0].value, 0, 'restart must not raise a saved zero volume');
  assert.equal(context.mutedVolume, 81, 'unmute can restore the original pre-mute volume');
});

test('saved view restores room, dim, screen and cabinet modes without requiring a user gesture', async () => {
  for (const savedViewMode of ['off', 'scene', 'dim', 'screen', 'tv']) {
    const calls = [];
    const context = {
      savedViewMode, nativeWindowFullscreen: false,
      enterSceneFullscreen: async () => calls.push('scene'),
      setBackdropDim: async enabled => calls.push(['dim', enabled]),
      document: { body: { classList: { toggle: (name, value) => calls.push([name, value]) } } },
      window: { tube: { setWindowFullscreen: async enabled => { calls.push(['fullscreen', enabled]); return enabled; } } },
      syncFullscreenButtonState: () => calls.push('sync'),
      setStatus: () => assert.fail('restoration should succeed'), console
    };
    const restore = vm.runInNewContext(`${extract('restoreViewMode')}; restoreViewMode`, context);
    await restore();
    assert.equal(calls.at(-1), 'sync');
    if (savedViewMode === 'scene') assert.equal(calls[0], 'scene');
    else if (savedViewMode === 'dim') assert.deepEqual(calls[0], ['dim', true]);
    else if (savedViewMode !== 'off') {
      assert.deepEqual(calls[0], ['screen-fill', savedViewMode === 'screen']);
      assert.equal(context.nativeWindowFullscreen, true);
    }
  }
  assert.match(extract('syncFullscreenButtonState'), /localStorage\.setItem\(VIEW_MODE_KEY, fullscreenMode\(\)\)/);
  assert.match(renderer, /getWindowFullscreen\(\)\.then\(isFullscreen => \{\s*nativeWindowFullscreen = Boolean\(isFullscreen\);\s*return restoreViewMode\(\);/);
});
