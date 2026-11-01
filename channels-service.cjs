const fs = require('node:fs/promises');
const path = require('node:path');

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.mov', '.3gp', '.3g2', '.webm', '.ogv', '.ogg', '.mkv',
  '.avi', '.mpeg', '.mpg', '.mpe', '.m2v', '.wmv', '.asf', '.flv', '.f4v',
  '.rm', '.rmvb', '.ts', '.mts', '.m2ts', '.vob', '.mxf', '.dv', '.nut'
]);
function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const sample = Number(random());
    const other = Math.max(0, Math.min(index, Math.floor((Number.isFinite(sample) ? sample : 0) * (index + 1))));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

const EPISODE_ORDER_VERSION = 'season-episode-v1';
const MAX_DIRECT_CHANNEL_AD_SECONDS = 180;
const MAX_DIRECT_CHANNEL_ADS = 120;
function selectDirectChannelCommercialSources(originalAds, readySourcePaths = new Set()) {
  const ready = readySourcePaths instanceof Set ? readySourcePaths : new Set(readySourcePaths || []);
  return (Array.isArray(originalAds) ? originalAds : [])
    .filter(item => typeof item?.path === 'string' && Number.isFinite(Number(item.durationSeconds))
      && Number(item.durationSeconds) >= 2.5 && Number(item.durationSeconds) <= MAX_DIRECT_CHANNEL_AD_SECONDS
      && !ready.has(path.resolve(item.path)))
    .slice(0, MAX_DIRECT_CHANNEL_ADS)
    .map(item => ({
      ...item,
      title: item.title || path.basename(item.path),
      durationSeconds: Number(item.durationSeconds),
      mediaDurationSeconds: Number(item.durationSeconds),
      segmentType: 'commercial',
      channelMedia: true,
      channelAd: true
    }));
}

function episodeCoordinates(item) {
  const source = String(item?.path || item?.title || '');
  const fileName = path.basename(source, path.extname(source));
  let season = null;
  for (const directory of source.split(path.sep).slice(0, -1).reverse()) {
    const match = directory.match(/(?:^|[^a-z0-9])season[ ._-]*0*(\d{1,3})(?:$|[^a-z0-9])/i);
    if (match) { season = Number(match[1]); break; }
  }
  let episode = null;
  const seasonEpisode = fileName.match(/(?:^|[^a-z0-9])s\s*0*(\d{1,3})[\s._-]*e\s*0*(\d{1,4})(?:$|[^a-z0-9])/i);
  const xEpisode = fileName.match(/(?:^|[^a-z0-9])0*(\d{1,3})\s*x\s*0*(\d{1,4})(?:$|[^a-z0-9])/i);
  const namedEpisode = fileName.match(/(?:^|[^a-z0-9])(?:episode|ep|part)[ ._-]*0*(\d{1,4})(?:$|[^a-z0-9])/i)
    || fileName.match(/^\s*0*(\d{1,4})[ ._-]+/);
  if (seasonEpisode) { season = Number(seasonEpisode[1]); episode = Number(seasonEpisode[2]); }
  else if (xEpisode) { season = Number(xEpisode[1]); episode = Number(xEpisode[2]); }
  else if (namedEpisode) episode = Number(namedEpisode[1]);
  return { season, episode, fileName };
}

