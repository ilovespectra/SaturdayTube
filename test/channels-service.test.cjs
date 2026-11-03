const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createChannelRound,
  restoreChannelQueue,
  createBroadcastSchedule,
  locateBroadcastSegment,
  randomBroadcastOffset,
  reconcileChannelPlayback,
  scanChannelFolder,
  isMovieOnlyChannel,
  resolveChannelCommercialsRoot,
  isChannelFolder,
  discoverAdjacent666Channel,
  selectDirectChannelCommercialSources
} = require('../channels-service.cjs');

function makeRandom(seed = 7) {
  let value = seed;
  return () => {
    value = (value * 48271) % 0x7fffffff;
    return value / 0x7fffffff;
  };
}

test('each channel round takes one next episode from every enabled show', () => {
  const shows = [
    { name: 'A', path: '/channel/A', episodes: [{ path: '/channel/A/1.mp4' }, { path: '/channel/A/2.mp4' }, { path: '/channel/A/3.mp4' }] },
    { name: 'B', path: '/channel/B', episodes: [{ path: '/channel/B/1.mp4' }, { path: '/channel/B/2.mp4' }] },
    { name: 'C', path: '/channel/C', episodes: [{ path: '/channel/C/1.mp4' }] }
  ];
  let state = {};
  const rounds = [];
  const random = makeRandom();
  for (let index = 0; index < 4; index += 1) {
    const round = createChannelRound(shows, state, random);
    assert.equal(round.queue.length, shows.length);
    assert.deepEqual(new Set(round.queue.map(item => item.showPath)), new Set(shows.map(show => show.path)));
    assert.equal(new Set(round.queue.map(item => item.showPath)).size, shows.length);
    assert.ok(round.queue.every(item => item.channelMedia && item.managedLocalCopy === false));
    rounds.push(round.queue);
    state = round;
  }
  for (const show of shows.slice(0, 2)) {
    const episodes = rounds.map(round => round.find(item => item.showPath === show.path).path);
    assert.notEqual(episodes[0], episodes[1], `${show.name} does not repeat before using its episode bag`);
  }
});

test('broadcast schedules progress seasons in order, start at the earliest episode, and wrap', () => {
  const show = { name: 'Series', path: '/tv/Series', episodes: [
    { path: '/tv/Series/Season 2/Episode 02.mp4', durationSeconds: 100 },
    { path: '/tv/Series/Season 1/Series S01E02.mp4', durationSeconds: 100 },
    { path: '/tv/Series/Season 2/Series S02E01.mp4', durationSeconds: 100 },
    { path: '/tv/Series/Season 1/Episode 01.mp4', durationSeconds: 100 }
  ] };
  const legacyRotation = {
    round: 8,
    episodeBags: { [show.path]: ['/tv/Series/Season 2/Episode 02.mp4'] },
    lastEpisodeByShow: { [show.path]: '/tv/Series/Season 2/Episode 02.mp4' }
  };
  const schedule = createBroadcastSchedule([show], [], legacyRotation, 750, () => 0);
  const programs = schedule.queue.filter(item => item.segmentType === 'program');
  const expected = [
    '/tv/Series/Season 1/Episode 01.mp4',
    '/tv/Series/Season 1/Series S01E02.mp4',
    '/tv/Series/Season 2/Series S02E01.mp4',
    '/tv/Series/Season 2/Episode 02.mp4'
  ];
  assert.equal(schedule.episodeOrderVersion, 'season-episode-v1');
  assert.deepEqual(programs.map(item => item.path), [...expected, ...expected]);
});

test('when episode one is missing, a channel begins at the earliest available episode', () => {
  const show = { name: 'Series', path: '/tv/Series', episodes: [
    { path: '/tv/Series/Season 1/Series S01E04.mp4', durationSeconds: 90 },
    { path: '/tv/Series/Season 1/Series S01E02.mp4', durationSeconds: 90 },
    { path: '/tv/Series/Season 2/Series S02E01.mp4', durationSeconds: 90 }
  ] };
  const schedule = createBroadcastSchedule([show], [], {}, 0, () => 0);
  assert.equal(schedule.queue.find(item => item.segmentType === 'program').path, '/tv/Series/Season 1/Series S01E02.mp4');
});

