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
    id, name: id, scanComplete: true, shows: [], commercials: [], error: '',
    queue: [{ segmentType: 'program', showPath: 'show', path: `${id}-old` }],
    rotation: { commercialBagPaths: ['old-ad'], episodeBags: { show: ['old-episode'] } },
    playHistory: { old: 1 }, broadcast: {}, savedPlaybackState: { old: true },
    ...extra
  });
  const nodes = new Map();
  const calls = [];
  const channels = [channel('one'), channel('two', { enabled: false, adFree: true, disabledShowPaths: ['excluded'] })];
  const context = {
    channels, channelsStartupReady: true, channelRefreshPromise: null, channelShuffleStatus: '',
    activeChannelId: 'one', selectedInput: 'tv', channelTuneToken: 0,
    activeChannel() { return channels.find(channel => channel.id === context.activeChannelId); },
    locateChannelSegment() { return null; }, broadcastElapsed() { return 0; },
    document: { querySelector(id) {
      if (!nodes.has(id)) nodes.set(id, {});
      return nodes.get(id);
    } },
    console: { error(...args) { calls.push(['error', args[0]]); } },
    renderChannels() { context.updateGuideShuffleControls(); },
    renderTVGuide() { context.updateGuideShuffleControls(); },
    clearChannelVideoForInputChange() { calls.push(['clear', context.activeChannelId]); },
    setTVSearching(value) { calls.push(['search', value]); },
    setStatus(value) { calls.push(['status', value]); },
    releaseChannelRestore() {},
    persistChannels() { calls.push(['save']); },
    startActiveChannel() { calls.push(['tune', context.activeChannelId]); },
    async scanChannel(channel) { calls.push(['scan', channel.id]); channel.scanComplete = true; },
    async initializeChannelBroadcast(channel) {
      calls.push(['build', channel.id]);
      assert.equal(channel.broadcast, null);
      assert.equal(channel.queue.length, 0);
      assert.equal(channel.rotation.commercialBagPaths, undefined, 'old commercial bag is discarded');
      assert.equal(channel.rotation.episodeBags, undefined, 'old show bags are discarded');
      assert.equal(Object.keys(channel.playHistory).length, 0);
      channel.queue = [{ segmentType: 'program', path: `${channel.id}-new` }, { segmentType: 'commercial', path: 'new-ad' }];
      channel.broadcast = {};
    },
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(['unwrapChannelSchedule', 'resetChannelShuffle', 'updateGuideShuffleControls', 'shuffleAllChannels'].map(pick).join('\n'), context);
  return { context, calls, nodes, run: () => context.shuffleAllChannels() };
}

test('Guide exposes global shuffle with progress and uses cached catalogues for all channels, including disabled ones', async () => {
  assert.match(html, /id="tvGuideShuffle"[^>]*>SHUFFLE ALL/);
  assert.match(html, /id="tvGuideShuffleStatus"[^>]*aria-live="polite"/);
  assert.match(source, /'#tvGuideShuffle'\)\.addEventListener\('click', \(\) => \{ void shuffleAllChannels\(\); \}\)/);
  assert.doesNotMatch(pick('shuffleAllChannels'), /rescanChannelFolder|force: true|discoverNewChannels/);
  const { context, calls, nodes, run } = harness();
  await run();
  assert.deepEqual(calls.filter(call => call[0] === 'build'), [['build', 'one'], ['build', 'two']]);
  assert.equal(calls.some(call => call[0] === 'scan'), false);
  assert.deepEqual(calls.filter(call => call[0] === 'tune'), [['tune', 'one']]);
  assert.equal(calls.filter(call => call[0] === 'save').length, 2);
  assert.equal(context.channels[1].enabled, false);
  assert.equal(context.channels[1].adFree, true);
  assert.deepEqual(context.channels[1].disabledShowPaths, ['excluded']);
  assert.equal(nodes.get('#tvGuideShuffleStatus').textContent, 'SHUFFLED 2 CHANNELS + COMMERCIALS');
  assert.equal(nodes.get('#tvGuideShuffle').disabled, false);
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
  assert.equal(nodes.get('#tvGuideAdd').disabled, true);
  assert.equal(nodes.get('#tvGuideShuffle').textContent, 'SHUFFLING…');
  assert.match(nodes.get('#tvGuideShuffleStatus').textContent, /SHUFFLING 1 \/ 2/);
  await run();
  assert.equal(calls.some(call => call[0] === 'build'), false);
  release();
  await pending;
  assert.equal(calls.filter(call => call[0] === 'build').length, 2);
});

test('shuffle scans only unfinished catalogues and reports individual failures while continuing other channels', async () => {
  const { context, calls, nodes, run } = harness({ selectedInput: 'video' });
  context.channels[0].error = 'Drive offline';
  context.channels[1].scanComplete = false;
  await run();
  assert.deepEqual(calls.filter(call => call[0] === 'scan'), [['scan', 'two']]);
  assert.deepEqual(calls.filter(call => call[0] === 'build'), [['build', 'two']]);
  assert.equal(calls.some(call => call[0] === 'clear' || call[0] === 'tune'), false, 'another input is not interrupted');
  assert.equal(calls.filter(call => call[0] === 'error').length, 1);
  assert.match(nodes.get('#tvGuideShuffleStatus').textContent, /SHUFFLED 1 \/ 2 · FAILED: one/);
  assert.equal(nodes.get('#tvGuideShuffle').disabled, false);
  assert.equal(context.channels[0].queue[0].path, 'one-old', 'offline channel keeps its saved schedule');
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
