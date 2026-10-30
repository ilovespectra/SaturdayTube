const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { copyFileIntoShelf } = require('./shelf-storage.cjs');

app.setName(process.env.SATURDAY_TUBE_QA === '1' ? 'Saturday Tube QA' : app.isPackaged ? 'Saturday Tube Candidate' : 'Saturday Tube Dev');

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

const mediaFiles = new Map();
const subtitleFiles = new Map();
const libraryRoots = new Map();
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
    'styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
    'assets/materials/loewe-back.jpg': { file: 'assets/materials/loewe-back.jpg', type: 'image/jpeg' },
    'assets/materials/clear-gameboy.jpg': { file: 'assets/materials/clear-gameboy.jpg', type: 'image/jpeg' },
    'assets/materials/philips-chassis.jpg': { file: 'assets/materials/philips-chassis.jpg', type: 'image/jpeg' },
    'assets/materials/chassis-simulation.svg': { file: 'assets/materials/chassis-simulation.svg', type: 'image/svg+xml' }
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

function metadataSearchTerms(filename) {
  const basename = path.basename(String(filename || '')).replace(/\.[^.]+$/, '');
  const year = (basename.match(/\b(?:19|20)\d{2}\b/) || [])[0] || '';
  const query = basename
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\b(?:S\d{1,2}E\d{1,2}|\d{1,2}x\d{2})\b/ig, ' ')
    .replace(/\b(?:2160p|1440p|1080p|720p|480p|4k|8k|uhd|hdr|web[- ]?dl|web[- ]?rip|bluray|blu[- ]?ray|brrip|hdtv|dvdrip|x26[45]|h26[45]|hevc|av1|aac|dts|proper|repack|extended|remastered|multi|dubbed|subbed)\b.*$/i, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { query, year };
}