test('broadcast schedules include timed channel ads and locate elapsed program/ad offsets', () => {
  const shows = [
    { name: 'A', path: '/channel/A', episodes: [
      { path: '/channel/A/1.mp4', durationSeconds: 600 },
      { path: '/channel/A/2.mp4', durationSeconds: 1200 },
      { path: '/channel/A/3.mp4', durationSeconds: 900 }
    ] },
    { name: 'B', path: '/channel/B', episodes: [
      { path: '/channel/B/1.mp4', durationSeconds: 720 },
      { path: '/channel/B/2.mp4', durationSeconds: 840 }
    ] }
  ];
  const commercials = [
    { path: '/channel/Commercials/ad-1.mp4', title: 'Ad 1', durationSeconds: 30 },
    { path: '/channel/Commercials/ad-2.mp4', title: 'Ad 2', durationSeconds: 45 }
  ];
  const first = createBroadcastSchedule(shows, commercials, {}, 0, makeRandom(9));
  const programs = first.queue.filter(item => item.segmentType === 'program');
  const ads = first.queue.filter(item => item.segmentType === 'commercial');
  assert.equal(new Set(programs.map(item => item.path)).size, shows.length, 'first broadcast round includes every show episode');
  assert.ok(programs.every(item => item.durationSeconds <= 14 * 60), 'program segments stay under the uninterrupted-viewing ceiling');
  assert.ok(ads.length > 0);
  assert.ok(ads.every(item => item.channelAd && item.durationSeconds <= item.mediaDurationSeconds));
  for (let index = 0; index < first.queue.length; index += 1) {
    if (first.queue[index].segmentType === 'program') {
      assert.equal(first.queue[index + 1]?.segmentType, 'commercial', 'every program segment is followed by a full ad break');
    }
  }
  const programSeconds = programs.reduce((sum, item) => sum + item.durationSeconds, 0);
  const adSeconds = ads.reduce((sum, item) => sum + item.durationSeconds, 0);
  const targetAdSeconds = programSeconds * 11 / 49;
  assert.ok(adSeconds >= targetAdSeconds, 'complete ads are never shortened to meet the approximate break target');
  assert.ok(adSeconds < targetAdSeconds + Math.max(...commercials.map(item => item.durationSeconds)) * programs.length, 'each full-clip break overshoots by at most one commercial');
  assert.ok(ads.every(item => item.durationSeconds === item.mediaDurationSeconds), 'every scheduled ad plays to its end');
  const firstAdAt = first.queue[0].durationSeconds;
  const insideAd = locateBroadcastSegment(first.queue, firstAdAt + 12);
  assert.equal(insideAd.segment.segmentType, 'commercial');
  assert.equal(insideAd.offsetSeconds, 12);
  const randomOffset = randomBroadcastOffset(first.totalDurationSeconds, () => 0.5);
  assert.ok(randomOffset >= 0 && randomOffset < first.totalDurationSeconds);
  assert.equal(locateBroadcastSegment(first.queue, randomOffset).segment.durationSeconds > 0, true);
  const lateOffset = randomBroadcastOffset(first.totalDurationSeconds, () => 0.999999);
  assert.equal(locateBroadcastSegment(first.queue, lateOffset).segment.segmentType, 'commercial', 'startup may tune in during a commercial');

  const extended = createBroadcastSchedule(shows, commercials, {
    round: first.round,
    episodeBags: first.episodeBags,
    lastEpisodeByShow: first.lastEpisodeByShow,
    lastCommercialPath: first.lastCommercialPath
  }, 6000, makeRandom(10));
  assert.ok(extended.totalDurationSeconds >= 6000);
  assert.ok(extended.roundsAdded > 1, 'wall-clock catch-up can span multiple program/ad rounds');
  const extendedPrograms = extended.queue.filter(item => item.segmentType === 'program');
  const programGroups = [...new Map(extendedPrograms.map(item => [item.programGroupIndex, item])).values()];
  assert.equal(programGroups.length % shows.length, 0);
  for (let offset = 0; offset < programGroups.length; offset += shows.length) {
    assert.deepEqual(new Set(programGroups.slice(offset, offset + shows.length).map(item => item.showPath)), new Set(shows.map(show => show.path)));
  }
});

test('long programs receive shuffled breaks before 15 minutes and resume within split media', () => {
  const shows = [{ name: 'Feature', path: '/tv/Feature', episodes: [
    { path: '/tv/Feature/long.mp4', durationSeconds: 2500 }
  ] }];
  const commercials = Array.from({ length: 12 }, (_, index) => ({
    path: `/tv/Commercials/ad-${index}.mp4`, durationSeconds: 30
  }));
  const schedule = createBroadcastSchedule(shows, commercials, {}, 0, makeRandom(76));
  const programs = schedule.queue.filter(item => item.segmentType === 'program');
  assert.equal(programs.length, 3);
  assert.ok(programs.every(item => item.durationSeconds <= 14 * 60));
  assert.equal(programs.reduce((sum, item) => sum + item.durationSeconds, 0), 2500);
  assert.ok(programs[1].sourceStartSeconds > 800 && programs[1].sourceStartSeconds < 850);
  for (let index = 0; index < schedule.queue.length; index += 1) {
    if (schedule.queue[index].segmentType === 'program') assert.equal(schedule.queue[index + 1]?.segmentType, 'commercial');
  }
  const saved = {
    queue: [
      { path: '/tv/Feature/long.mp4', segmentType: 'program', durationSeconds: 840, sourceStartSeconds: 0, sequence: 1, programSequence: 1 },
      { path: commercials[0].path, segmentType: 'commercial', durationSeconds: 30, sequence: 2, programSequence: 1, breakSequence: 1, adBreakPosition: 1 },
      { path: '/tv/Feature/long.mp4', segmentType: 'program', durationSeconds: 840, sourceStartSeconds: 840, sequence: 3, programSequence: 1 }
    ],
    elapsedSeconds: 870 + 42
  };
  const restored = reconcileChannelPlayback(shows, commercials, saved);
  const current = locateBroadcastSegment(restored.queue, restored.elapsedSeconds);
  assert.equal(current.segment.segmentType, 'program');
  assert.equal(current.segment.sourceStartSeconds, 840);
  assert.equal(current.offsetSeconds, 42);
  assert.ok(current.segment.sourceStartSeconds + current.offsetSeconds < 2500);
});

