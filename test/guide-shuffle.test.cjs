const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = name => source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))[0];

function harness(overrides = {}) {
  const channel = (id, extra = {}) => ({
    id, name: id, scanComplete: true, shows: [{ path: `show-${id}`, episodes: [{ path: `${id}-current` }, { path: `${id}-next` }] }], commercials: [], error: '',
    queue: [
      { segmentType: 'program', showPath: `show-${id}`, path: `${id}-current`, programSequence: 1, sequence: 1, durationSeconds: 10 },
      { segmentType: 'commercial', path: `${id}-ad`, programSequence: 1, breakSequence: 2, sequence: 2, durationSeconds: 5 },
      { segmentType: 'program', showPath: `show-${id}`, path: `${id}-next`, programSequence: 2, sequence: 3, durationSeconds: 10 }
    ],
    rotation: { commercialBagPaths: ['old-ad'], episodeBags: { [`show-${id}`]: ['old-episode'] } },
    playHistory: { old: 1 }, broadcast: { startedAtMs: 1000, initialOffsetSeconds: 0, totalDurationSeconds: 25 }, savedPlaybackState: { old: true },
    ...extra
  });
  const nodes = new Map();
  const calls = [];
  const channels = [channel('one'), channel('two', { enabled: false, adFree: true, disabledShowPaths: ['excluded'] })];
  const context = {
    channels, channelsStartupReady: true, channelRefreshPromise: null, channelShuffleStatus: '',
    activeChannelId: 'one', selectedInput: 'tv', channelTuneToken: 0,
    activeChannel() { return channels.find(channel => channel.id === context.activeChannelId); },
    channelShuffleButton: { disabled: false, textContent: '' },
    channelShuffleStatusOutput: { textContent: '' },
    document: { querySelector(id) {
      if (!nodes.has(id)) nodes.set(id, {});
      return nodes.get(id);
    } },
    console: { error(...args) { calls.push(['error', args[0]]); } },
    renderChannels() { context.updateGuideShuffleControls(); },
    renderPlaylist() { calls.push(['playlist']); },
    renderTVGuide() { context.updateGuideShuffleControls(); },
    setStatus(value) { calls.push(['status', value]); },
    persistChannels() { calls.push(['save']); },
    isCurrentChannelPlayback() { return false; },
    channelPlaybackSnapshot(channel) { return { elapsedSeconds: 0, queue: channel.queue }; },
    locateChannelSegment(channel, elapsed) {
      let startSeconds = 0;
      for (let index = 0; index < channel.queue.length; index += 1) {
        const item = channel.queue[index];
        if (elapsed < startSeconds + item.durationSeconds) return { index, segment: item };
        startSeconds += item.durationSeconds;
      }
      return null;
    },
    broadcastElapsed() { return 0; },
    async appendBroadcastCoverage() {},
    async scanChannel(channel) { calls.push(['scan', channel.id]); channel.scanComplete = true; },
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(['channelProgramGroupEnd', 'channelEpisodeIsNumbered', 'shuffleChannelItems', 'shuffleChannelPoolCycles',
    'shuffleChannelScheduleTail', 'updateGuideShuffleControls', 'shuffleAllChannels'].map(pick).join('\n'), context);
  return { context, calls, nodes, run: () => context.shuffleAllChannels() };
}

test('Guide and Settings shuffle all channel lineups without interrupting current playback', async () => {
  assert.match(html, /id="tvGuideShuffle"[^>]*>SHUFFLE ALL/);
  assert.match(html, /id="tvGuideShuffleStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="channelShuffleButton"[^>]*>⤨ SHUFFLE LINEUPS/);
  assert.match(source, /'#tvGuideShuffle'\)\.addEventListener\('click', \(\) => \{ void shuffleAllChannels\(\); \}\)/);
  assert.match(source, /channelShuffleButton\.addEventListener\('click', \(\) => \{ void shuffleAllChannels\(\); \}\)/);
  assert.doesNotMatch(pick('shuffleAllChannels'), /rescanChannelFolder|force: true|discoverNewChannels/);
  const { context, calls, nodes, run } = harness();
  await run();
  assert.equal(calls.some(call => call[0] === 'scan'), false);
  assert.equal(calls.some(call => ['clear', 'tune'].includes(call[0])), false, 'shuffle does not restart or retune playback');
  assert.equal(calls.filter(call => call[0] === 'save').length, 2);
  assert.equal(context.channels[1].enabled, false);
  assert.equal(context.channels[1].adFree, true);
  assert.deepEqual(context.channels[1].disabledShowPaths, ['excluded']);
  assert.equal(nodes.get('#tvGuideShuffleStatus').textContent, 'SHUFFLED 2 CHANNELS · CURRENT PROGRAMMES LEFT ON AIR');
  assert.equal(nodes.get('#tvGuideShuffle').disabled, false);
  assert.equal(context.channelShuffleButton.disabled, false);
  assert.match(context.channelShuffleStatusOutput.textContent, /CURRENT PROGRAMMES LEFT ON AIR/);
  assert.equal(context.channels[0].queue[0].path, 'one-current');
  assert.equal(context.channels[1].queue[0].path, 'two-current');
  assert.equal(context.channels[0].broadcast.startedAtMs, 1000, 'current channel clock stays in place');
  assert.deepEqual(context.channels[0].savedPlaybackState, { old: true }, 'saved playback state is preserved');
  assert.deepEqual(context.channels[0].rotation.episodeBags, { 'show-one': ['old-episode'] }, 'per-channel episode progress stays independent');
  assert.equal(context.channelRefreshPromise, null);
});

test('shuffle waits for existing queue work and prevents a second shuffle or refresh while running', async () => {
  let release;
  const { context, calls, nodes, run } = harness();
  context.channels[0].broadcast.queuePromise = new Promise(resolve => { release = resolve; });
  const pending = run();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(context.channelRefreshPromise);
  assert.equal(nodes.get('#tvGuideShuffle').disabled, true);
  assert.equal(context.channelShuffleButton.disabled, true);
  assert.equal(nodes.get('#tvGuideAdd').disabled, true);
  assert.equal(nodes.get('#tvGuideShuffle').textContent, 'SHUFFLING…');
  assert.match(nodes.get('#tvGuideShuffleStatus').textContent, /SHUFFLING 1 \/ 2/);
  await run();
  release();
  await pending;
  assert.equal(calls.some(call => call[0] === 'build'), false);
});

test('shuffle scans only unfinished catalogues and reports individual failures while continuing other channels', async () => {
  const { context, calls, nodes, run } = harness({ selectedInput: 'video' });
  context.channels[0].error = 'Drive offline';
  context.channels[1].scanComplete = false;
  await run();
  assert.deepEqual(calls.filter(call => call[0] === 'scan'), [['scan', 'two']]);
  assert.equal(context.channels[1].queue[0].path, 'two-current');
  assert.equal(calls.some(call => call[0] === 'clear' || call[0] === 'tune'), false, 'another input is not interrupted');
  assert.equal(calls.filter(call => call[0] === 'error').length, 1);
  assert.match(nodes.get('#tvGuideShuffleStatus').textContent, /SHUFFLED 1 \/ 2 · FAILED: one/);
  assert.equal(nodes.get('#tvGuideShuffle').disabled, false);
  assert.equal(context.channels[0].queue[0].path, 'one-current', 'offline channel keeps its saved schedule');
});

test('shuffle respects startup, refresh and outstanding Guide-edit locks', async () => {
  for (const change of [
    context => { context.channelsStartupReady = false; },
    context => { context.channelRefreshPromise = Promise.resolve(); },
    context => { context.channels[0].adFreeUpdating = true; },
    context => { context.channels[0].guideEditPromise = Promise.resolve(); }
  ]) {
    const { context, calls, run } = harness();
    change(context);
    await run();
    assert.equal(calls.length, 0);
  }
});