function stripMarkup(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
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

async function lookupMetadata(_event, filename) {
  const { query, year } = metadataSearchTerms(filename);
  if (query.length < 2 || query.length > 100) return null;
  try {
    const shows = await fetchMetadataJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    const match = Array.isArray(shows) && shows.find(result => {
      const premiered = result?.show?.premiered?.slice(0, 4);
      return result?.show?.name && Number(result.score) >= 0.45 && (!year || !premiered || Math.abs(Number(year) - Number(premiered)) <= 2);
    });
    if (match) {
      const show = match.show;
      return {
        title: show.name,
        year: show.premiered?.slice(0, 4) || '',
        kind: show.type || 'TV',
        detail: stripMarkup(show.summary).slice(0, 260),
        image: show.image?.medium || show.image?.original || '',
        url: show.url || '',
        source: 'TVmaze'
      };
    }
  } catch (error) {
    console.warn('TV metadata lookup was unavailable', error?.message || error);
  }
  try {
    const search = await fetchMetadataJson(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(`${query} ${year}`.trim())}&limit=5`);
    const pages = Array.isArray(search?.pages) ? search.pages : [];
    const normalized = query.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const page = pages.find(item => {
      const title = String(item.title || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const searchable = [item.title, item.description, item.excerpt].join(' ').toLocaleLowerCase();
      const yearMatches = !year || new RegExp(`\\b${year}\\b`).test(searchable);
      return (title === normalized || title.includes(normalized)) && yearMatches;
    });
    if (!page) return null;
    let image = page.thumbnail?.source || page.thumbnail?.url || '';
    if (!image && page.key) {
      try {
        const summary = await fetchMetadataJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`);
        image = summary.thumbnail?.source || summary.originalimage?.source || '';
      } catch (error) {
        console.warn('Wikipedia cover lookup was unavailable', error?.message || error);
      }
    }
    return {
      title: page.title || query,
      year: year || ((String(page.description || '').match(/\b(?:19|20)\d{2}\b/) || [])[0] || ''),
      kind: 'Reference',
      detail: stripMarkup(page.description || page.excerpt).slice(0, 260),
      image,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.key || page.title).replace(/ /g, '_'))}`,
      source: 'Wikipedia'
    };
  } catch (error) {
    console.warn('Reference metadata lookup was unavailable', error?.message || error);
    return null;
  }
}

function insideLibraryRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function chooseLibraryFolder(event) {
  const result = await dialog.showOpenDialog({
    title: 'Choose where Saturday Tube should keep imported tapes',
    buttonLabel: 'Use this shelf folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const root = await fs.promises.realpath(result.filePaths[0]);
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw new Error('Choose a folder for your local tape shelf.');
  libraryRoots.set(event.sender.id, root);
  return root;
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
      found.push(registerMediaFile(actualPath));
    } catch { /* A removable drive or file may have disappeared while the shelf was open. */ }
  }
  return found;
}

async function importLibraryFiles(event) {
  const root = libraryRoots.get(event.sender.id);
  if (!root) throw new Error('Set a local shelf destination before importing tapes.');
  const result = await dialog.showOpenDialog({
    title: 'Choose videos to copy onto your Saturday Tube shelf',
    buttonLabel: 'Copy to shelf',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video and audio', extensions: Object.keys(mimeByExt).map(ext => ext.slice(1)) },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return { files: [], copied: 0, alreadyOnShelf: 0, failed: [] };
  const files = [];
  const failed = [];
  let copied = 0;
  let alreadyOnShelf = 0;
  for (const selectedPath of result.filePaths) {
    try {
      const source = await fs.promises.realpath(selectedPath);
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() || !Object.hasOwn(mimeByExt, path.extname(source).toLowerCase())) {
        failed.push(path.basename(selectedPath));
        continue;
      }
      const stored = await copyFileIntoShelf(source, root);
      if (stored.copied) copied += 1;
      else alreadyOnShelf += 1;
      files.push(registerMediaFile(stored.path));
    } catch (error) {
      console.warn('A selected video could not be copied to the local shelf', error?.message || error);
      failed.push(path.basename(selectedPath));
    }
  }
  return { files, copied, alreadyOnShelf, failed };
}

function ffmpegExecutable() {
  const executable = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg')
    : path.join(__dirname, 'vendor', 'ffmpeg', 'ffmpeg');
  if (fs.existsSync(executable)) return executable;
  throw new Error(`The bundled FFmpeg decoder is missing at ${executable}. Restore the vendor/ffmpeg files before running this build.`);
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
    const executable = ffmpegExecutable();
    const common = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn'];
    const tail = ['-pix_fmt', 'yuv420p', '-tag:v', 'avc1', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', temporary];
    try {
      await runFFmpeg(executable, [...common, '-c:v', 'h264_videotoolbox', '-b:v', '2500k', ...tail]);
      const convertedStat = await fs.promises.stat(temporary);
      if (convertedStat.size > MAX_TRANSCODE_CACHE_BYTES) throw new Error('Converted copy would exceed the 3 GB temporary-cache limit.');
      await fs.promises.rename(temporary, output);
      await trimTranscodeCache(cacheDir);
      return output;
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      throw new Error(`Could not make a browser-compatible copy. The file may be damaged or unsupported, or macOS H.264 encoding may be unavailable. ${String(error.message || error).slice(-220)}`);
    }
  })();
  transcodeJobs.set(key, job);
  try { return registerMediaFile(await job); }
  finally { transcodeJobs.delete(key); }
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
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#11120f',
    title: 'Saturday Tube',
    // Show immediately; a stalled renderer must not leave only a bouncing Dock icon.
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
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
    logLaunch('window load finished', win.webContents.getURL());
  });
  win.webContents.on('console-message', event => {
    if (event && event.level >= 2) {
      logLaunch('renderer console error', `${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
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

app.whenReady().then(() => {
  logLaunch('Electron ready');
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
  ipcMain.handle('restore-videos', (_event, paths) => restoreVideos(paths));
  ipcMain.handle('transcode-media', transcodeMedia);
  ipcMain.handle('choose-library-folder', chooseLibraryFolder);
  ipcMain.handle('restore-library-folder', restoreLibraryFolder);
  ipcMain.handle('browse-library-folder', (event, folderPath) => browseLibraryFolder(event, folderPath));
  ipcMain.handle('open-library-files', openLibraryFiles);
  ipcMain.handle('import-library-files', importLibraryFiles);
  ipcMain.handle('lookup-metadata', lookupMetadata);
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