test('short TV episodes get a scaled mid-roll and an episode-end break', () => {
  const shows = [
    { name: 'Short A', path: '/tv/A', episodes: [{ path: '/tv/A/1.mp4', durationSeconds: 480 }] },
    { name: 'Short B', path: '/tv/B', episodes: [{ path: '/tv/B/1.mp4', durationSeconds: 600 }] },
    { name: 'Short C', path: '/tv/C', episodes: [{ path: '/tv/C/1.mp4', durationSeconds: 840 }] }
  ];
  const ads = [{ path: '/tv/Commercials/whole.mp4', title: 'Whole spot', durationSeconds: 8 }];
  const withAds = createBroadcastSchedule(shows, ads, {}, 0, makeRandom(44));
  const programs = withAds.queue.filter(item => item.segmentType === 'program');
  assert.equal(programs.length, 6, 'each episode has a mid-roll and a resumed segment');
  const pieces = programs.map(item => [item.mediaDurationSeconds, item.sourceStartSeconds, item.durationSeconds])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  assert.deepEqual(pieces, [
    [480, 0, 240], [480, 240, 240], [600, 0, 300], [600, 300, 300], [840, 0, 420], [840, 420, 420]
  ]);
  for (let index = 0; index < withAds.queue.length; index += 1) {
    if (withAds.queue[index].segmentType === 'program') {
      assert.equal(withAds.queue[index + 1]?.segmentType, 'commercial', 'the shuffled break follows the played program segment');
    }
  }
  const breakStarts = withAds.queue.filter((item, index) => item.segmentType === 'commercial'
    && withAds.queue[index - 1]?.segmentType === 'program');
  assert.equal(breakStarts.length, 6, 'every mid-roll and episode end starts a separate break');
  assert.ok(withAds.queue.filter(item => item.segmentType === 'commercial').every(item => item.durationSeconds === item.mediaDurationSeconds));
  const withoutAds = createBroadcastSchedule(shows, [], {}, 0, makeRandom(45));
  assert.equal(withoutAds.queue.some(item => item.segmentType === 'commercial'), false);
  assert.equal(withoutAds.queue.filter(item => item.segmentType === 'program').length, 3, 'uninterrupted episodes stay in one piece without ads');
});

test('programmes under eight minutes air whole with one break afterwards', () => {
  const shows = [{ name: 'Videos', path: '/tv/Videos', episodes: [{ path: '/tv/Videos/song.mp4', durationSeconds: 300 }] }];
  const ads = [{ path: '/tv/Commercials/a.mp4', durationSeconds: 10 }, { path: '/tv/Commercials/b.mp4', durationSeconds: 10 }];
  const schedule = createBroadcastSchedule(shows, ads, {}, 0, makeRandom(9));
  const programs = schedule.queue.filter(item => item.segmentType === 'program');
  assert.equal(programs.length, 1, 'a music video is never split mid-song');
  assert.equal(programs[0].sourceStartSeconds, 0);
  assert.equal(programs[0].durationSeconds, 300);
  assert.equal(schedule.queue[schedule.queue.indexOf(programs[0]) + 1]?.segmentType, 'commercial');
});

test('each available ad break queues two full spots before resuming the same episode', () => {
  const show = { name: 'Cartoon', path: '/tv/Cartoon', episodes: [{ path: '/tv/Cartoon/short.mp4', durationSeconds: 480 }] };
  const ads = [
    { path: '/tv/Commercials/a.mp4', durationSeconds: 30 },
    { path: '/tv/Commercials/b.mp4', durationSeconds: 30 },
    { path: '/tv/Commercials/c.mp4', durationSeconds: 30 }
  ];
  const schedule = createBroadcastSchedule([show], ads, {}, 0, makeRandom(11));
  const queue = schedule.queue;
  const programSegments = queue.filter(item => item.segmentType === 'program');
  assert.equal(programSegments.length, 2);
  assert.equal(programSegments[0].sourceStartSeconds, 0);
  assert.equal(programSegments[1].sourceStartSeconds, 240);
  for (const [index, program] of programSegments.entries()) {
    const segmentIndex = queue.indexOf(program);
    const nextProgramIndex = index + 1 < programSegments.length ? queue.indexOf(programSegments[index + 1]) : queue.length;
    const breakAds = queue.slice(segmentIndex + 1, nextProgramIndex);
    assert.equal(breakAds.length, 2, 'each break queues two spots when multiple spots are available');
    assert.ok(breakAds.every(item => item.segmentType === 'commercial' && item.durationSeconds === item.mediaDurationSeconds));
    assert.equal(new Set(breakAds.map(item => item.path)).size, 2, 'two spots in one break do not repeat');
  }
});

