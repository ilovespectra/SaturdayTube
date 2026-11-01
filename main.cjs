const { app, BrowserWindow, dialog, ipcMain, protocol, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { copyFileIntoShelf, removeFileFromShelf } = require('./shelf-storage.cjs');
const { lookupMetadata: lookupMediaMetadata, parseMetadataFilename } = require('./metadata-service.cjs');
const { readWindowBounds, restoreWindowBounds, writeWindowBounds } = require('./window-state.cjs');
const { CommercialsService } = require('./commercials-service.cjs');
const { scanChannelFolder, createBroadcastSchedule, reconcileChannelPlayback, selectDirectChannelCommercialSources, insideRoot, VIDEO_EXTENSIONS, isMovieOnlyChannel, isMovieExtraPath, isChannelFolder, discoverAdjacent666Channel, resolveChannelCommercialsRoot } = require('./channels-service.cjs');

app.setName(process.env.SATURDAY_TUBE_QA === '1' ? 'Saturday Tube QA' : app.isPackaged ? app.getName() : 'Saturday Tube Dev');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let launchLogPath;
function logLaunch(event, detail = '') {
  const line = `[${new Date().toISOString()}] ${event}${detail ? `: ${detail}` : ''}`;
  console.error(line);
  try {
    const userData = app.getPath('userData');
    fs.mkdirSync(userData, { recursive: true });
    launchLogPath = path.join(userData, 'launch.log');
    fs.appendFileSync(launchLogPath, `${line}\n`);
  } catch (error) {
    console.error('Could not write Saturday Tube launch log', error);
  }
}

process.on('uncaughtException', error => {
  logLaunch('uncaught main-process exception', error?.stack || String(error));
  app.exit(1);
});
process.on('unhandledRejection', reason => {
  logLaunch('unhandled promise rejection', reason?.stack || String(reason));
});
logLaunch('process started', `version=${app.getVersion()} electron=${process.versions.electron} platform=${process.platform} arch=${process.arch}`);

if (!app.requestSingleInstanceLock()) {
  logLaunch('another Saturday Tube instance already owns the lock; exiting');
  app.quit();
  return;
}
logLaunch('single-instance lock acquired', app.getPath('userData'));
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) {
    logLaunch('second launch received while no window exists');
    if (app.isReady()) createWindow();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  logLaunch('existing window focused after second launch');
});

protocol.registerSchemesAsPrivileged([{
  scheme: 'saturday',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);
ipcMain.handle('toggle-window-fullscreen', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return false;
  window.setFullScreen(!window.isFullScreen());
  return !window.isFullScreen();
});
ipcMain.handle('get-window-fullscreen', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return Boolean(window && !window.isDestroyed() && window.isFullScreen());
});

const mediaFiles = new Map();
const commercialMediaFiles = new Map();
let commercialService = null;
let staticInputMedia = null;
const subtitleFiles = new Map();
const libraryRoots = new Map();
const channelRoots = new Map();
const channelDurationCache = new Map();
const MAX_CHANNEL_DURATION_CACHE_ENTRIES = 8000;
function rememberChannelDuration(filePath, entry) {
  channelDurationCache.delete(filePath);
  channelDurationCache.set(filePath, entry);
  while (channelDurationCache.size > MAX_CHANNEL_DURATION_CACHE_ENTRIES) {
    channelDurationCache.delete(channelDurationCache.keys().next().value);
  }
}
let channelDurationCacheLoadPromise = null;
let channelDurationCacheLoaded = false;
const channelCommercialImportJobs = new Map();
const mimeByExt = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.3gp': 'video/3gpp', '.3g2': 'video/3gpp2',
  '.webm': 'video/webm', '.ogv': 'video/ogg', '.ogg': 'video/ogg', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg', '.mpe': 'video/mpeg', '.m2v': 'video/mpeg',
  '.wmv': 'video/x-ms-wmv', '.asf': 'video/x-ms-asf', '.flv': 'video/x-flv', '.f4v': 'video/mp4', '.rm': 'application/vnd.rn-realmedia', '.rmvb': 'application/vnd.rn-realmedia-vbr',
  '.ts': 'video/mp2t', '.mts': 'video/mp2t', '.m2ts': 'video/mp2t', '.vob': 'video/mpeg', '.mxf': 'application/mxf', '.dv': 'video/dv', '.nut': 'video/x-nut',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac', '.flac': 'audio/flac', '.opus': 'audio/ogg', '.aiff': 'audio/aiff', '.wma': 'audio/x-ms-wma', '.alac': 'audio/mp4'
};
const transcodeJobs = new Map();
const MAX_TRANSCODE_CACHE_BYTES = 3 * 1024 ** 3;
const COMMERCIAL_SOURCE_ROOT = '/Volumes/BIGGERDRIVE/WATCH/Commercials';
const MOVIE_TRAILERS_ROOT = '/Volumes/BIGGERDRIVE/WATCH/MoviePreviews';
let movieTrailerCache = null;

function srtToVtt(text) {
  let body = text.replace(/^\uFEFF/, '').replace(/\r/g, '');
  if (!/^\s*WEBVTT/m.test(body)) {
    body = body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    body = body.replace(/^\s*\d+\s*\n(?=\d{2}:\d{2}:\d{2}\.\d{3})/gm, '');
    body = `WEBVTT\n\n${body.trim()}\n`;
  }
  return body;
}

function asResponse(body, status, headers) {
  return new Response(body, { status, headers });
}