function compareEpisodeOrder(left, right) {
  const a = episodeCoordinates(left);
  const b = episodeCoordinates(right);
  if (a.season !== null && b.season !== null && a.season !== b.season) return a.season - b.season;
  if (a.episode !== null && b.episode !== null && a.episode !== b.episode) return a.episode - b.episode;
  const titleOrder = a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
  return titleOrder || String(left?.path || '').localeCompare(String(right?.path || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function createChannelRound(shows, previousState = {}, random = Math.random) {
  const usable = (Array.isArray(shows) ? shows : [])
    .filter(show => typeof show?.path === 'string' && Array.isArray(show.episodes) && show.episodes.length)
    .map(show => ({
      path: show.path,
      name: String(show.name || path.basename(show.path)),
      episodes: [...show.episodes].sort(compareEpisodeOrder)
    }));
  const validShows = new Set(usable.map(show => show.path));
  const isOrderedState = previousState.episodeOrderVersion === EPISODE_ORDER_VERSION;
  const bags = Object.fromEntries(Object.entries(isOrderedState ? previousState.episodeBags || {} : {})
    .filter(([showPath]) => validShows.has(showPath))
    .map(([showPath, bag]) => [showPath, Array.isArray(bag) ? bag.filter(filePath => usable.find(show => show.path === showPath)?.episodes.some(item => item.path === filePath)) : []]));
  const lastByShow = Object.fromEntries(Object.entries(isOrderedState ? previousState.lastEpisodeByShow || {} : {})
    .filter(([showPath, filePath]) => validShows.has(showPath) && usable.find(show => show.path === showPath)?.episodes.some(item => item.path === filePath)));
  const queue = [];
  for (const show of shuffled(usable, random)) {
    let bag = bags[show.path] || [];
    if (!bag.length) {
      bag = show.episodes.map(item => item.path);
      const lastIndex = show.episodes.findIndex(item => item.path === lastByShow[show.path]);
      if (lastIndex >= 0) {
        const nextIndex = (lastIndex + 1) % show.episodes.length;
        bag = [...show.episodes.slice(nextIndex), ...show.episodes.slice(0, nextIndex)].map(item => item.path);
      }
    }
    const episodePath = bag.shift();
    bags[show.path] = bag;
    lastByShow[show.path] = episodePath;
    const episode = show.episodes.find(item => item.path === episodePath);
    if (episode) queue.push({ ...episode, showName: show.name, showPath: show.path, channelMedia: true, managedLocalCopy: false, unavailable: false });
  }
  return {
    round: Math.max(0, Number(previousState.round) || 0) + 1,
    episodeOrderVersion: EPISODE_ORDER_VERSION,
    queue,
    cursor: 0,
    episodeBags: bags,
    lastEpisodeByShow: lastByShow
  };
}

function restoreChannelQueue(shows, savedState = {}) {
  const byPath = new Map((shows || []).flatMap(show => show.episodes.map(episode => [episode.path, { ...episode, showName: show.name, showPath: show.path, channelMedia: true, managedLocalCopy: false, unavailable: false }])));
  const queuePaths = Array.isArray(savedState.queuePaths) ? savedState.queuePaths.slice(0, 300) : [];
  const queue = queuePaths.map(filePath => byPath.get(filePath)).filter(Boolean);
  if (!queue.length) return null;
  const cursor = Math.max(0, Math.min(queue.length - 1, Math.trunc(Number(savedState.cursor) || 0)));
  return {
    round: Math.max(0, Number(savedState.round) || 0),
    queue,
    cursor,
    episodeBags: savedState.episodeBags && typeof savedState.episodeBags === 'object' ? savedState.episodeBags : {},
    lastEpisodeByShow: savedState.lastEpisodeByShow && typeof savedState.lastEpisodeByShow === 'object' ? savedState.lastEpisodeByShow : {},
    currentTime: Math.max(0, Number(savedState.currentTime) || 0),
    wasPlaying: savedState.wasPlaying === true
  };
}

const AD_SECONDS_PER_PROGRAM_SECOND = 11 / 49;
const MAX_CHANNEL_UNINTERRUPTED_PROGRAM_SECONDS = 14 * 60;
const MIN_COMMERCIALS_PER_BREAK = 2;
const MAX_BROADCAST_ROUNDS_PER_REQUEST = 1000;
const RECENT_CHANNEL_ADS_TO_AVOID = 8;
function createCommercialSegments(commercials, targetSeconds, random = Math.random, previousState = {}) {
  const byPath = new Map((Array.isArray(commercials) ? commercials : [])
    .filter(item => typeof item?.path === 'string' && Number.isFinite(Number(item.durationSeconds)) && Number(item.durationSeconds) >= 2.5)
    .map(item => [item.path, item]));
  const usable = [...byPath.values()];
  let remaining = Number(targetSeconds);
  const rotation = typeof previousState === 'string' ? { lastCommercialPath: previousState } : (previousState || {});
  const lastPath = typeof rotation.lastCommercialPath === 'string' ? rotation.lastCommercialPath : '';
  let bag = Array.isArray(rotation.commercialBagPaths) ? rotation.commercialBagPaths.filter(filePath => byPath.has(filePath)) : [];
  let recent = Array.isArray(rotation.recentCommercialPaths) ? rotation.recentCommercialPaths.filter(filePath => byPath.has(filePath)) : [];
  const recentLimit = Math.min(RECENT_CHANNEL_ADS_TO_AVOID, Math.max(0, usable.length - 1));
  if (!Number.isFinite(remaining) || remaining <= 0 || !usable.length) {
    return { segments: [], lastPath, commercialBagPaths: bag, recentCommercialPaths: recent.slice(-recentLimit || undefined) };
  }
  const minimumCount = Math.min(MIN_COMMERCIALS_PER_BREAK, usable.length);
  let previousPath = lastPath;
  const segments = [];
  while ((remaining > 0.01 || segments.length < minimumCount) && segments.length < 1000) {
    if (!bag.length) {
      const avoid = new Set(recent.slice(-recentLimit));
      let candidates = usable.filter(item => !avoid.has(item.path));
      if (!candidates.length) candidates = usable.filter(item => item.path !== previousPath);
      if (!candidates.length) candidates = usable;
      bag = shuffled(candidates, random).map(item => item.path);
    }
    const filePath = bag.shift();
    const clip = byPath.get(filePath);
    if (!clip) continue;
    const mediaDurationSeconds = Number(clip.durationSeconds);
    if (!(mediaDurationSeconds > 0)) continue;
    segments.push({
      ...clip,
      title: clip.title || path.basename(clip.path),
      showName: 'COMMERCIALS',
      segmentType: 'commercial',
      channelMedia: true,
      channelAd: true,
      mediaDurationSeconds,
      durationSeconds: mediaDurationSeconds
    });
    previousPath = clip.path;
    recent = recent.filter(recentPath => recentPath !== clip.path);
    recent.push(clip.path);
    if (recentLimit) recent = recent.slice(-recentLimit);
    else recent = [];
    remaining -= mediaDurationSeconds;
  }
  return { segments, lastPath: previousPath, commercialBagPaths: bag, recentCommercialPaths: recent };
}

function createBroadcastSchedule(shows, commercials, previousState = {}, minimumDurationSeconds = 0, random = Math.random) {
  const usableShows = (Array.isArray(shows) ? shows : []).map(show => ({
    ...show,
    episodes: (Array.isArray(show?.episodes) ? show.episodes : []).filter(item => Number.isFinite(Number(item?.durationSeconds)) && Number(item.durationSeconds) > 0)
  })).filter(show => show.episodes.length);
  let rotation = previousState && typeof previousState === 'object' ? previousState : {};
  let lastCommercialPath = typeof rotation.lastCommercialPath === 'string' ? rotation.lastCommercialPath : '';
  let commercialBagPaths = Array.isArray(rotation.commercialBagPaths) ? rotation.commercialBagPaths : [];
  let recentCommercialPaths = Array.isArray(rotation.recentCommercialPaths) ? rotation.recentCommercialPaths : [];
  const queue = [];
  let totalDurationSeconds = 0;
  let roundsAdded = 0;
  let programGroupIndex = 0;
  const minimum = Math.max(0, Number(minimumDurationSeconds) || 0);
  const hasCommercials = (Array.isArray(commercials) ? commercials : [])
    .some(item => typeof item?.path === 'string' && Number(item.durationSeconds) >= 2.5);
  while (roundsAdded < MAX_BROADCAST_ROUNDS_PER_REQUEST && (roundsAdded === 0 || totalDurationSeconds < minimum)) {
    const round = createChannelRound(usableShows, rotation, random);
    if (!round.queue.length) break;
    for (const episode of round.queue) {
      const programDuration = Number(episode.durationSeconds);
      if (!(programDuration > 0)) continue;
      programGroupIndex += 1;
      const regularSegmentCount = Math.max(1, Math.ceil(programDuration / MAX_CHANNEL_UNINTERRUPTED_PROGRAM_SECONDS));
      // Keep one mid-roll and one episode-end break even for a short episode.
      const segmentCount = hasCommercials ? Math.max(2, regularSegmentCount) : regularSegmentCount;
      let sourceStartSeconds = 0;
      for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
        const sourceEndSeconds = segmentIndex === segmentCount - 1
          ? programDuration
          : programDuration * (segmentIndex + 1) / segmentCount;
        const segmentDurationSeconds = sourceEndSeconds - sourceStartSeconds;
        queue.push({
          ...episode,
          title: episode.title || path.basename(episode.path),
          segmentType: 'program',
          channelMedia: true,
          channelAd: false,
          programGroupIndex,
          sourceStartSeconds,
          mediaDurationSeconds: programDuration,
          durationSeconds: segmentDurationSeconds
        });
        totalDurationSeconds += segmentDurationSeconds;
        const adBlock = createCommercialSegments(commercials, segmentDurationSeconds * AD_SECONDS_PER_PROGRAM_SECOND, random, {
          lastCommercialPath,
          commercialBagPaths,
          recentCommercialPaths
        });
        queue.push(...adBlock.segments);
        totalDurationSeconds += adBlock.segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
        lastCommercialPath = adBlock.lastPath;
        commercialBagPaths = adBlock.commercialBagPaths;
        recentCommercialPaths = adBlock.recentCommercialPaths;
        sourceStartSeconds = sourceEndSeconds;
      }
    }
    rotation = { ...round, lastCommercialPath, commercialBagPaths, recentCommercialPaths };
    roundsAdded += 1;
  }
  return {
    round: Math.max(0, Number(rotation.round) || 0),
    queue,
    totalDurationSeconds,
    maxUninterruptedProgramSeconds: MAX_CHANNEL_UNINTERRUPTED_PROGRAM_SECONDS,
    roundsAdded,
    episodeOrderVersion: rotation.episodeOrderVersion || EPISODE_ORDER_VERSION,
    episodeBags: rotation.episodeBags || {},
    lastEpisodeByShow: rotation.lastEpisodeByShow || {},
    lastCommercialPath,
    commercialBagPaths,
    recentCommercialPaths
  };
}

function locateBroadcastSegment(queue, elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  let startSeconds = 0;
  for (let index = 0; index < (Array.isArray(queue) ? queue.length : 0); index += 1) {
    const segment = queue[index];
    const durationSeconds = Number(segment?.durationSeconds);
    if (!(durationSeconds > 0)) continue;
    const endSeconds = startSeconds + durationSeconds;
    if (elapsed < endSeconds) return { index, segment, startSeconds, offsetSeconds: elapsed - startSeconds };
    startSeconds = endSeconds;
  }
  return null;
}

function randomBroadcastOffset(totalDurationSeconds, random = Math.random) {
  const total = Number(totalDurationSeconds);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const sample = Number(random());
  return Math.min(total * (1 - Number.EPSILON), Math.max(0, Number.isFinite(sample) ? sample : 0) * total);
}

const MAX_CHANNEL_QUEUE_ENTRIES = 6000;
const MAX_CHANNEL_PLAY_HISTORY = 1000;
function reconcileChannelPlayback(shows, commercials, savedState = {}) {
  const mediaByPath = new Map();
  for (const show of Array.isArray(shows) ? shows : []) {
    for (const item of Array.isArray(show?.episodes) ? show.episodes : []) {
      if (typeof item?.path === 'string' && Number(item.durationSeconds) > 0) {
        mediaByPath.set(item.path, { ...item, showName: show.name || item.showName || '', showPath: show.path || item.showPath || '', segmentType: 'program' });
      }
    }
  }
  for (const item of Array.isArray(commercials) ? commercials : []) {
    if (typeof item?.path === 'string' && Number(item.durationSeconds) > 0) {
      mediaByPath.set(item.path, { ...item, showName: 'COMMERCIALS', segmentType: 'commercial' });
    }
  }

  const rawSavedQueue = Array.isArray(savedState?.queue) ? savedState.queue : [];
  const droppedQueueSeconds = rawSavedQueue.slice(0, Math.max(0, rawSavedQueue.length - MAX_CHANNEL_QUEUE_ENTRIES))
    .reduce((sum, item) => sum + Math.max(0, Number(item?.durationSeconds) || 0), 0);
  const savedQueue = rawSavedQueue.slice(-MAX_CHANNEL_QUEUE_ENTRIES);
  const oldElapsed = Math.max(0, (Number(savedState?.elapsedSeconds) || 0) - droppedQueueSeconds);
  const restoredQueue = [];
  let oldCursor = 0;
  let newCursor = 0;
  let elapsedSeconds = null;
  let cursorLocated = false;
  let nextSequence = Math.max(0, Math.trunc(Number(savedState?.nextSequence) || 0));

  for (let index = 0; index < savedQueue.length; index += 1) {
    const saved = savedQueue[index];
    const oldDuration = Number(saved?.durationSeconds);
    const oldStart = oldCursor;
    const oldEnd = oldStart + (Number.isFinite(oldDuration) && oldDuration > 0 ? oldDuration : 0);
    const source = typeof saved?.path === 'string' ? mediaByPath.get(saved.path) : null;
    const segmentType = saved?.segmentType === 'commercial' ? 'commercial' : saved?.segmentType === 'program' ? 'program' : '';
    let usable = Boolean(source && segmentType && source.segmentType === segmentType && Number(source.durationSeconds) > 0);
    let durationSeconds = usable ? Number(source.durationSeconds) : 0;
    if (usable) {
      const sourceStartSeconds = segmentType === 'program'
        ? Math.max(0, Number(saved.sourceStartSeconds) || 0)
        : 0;
      const mediaDurationSeconds = Number(source.durationSeconds);
      const availableDurationSeconds = Math.max(0, mediaDurationSeconds - sourceStartSeconds);
      const savedSegmentDuration = Number(saved.durationSeconds);
      const isSplitProgramSegment = segmentType === 'program'
        && (sourceStartSeconds > 0 || (Number.isFinite(savedSegmentDuration) && savedSegmentDuration < mediaDurationSeconds - 0.01));
      durationSeconds = isSplitProgramSegment
        ? Math.min(savedSegmentDuration, availableDurationSeconds)
        : durationSeconds;
      usable = durationSeconds > 0;
      if (usable) {
        const sequence = Number.isFinite(Number(saved.sequence)) ? Math.max(0, Math.trunc(Number(saved.sequence))) : index;
        nextSequence = Math.max(nextSequence, sequence + 1);
        restoredQueue.push({
        ...source,
        title: saved.title || source.title,
        showName: saved.showName || source.showName,
        segmentType,
        sourceStartSeconds,
        durationSeconds,
        mediaDurationSeconds,
        channelMedia: true,
        channelAd: segmentType === 'commercial',
        managedLocalCopy: false,
        unavailable: false,
        sequence,
        programSequence: Math.max(0, Math.trunc(Number(saved.programSequence) || 0)),
        breakSequence: Math.max(0, Math.trunc(Number(saved.breakSequence) || 0)),
        adBreakPosition: Math.max(0, Math.trunc(Number(saved.adBreakPosition) || 0))
        });
        if (oldElapsed < oldStart) newCursor += durationSeconds;
      }
    }

    if (!cursorLocated && oldElapsed >= oldStart && oldElapsed < oldEnd) {
      if (usable) {
        const offset = Math.min(Math.max(0, oldElapsed - oldStart), Math.max(0, durationSeconds - 0.01));
        elapsedSeconds = newCursor + offset;
      } else {
        elapsedSeconds = newCursor;
      }
      cursorLocated = true;
    }
    if (oldElapsed >= oldEnd) {
      oldCursor = oldEnd;
      if (usable) newCursor += 0;
    } else {
      oldCursor = oldEnd;
      if (usable) newCursor += 0;
    }
    // The new timeline cursor advances only for segments strictly before the saved position.
    if (usable && oldElapsed >= oldEnd) newCursor += durationSeconds;
  }
  if (!cursorLocated) elapsedSeconds = newCursor + Math.max(0, oldElapsed - oldCursor);

  const historyEntries = Object.entries(savedState?.playHistory && typeof savedState.playHistory === 'object' ? savedState.playHistory : {})
    .filter(([filePath, entry]) => typeof filePath === 'string' && entry && Number(entry.count) > 0)
    .sort((left, right) => (Number(left[1].lastPlayedAt) || 0) - (Number(right[1].lastPlayedAt) || 0))
    .slice(-MAX_CHANNEL_PLAY_HISTORY);
  const playHistory = Object.fromEntries(historyEntries.map(([filePath, entry]) => [filePath, {
    count: Math.max(1, Math.trunc(Number(entry.count) || 1)),
    lastPlayedAt: Math.max(0, Number(entry.lastPlayedAt) || 0),
    segmentType: entry.segmentType === 'commercial' ? 'commercial' : 'program'
  }]));
  const totalDurationSeconds = restoredQueue.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0);
  return {
    queue: restoredQueue,
    elapsedSeconds: Math.max(0, Number(elapsedSeconds) || 0),
    totalDurationSeconds,
    rotation: savedState?.rotation && typeof savedState.rotation === 'object' ? savedState.rotation : {},
    playHistory,
    lastPlayedSequence: Number.isFinite(Number(savedState?.lastPlayedSequence)) ? Math.trunc(Number(savedState.lastPlayedSequence)) : null,
    nextSequence
  };
}

async function mapLimit(items, limit, callback) {
  const result = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await callback(items[index]);
    }
  }));
  return result;
}