test('short unreviewed Commercials-folder spots are eligible while compilations and reviewed duplicates are not', () => {
  const selected = selectDirectChannelCommercialSources([
    { path: '/TV/Commercials/ad.mp4', durationSeconds: 30, url: 'ad-url' },
    { path: '/TV/Commercials/compilation.mp4', durationSeconds: 240, url: 'compilation-url' },
    { path: '/TV/Commercials/tiny.mp4', durationSeconds: 2, url: 'tiny-url' },
    { path: '/TV/Commercials/reviewed.mp4', durationSeconds: 18, url: 'reviewed-url' }
  ], new Set(['/TV/Commercials/reviewed.mp4']));
  assert.deepEqual(selected.map(item => item.path), ['/TV/Commercials/ad.mp4']);
  assert.equal(selected[0].channelAd, true);
  assert.equal(selected[0].durationSeconds, selected[0].mediaDurationSeconds);
});

test('channel ad rotation shuffles full clips and avoids recent repeats across breaks', () => {
  const shows = Array.from({ length: 12 }, (_, index) => ({
    name: `Show ${index}`,
    path: `/channel/Show ${index}`,
    episodes: [{ path: `/channel/Show ${index}/one.mp4`, durationSeconds: 100 }]
  }));
  const commercials = Array.from({ length: 10 }, (_, index) => ({
    path: `/channel/Commercials/ad-${index}.mp4`,
    title: `Ad ${index}`,
    durationSeconds: 15
  }));
  const schedule = createBroadcastSchedule(shows, commercials, {}, 0, makeRandom(31));
  const ads = schedule.queue.filter(item => item.segmentType === 'commercial');
  const otherChannelSchedule = createBroadcastSchedule(shows, commercials, {}, 0, makeRandom(32));
  assert.notDeepEqual(ads.map(item => item.path), otherChannelSchedule.queue.filter(item => item.segmentType === 'commercial').map(item => item.path), 'independent channels get independently shuffled commercial breaks');
  assert.ok(ads.length >= 20);
  assert.ok(ads.every(item => item.durationSeconds === 15 && item.mediaDurationSeconds === 15));
  for (let index = 8; index < ads.length; index += 1) {
    assert.equal(ads.slice(index - 8, index).some(item => item.path === ads[index].path), false, 'recent eight ads are not reused');
  }
  assert.ok(schedule.recentCommercialPaths.length <= 8);
  assert.ok(schedule.commercialBagPaths.length <= commercials.length);
});

test('saved channel queues restore by path and skip episodes that disappeared', () => {
  const shows = [{ name: 'Cartoon', path: '/tv/Cartoon', episodes: [
    { path: '/tv/Cartoon/one.mp4', url: 'one' },
    { path: '/tv/Cartoon/two.mp4', url: 'two' }
  ] }];
  const restored = restoreChannelQueue(shows, { queuePaths: ['/tv/Cartoon/missing.mp4', '/tv/Cartoon/two.mp4'], cursor: 1, currentTime: 42, wasPlaying: true });
  assert.equal(restored.queue.length, 1);
  assert.equal(restored.queue[0].path, '/tv/Cartoon/two.mp4');
  assert.equal(restored.cursor, 0);
  assert.equal(restored.currentTime, 42);
  assert.equal(restored.wasPlaying, true);
});