async function serveMedia(request, id) {
  const filePath = mediaFiles.get(id);
  if (!filePath) return new Response('Not found', { status: 404 });
  const stat = await fs.promises.stat(filePath);
  const type = mimeByExt[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const baseHeaders = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (request.method === 'HEAD') {
    return asResponse(null, 200, { ...baseHeaders, 'Content-Length': String(stat.size) });
  }
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return asResponse(null, 416, { ...baseHeaders, 'Content-Range': `bytes */${stat.size}` });
    let start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    let end = match[2] && match[1] ? Number(match[2]) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
      return asResponse(null, 416, { ...baseHeaders, 'Content-Range': `bytes */${stat.size}` });
    }
    end = Math.min(end, stat.size - 1);
    const stream = fs.createReadStream(filePath, { start, end });
    return asResponse(Readable.toWeb(stream), 206, {
      ...baseHeaders,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${stat.size}`
    });
  }
  const stream = fs.createReadStream(filePath);
  return asResponse(Readable.toWeb(stream), 200, { ...baseHeaders, 'Content-Length': String(stat.size) });
}

function serveAppAsset(url) {
  const name = decodeURIComponent(url.pathname.slice(1) || 'index.html');
  const appAssets = {
    'index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    'renderer.js': { file: 'renderer.js', type: 'text/javascript; charset=utf-8' },
    'commercial-mode.js': { file: 'commercial-mode.js', type: 'text/javascript; charset=utf-8' },
    'movie-preroll.js': { file: 'movie-preroll.cjs', type: 'text/javascript; charset=utf-8' },
    'styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
    'commercials.css': { file: 'commercials.css', type: 'text/css; charset=utf-8' },
    'assets/materials/loewe-back.jpg': { file: 'assets/materials/loewe-back.jpg', type: 'image/jpeg' },
    'assets/materials/clear-gameboy.jpg': { file: 'assets/materials/clear-gameboy.jpg', type: 'image/jpeg' },
    'assets/materials/philips-chassis.jpg': { file: 'assets/materials/philips-chassis.jpg', type: 'image/jpeg' },
    'assets/materials/chassis-simulation.svg': { file: 'assets/materials/chassis-simulation.svg', type: 'image/svg+xml' },
    'assets/static/analog-tv-static-loop.mp4': { file: 'assets/static/analog-tv-static-loop.mp4', type: 'video/mp4' },
    'assets/static/tv-static-4k-60fps.mp4': { file: 'assets/static/tv-static-4k-60fps.mp4', type: 'video/mp4' },
    'assets/audio/quick/button-click.wav': { file: 'assets/audio/quick/button-click.wav', type: 'audio/wav' },
    'assets/audio/quick/clicking.wav': { file: 'assets/audio/quick/clicking.wav', type: 'audio/wav' },
    'assets/audio/quick/crt-poweroff.wav': { file: 'assets/audio/quick/crt-poweroff.wav', type: 'audio/wav' },
    'assets/audio/quick/crt-poweronanddegause.wav': { file: 'assets/audio/quick/crt-poweronanddegause.wav', type: 'audio/wav' },
    'assets/audio/quick/startup-chiptune.wav': { file: 'assets/audio/quick/startup-chiptune.wav', type: 'audio/wav' },
    'assets/audio/quick/vhs-eject.wav': { file: 'assets/audio/quick/vhs-eject.wav', type: 'audio/wav' },
    'assets/audio/quick/vhs-insert.wav': { file: 'assets/audio/quick/vhs-insert.wav', type: 'audio/wav' },
    'assets/audio/button-click.mp3': { file: 'assets/audio/button-click.mp3', type: 'audio/mpeg' },
    'assets/audio/clicking.mp3': { file: 'assets/audio/clicking.mp3', type: 'audio/mpeg' },
    'assets/audio/crt-cutoff.mp3': { file: 'assets/audio/crt-cutoff.mp3', type: 'audio/mpeg' },
    'assets/audio/crt-hum-loop.wav': { file: 'assets/audio/crt-hum-loop.wav', type: 'audio/wav' },
    'assets/audio/crt-poweroff.mp3': { file: 'assets/audio/crt-poweroff.mp3', type: 'audio/mpeg' },
    'assets/audio/crt-poweronanddegause.mp3': { file: 'assets/audio/crt-poweronanddegause.mp3', type: 'audio/mpeg' },
    'assets/audio/startup-chiptune.mp3': { file: 'assets/audio/startup-chiptune.mp3', type: 'audio/mpeg' },
    'assets/audio/static.mp3': { file: 'assets/audio/static.mp3', type: 'audio/mpeg' },
    'assets/audio/vhs-eject.mp3': { file: 'assets/audio/vhs-eject.mp3', type: 'audio/mpeg' },
    'assets/audio/vhs-insert.mp3': { file: 'assets/audio/vhs-insert.mp3', type: 'audio/mpeg' }
  };
  const asset = appAssets[name];
  if (!asset) return new Response('Not found', { status: 404 });
  const content = fs.readFileSync(path.join(__dirname, asset.file));
  return asResponse(content, 200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store' });
}


function registerMediaFile(filePath) {
  const id = randomUUID();
  mediaFiles.set(id, filePath);
  return { id, url: `saturday://app/media/${id}`, title: path.basename(filePath), path: filePath };
}

async function getMovieTrailers() {
  if (movieTrailerCache) return movieTrailerCache;
  const root = await fs.promises.realpath(MOVIE_TRAILERS_ROOT);
  if (!(await fs.promises.stat(root)).isDirectory()) throw new Error('Movie trailer folder is unavailable.');
  const found = [];
  const visit = async directory => {
    for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) await visit(candidate);
      else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const real = await fs.promises.realpath(candidate).catch(() => null);
        if (real && insideRoot(root, real)) found.push(registerMediaFile(real));
      }
    }
  };
  await visit(root);
  movieTrailerCache = found;
  return found;
}