async function findVideoFiles(root, folder) {
  const realRoot = await fs.realpath(root).catch(() => null);
  const firstDirectory = await fs.realpath(folder).catch(() => null);
  if (!realRoot || !firstDirectory || !insideRoot(realRoot, firstDirectory)) return [];
  const pending = [firstDirectory];
  const visited = new Set();
  const files = [];
  while (pending.length) {
    const directory = pending.pop();
    const realDirectory = await fs.realpath(directory).catch(() => null);
    if (!realDirectory || !insideRoot(realRoot, realDirectory) || visited.has(realDirectory)) continue;
    visited.add(realDirectory);
    let entries;
    try { entries = await fs.readdir(realDirectory, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith('.')) continue;
      const candidate = path.join(realDirectory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const realFile = await fs.realpath(candidate).catch(() => null);
        if (realFile && insideRoot(realRoot, realFile)) files.push(realFile);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

function isMovieOnlyChannel(rootPath) {
  return ['hbo', '666'].includes(path.basename(String(rootPath || '')).trim().toLocaleLowerCase('en-US'));
}

function isMovieExtraPath(root, filePath) {
  const segments = path.relative(root, filePath).split(path.sep).filter(Boolean);
  const excluded = /(?:trailer|teaser|preview|featurette|behind[ ._-]*the[ ._-]*scenes|making[ ._-]*of|bonus|extras?|deleted[ ._-]*scenes|interview|promo|tv shows?|television|series|episodes?|season(?:[ ._-]*\d+)?|s\d{1,2}e\d{1,2})/i;
  return segments.some(segment => excluded.test(segment));
}

async function isChannelFolder(rootPath) {
  const root = await fs.realpath(rootPath).catch(() => null);
  if (!root || !(await fs.stat(root).catch(() => null))?.isDirectory()) return false;
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const movieOnly = isMovieOnlyChannel(root);
  if (movieOnly && entries.some(entry => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    && !isMovieExtraPath(root, path.join(root, entry.name)))) return true;
  const showFolders = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')
    && entry.name.toLocaleLowerCase('en-US') !== 'commercials'
    && (!movieOnly || !isMovieExtraPath(root, path.join(root, entry.name))));
  for (const entry of showFolders) {
    const files = (await findVideoFiles(root, path.join(root, entry.name)))
      .filter(filePath => !movieOnly || !isMovieExtraPath(root, filePath));
    if (movieOnly ? files.length === 1 : files.length > 0) return true;
  }
  return false;
}

async function discoverAdjacent666Channel(channelsRootPath) {
  if (typeof channelsRootPath !== 'string' || !path.isAbsolute(channelsRootPath)
    || path.basename(path.resolve(channelsRootPath)).trim().toLocaleLowerCase('en-US') !== 'tv-channels') return null;
  const channelsRoot = await fs.realpath(channelsRootPath).catch(() => null);
  if (!channelsRoot || path.basename(channelsRoot).trim().toLocaleLowerCase('en-US') !== 'tv-channels') return null;
  const expectedParent = path.dirname(channelsRoot);
  const root = await fs.realpath(path.join(expectedParent, '666')).catch(() => null);
  if (!root || path.dirname(root) !== expectedParent || !isMovieOnlyChannel(root) || !(await isChannelFolder(root))) return null;
  return { root, name: path.basename(root) };
}

async function resolveChannelCommercialsRoot(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath) || isMovieOnlyChannel(rootPath)) return null;
  const root = await fs.realpath(rootPath).catch(() => null);
  if (!root) return null;
  let candidate = null;
  if (path.basename(root).trim().toLocaleLowerCase('en-US') === 'comedy central') {
    const sharedDecadeRoot = await fs.realpath(path.join(path.dirname(root), '00s')).catch(() => null);
    if (sharedDecadeRoot && path.dirname(sharedDecadeRoot) === path.dirname(root)
      && path.basename(sharedDecadeRoot).toLocaleLowerCase('en-US') === '00s') {
      candidate = path.join(sharedDecadeRoot, 'Commercials');
    }
  } else {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const local = entries.find(entry => entry.isDirectory() && entry.name.toLocaleLowerCase('en-US') === 'commercials');
    if (local) candidate = path.join(root, local.name);
  }
  if (!candidate) return null;
  const commercialsRoot = await fs.realpath(candidate).catch(() => null);
  const rootStat = commercialsRoot ? await fs.stat(commercialsRoot).catch(() => null) : null;
  if (!commercialsRoot || !rootStat?.isDirectory() || path.basename(commercialsRoot).toLocaleLowerCase('en-US') !== 'commercials') return null;
  if (path.basename(root).trim().toLocaleLowerCase('en-US') === 'comedy central') {
    const decadeRoot = await fs.realpath(path.join(path.dirname(root), '00s')).catch(() => null);
    if (!decadeRoot || path.dirname(commercialsRoot) !== decadeRoot) return null;
  } else if (!insideRoot(root, commercialsRoot)) return null;
  return commercialsRoot;
}

async function scanChannelFolder(rootPath, { registerMedia, probeDuration = async () => null, probeCommercials = true } = {}) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) throw new Error('Choose an available TV channel folder.');
  if (typeof registerMedia !== 'function') throw new Error('Channel media registration is unavailable.');
  const root = await fs.realpath(rootPath);
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error('The saved TV channel path is not a folder.');
  const movieOnly = isMovieOnlyChannel(root);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const directories = entries.filter(item => item.isDirectory() && !item.name.startsWith('.'));
  const commercialsRoot = await resolveChannelCommercialsRoot(root);
  const showDirectories = directories.filter(item => item.name.toLocaleLowerCase('en-US') !== 'commercials')
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const registerFiles = async (filePaths, showName = '', includeDuration = false) => mapLimit(filePaths, 4, async filePath => {
    try {
      const stat = await fs.stat(filePath);
      const media = registerMedia(filePath);
      let durationSeconds = null;
      if (includeDuration) {
        try {
          const duration = Number(await probeDuration(filePath));
          if (Number.isFinite(duration) && duration > 0) durationSeconds = duration;
        } catch { /* Media without readable durations stays out of the schedule. */ }
      }
      return { ...media, size: stat.size, modified: stat.mtimeMs, durationSeconds, ...(showName ? { showName } : {}) };
    } catch { return null; }
  });

  const shows = [];
  for (const directory of showDirectories) {
    const showRoot = await fs.realpath(path.join(root, directory.name)).catch(() => null);
    if (!showRoot || !insideRoot(root, showRoot) || (movieOnly && isMovieExtraPath(root, showRoot))) continue;
    let paths = await findVideoFiles(root, showRoot);
    if (movieOnly) {
      paths = paths.filter(filePath => !isMovieExtraPath(root, filePath));
      if (paths.length !== 1) continue;
    }
    const episodes = (await registerFiles(paths, directory.name, true)).filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
    if (episodes.length) shows.push({ name: directory.name, path: showRoot, episodes });
  }

  if (movieOnly) {
    const rootMovies = entries.filter(entry => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map(entry => path.join(root, entry.name)).filter(filePath => !isMovieExtraPath(root, filePath));
    for (const filePath of rootMovies) {
      const realPath = await fs.realpath(filePath).catch(() => null);
      if (!realPath || !insideRoot(root, realPath)) continue;
      const episode = (await registerFiles([realPath], path.basename(realPath, path.extname(realPath)), true)).filter(Boolean)[0];
      if (episode) shows.push({ name: episode.showName || path.basename(realPath), path: realPath, episodes: [episode] });
    }
  }

  let commercials = [];
  if (!movieOnly && commercialsRoot) {
    const paths = (await findVideoFiles(commercialsRoot, commercialsRoot));
    commercials = (await registerFiles(paths, '', probeCommercials)).filter(Boolean)
      .filter(item => !probeCommercials || Number(item.durationSeconds) >= 2.5)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  }
  return {
    root,
    name: path.basename(root),
    movieOnly,
    commercialsRoot,
    shows,
    commercials,
    episodeCount: shows.reduce((sum, show) => sum + show.episodes.length, 0),
    showCount: shows.length,
    commercialCount: commercials.length
  };
}

module.exports = {
  VIDEO_EXTENSIONS,
  selectDirectChannelCommercialSources,
  createChannelRound,
  restoreChannelQueue,
  createBroadcastSchedule,
  locateBroadcastSegment,
  randomBroadcastOffset,
  reconcileChannelPlayback,
  scanChannelFolder,
  isMovieOnlyChannel,
  isChannelFolder,
  discoverAdjacent666Channel,
  isMovieExtraPath,
  resolveChannelCommercialsRoot,
  insideRoot,
  shuffled
};