test('channel playback recovery preserves program/ad order and exact mid-break offset', () => {
  const shows = [{ name: 'Series', path: '/tv/Series', episodes: [
    { path: '/tv/Series/one.mp4', url: 'one', durationSeconds: 100 },
    { path: '/tv/Series/two.mp4', url: 'two', durationSeconds: 120 }
  ] }];
  const commercials = [{ path: '/ads/a.mp4', url: 'ad', durationSeconds: 30 }];
  const rotation = { round: 4, lastEpisodeByShow: { '/tv/Series': '/tv/Series/two.mp4' }, recentCommercialPaths: ['/ads/a.mp4'] };
  const saved = {
    rotation,
    queue: [
      { path: '/tv/Series/one.mp4', segmentType: 'program', durationSeconds: 100, sequence: 20, programSequence: 3 },
      { path: '/ads/a.mp4', segmentType: 'commercial', durationSeconds: 30, sequence: 21, programSequence: 3, breakSequence: 3, adBreakPosition: 1 },
      { path: '/tv/Series/two.mp4', segmentType: 'program', durationSeconds: 120, sequence: 22, programSequence: 4 }
    ],
    elapsedSeconds: 115,
    playHistory: { '/tv/Series/one.mp4': { count: 2, lastPlayedAt: 1000, segmentType: 'program' } },
    lastPlayedSequence: 21,
    nextSequence: 23,
    nextProgrammeSequence: 4
  };
  const restored = reconcileChannelPlayback(shows, commercials, saved);
  const current = locateBroadcastSegment(restored.queue, restored.elapsedSeconds);
  assert.deepEqual(restored.queue.map(item => item.path), saved.queue.map(item => item.path));
  assert.equal(current.segment.segmentType, 'commercial');
  assert.equal(current.offsetSeconds, 15);
  assert.equal(current.segment.adBreakPosition, 1);
  assert.equal(restored.lastPlayedSequence, 21);
  assert.equal(restored.playHistory['/tv/Series/one.mp4'].count, 2);
  assert.equal(restored.rotation.round, 4);
});

test('refresh reconciliation skips removed media without replaying the next queued item', () => {
  const shows = [{ name: 'Series', path: '/tv/Series', episodes: [
    { path: '/tv/Series/one.mp4', url: 'one', durationSeconds: 100 },
    { path: '/tv/Series/two.mp4', url: 'two', durationSeconds: 120 }
  ] }];
  const saved = {
    queue: [
      { path: '/tv/Series/one.mp4', segmentType: 'program', durationSeconds: 100, sequence: 10 },
      { path: '/tv/Series/removed-ad.mp4', segmentType: 'commercial', durationSeconds: 30, sequence: 11 },
      { path: '/tv/Series/two.mp4', segmentType: 'program', durationSeconds: 120, sequence: 12 }
    ],
    elapsedSeconds: 115,
    rotation: { round: 2 },
    playHistory: { '/tv/Series/one.mp4': { count: 1, lastPlayedAt: 10 } }
  };
  const restored = reconcileChannelPlayback(shows, [], saved);
  const current = locateBroadcastSegment(restored.queue, restored.elapsedSeconds);
  assert.deepEqual(restored.queue.map(item => item.path), ['/tv/Series/one.mp4', '/tv/Series/two.mp4']);
  assert.equal(current.segment.path, '/tv/Series/two.mp4');
  assert.equal(current.offsetSeconds, 0);
  assert.equal(restored.playHistory['/tv/Series/one.mp4'].count, 1);
});

test('refresh reconciliation adopts changed durations while retaining elapsed within current media', () => {
  const shows = [{ name: 'Series', path: '/tv/Series', episodes: [
    { path: '/tv/Series/one.mp4', url: 'one', durationSeconds: 80 },
    { path: '/tv/Series/two.mp4', url: 'two', durationSeconds: 120 }
  ] }];
  const restored = reconcileChannelPlayback(shows, [], {
    queue: [
      { path: '/tv/Series/one.mp4', segmentType: 'program', durationSeconds: 100, sequence: 0 },
      { path: '/tv/Series/two.mp4', segmentType: 'program', durationSeconds: 120, sequence: 1 }
    ],
    elapsedSeconds: 115
  });
  const current = locateBroadcastSegment(restored.queue, restored.elapsedSeconds);
  assert.equal(restored.queue[0].durationSeconds, 80);
  assert.equal(current.segment.path, '/tv/Series/two.mp4');
  assert.equal(current.offsetSeconds, 15);
});

test('Commercials is isolated from shows and channel ads retain their own source paths', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-channel-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dirs = [
    'Nickelodeon/Season 1',
    '90s/Season 2',
    'Commercials/Bumpers'
  ];
  for (const relative of dirs) await fs.mkdir(path.join(root, relative), { recursive: true });
  const media = [
    'Nickelodeon/Season 1/Hey Arnold S01E01.mp4',
    '90s/Season 2/Cartoon 1994.mkv',
    'Commercials/Bumpers/Nick ident.mp4',
    'Commercials/too-short.mp4'
  ];
  for (const relative of media) await fs.writeFile(path.join(root, relative), 'fixture');
  let showDurationCalls = 0;
  let adDurationCalls = 0;
  const scanned = await scanChannelFolder(root, {
    registerMedia: filePath => ({ id: filePath, url: `saturday://test/${encodeURIComponent(filePath)}`, title: path.basename(filePath), path: filePath }),
    probeDuration: async filePath => {
      if (filePath.includes(`${path.sep}Commercials${path.sep}`)) adDurationCalls += 1;
      else showDurationCalls += 1;
      return filePath.includes('too-short') ? 1.8 : 20;
    }
  });
  assert.equal(scanned.showCount, 2);
  assert.equal(scanned.episodeCount, 2);
  assert.equal(scanned.commercialCount, 1);
  assert.deepEqual(scanned.shows.map(show => show.name).sort(), ['90s', 'Nickelodeon']);
  assert.equal(scanned.commercials[0].title, 'Nick ident.mp4');
  assert.ok(scanned.shows.every(show => show.episodes.every(item => !item.path.includes(`${path.sep}Commercials${path.sep}`))));
  assert.ok(scanned.commercials.every(item => item.path.includes(`${path.sep}Commercials${path.sep}`)));
  assert.equal(showDurationCalls, 2, 'episode durations are available for the virtual broadcast clock');
  assert.equal(adDurationCalls, 2, 'channel ad durations are available for scheduled breaks');
  assert.ok(scanned.shows.flatMap(show => show.episodes).every(item => item.durationSeconds === 20));
});