async function fetchMetadataJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'SaturdayTube/0.8 metadata lookup' } });
    if (!response.ok) throw new Error(`Metadata service returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function lookupMetadata(_event, request) {
  return lookupMediaMetadata(request, fetchMetadataJson);
}

function insideLibraryRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function getManagedTapeShelf(event) {
  const userDataPath = app.getPath('userData');
  await fs.promises.mkdir(userDataPath, { recursive: true });
  const userData = await fs.promises.realpath(userDataPath);
  const requestedRoot = path.join(userData, 'Managed Tapes');
  await fs.promises.mkdir(requestedRoot, { recursive: true });
  const root = await fs.promises.realpath(requestedRoot);
  const stat = await fs.promises.stat(root);
  if (root === userData || !insideLibraryRoot(userData, root) || !stat.isDirectory()) {
    throw new Error('Saturday Tube local tape storage must stay inside this Mac’s app data folder.');
  }
  return root;
}

async function ensureLocalTape(event, filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Choose an available local tape file.');
  const source = await fs.promises.realpath(filePath);
  const sourceStat = await fs.promises.stat(source);
  if (!sourceStat.isFile()) throw new Error('The selected tape is not a file.');
  if (!Object.hasOwn(mimeByExt, path.extname(source).toLowerCase())) {
    const unsupported = new Error('Unsupported video file type.');
    unsupported.code = 'UNSUPPORTED_FILE';
    throw unsupported;
  }
  const managedRoot = await getManagedTapeShelf(event);
  const stored = await copyFileIntoShelf(source, managedRoot, {
    onProgress: ({ copiedBytes, totalBytes }) => sendLibraryImportProgress(event, {
      phase: 'local-copy-progress', name: path.basename(source), copiedBytes, totalBytes
    })
  });
  return {
    ...registerMediaFile(stored.path),
    managedLocalCopy: true,
    sourcePath: stored.copied ? source : null,
    managedRoot,
    copied: stored.copied
  };
}

async function ejectManagedTape(event, filePath) {
  const managedRoot = await getManagedTapeShelf(event);
  return removeFileFromShelf(filePath, managedRoot);
}

async function chooseLibraryFolder(event) {
  const result = await dialog.showOpenDialog({
    title: 'Choose a folder to browse for original tapes',
    buttonLabel: 'Browse this folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const root = await fs.promises.realpath(result.filePaths[0]);
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw new Error('Choose a folder for your local tape shelf.');
  libraryRoots.set(event.sender.id, root);
  return root;
}

function rememberChannelRoot(senderId, root) {
  const roots = channelRoots.get(senderId) || new Set();
  roots.add(root);
  channelRoots.set(senderId, roots);
}

async function restoreChannelDurationCache() {
  if (channelDurationCacheLoaded) return;
  if (!channelDurationCacheLoadPromise) {
    channelDurationCacheLoadPromise = (async () => {
      const cachePath = path.join(app.getPath('userData'), 'channel-duration-cache.json');
      try {
        const saved = JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
        for (const [filePath, entry] of Object.entries(saved || {})) {
          if (typeof filePath === 'string' && path.isAbsolute(filePath) && Number(entry?.size) >= 0
            && Number.isFinite(Number(entry?.modified)) && Number.isFinite(Number(entry?.duration)) && Number(entry.duration) > 0) {
            rememberChannelDuration(filePath, { size: Number(entry.size), modified: Number(entry.modified), duration: Number(entry.duration) });
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('TV channel duration cache could not be restored', error?.message || error);
      }
    })().finally(() => {
      channelDurationCacheLoaded = true;
      channelDurationCacheLoadPromise = null;
    });
  }
  await channelDurationCacheLoadPromise;
}

async function persistChannelDurationCache() {
  const cachePath = path.join(app.getPath('userData'), 'channel-duration-cache.json');
  const entries = [...channelDurationCache.entries()].slice(-MAX_CHANNEL_DURATION_CACHE_ENTRIES);
  const temporary = `${cachePath}.${process.pid}.${randomUUID()}.partial`;
  try {
    await fs.promises.writeFile(temporary, `${JSON.stringify(Object.fromEntries(entries))}\n`, { mode: 0o600 });
    await fs.promises.rename(temporary, cachePath);
  } catch (error) {
    await fs.promises.unlink(temporary).catch(() => {});
    console.warn('TV channel duration cache could not be saved', error?.message || error);
  }
}

async function getReadyChannelCommercials(originalAds) {
  const [library, sources] = await Promise.all([
    commercialService.listLibrary(),
    commercialService.listChannelSources()
  ]);
  const sourcesByPath = new Map(sources.map(source => [path.resolve(source.originalPath), source]));
  const clipsBySource = new Map();
  for (const clip of library.clips || []) {
    const clips = clipsBySource.get(clip.sourceId) || [];
    clips.push(clip);
    clipsBySource.set(clip.sourceId, clips);
  }
  const channelAds = [];
  const readySourcePaths = new Set();
  const matchedSources = new Set();
  let reviewCount = 0;
  for (const item of originalAds) {
    const source = sourcesByPath.get(path.resolve(item.path));
    if (!source) continue;
    matchedSources.add(source.id);
    const readyCountBefore = channelAds.length;
    for (const clip of clipsBySource.get(source.id) || []) {
      if (!clip.enabled || !clip.reviewed || clip.needsReview) {
        if (clip.needsReview && !clip.reviewed) reviewCount += 1;
        continue;
      }
      try {
        const filePath = await commercialService.clipPath(clip.id);
        const media = registerMediaFile(filePath);
        const sourceName = path.basename(item.path, path.extname(item.path));
        channelAds.push({
          ...media,
          path: filePath,
          title: `${sourceName} · ${clip.title}`,
          durationSeconds: Number(clip.durationSeconds),
          channelClipId: clip.id,
          sourceId: source.id
        });
      } catch { /* A missing or incomplete generated clip is not scheduled. */ }
    }
    if (channelAds.length > readyCountBefore) readySourcePaths.add(path.resolve(item.path));
  }
  return { channelAds, readySourcePaths, reviewCount, sourceCount: matchedSources.size };
}

async function importChannelCommercialSources(commercialsRoot, originalAds) {
  if (!commercialsRoot || !originalAds.length) return;
  const sources = await commercialService.listChannelSources();
  const existingByPath = new Map(sources.map(source => [path.resolve(source.originalPath), source]));
  for (const item of originalAds) {
    try {
      const sourcePath = await fs.promises.realpath(item.path);
      if (!insideRoot(commercialsRoot, sourcePath)) continue;
      const stat = await fs.promises.stat(sourcePath);
      const existing = existingByPath.get(path.resolve(sourcePath));
      if (existing && Number(existing.sizeBytes) === stat.size && Math.abs(Number(existing.mtimeMs) - stat.mtimeMs) < 1) continue;
      if (Date.now() - stat.mtimeMs < Number(commercialService.stabilityMs || 90_000)) continue;
      const durationSeconds = Number(item.durationSeconds) > 0
        ? Number(item.durationSeconds)
        : await commercialService.probeDuration(sourcePath);
      if (!(Number(durationSeconds) > 0)) continue;
      if (Number(durationSeconds) > 180) await commercialService.importCompilation(sourcePath);
      else await commercialService.importWatchedFile(commercialsRoot, sourcePath, stat);
    } catch (error) {
      console.warn('A channel commercial source was skipped until complete and reviewable', path.basename(item.path), error?.message || error);
    }
  }
}

function scheduleChannelCommercialImports(commercialsRoot, originalAds) {
  if (!commercialsRoot || !originalAds.length) return;
  const key = path.resolve(commercialsRoot);
  if (channelCommercialImportJobs.has(key)) return;
  const job = new Promise(resolve => {
    const timer = setTimeout(resolve, 2500);
    timer.unref?.();
  }).then(() => importChannelCommercialSources(commercialsRoot, originalAds))
    .catch(error => console.warn('TV channel commercials could not be prepared in the background', error?.message || error))
    .finally(() => channelCommercialImportJobs.delete(key));
  channelCommercialImportJobs.set(key, job);
}

async function scanChannelRoot(root, event) {
  await restoreChannelDurationCache();
  const scanned = await scanChannelFolder(root, {
    registerMedia: registerMediaFile,
    probeCommercials: true,
    probeDuration: async filePath => {
      const stat = await fs.promises.stat(filePath);
      const cached = channelDurationCache.get(filePath);
      if (cached && cached.size === stat.size && cached.modified === stat.mtimeMs) {
        rememberChannelDuration(filePath, cached);
        return cached.duration;
      }
      if (cached) channelDurationCache.delete(filePath);
      const duration = await commercialService.probeDuration(filePath);
      rememberChannelDuration(filePath, { size: stat.size, modified: stat.mtimeMs, duration });
      return duration;
    }
  });
  await persistChannelDurationCache();
  const originalAds = scanned.movieOnly ? [] : (scanned.commercials || []);
  const ready = await getReadyChannelCommercials(originalAds);
  const directAds = selectDirectChannelCommercialSources(originalAds, ready.readySourcePaths);
  scanned.commercials = [...ready.channelAds, ...directAds];
  scanned.commercialCount = scanned.commercials.length;
  scanned.commercialReviewCount = ready.reviewCount;
  scanned.commercialCompilationCount = ready.sourceCount;
  if (!scanned.movieOnly) scheduleChannelCommercialImports(scanned.commercialsRoot, originalAds);
  return scanned;
}

async function chooseChannelFolder(event) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(owner, {
    title: 'Choose a TV channel folder with show subfolders',
    buttonLabel: 'Use as TV channel',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const root = await fs.promises.realpath(result.filePaths[0]);
  if (!(await fs.promises.stat(root)).isDirectory()) throw new Error('Choose a folder for this TV channel.');
  rememberChannelRoot(event.sender.id, root);
  try {
    return await scanChannelRoot(root, event);
  } catch (error) {
    console.warn('A selected TV channel folder could not be scanned yet', path.basename(root), error?.message || error);
    const commercialsRoot = await resolveChannelCommercialsRoot(root).catch(() => null);
    return {
      root,
      name: path.basename(root),
      movieOnly: isMovieOnlyChannel(root),
      commercialsRoot,
      shows: [],
      commercials: [],
      showCount: 0,
      episodeCount: 0,
      commercialCount: 0,
      scanError: true
    };
  }
}

async function discoverSiblingChannels(_event, savedRoots) {
  if (!Array.isArray(savedRoots)) return [];
  const knownRoots = new Set();
  const parentFolders = new Set();
  for (const savedRoot of savedRoots) {
    if (typeof savedRoot !== 'string' || !path.isAbsolute(savedRoot)) continue;
    const root = await fs.promises.realpath(savedRoot).catch(() => null);
    if (!root || !(await fs.promises.stat(root).catch(() => null))?.isDirectory()) continue;
    knownRoots.add(root);
    parentFolders.add(path.dirname(root));
  }
  const discovered = [];
  for (const parent of parentFolders) {
    const entries = await fs.promises.readdir(parent, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name || entry.name.startsWith('.')) continue;
      const candidate = await fs.promises.realpath(path.join(parent, entry.name)).catch(() => null);
      if (!candidate || path.dirname(candidate) !== parent || knownRoots.has(candidate)) continue;
      if (!(await isChannelFolder(candidate))) continue;
      knownRoots.add(candidate);
      discovered.push({ root: candidate, name: path.basename(candidate) });
    }
    const adjacent666 = await discoverAdjacent666Channel(parent);
    if (adjacent666 && !knownRoots.has(adjacent666.root)) {
      knownRoots.add(adjacent666.root);
      discovered.push(adjacent666);
    }
  }
  return discovered.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

async function restoreChannelFolder(event, requestedRoot) {
  if (typeof requestedRoot !== 'string' || !path.isAbsolute(requestedRoot)) throw new Error('Choose or restore this TV channel folder before scanning it.');
  const root = await fs.promises.realpath(requestedRoot).catch(() => null);
  if (!root) throw new Error('This TV channel folder is unavailable. Reconnect its drive or choose the folder again.');
  const stat = await fs.promises.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error('This TV channel path is no longer a folder. Choose the folder again.');
  rememberChannelRoot(event.sender.id, root);
  return root;
}

async function rescanChannelFolder(event, requestedRoot) {
  const trustedRoots = channelRoots.get(event.sender.id);
  if (!trustedRoots || typeof requestedRoot !== 'string' || !trustedRoots.has(path.resolve(requestedRoot))) {
    throw new Error('Choose or restore this TV channel folder before scanning it.');
  }
  const root = await fs.promises.realpath(requestedRoot).catch(() => null);
  if (!root || !trustedRoots.has(root) || !(await fs.promises.stat(root)).isDirectory()) throw new Error('The TV channel folder is unavailable. Reconnect its drive and scan again.');
  return scanChannelRoot(root, event);
}

async function buildChannelRound(event, requestedRoot, requestedShows, requestedCommercials, previousState, minimumDurationSeconds = 0) {
  const trustedRoots = channelRoots.get(event.sender.id);
  if (!trustedRoots || typeof requestedRoot !== 'string' || !trustedRoots.has(path.resolve(requestedRoot))) throw new Error('Choose or restore this TV channel folder before playback.');
  const root = await fs.promises.realpath(requestedRoot).catch(() => null);
  if (!root || !trustedRoots.has(root)) throw new Error('The TV channel folder is unavailable. Reconnect the drive and scan again.');
  const movieOnly = isMovieOnlyChannel(root);
  const shows = [];
  for (const candidate of Array.isArray(requestedShows) ? requestedShows : []) {
    if (typeof candidate?.path !== 'string' || !Array.isArray(candidate.episodes)) continue;
    const showPath = await fs.promises.realpath(candidate.path).catch(() => null);
    if (!showPath) continue;
    const showStat = await fs.promises.stat(showPath).catch(() => null);
    const rootLevelMovie = movieOnly && showPath !== root && path.dirname(showPath) === root && showStat?.isFile()
      && VIDEO_EXTENSIONS.has(path.extname(showPath).toLowerCase()) && !isMovieExtraPath(root, showPath);
    const movieFolder = movieOnly && path.dirname(showPath) === root && showStat?.isDirectory()
      && path.basename(showPath).toLocaleLowerCase('en-US') !== 'commercials' && !isMovieExtraPath(root, showPath);
    const normalShowFolder = !movieOnly && path.dirname(showPath) === root && showStat?.isDirectory()
      && path.basename(showPath).toLocaleLowerCase('en-US') !== 'commercials';
    if (movieOnly ? (!rootLevelMovie && !movieFolder) || candidate.episodes.length !== 1 : !normalShowFolder) continue;
    const episodes = [];
    for (const item of candidate.episodes) {
      if (typeof item?.path !== 'string' || !path.isAbsolute(item.path) || !VIDEO_EXTENSIONS.has(path.extname(item.path).toLowerCase())) continue;
      const filePath = await fs.promises.realpath(item.path).catch(() => null);
      const durationSeconds = Number(item.durationSeconds);
      const insideShow = rootLevelMovie ? filePath === showPath : filePath && insideRoot(showPath, filePath);
      if (!filePath || !insideShow || (movieOnly && isMovieExtraPath(root, filePath))
        || !(await fs.promises.stat(filePath).catch(() => null))?.isFile()
        || !Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;
      episodes.push({ path: filePath, title: path.basename(filePath), durationSeconds });
    }
    if (episodes.length && (!movieOnly || episodes.length === 1)) {
      const name = typeof candidate.name === 'string' && candidate.name ? candidate.name
        : rootLevelMovie ? path.basename(showPath, path.extname(showPath)) : path.basename(showPath);
      shows.push({ path: showPath, name, episodes });
    }
  }
  const commercialsRoot = movieOnly ? null : await resolveChannelCommercialsRoot(root);
  const commercials = [];
  if (commercialsRoot) {
    for (const item of Array.isArray(requestedCommercials) ? requestedCommercials : []) {
      if (typeof item?.channelClipId === 'string') {
        const record = await commercialService.getClipSource(item.channelClipId).catch(() => null);
        const clip = record?.clip;
        const sourcePath = typeof record?.source?.originalPath === 'string' ? await fs.promises.realpath(record.source.originalPath).catch(() => null) : null;
        const filePath = await commercialService.clipPath(item.channelClipId).catch(() => null);
        const actualPath = filePath ? await fs.promises.realpath(filePath).catch(() => null) : null;
        const stat = actualPath ? await fs.promises.stat(actualPath).catch(() => null) : null;
        const durationSeconds = Number(clip?.durationSeconds);
        if (!clip || !clip.enabled || !clip.reviewed || clip.needsReview || record?.source?.status !== 'complete'
          || !sourcePath || !insideRoot(commercialsRoot, sourcePath) || !actualPath || actualPath !== filePath || !stat?.isFile()
          || (item.sourceId && item.sourceId !== clip.sourceId) || !Number.isFinite(durationSeconds) || durationSeconds < 2.5) continue;
        commercials.push({ path: actualPath, title: clip.title, durationSeconds });
        continue;
      }
      const requestedPath = typeof item?.path === 'string' && path.isAbsolute(item.path) ? item.path : '';
      const actualPath = requestedPath ? await fs.promises.realpath(requestedPath).catch(() => null) : null;
      const stat = actualPath ? await fs.promises.stat(actualPath).catch(() => null) : null;
      const durationSeconds = Number(item?.durationSeconds);
      if (!actualPath || !insideRoot(commercialsRoot, actualPath) || !stat?.isFile()
        || !VIDEO_EXTENSIONS.has(path.extname(actualPath).toLowerCase())
        || !Number.isFinite(durationSeconds) || durationSeconds < 2.5 || durationSeconds > 180) continue;
      const media = registerMediaFile(actualPath);
      commercials.push({ ...media, path: actualPath, title: item.title || path.basename(actualPath), durationSeconds });
    }
  }
  return createBroadcastSchedule(shows, commercials, previousState, minimumDurationSeconds);
}

async function restoreLibraryFolder(event, requestedRoot) {
  if (typeof requestedRoot !== 'string' || !path.isAbsolute(requestedRoot)) throw new Error('The saved shelf path is invalid.');
  const root = await fs.promises.realpath(requestedRoot);
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw new Error('The saved shelf is no longer a folder.');
  libraryRoots.set(event.sender.id, root);
  return root;
}

async function browseLibraryFolder(event, requestedPath) {
  const root = libraryRoots.get(event.sender.id);
  if (!root) throw new Error('Choose a folder to open the tape shelves.');
  const destination = await fs.promises.realpath(typeof requestedPath === 'string' ? requestedPath : root);
  if (!insideLibraryRoot(root, destination)) throw new Error('That folder is outside the selected tape shelf.');
  const stat = await fs.promises.stat(destination);
  if (!stat.isDirectory()) throw new Error('That shelf is not a folder.');
  const entries = await fs.promises.readdir(destination, { withFileTypes: true });
  const directories = entries.filter(item => item.isDirectory()).map(item => ({
    name: item.name,
    path: path.join(destination, item.name)
  })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const candidates = entries.filter(item => item.isFile() && Object.hasOwn(mimeByExt, path.extname(item.name).toLowerCase()));
  const visibleFiles = candidates.slice(0, 600);
  const files = await Promise.all(visibleFiles.map(async item => {
    const filePath = path.join(destination, item.name);
    const fileStat = await fs.promises.stat(filePath);
    return { name: item.name, path: filePath, extension: path.extname(item.name).slice(1).toUpperCase(), size: fileStat.size, modified: fileStat.mtimeMs };
  }));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return { root, current: destination, directories, files, omitted: Math.max(0, candidates.length - files.length) };
}

async function openLibraryFiles(event, paths) {
  const root = libraryRoots.get(event.sender.id);
  if (!root || !Array.isArray(paths)) return [];
  const unique = new Set();
  const found = [];
  for (const filePath of paths) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || unique.has(filePath)) continue;
    unique.add(filePath);
    try {
      const actualPath = await fs.promises.realpath(filePath);
      const stat = await fs.promises.stat(actualPath);
      if (!insideLibraryRoot(root, actualPath) || !stat.isFile() || !Object.hasOwn(mimeByExt, path.extname(actualPath).toLowerCase())) continue;
      found.push(await ensureLocalTape(event, actualPath));
    } catch (error) {
      console.warn('A selected tape could not be copied into local storage', error?.message || error);
    }
  }
  return found;
}

function sendLibraryImportProgress(event, progress) {
  try {
    if (event?.sender && !event.sender.isDestroyed()) event.sender.send('library-import-progress', progress);
  } catch { /* A closed window does not cancel or damage an already-running copy. */ }
}

function sendCommercialProgress(event, progress) {
  try {
    if (event?.sender && !event.sender.isDestroyed()) {
      event.sender.send('commercials-progress', progress);
      return;
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('commercials-progress', progress);
    }
  } catch { /* A closed window does not cancel a safe library import. */ }
}

async function getCommercialLibrary() {
  if (!commercialService) throw new Error('Commercial library is not ready yet.');
  const library = await commercialService.listLibrary();
  const clips = await Promise.all(library.clips.map(async clip => {
    const filePath = await commercialService.clipPath(clip.id);
    const stat = await fs.promises.stat(filePath);
    const cached = commercialMediaFiles.get(clip.id);
    let id = cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs ? cached.id : null;
    if (!id) {
      id = registerMediaFile(filePath).id;
      commercialMediaFiles.set(clip.id, { id, size: stat.size, mtimeMs: stat.mtimeMs });
    }
    return { ...clip, url: `saturday://app/media/${id}` };
  }));
  return { ...library, clips };
}