test('TV startup can defer commercial probing until after episode scanning', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-channel-fast-scan-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'Show'), { recursive: true });
  await fs.mkdir(path.join(root, 'Commercials'), { recursive: true });
  await fs.writeFile(path.join(root, 'Show', 'episode.mp4'), 'episode');
  await fs.writeFile(path.join(root, 'Commercials', 'compilation.mp4'), 'commercial');
  let commercialProbes = 0;
  const scanned = await scanChannelFolder(root, {
    registerMedia: filePath => ({ id: filePath, url: 'fixture', title: path.basename(filePath), path: filePath }),
    probeCommercials: false,
    probeDuration: async filePath => {
      if (filePath.includes(`${path.sep}Commercials${path.sep}`)) commercialProbes += 1;
      return 1200;
    }
  });
  assert.equal(scanned.episodeCount, 1);
  assert.equal(scanned.commercialCount, 1, 'unprobed sources remain available for background preparation');
  assert.equal(scanned.commercials[0].durationSeconds, null);
  assert.equal(commercialProbes, 0, 'startup never waits on compilation duration probing');
});

test('a channel with no show or Commercials folders remains a valid empty setup', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-empty-channel-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const scanned = await scanChannelFolder(root, { registerMedia: filePath => ({ id: filePath, url: 'fixture', title: path.basename(filePath), path: filePath }) });
  assert.equal(scanned.showCount, 0);
  assert.equal(scanned.episodeCount, 0);
  assert.equal(scanned.commercialCount, 0);
  assert.deepEqual(scanned.shows, []);
  assert.deepEqual(scanned.commercials, []);
});

test('Comedy Central finds labeled movies through deeply nested directories', async t => {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-nested-movies-')));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const comedyRoot = path.join(parent, 'Comedy Central');
  const nestedFolder = path.join(comedyRoot, 'Movie One', ...Array.from({ length: 12 }, (_, index) => `Disc ${index + 1}`));
  const secondFolder = path.join(comedyRoot, 'Movie Two', 'Blu-ray', 'Feature');
  const adsRoot = path.join(parent, '00s', 'Commercials');
  await fs.mkdir(nestedFolder, { recursive: true });
  await fs.mkdir(secondFolder, { recursive: true });
  await fs.mkdir(adsRoot, { recursive: true });
  const nestedMovie = path.join(nestedFolder, 'Movie One.mp4');
  const secondMovie = path.join(secondFolder, 'Movie Two.mkv');
  const sharedAd = path.join(adsRoot, '2004 spot.mp4');
  await Promise.all([nestedMovie, secondMovie, sharedAd].map(file => fs.writeFile(file, 'fixture')));
  const scanned = await scanChannelFolder(comedyRoot, {
    registerMedia: filePath => ({ id: filePath, url: `saturday://test/${encodeURIComponent(filePath)}`, title: path.basename(filePath), path: filePath }),
    probeDuration: async () => 120
  });
  assert.equal(scanned.showCount, 2);
  assert.equal(scanned.episodeCount, 2);
  assert.deepEqual(scanned.shows.map(show => show.name).sort(), ['Movie One', 'Movie Two']);
  assert.deepEqual(scanned.shows.flatMap(show => show.episodes.map(item => item.path)).sort(), [nestedMovie, secondMovie].sort());
  assert.equal(scanned.commercialCount, 1);
  assert.equal(scanned.commercials[0].path, sharedAd);
  assert.ok(scanned.shows.every(show => show.episodes.every(item => !item.path.includes(`${path.sep}Commercials${path.sep}`))));
});