async function importCommercialCompilation(event) {
  const result = await dialog.showOpenDialog({
    title: 'Add a commercial compilation to Saturday Tube',
    buttonLabel: 'Split into commercials',
    properties: ['openFile'],
    filters: [{ name: 'Video compilations', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  const outcome = await commercialService.importCompilation(result.filePaths[0], progress => sendCommercialProgress(event, progress));
  sendCommercialProgress(event, { phase: 'complete', ...outcome });
  return outcome;
}

async function analyzeCommercialBreaks(event, filePath, durationSeconds) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Choose an available local tape.');
  const managedRoot = await getManagedTapeShelf(event);
  const realPath = await fs.promises.realpath(filePath);
  if (!insideLibraryRoot(managedRoot, realPath)) throw new Error('Fade analysis is limited to tapes on this Mac’s Saturday Tube shelf.');
  return commercialService.analyzeProgram(realPath, durationSeconds, progress => sendCommercialProgress(event, progress));
}

function importFailureReason(error) {
  if (error?.code === 'UNSUPPORTED_FILE') return 'Unsupported video file type.';
  if (error?.code === 'ENOSPC') return 'This Mac is low on storage. Free space and retry.';
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'Saturday Tube local storage is not writable.';
  if (['ENOENT', 'ENOTDIR', 'ENODEV'].includes(error?.code)) return 'Source file or local storage is unavailable.';
  if (error?.code === 'EIO') return 'Drive read/write failed. Check the source drive.';
  return 'Copy failed. Check the source and local storage, then retry.';
}

async function importLibraryFiles(event) {
  const root = await getManagedTapeShelf(event);
  sendLibraryImportProgress(event, { phase: 'choosing' });
  const result = await dialog.showOpenDialog({
    title: 'Choose videos to copy into Saturday Tube on this Mac',
    buttonLabel: 'Copy to this Mac',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video and audio', extensions: Object.keys(mimeByExt).map(ext => ext.slice(1)) },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) {
    sendLibraryImportProgress(event, { phase: 'cancelled' });
    return { files: [], copied: 0, alreadyOnShelf: 0, failed: [] };
  }
  const total = result.filePaths.length;
  sendLibraryImportProgress(event, { phase: 'queued', total, names: result.filePaths.map(filePath => path.basename(filePath)) });
  const files = [];
  const failed = [];
  let copied = 0;
  let alreadyOnShelf = 0;
  for (const [index, selectedPath] of result.filePaths.entries()) {
    const name = path.basename(selectedPath);
    sendLibraryImportProgress(event, { phase: 'copying', index, total, name });
    try {
      const source = await fs.promises.realpath(selectedPath);
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() || !Object.hasOwn(mimeByExt, path.extname(source).toLowerCase())) {
        const unsupported = new Error('Unsupported video file type.');
        unsupported.code = 'UNSUPPORTED_FILE';
        throw unsupported;
      }
      sendLibraryImportProgress(event, { phase: 'copying', index, total, name, bytesTotal: stat.size });
      const stored = await copyFileIntoShelf(source, root, {
        onProgress: ({ copiedBytes, totalBytes }) => sendLibraryImportProgress(event, {
          phase: 'copy-progress', index, total, name, copiedBytes, totalBytes
        })
      });
      if (stored.copied) {
        copied += 1;
        sendLibraryImportProgress(event, { phase: 'copied', index, total, name });
      } else {
        alreadyOnShelf += 1;
        sendLibraryImportProgress(event, { phase: 'already-on-shelf', index, total, name });
      }
      files.push({
        ...registerMediaFile(stored.path),
        managedLocalCopy: true,
        sourcePath: stored.copied ? source : null
      });
    } catch (error) {
      console.warn('A selected video could not be copied to the local shelf', error?.message || error);
      failed.push(name);
      sendLibraryImportProgress(event, { phase: 'file-failed', index, total, name, message: importFailureReason(error) });
    }
  }
  sendLibraryImportProgress(event, { phase: 'finished', total, copied, alreadyOnShelf, failed: failed.length });
  return { files, copied, alreadyOnShelf, failed, managedRoot: root };
}

function ffmpegExecutable() {
  const executable = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg')
    : path.join(__dirname, 'vendor', 'ffmpeg', 'ffmpeg');
  if (fs.existsSync(executable)) return executable;
  throw new Error(`The bundled FFmpeg decoder is missing at ${executable}. Restore the vendor/ffmpeg files before running this build.`);
}

function systemFFmpegExecutable() {
  const searchDirectories = [
    ...(process.platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : []),
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean)
  ];
  for (const directory of new Set(searchDirectories)) {
    const candidate = path.join(directory, 'ffmpeg');
    try {
      if (fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
    } catch { /* Try the next standard or PATH location. */ }
  }
  return null;
}

function transcodeExecutableCandidates() {
  let bundled = null;
  try { bundled = ffmpegExecutable(); } catch { /* A complete system FFmpeg may still be available. */ }
  const system = systemFFmpegExecutable();
  const ordered = app.isPackaged ? [bundled, system] : [system, bundled];
  const candidates = [...new Set(ordered.filter(Boolean))];
  if (!candidates.length) ffmpegExecutable();
  return candidates;
}

function runFFmpeg(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-1800); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`)));
  });
}

async function trimTranscodeCache(cacheDir) {
  let entries = await fs.promises.readdir(cacheDir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.filter(entry => entry.isFile() && entry.name.endsWith('.mp4')).map(async entry => {
    const filePath = path.join(cacheDir, entry.name);
    const stat = await fs.promises.stat(filePath).catch(() => null);
    return stat ? { filePath, size: stat.size, mtimeMs: stat.mtimeMs } : null;
  }));
  let total = files.reduce((sum, entry) => sum + (entry?.size || 0), 0);
  for (const entry of files.filter(Boolean).sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= MAX_TRANSCODE_CACHE_BYTES) break;
    await fs.promises.unlink(entry.filePath).catch(() => {});
    total -= entry.size;
  }
}

async function transcodeMedia(_event, id) {
  const source = mediaFiles.get(id);
  if (!source) throw new Error('That tape is no longer available.');
  const stat = await fs.promises.stat(source);
  const key = createHash('sha256').update(`${source}\0${stat.size}\0${stat.mtimeMs}`).digest('hex');
  const cacheDir = path.join(app.getPath('cache'), 'Saturday Tube', 'transcodes');
  const output = path.join(cacheDir, `${key}.mp4`);
  if ((await fs.promises.stat(output).catch(() => null))?.size > 0) return registerMediaFile(output);
  if (transcodeJobs.has(key)) return registerMediaFile(await transcodeJobs.get(key));
  const job = (async () => {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const temporary = path.join(cacheDir, `${key}.${process.pid}.partial.mp4`);
    const executables = transcodeExecutableCandidates();
    const common = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn'];
    const audioTail = ['-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', temporary];
    const videoCodec = await commercialService.probeVideoCodec(source).catch(() => '');
    let lastError = null;
    for (const executable of executables) {
      const attempts = videoCodec === 'h264'
        ? [[...common, '-c:v', 'copy', ...audioTail], [...common, '-c:v', 'h264_videotoolbox', '-b:v', '2500k', '-pix_fmt', 'yuv420p', '-tag:v', 'avc1', ...audioTail]]
        : [[...common, '-c:v', 'h264_videotoolbox', '-b:v', '2500k', '-pix_fmt', 'yuv420p', '-tag:v', 'avc1', ...audioTail]];
      for (const args of attempts) {
        try {
          await runFFmpeg(executable, args);
          const convertedStat = await fs.promises.stat(temporary);
          if (convertedStat.size > MAX_TRANSCODE_CACHE_BYTES) throw new Error('Converted copy would exceed the 3 GB temporary-cache limit.');
          await fs.promises.rename(temporary, output);
          await trimTranscodeCache(cacheDir);
          return output;
        } catch (error) {
          lastError = error;
          await fs.promises.unlink(temporary).catch(() => {});
        }
      }
    }
    throw new Error(`Could not make a browser-compatible copy. Tried ${executables.map(path.basename).join(' and ')}. The file may be damaged or unsupported, or macOS H.264 encoding may be unavailable. ${String(lastError?.message || lastError || '').slice(-220)}`);
  })();
  transcodeJobs.set(key, job);
  try { return registerMediaFile(await job); }
  finally { transcodeJobs.delete(key); }
}

async function getMediaAudioCodec(_event, id) {
  const source = mediaFiles.get(id);
  if (!source) throw new Error('That tape is no longer available.');
  return commercialService.probeAudioCodec(source);
}

async function restoreVideos(paths) {
  if (!Array.isArray(paths)) return [];
  const restored = [];
  const seen = new Set();
  for (const filePath of paths) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    restored.push(registerMediaFile(filePath));
  }
  return restored;
}
async function openSubtitle() {
  const result = await dialog.showOpenDialog({
    title: 'Choose a subtitle file',
    properties: ['openFile'],
    filters: [{ name: 'Subtitle files', extensions: ['srt', 'vtt'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const id = randomUUID();
  const text = await fs.promises.readFile(filePath, 'utf8');
  subtitleFiles.set(id, srtToVtt(text));
  return { url: `saturday://app/subtitle/${id}`, title: path.basename(filePath) };
}

function createWindow() {
  const windowBoundsPath = path.join(app.getPath('userData'), 'window-bounds.json');
  const restoredBounds = restoreWindowBounds(readWindowBounds(windowBoundsPath), {
    displays: screen.getAllDisplays(),
    primaryDisplay: screen.getPrimaryDisplay(),
    defaultBounds: { width: 1280, height: 820 },
    minWidth: 900,
    minHeight: 640
  });
  const win = new BrowserWindow({
    ...restoredBounds,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#11120f',
    title: app.getName(),
    // Show immediately; a stalled renderer must not leave only a bouncing Dock icon.
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  let boundsSaveTimer = null;
  const saveWindowBounds = () => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
    boundsSaveTimer = null;
    if (win.isDestroyed() || win.isMinimized() || win.isMaximized() || win.isFullScreen()) return;
    try {
      writeWindowBounds(windowBoundsPath, win.getBounds());
    } catch (error) {
      logLaunch('window bounds could not be saved', error?.message || String(error));
    }
  };
  const scheduleWindowBoundsSave = () => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
    boundsSaveTimer = setTimeout(saveWindowBounds, 250);
    boundsSaveTimer.unref?.();
  };
  win.on('move', scheduleWindowBoundsSave);
  win.on('resize', scheduleWindowBoundsSave);
  win.on('enter-full-screen', () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('window-fullscreen-change', true);
  });
  win.on('leave-full-screen', () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('window-fullscreen-change', false);
    scheduleWindowBoundsSave();
  });
  win.on('close', saveWindowBounds);
  win.webContents.on('before-input-event', (event, input) => {
    const modifier = process.platform === 'darwin' ? input.meta : input.control;
    if (input.type !== 'keyDown' || !modifier || input.alt || input.shift || String(input.key).toLowerCase() !== 'f') return;
    event.preventDefault();
    win.setFullScreen(!win.isFullScreen());
  });
  let mainFrameLoaded = false;
  let fallbackShown = false;
  const showStartupFallback = reason => {
    if (fallbackShown || win.isDestroyed()) return;
    fallbackShown = true;
    const detail = String(reason || 'Unknown loading error').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const fallback = `<!doctype html><meta charset="utf-8"><title>Saturday Tube startup</title><body style="margin:0;background:#171610;color:#f3e8c8;font:18px system-ui;padding:36px"><h1>Saturday Tube opened, but its screen did not load.</h1><p>${detail}</p><p>Startup details are recorded in this Mac user's Saturday Tube launch.log.</p></body>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallback)}`).catch(error => {
      logLaunch('startup fallback failed', error?.stack || String(error));
    });
  };
  win.webContents.once('dom-ready', () => logLaunch('renderer DOM ready'));
  win.webContents.on('did-finish-load', () => {
    if (!fallbackShown) mainFrameLoaded = true;
    win.webContents.send('window-fullscreen-change', win.isFullScreen());
    logLaunch('window load finished', win.webContents.getURL());
  });
  win.webContents.on('console-message', event => {
    if (event && event.level >= 2) {
      logLaunch('renderer console error', `${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logLaunch('renderer preload failed', `${preloadPath}: ${error?.stack || String(error)}`);
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logLaunch('window load failed', `${errorCode} ${errorDescription} ${validatedURL}`);
    if (errorCode !== -3) showStartupFallback(errorDescription);
  });
  const startupTimer = setTimeout(() => {
    if (!mainFrameLoaded) {
      logLaunch('renderer startup timed out', win.webContents.getURL());
      showStartupFallback('The player screen did not finish loading within 12 seconds. Check launch.log for details.');
    }
  }, 12000);
  startupTimer.unref?.();
  win.webContents.once('did-finish-load', () => clearTimeout(startupTimer));
  win.loadURL('saturday://app/index.html').catch(error => {
    logLaunch('window load rejected', error?.stack || String(error));
    showStartupFallback(error?.message || String(error));
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('render-process-gone', (_event, details) => {
    logLaunch('renderer stopped', JSON.stringify(details));
  });
}

app.on('before-quit', () => commercialService?.stopWatchingFolder());

app.whenReady().then(() => {
  logLaunch('Electron ready');
  commercialService = new CommercialsService(path.join(app.getPath('userData'), 'Commercial Library'));
  commercialService.startWatchingFolder(COMMERCIAL_SOURCE_ROOT, progress => {
    sendCommercialProgress(null, progress);
    if (progress.phase === 'watch-import-complete') logLaunch('commercial file added from watched folder', progress.title);
    else if (progress.phase === 'watch-folder-unavailable') logLaunch('commercial source folder unavailable', progress.message);
  });
  try {
    logLaunch('bundled FFmpeg decoder ready', ffmpegExecutable());
  } catch (error) {
    logLaunch('bundled FFmpeg decoder unavailable', error?.message || String(error));
  }
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(path.join(__dirname, 'assets', 'SaturdayTube.png'));
      logLaunch('custom Dock icon applied');
    } catch (error) {
      logLaunch('custom Dock icon failed', error?.stack || String(error));
    }
  }
  protocol.handle('saturday', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'media' && parts[1]) return await serveMedia(request, parts[1]);
      if (parts[0] === 'subtitle' && parts[1]) {
        const vtt = subtitleFiles.get(parts[1]);
        return vtt ? asResponse(vtt, 200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store' }) : new Response('Not found', { status: 404 });
      }
      return serveAppAsset(url);
    } catch (error) {
      console.error('Saturday Tube media request failed', error);
      return new Response('The selected local file could not be read.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  });
  staticInputMedia = registerMediaFile(path.join(__dirname, 'assets', 'static', 'tv-static-4k-60fps.mp4'));
  ipcMain.handle('get-static-input', () => staticInputMedia);
  ipcMain.handle('get-movie-trailers', getMovieTrailers);
  ipcMain.handle('choose-channel-folder', chooseChannelFolder);
  ipcMain.handle('discover-sibling-channels', discoverSiblingChannels);
  ipcMain.handle('restore-channel-folder', restoreChannelFolder);
  ipcMain.handle('rescan-channel-folder', rescanChannelFolder);
  ipcMain.handle('build-channel-round', buildChannelRound);
  ipcMain.handle('reconcile-channel-playback', (_event, shows, commercials, savedState) => reconcileChannelPlayback(shows, commercials, savedState));
  ipcMain.handle('get-commercial-library', getCommercialLibrary);
  ipcMain.handle('import-commercial-compilation', importCommercialCompilation);
  ipcMain.handle('analyze-commercial-breaks', analyzeCommercialBreaks);
  ipcMain.handle('update-commercial-clip', (_event, id, patch) => commercialService.updateClip(id, patch));
  ipcMain.handle('retime-commercial-clip', (_event, id, start, end) => commercialService.retimeClip(id, start, end));
  ipcMain.handle('restore-videos', (_event, paths) => restoreVideos(paths));
  ipcMain.handle('get-managed-tape-shelf', async event => {
    const root = await getManagedTapeShelf();
    libraryRoots.set(event.sender.id, root);
    return root;
  });
  ipcMain.handle('ensure-local-tape', ensureLocalTape);
  ipcMain.handle('eject-managed-tape', ejectManagedTape);
  ipcMain.handle('transcode-media', transcodeMedia);
  ipcMain.handle('get-media-audio-codec', getMediaAudioCodec);
  ipcMain.on('channel-tune-metric', (_event, metric) => {
    const allowedStages = new Set(['click', 'metadata', 'playing', 'first-frame', 'play-stalled', 'source-error', 'transcode-start', 'transcode-ready', 'transcode-error']);
    if (!metric || !allowedStages.has(metric.stage)) return;
    const channel = typeof metric.channel === 'string' ? metric.channel.slice(0, 48) : 'Unknown';
    const source = typeof metric.source === 'string' ? metric.source.slice(0, 80) : '';
    const elapsedMs = Number(metric.elapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 1_800_000) return;
    const details = { channel, stage: metric.stage, elapsedMs: Math.round(elapsedMs), ...(source ? { source } : {}) };
    if (metric.stage === 'play-stalled') {
      const boundedInteger = (value, maximum) => Math.max(0, Math.min(maximum, Math.trunc(Number(value) || 0)));
      const boundedSeconds = value => {
        const seconds = Number(value);
        return Number.isFinite(seconds) ? Math.max(0, Math.min(172_800, seconds)) : 0;
      };
      Object.assign(details, {
        readyState: boundedInteger(metric.readyState, 4),
        networkState: boundedInteger(metric.networkState, 3),
        errorCode: boundedInteger(metric.errorCode, 4),
        currentTime: boundedSeconds(metric.currentTime),
        duration: boundedSeconds(metric.duration)
      });
    }
    logLaunch('channel tune timing', JSON.stringify(details));
  });
  ipcMain.handle('choose-library-folder', chooseLibraryFolder);
  ipcMain.handle('restore-library-folder', restoreLibraryFolder);
  ipcMain.handle('browse-library-folder', (event, folderPath) => browseLibraryFolder(event, folderPath));
  ipcMain.handle('open-library-files', openLibraryFiles);
  ipcMain.handle('import-library-files', importLibraryFiles);
  ipcMain.handle('lookup-metadata', lookupMetadata);
  ipcMain.on('parse-metadata-filename', (event, filename) => {
    event.returnValue = parseMetadataFilename(filename);
  });
  ipcMain.handle('open-subtitle', openSubtitle);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('child-process-gone', (_event, details) => {
  logLaunch('child process stopped', JSON.stringify(details));
});
app.whenReady().catch(error => {
  logLaunch('Electron startup failed', error?.stack || String(error));
  app.exit(1);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