test('Comedy Central references the sibling 00s commercial folder without copying sources', async t => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-shared-ads-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const comedyRoot = path.join(parent, 'Comedy Central');
  const adRoot = path.join(parent, '00s', 'Commercials');
  await fs.mkdir(path.join(comedyRoot, 'South Park'), { recursive: true });
  await fs.mkdir(adRoot, { recursive: true });
  const episodePath = path.join(comedyRoot, 'South Park', 'episode.mp4');
  const adPath = path.join(adRoot, '2004 commercial.mp4');
  await fs.writeFile(episodePath, 'episode');
  await fs.writeFile(adPath, 'commercial');
  let adProbes = 0;
  const scanned = await scanChannelFolder(comedyRoot, {
    registerMedia: filePath => ({ id: filePath, url: 'fixture', title: path.basename(filePath), path: filePath }),
    probeDuration: async filePath => { if (path.basename(filePath) === '2004 commercial.mp4') adProbes += 1; return 30; }
  });
  assert.equal(scanned.movieOnly, false);
  assert.equal(scanned.commercialsRoot, await fs.realpath(adRoot));
  assert.equal(scanned.commercials[0].path, await fs.realpath(adPath));
  assert.equal(scanned.commercialCount, 1);
  assert.equal(adProbes, 1);
  assert.equal(path.dirname(scanned.commercials[0].path), scanned.commercialsRoot);
});

test('666 adjacent to TV-Channels is discoverable as an ad-free feature channel', async t => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-channel-666-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const channelsRoot = path.join(parent, 'TV-Channels');
  await fs.mkdir(channelsRoot, { recursive: true });
  const root = path.join(parent, '666');
  await fs.mkdir(path.join(root, 'Feature'), { recursive: true });
  await fs.writeFile(path.join(root, 'Feature', 'One.mp4'), 'fixture');
  await fs.mkdir(path.join(root, 'Trailers'), { recursive: true });
  await fs.writeFile(path.join(root, 'Trailers', 'Promo.mp4'), 'fixture');
  assert.equal(await isChannelFolder(root), true);
  assert.deepEqual(await discoverAdjacent666Channel(channelsRoot), { root: await fs.realpath(root), name: '666' });
  assert.equal(await discoverAdjacent666Channel(parent), null, 'the special-case search is limited to a TV-Channels root');
  const scanned = await scanChannelFolder(root, {
    registerMedia: filePath => ({ id: filePath, url: 'fixture', title: path.basename(filePath), path: filePath }),
    probeDuration: async () => 2400
  });
  assert.equal(scanned.movieOnly, true);
  assert.equal(scanned.showCount, 1);
  assert.equal(scanned.episodeCount, 1);
  assert.equal(scanned.commercialCount, 0);
  assert.equal(scanned.commercials.length, 0);
  assert.match(scanned.shows[0].episodes[0].path, /Feature[\\/]One\.mp4$/);
});

test('HBO and 666 scan as feature-only channels with no ad or trailer segments', async t => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-movie-channels-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const hboRoot = path.join(parent, 'HBO');
  const sixRoot = path.join(parent, '666');
  for (const root of [hboRoot, sixRoot]) {
    await fs.mkdir(path.join(root, 'Movie One'), { recursive: true });
    await fs.mkdir(path.join(root, 'TV Shows', 'Season 1'), { recursive: true });
    await fs.mkdir(path.join(root, 'Series of Unfortunate Events', 'Season 1'), { recursive: true });
    await fs.mkdir(path.join(root, 'Ambiguous Movie'), { recursive: true });
    await fs.mkdir(path.join(root, 'Commercials'), { recursive: true });
    await fs.writeFile(path.join(root, 'Movie One', 'feature.mp4'), 'feature');
    await fs.writeFile(path.join(root, 'TV Shows', 'Season 1', 'episode S01E01.mp4'), 'episode');
    await fs.writeFile(path.join(root, 'Series of Unfortunate Events', 'Season 1', 'episode.mp4'), 'episode');
    await fs.writeFile(path.join(root, 'Ambiguous Movie', 'part-one.mp4'), 'feature');
    await fs.writeFile(path.join(root, 'Ambiguous Movie', 'part-two.mp4'), 'extra episode');
    await fs.writeFile(path.join(root, 'Commercials', 'ad.mp4'), 'ad');
    await fs.writeFile(path.join(root, 'Direct Feature.mkv'), 'feature');
    await fs.writeFile(path.join(root, 'Official Trailer.mp4'), 'trailer');
  }
  let blockedMediaProbes = 0;
  const scanned = await scanChannelFolder(hboRoot, {
    registerMedia: filePath => ({ id: filePath, url: 'fixture', title: path.basename(filePath), path: filePath }),
    probeDuration: async filePath => {
      if (/TV Shows|Series of Unfortunate Events|Ambiguous Movie|Commercials|Trailer/i.test(filePath)) blockedMediaProbes += 1;
      return 1000;
    }
  });
  assert.equal(isMovieOnlyChannel(hboRoot), true);
  assert.equal(isMovieOnlyChannel(sixRoot), true);
  assert.equal(scanned.movieOnly, true);
  assert.equal(scanned.commercialsRoot, null);
  assert.equal(scanned.commercialCount, 0);
  assert.deepEqual(scanned.shows.map(show => show.name).sort(), ['Direct Feature', 'Movie One']);
  assert.equal(blockedMediaProbes, 0, 'the scanner does not even probe TV episodes, ambiguous folders, ads, or trailers');
  const schedule = createBroadcastSchedule(scanned.shows, scanned.commercials, {}, 4000, makeRandom(77));
  assert.ok(schedule.queue.length > 2);
  assert.ok(schedule.queue.every(item => item.segmentType === 'program'));
  assert.ok(schedule.queue.every(item => item.channelAd !== true));
  const sixScanned = await scanChannelFolder(sixRoot, {
    registerMedia: filePath => ({ id: filePath, url: 'fixture', title: path.basename(filePath), path: filePath }),
    probeDuration: async () => 1000
  });
  assert.equal(sixScanned.movieOnly, true, '666 inherits the no-commercial, no-trailer movie policy when its folder is registered');
  assert.equal(sixScanned.commercialCount, 0);
});

test('show order is random every round while each show airs its episodes in order', () => {
  const shows = ['Arthur', 'Doug', 'Hey Arnold', 'Rugrats', 'Ren and Stimpy'].map(name => ({
    name, path: `/tv/${name}`,
    episodes: [3, 1, 2].map(number => ({ path: `/tv/${name}/${name} S01E0${number}.mp4`, durationSeconds: 60 }))
  }));
  const random = makeRandom(11);
  let state = {};
  const orders = new Set();
  const aired = Object.fromEntries(shows.map(show => [show.path, []]));
  let previousLast = '';
  for (let round = 0; round < 6; round += 1) {
    const next = createChannelRound(shows, state, random);
    const order = next.queue.map(item => item.showPath);
    if (previousLast) assert.notEqual(order[0], previousLast, 'the show that just aired does not open the next round');
    previousLast = order.at(-1);
    orders.add(order.join('|'));
    for (const item of next.queue) aired[item.showPath].push(path.basename(item.path));
    state = next;
  }
  assert.ok(orders.size > 1, 'show order changes between rounds');
  assert.ok([...orders].some(order => order !== shows.map(show => show.path).sort().join('|')), 'show order is not alphabetical');
  for (const show of shows) {
    assert.deepEqual(aired[show.path].map(name => name.match(/E0(\d)/)[1]), ['1', '2', '3', '1', '2', '3'], `${show.name} plays in episode order`);
  }
});

test('loose videos in the channel folder air in random order without repeats until all have played', () => {
  const titles = ['ABBA - Waterloo', 'Blondie - Atomic', 'Cher - Believe', 'Devo - Whip It', 'Eurythmics - Sweet Dreams', 'Foreigner - Juke Box Hero'];
  const loose = { name: 'MTV', path: '/tv/MTV', loose: true, episodes: titles.map(title => ({ path: `/tv/MTV/${title}.mp4`, durationSeconds: 200 })) };
  const random = makeRandom(5);
  let state = {};
  const aired = [];
  for (let round = 0; round < titles.length * 2; round += 1) {
    const next = createChannelRound([loose], state, random);
    aired.push(path.basename(next.queue[0].path, '.mp4'));
    state = next;
  }
  assert.deepEqual([...aired.slice(0, titles.length)].sort(), titles, 'every video airs once per pass');
  assert.deepEqual([...aired.slice(titles.length)].sort(), titles);
  assert.notDeepEqual(aired.slice(0, titles.length), titles, 'not alphabetical');
  assert.notEqual(aired[titles.length], aired[titles.length - 1], 'no back-to-back repeat across passes');

  const numbered = { ...loose, episodes: [3, 1, 2].map(number => ({ path: `/tv/MTV/Unplugged S01E0${number}.mp4`, durationSeconds: 200 })) };
  state = {};
  const ordered = [];
  for (let round = 0; round < 3; round += 1) {
    const next = createChannelRound([numbered], state, random);
    ordered.push(path.basename(next.queue[0].path, '.mp4'));
    state = next;
  }
  assert.deepEqual(ordered, ['Unplugged S01E01', 'Unplugged S01E02', 'Unplugged S01E03'], 'numbered loose episodes stay in order');
});

test('un-numbered episodes air chronologically by air date or year', () => {
  const show = { name: 'Specials', path: '/tv/Specials', episodes: [
    { path: '/tv/Specials/Zebra Holiday Special (1981).mp4', durationSeconds: 60 },
    { path: '/tv/Specials/Arbor Day 1994-04-29.mp4', durationSeconds: 60 },
    { path: '/tv/Specials/Back to School 1994-09-02.mp4', durationSeconds: 60 },
    { path: '/tv/Specials/Moon Landing 1969.mp4', durationSeconds: 60 }
  ] };
  const schedule = createBroadcastSchedule([show], [], {}, 230, () => 0);
  assert.deepEqual(schedule.queue.filter(item => item.segmentType === 'program').map(item => path.basename(item.path, '.mp4')),
    ['Moon Landing 1969', 'Zebra Holiday Special (1981)', 'Arbor Day 1994-04-29', 'Back to School 1994-09-02']);
});
