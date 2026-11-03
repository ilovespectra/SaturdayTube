const { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { configureAppIdentity } = require('./app-identity.cjs');
const appIdentity = configureAppIdentity({ app });
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const childProcess = require('node:child_process');
// Every FFmpeg/ffprobe child (conversions, codec probes, break and commercial analysis) is tracked so quitting the app stops
// it; otherwise orphaned conversions keep the drive busy and slow the next launch's first channel. This must run before the
// services below take their own reference to spawn.
const liveChildProcesses = new Set();
const nativeSpawn = childProcess.spawn;
childProcess.spawn = function trackedSpawn(...args) {
  const child = nativeSpawn.apply(this, args);
  liveChildProcesses.add(child);
  child.once('exit', () => liveChildProcesses.delete(child));
  child.once('error', () => liveChildProcesses.delete(child));
  return child;
};
function stopChildProcesses() {
  for (const child of liveChildProcesses) {
    try { child.kill('SIGKILL'); } catch { /* Already gone. */ }
  }
  liveChildProcesses.clear();
}
process.once('exit', stopChildProcesses);
const { spawn } = childProcess;
const { createHash } = require('node:crypto');
const { copyFileIntoShelf, removeFileFromShelf } = require('./shelf-storage.cjs');
const { lookupMetadata: lookupMediaMetadata, parseMetadataFilename } = require('./metadata-service.cjs');
const { readWindowBounds, restoreWindowBounds, writeWindowBounds } = require('./window-state.cjs');
const { CommercialsService } = require('./commercials-service.cjs');
const { ChannelBreakFinder } = require('./channel-breaks.cjs');
const { RemoteServer } = require('./remote-server.cjs');
const { enqueueCommercialFolders, parserFFmpegPaths } = require('./commercial-parser.cjs');
const { scanChannelFolder, createBroadcastSchedule, reconcileChannelPlayback, fillMissingCommercialBreaks, selectDirectChannelCommercialSources, isCommercialReel, isChannelReadyClip, insideRoot, VIDEO_EXTENSIONS, isMovieOnlyChannel, isMovieExtraPath, isChannelFolder, channelDisplayName, channelIdentity, compareChannelFolders, discoverAdjacent666Channel, resolveChannelCommercialsRoot } = require('./channels-service.cjs');

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
logLaunch('process started', `name=${appIdentity.displayName} version=${app.getVersion()} electron=${process.versions.electron} platform=${process.platform} arch=${process.arch} userData=${app.getPath('userData')}`);

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
ipcMain.handle('set-window-fullscreen', (event, fullscreen) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return false;
  if (window.isFullScreen() !== (fullscreen === true)) window.setFullScreen(fullscreen === true);
  return fullscreen === true;
});
// "Dim room" view: a click-through black sheet covers the TV's display behind the window while Saturday Tube is the active
// app, so whatever size the TV is, the rest of the desktop fades away. Switching to another app lifts it.
const BACKDROP_OPACITY = 0.86;
const BACKDROP_FADE_MS = 260;
let backdropWindow = null;
let backdropOwner = null;
let backdropWanted = false;
let backdropFadeTimer = null;
let backdropBlurTimer = null;
function fadeBackdrop(target, done = () => {}) {
  if (!backdropWindow || backdropWindow.isDestroyed()) return;
  if (backdropFadeTimer) clearInterval(backdropFadeTimer);
  const from = backdropWindow.getOpacity();
  const started = Date.now();
  backdropFadeTimer = setInterval(() => {
    if (!backdropWindow || backdropWindow.isDestroyed()) { clearInterval(backdropFadeTimer); backdropFadeTimer = null; return; }
    const progress = Math.min(1, (Date.now() - started) / BACKDROP_FADE_MS);
    backdropWindow.setOpacity(from + (target - from) * progress);
    if (progress >= 1) { clearInterval(backdropFadeTimer); backdropFadeTimer = null; done(); }
  }, 16);
}
function ensureBackdropWindow() {
  if (backdropWindow && !backdropWindow.isDestroyed()) return backdropWindow;
  backdropWindow = new BrowserWindow({
    show: false, frame: false, focusable: false, skipTaskbar: true, hasShadow: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, enableLargerThanScreen: true, roundedCorners: false,
    backgroundColor: '#000000', title: 'Saturday Tube backdrop',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  backdropWindow.setIgnoreMouseEvents(true);
  backdropWindow.on('closed', () => { backdropWindow = null; });
  return backdropWindow;
}
function updateBackdrop() {
  const owner = backdropOwner && !backdropOwner.isDestroyed() ? backdropOwner : null;
  const show = Boolean(backdropWanted && owner && owner.isVisible() && !owner.isMinimized() && !owner.isFullScreen() && owner.isFocused());
  if (!show) {
    if (backdropWindow && !backdropWindow.isDestroyed() && backdropWindow.isVisible()) {
      fadeBackdrop(0, () => { if (backdropWindow && !backdropWindow.isDestroyed()) backdropWindow.hide(); });
    }
    return;
  }
  const backdrop = ensureBackdropWindow();
  backdrop.setBounds(screen.getDisplayMatching(owner.getBounds()).bounds);
  if (!backdrop.isVisible()) {
    backdrop.setOpacity(0);
    backdrop.showInactive();
  }
  // The sheet goes in front when shown; put the TV back on top of it.
  owner.moveTop();
  fadeBackdrop(BACKDROP_OPACITY);
}
function watchBackdropOwner(win) {
  const refresh = () => updateBackdrop();
  win.on('focus', () => { if (backdropBlurTimer) clearTimeout(backdropBlurTimer); refresh(); });
  // Focus can flicker while a menu or sheet opens; only lift the sheet once another app really has it.
  win.on('blur', () => {
    if (backdropBlurTimer) clearTimeout(backdropBlurTimer);
    backdropBlurTimer = setTimeout(refresh, 120);
  });
  for (const name of ['show', 'hide', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen', 'moved', 'resized']) win.on(name, refresh);
  win.on('closed', () => {
    if (backdropOwner === win) backdropOwner = null;
    if (backdropWindow && !backdropWindow.isDestroyed()) backdropWindow.destroy();
  });
}
ipcMain.handle('set-backdrop-dim', (event, enabled) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return false;
  if (backdropOwner !== window) { backdropOwner = window; watchBackdropOwner(window); }
  backdropWanted = enabled === true;
  updateBackdrop();
  return backdropWanted;
});
ipcMain.handle('get-window-fullscreen', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return Boolean(window && !window.isDestroyed() && window.isFullScreen());
});

const mediaFiles = new Map();
const commercialMediaFiles = new Map();
let commercialService = null;
let channelBreakFinder = null;
let remoteServer = null;
let televisionWindow = null;
let remotePointer = null;
let remotePointerRelease = null;
let desktopTrackpad = null;
function sendDesktopTrackpad(value) {
  if (!desktopTrackpad) {
    const helper = spawn('/usr/bin/swift', [path.join(__dirname, 'desktop-trackpad.swift')], { stdio: ['pipe', 'ignore', 'pipe'] });
    desktopTrackpad = helper;
    let detail = '';
    helper.stderr.on('data', chunk => { detail += chunk.toString(); });
    helper.stdin.on('error', error => logLaunch('desktop trackpad pipe failed', error.message));
    helper.on('error', error => logLaunch('desktop trackpad failed', error.message));
    helper.on('exit', code => {
      if (desktopTrackpad === helper) desktopTrackpad = null;
      if (code) {
        logLaunch('desktop trackpad unavailable', detail);
        dialog.showErrorBox('Desktop trackpad unavailable', detail || 'Could not start macOS cursor control.');
      }
    });
  }
  desktopTrackpad.stdin.write(`${JSON.stringify(value)}\n`);
  clearTimeout(remotePointerRelease);
  if (value.type !== 'up') {
    remotePointerRelease = setTimeout(() => {
      desktopTrackpad?.stdin.write('{"type":"up"}\n');
    }, 5000);
  }
}
function sendTrackpadInput(value) {
  if (process.platform === 'darwin' && value.type !== 'zoom') {
    sendDesktopTrackpad(value);
    return;
  }
  const win = televisionWindow;
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  remotePointer ||= { x: width / 2, y: height / 2, down: false };
  if (value.type === 'move') {
    remotePointer.x += value.dx;
    remotePointer.y += value.dy;
  }
  remotePointer.x = Math.max(0, Math.min(width - 1, remotePointer.x));
  remotePointer.y = Math.max(0, Math.min(height - 1, remotePointer.y));
  const point = { x: Math.round(remotePointer.x), y: Math.round(remotePointer.y) };
  win.webContents.send('remote-command', { action: 'trackpad', value: { ...value, ...point } });
  if (value.type === 'zoom') return;
  const mouse = type => win.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
  if (value.type === 'move') {
    win.webContents.sendInputEvent({ type: 'mouseMove', ...point, modifiers: remotePointer.down ? ['leftButtonDown'] : [] });
  } else if (value.type === 'scroll') {
    win.webContents.sendInputEvent({ type: 'mouseWheel', ...point, deltaX: value.dx, deltaY: value.dy });
  } else if (value.type === 'click') {
    mouse('mouseDown');
    mouse('mouseUp');
  } else if (value.type === 'down' && !remotePointer.down) {
    remotePointer.down = true;
    mouse('mouseDown');
  } else if (value.type === 'up' && remotePointer.down) {
    remotePointer.down = false;
    mouse('mouseUp');
  }
  clearTimeout(remotePointerRelease);
  remotePointerRelease = null;
  if (remotePointer.down) {
    // A disconnected phone must not leave the TV dragging indefinitely.
    remotePointerRelease = setTimeout(() => {
      if (televisionWindow === win && !win.isDestroyed() && !win.webContents.isDestroyed() && remotePointer?.down) {
        remotePointer.down = false;
        win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
      }
    }, 5000);
  }
}
function sendRemoteCommand(command) {
  if (command.action === 'trackpad') {
    sendTrackpadInput(command.value);
    return;
  }
  if (command.action === 'power') {
    if (televisionWindow && !televisionWindow.isDestroyed()) televisionWindow.close();
    else createWindow();
    return;
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('remote-command', command);
  }
}
ipcMain.handle('remote-get-pairing', () => remoteServer?.pairing() || { enabled: false, running: false });
ipcMain.handle('remote-set-enabled', async (_event, enabled) => {
  if (!remoteServer) return { enabled: false, running: false };
  try {
    return await remoteServer.setEnabled(enabled === true);
  } catch (error) {
    logLaunch('phone remote could not start', error?.message || String(error));
    return { ...remoteServer.pairing(), error: 'The remote could not start on this network.' };
  }
});
ipcMain.handle('remote-reset-key', () => remoteServer?.resetKey() || { enabled: false, running: false });
ipcMain.handle('remote-open-on-this-mac', async () => {
  const url = remoteServer?.localUrl();
  if (!url) return { ok: false, error: 'Turn on the phone remote first.' };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch {
    return { ok: false, error: 'The paired remote could not be opened in your browser.' };
  }
});
ipcMain.handle('remote-open-mirror', async () => {
  const url = remoteServer?.mirrorUrl();
  if (!url) return { ok: false, error: 'Turn on the phone remote first.' };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch {
    return { ok: false, error: 'The screen mirror could not be opened in your browser.' };
  }
});
ipcMain.on('remote-state', (_event, state) => {
  if (televisionWindow && !televisionWindow.isDestroyed() && remoteServer?.server && state && typeof state === 'object') remoteServer.publishState({ ...state, powered: true });
});
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
let channelCommercialImportChain = Promise.resolve();
// Version 2 splits reels only where black and a pause in the sound meet; older splits keep airing until re-split.
const COMMERCIAL_SPLIT_VERSION = 2;
const COMMERCIAL_MIN_USABLE_SPLIT_VERSION = 1;
const mimeByExt = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.3gp': 'video/3gpp', '.3g2': 'video/3gpp2',
  '.webm': 'video/webm', '.ogv': 'video/ogg', '.ogg': 'video/ogg', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg', '.mpe': 'video/mpeg', '.m2v': 'video/mpeg',
  '.wmv': 'video/x-ms-wmv', '.asf': 'video/x-ms-asf', '.flv': 'video/x-flv', '.f4v': 'video/mp4', '.rm': 'application/vnd.rn-realmedia', '.rmvb': 'application/vnd.rn-realmedia-vbr',
  '.ts': 'video/mp2t', '.mts': 'video/mp2t', '.m2ts': 'video/mp2t', '.vob': 'video/mpeg', '.mxf': 'application/mxf', '.dv': 'video/dv', '.nut': 'video/x-nut',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac', '.flac': 'audio/flac', '.opus': 'audio/ogg', '.aiff': 'audio/aiff', '.wma': 'audio/x-ms-wma', '.alac': 'audio/mp4'
};
const transcodeJobs = new Map();
// A converted copy keeps the original picture, so a long 1080p episode can be several GB. The cache may grow to 16 GB, but
// never to the point of leaving less than 8 GB free on the disk; the least recently watched copies go first.
const MAX_TRANSCODE_FILE_BYTES = 8 * 1024 ** 3;
const MAX_TRANSCODE_CACHE_BYTES = 16 * 1024 ** 3;
const MIN_FREE_DISK_BYTES = 8 * 1024 ** 3;
let movieTrailerCache = null;
function movieTrailersRoot() { return path.join(app.getPath('userData'), 'Movie Previews'); }

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
    return asResponse(mediaResponseBody(request, filePath, { start, end }), 206, {
      ...baseHeaders,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${stat.size}`
    });
  }
  return asResponse(mediaResponseBody(request, filePath), 200, { ...baseHeaders, 'Content-Length': String(stat.size) });
}
function mediaResponseBody(request, filePath, range = {}) {
  const stream = fs.createReadStream(filePath, { ...range, highWaterMark: 256 * 1024 });
  const abort = () => stream.destroy();
  stream.once('close', () => request.signal?.removeEventListener('abort', abort));
  request.signal?.addEventListener('abort', abort, { once: true });
  if (request.signal?.aborted) abort();
  return Readable.toWeb(stream, { strategy: { highWaterMark: 256 * 1024, size: chunk => chunk.byteLength } });
}

function serveAppAsset(url) {
  const name = decodeURIComponent(url.pathname.slice(1) || 'index.html');
  const appAssets = {
    'index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    'renderer.js': { file: 'renderer.js', type: 'text/javascript; charset=utf-8' },
    'aux-genesis.js': { file: 'aux-genesis.js', type: 'text/javascript; charset=utf-8' },
    'vendor/genesis/genesis-core.js': { file: 'vendor/genesis/genesis-core.js', type: 'text/javascript; charset=utf-8' },
    'vendor/genesis/LICENSE': { file: 'vendor/genesis/LICENSE', type: 'text/plain; charset=utf-8' },
    'commercial-mode.js': { file: 'commercial-mode.js', type: 'text/javascript; charset=utf-8' },
    'movie-preroll.js': { file: 'movie-preroll.cjs', type: 'text/javascript; charset=utf-8' },
    'styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
    'scene-mode.js': { file: 'scene-mode.js', type: 'text/javascript; charset=utf-8' },
    'scene-mode.css': { file: 'scene-mode.css', type: 'text/css; charset=utf-8' },
    'intermission.js': { file: 'intermission.js', type: 'text/javascript; charset=utf-8' },
    'intermission.css': { file: 'intermission.css', type: 'text/css; charset=utf-8' },
    'assets/scenes/kids-room.jpg': { file: 'assets/scenes/kids-room.jpg', type: 'image/jpeg' },
    'assets/scenes/cyberpunk.jpg': { file: 'assets/scenes/cyberpunk.jpg', type: 'image/jpeg' },
    'assets/scenes/basement.jpg': { file: 'assets/scenes/basement.jpg', type: 'image/jpeg' },
    'assets/scenes/bedroom.jpg': { file: 'assets/scenes/bedroom.jpg', type: 'image/jpeg' },
    'assets/scenes/attic.jpg': { file: 'assets/scenes/attic.jpg', type: 'image/jpeg' },
    'assets/scenes/detail/kids-room.webp': { file: 'assets/scenes/detail/kids-room.webp', type: 'image/webp' },
    'assets/scenes/detail/cyberpunk.webp': { file: 'assets/scenes/detail/cyberpunk.webp', type: 'image/webp' },
    'assets/scenes/detail/basement.webp': { file: 'assets/scenes/detail/basement.webp', type: 'image/webp' },
    'assets/scenes/detail/attic.webp': { file: 'assets/scenes/detail/attic.webp', type: 'image/webp' },
    'commercials.css': { file: 'commercials.css', type: 'text/css; charset=utf-8' },
    'assets/fonts/VT323-Regular.ttf': { file: 'assets/fonts/VT323-Regular.ttf', type: 'font/ttf' },
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
  const requestedRoot = movieTrailersRoot();
  await fs.promises.mkdir(requestedRoot, { recursive: true });
  const root = await fs.promises.realpath(requestedRoot);
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
          if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || !(Number(entry?.size) >= 0)
            || !Number.isFinite(Number(entry?.modified))) continue;
          if (entry.failed === true) {
            rememberChannelDuration(filePath, { size: Number(entry.size), modified: Number(entry.modified), duration: 0, failed: true });
          } else if (Number.isFinite(Number(entry?.duration)) && Number(entry.duration) > 0) {
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
    if (!source || (isCommercialReel(item) && !(Number(source.splitVersion) >= COMMERCIAL_MIN_USABLE_SPLIT_VERSION))) continue;
    matchedSources.add(source.id);
    const readyCountBefore = channelAds.length;
    for (const clip of clipsBySource.get(source.id) || []) {
      if (clip.needsReview && !clip.reviewed) reviewCount += 1;
      if (!isChannelReadyClip(clip)) {
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
  if (!commercialsRoot || !originalAds.length) return false;
  let changed = false;
  const sources = await commercialService.listChannelSources();
  const existingByPath = new Map(sources.map(source => [path.resolve(source.originalPath), source]));
  for (const item of originalAds) {
    try {
      const sourcePath = await fs.promises.realpath(item.path);
      if (!insideRoot(commercialsRoot, sourcePath)) continue;
      const stat = await fs.promises.stat(sourcePath);
      let existing = existingByPath.get(path.resolve(sourcePath));
      if (!existing && await commercialService.relinkMovedSource(sourcePath, stat)) {
        existing = (await commercialService.listChannelSources()).find(source => path.resolve(source.originalPath) === path.resolve(sourcePath));
        changed = true;
      }
      const durationSeconds = Number(item.durationSeconds) > 0
        ? Number(item.durationSeconds)
        : await commercialService.probeDuration(sourcePath);
      if (!(Number(durationSeconds) > 0)) continue;
      const reel = isCommercialReel({ path: sourcePath, durationSeconds });
      const unchanged = existing && Number(existing.sizeBytes) === stat.size && Math.abs(Number(existing.mtimeMs) - stat.mtimeMs) < 1;
      if (unchanged && (!reel || Number(existing.splitVersion) >= COMMERCIAL_SPLIT_VERSION)) continue;
      if (Date.now() - stat.mtimeMs < Number(commercialService.stabilityMs || 90_000)) continue;
      const result = reel
        ? await commercialService.importCompilation(sourcePath, () => {}, { resplit: true, splitVersion: COMMERCIAL_SPLIT_VERSION })
        : await commercialService.importWatchedFile(commercialsRoot, sourcePath, stat);
      if (!result?.duplicate) changed = true;
    } catch (error) {
      console.warn('A channel commercial source was skipped until complete and reviewable', path.basename(item.path), error?.message || error);
    }
  }
  return changed;
}

function scheduleChannelCommercialImports(commercialsRoot, originalAds) {
  if (!commercialsRoot || !originalAds.length) return;
  const key = path.resolve(commercialsRoot);
  if (channelCommercialImportJobs.has(key)) return;
  // One commercials folder is split at a time so background FFmpeg work never starves playback.
  const job = channelCommercialImportChain.then(() => new Promise(resolve => {
    const timer = setTimeout(resolve, 2500);
    timer.unref?.();
  })).then(() => importChannelCommercialSources(commercialsRoot, originalAds))
    .then(changed => {
      if (!changed) return;
      logLaunch('channel commercials split and ready', path.basename(path.dirname(key)));
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('channel-commercials-updated', key);
      }
    })
    .catch(error => console.warn('TV channel commercials could not be prepared in the background', error?.message || error))
    .finally(() => channelCommercialImportJobs.delete(key));
  channelCommercialImportChain = job;
  channelCommercialImportJobs.set(key, job);
}

const CHANNEL_CATALOG_VERSION = 1;
const MAX_CHANNEL_CATALOG_ROOTS = 64;
let channelCatalogCache = null;
let channelCatalogLoadPromise = null;
let channelCatalogWrite = Promise.resolve();

function channelCatalogPath() {
  return path.join(app.getPath('userData'), 'channel-catalog-cache.json');
}

async function restoreChannelCatalogCache() {
  if (channelCatalogCache) return channelCatalogCache;
  if (!channelCatalogLoadPromise) {
    channelCatalogLoadPromise = (async () => {
      const cache = new Map();
      try {
        const saved = JSON.parse(await fs.promises.readFile(channelCatalogPath(), 'utf8'));
        for (const [root, entry] of Object.entries(saved || {})) {
          if (path.isAbsolute(root) && entry?.version === CHANNEL_CATALOG_VERSION && typeof entry.fingerprint === 'string'
            && Array.isArray(entry.catalog?.shows)) cache.set(root, entry);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('TV channel playlists could not be restored', error?.message || error);
      }
      channelCatalogCache = cache;
      return cache;
    })().finally(() => { channelCatalogLoadPromise = null; });
  }
  return channelCatalogLoadPromise;
}

function persistChannelCatalogCache() {
  channelCatalogWrite = channelCatalogWrite.then(async () => {
    const cachePath = channelCatalogPath();
    const temporary = `${cachePath}.${process.pid}.${randomUUID()}.partial`;
    const entries = [...channelCatalogCache.entries()].slice(-MAX_CHANNEL_CATALOG_ROOTS);
    try {
      await fs.promises.writeFile(temporary, `${JSON.stringify(Object.fromEntries(entries))}\n`, { mode: 0o600 });
      await fs.promises.rename(temporary, cachePath);
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      console.warn('TV channel playlists could not be saved', error?.message || error);
    }
  });
  return channelCatalogWrite;
}

// A cheap change check: the channel folder, its show folders, and its commercials folder. Deeper edits need a manual refresh.
async function channelSourceFingerprint(root) {
  const rootStat = await fs.promises.stat(root);
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  const folders = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => path.join(root, entry.name));
  const commercialsRoot = await resolveChannelCommercialsRoot(root).catch(() => null);
  if (commercialsRoot && !insideRoot(root, commercialsRoot)) folders.push(commercialsRoot);
  const stamps = await Promise.all(folders.map(async folder => {
    const stat = await fs.promises.stat(folder).catch(() => null);
    return `${folder}:${stat ? stat.mtimeMs : 'missing'}`;
  }));
  return [`${root}:${rootStat.mtimeMs}:${entries.length}`, ...stamps.sort()].join('|');
}

function channelCatalogItem(item) {
  return {
    path: item.path, title: item.title, size: item.size, modified: item.modified, durationSeconds: item.durationSeconds,
    ...(item.showName ? { showName: item.showName } : {})
  };
}

function storeableChannelCatalog(scanned) {
  return {
    ...scanned,
    shows: scanned.shows.map(show => ({ name: show.name, path: show.path, episodes: show.episodes.map(channelCatalogItem) })),
    commercials: (scanned.commercials || []).map(channelCatalogItem)
  };
}

function restoredChannelCatalog(catalog) {
  // Media tokens are per-session, so cached paths are registered again instead of walking the drive.
  const register = item => ({ ...registerMediaFile(item.path), ...channelCatalogItem(item) });
  return {
    ...catalog,
    shows: catalog.shows.map(show => ({ ...show, episodes: (show.episodes || []).map(register) })),
    commercials: (catalog.commercials || []).map(register)
  };
}

let commercialParserService = null;
// Long commercial reels are cut into single spots in the background; the next channel scan picks the clips up.
function parseChannelCommercials(folders) {
  try {
    commercialParserService ||= new CommercialsService(path.join(app.getPath('userData'), 'Commercial Library'), parserFFmpegPaths(ffmpegExecutable()));
  } catch (error) {
    logLaunch('commercial parser unavailable', error?.message || String(error));
    return;
  }
  enqueueCommercialFolders(folders.filter(Boolean), {
    service: commercialParserService,
    log: message => logLaunch('commercial parser', message)
  }).catch(error => logLaunch('commercial parser failed', error?.message || String(error)));
}

async function catchUpChannelCommercials() {
  const saved = JSON.parse(await fs.promises.readFile(channelCatalogPath(), 'utf8').catch(() => '{}'));
  const folders = await Promise.all(Object.keys(saved || {}).map(root => resolveChannelCommercialsRoot(root).catch(() => null)));
  parseChannelCommercials(folders);
}

async function scanChannelRoot(root, event, { force = false } = {}) {
  const [catalogs, fingerprint] = await Promise.all([
    restoreChannelCatalogCache(),
    channelSourceFingerprint(root).catch(() => null)
  ]);
  const cached = catalogs.get(root);
  if (!force && fingerprint && cached?.fingerprint === fingerprint) {
    return finishChannelScan(restoredChannelCatalog(cached.catalog), { cachedAt: cached.scannedAt });
  }
  await restoreChannelDurationCache();
  const scanned = await scanChannelFolder(root, {
    registerMedia: registerMediaFile,
    probeCommercials: true,
    probeDuration: async filePath => {
      const stat = await fs.promises.stat(filePath);
      const cached = channelDurationCache.get(filePath);
      if (cached && cached.size === stat.size && cached.modified === stat.mtimeMs) {
        rememberChannelDuration(filePath, cached);
        if (cached.failed) throw new Error('This file could not be read the last time it was scanned.');
        return cached.duration;
      }
      if (cached) channelDurationCache.delete(filePath);
      let duration;
      try {
        duration = await commercialService.probeDuration(filePath);
      } catch (error) {
        // Remember unreadable files until they change so every rescan doesn't wait on the same broken file.
        rememberChannelDuration(filePath, { size: stat.size, modified: stat.mtimeMs, duration: 0, failed: true });
        throw error;
      }
      rememberChannelDuration(filePath, { size: stat.size, modified: stat.mtimeMs, duration });
      return duration;
    }
  });
  await persistChannelDurationCache();
  if (fingerprint) {
    catalogs.delete(root);
    catalogs.set(root, { version: CHANNEL_CATALOG_VERSION, fingerprint, scannedAt: Date.now(), catalog: storeableChannelCatalog(scanned) });
    await persistChannelCatalogCache();
  }
  return finishChannelScan(scanned, { cachedAt: null });
}

async function finishChannelScan(scanned, { cachedAt }) {
  const originalAds = scanned.movieOnly ? [] : (scanned.commercials || []);
  const ready = await getReadyChannelCommercials(originalAds);
  const directAds = selectDirectChannelCommercialSources(originalAds, ready.readySourcePaths);
  scanned.commercials = [...ready.channelAds, ...directAds];
  scanned.commercialCount = scanned.commercials.length;
  scanned.commercialReviewCount = ready.reviewCount;
  scanned.commercialCompilationCount = ready.sourceCount;
  if (!scanned.movieOnly) scheduleChannelCommercialImports(scanned.commercialsRoot, originalAds);
  scanned.fromCache = Boolean(cachedAt);
  scanned.cachedAt = cachedAt || null;
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
      name: channelDisplayName(root),
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

async function listChannelFolders(parent, knownRoots = new Set()) {
  const discovered = [];
  const entries = await fs.promises.readdir(parent, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name || entry.name.startsWith('.')) continue;
    const candidate = await fs.promises.realpath(path.join(parent, entry.name)).catch(() => null);
    if (!candidate || path.dirname(candidate) !== parent || knownRoots.has(candidate)) continue;
    if (!(await isChannelFolder(candidate))) continue;
    knownRoots.add(candidate);
    discovered.push({ root: candidate, name: channelDisplayName(candidate) });
  }
  const adjacent666 = await discoverAdjacent666Channel(parent);
  if (adjacent666 && !knownRoots.has(adjacent666.root)) {
    knownRoots.add(adjacent666.root);
    discovered.push(adjacent666);
  }
  return discovered;
}

function sortChannelFolders(folders) {
  return folders.sort(compareChannelFolders);
}

async function discoverSiblingChannels(_event, savedRoots, sourceRoot) {
  const knownRoots = new Set();
  const parentFolders = new Set();
  const missingRoots = [];
  for (const savedRoot of Array.isArray(savedRoots) ? savedRoots : []) {
    if (typeof savedRoot !== 'string' || !path.isAbsolute(savedRoot)) continue;
    const root = await fs.promises.realpath(savedRoot).catch(() => null);
    if (!root || !(await fs.promises.stat(root).catch(() => null))?.isDirectory()) {
      missingRoots.push(path.resolve(savedRoot));
      continue;
    }
    knownRoots.add(root);
    parentFolders.add(path.dirname(root));
  }
  if (typeof sourceRoot === 'string' && path.isAbsolute(sourceRoot)) {
    const source = await fs.promises.realpath(sourceRoot).catch(() => null);
    if (source && (await fs.promises.stat(source).catch(() => null))?.isDirectory()) parentFolders.add(source);
  }
  const discovered = [];
  for (const parent of parentFolders) discovered.push(...await listChannelFolders(parent, knownRoots));
  // A folder renamed in place (for example numbered for the dial) is the same channel, so it keeps its playback.
  const claimed = new Set();
  for (const folder of discovered) {
    const renamedFrom = missingRoots.find(root => !claimed.has(root) && path.dirname(root) === path.dirname(folder.root)
      && channelIdentity(root) === channelIdentity(folder.root));
    if (renamedFrom) {
      claimed.add(renamedFrom);
      folder.renamedFrom = renamedFrom;
    }
  }
  return sortChannelFolders(discovered);
}

async function chooseChannelSource(event) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(owner, {
    title: 'Choose the folder that holds your TV channel folders',
    buttonLabel: 'Use as channel source',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const root = await fs.promises.realpath(result.filePaths[0]);
  if (!(await fs.promises.stat(root)).isDirectory()) throw new Error('Choose a folder that holds TV channel folders.');
  return { root, channels: sortChannelFolders(await listChannelFolders(root)) };
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

async function rescanChannelFolder(event, requestedRoot, options) {
  const trustedRoots = channelRoots.get(event.sender.id);
  if (!trustedRoots || typeof requestedRoot !== 'string' || !trustedRoots.has(path.resolve(requestedRoot))) {
    throw new Error('Choose or restore this TV channel folder before scanning it.');
  }
  const root = await fs.promises.realpath(requestedRoot).catch(() => null);
  if (!root || !trustedRoots.has(root) || !(await fs.promises.stat(root)).isDirectory()) throw new Error('The TV channel folder is unavailable. Reconnect its drive and scan again.');
  return scanChannelRoot(root, event, { force: options?.force === true });
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
    const looseRootShow = !movieOnly && showPath === root && showStat?.isDirectory();
    if (movieOnly ? (!rootLevelMovie && !movieFolder) || candidate.episodes.length !== 1 : !normalShowFolder && !looseRootShow) continue;
    const episodes = [];
    for (const item of candidate.episodes) {
      if (typeof item?.path !== 'string' || !path.isAbsolute(item.path) || !VIDEO_EXTENSIONS.has(path.extname(item.path).toLowerCase())) continue;
      const filePath = await fs.promises.realpath(item.path).catch(() => null);
      const durationSeconds = Number(item.durationSeconds);
      const insideShow = rootLevelMovie ? filePath === showPath
        : looseRootShow ? filePath && path.dirname(filePath) === root
          : filePath && insideRoot(showPath, filePath);
      if (!filePath || !insideShow || (movieOnly && isMovieExtraPath(root, filePath))
        || !(await fs.promises.stat(filePath).catch(() => null))?.isFile()
        || !Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;
      episodes.push({ path: filePath, title: path.basename(filePath), durationSeconds });
    }
    if (episodes.length && (!movieOnly || episodes.length === 1)) {
      const name = typeof candidate.name === 'string' && candidate.name ? candidate.name
        : rootLevelMovie ? path.basename(showPath, path.extname(showPath)) : path.basename(showPath);
      shows.push({ path: showPath, name, episodes, ...(looseRootShow ? { loose: true } : {}) });
    }
  }
  const commercialsRoot = movieOnly ? null : await resolveChannelCommercialsRoot(root);
  if (commercialsRoot) parseChannelCommercials([commercialsRoot]);
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
        if (!clip || !isChannelReadyClip(clip) || record?.source?.status !== 'complete'
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

const TRANSCODE_STALL_MS = 120_000;
function runFFmpeg(executable, args, { outputPath = null, stallMs = TRANSCODE_STALL_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let stalled = false;
    let lastSize = -1;
    let lastGrowth = Date.now();
    // A damaged file can leave FFmpeg spinning without writing anything; kill it so it can't hold up every other conversion.
    const watchdog = outputPath ? setInterval(() => {
      fs.promises.stat(outputPath).then(stat => stat.size, () => 0).then(size => {
        if (size !== lastSize) { lastSize = size; lastGrowth = Date.now(); return; }
        if (Date.now() - lastGrowth >= stallMs && !stalled) { stalled = true; child.kill('SIGKILL'); }
      });
    }, Math.min(10_000, Math.max(250, stallMs / 4))) : null;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-1800); });
    child.once('error', error => { if (watchdog) clearInterval(watchdog); reject(error); });
    child.once('close', code => {
      if (watchdog) clearInterval(watchdog);
      if (stalled) reject(new Error('FFmpeg stopped making progress on this file.'));
      else if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
    });
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
  const disk = await fs.promises.statfs(cacheDir).catch(() => null);
  let free = disk ? Number(disk.bavail) * Number(disk.bsize) : Infinity;
  const newest = files.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  for (const entry of files.filter(Boolean).sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= MAX_TRANSCODE_CACHE_BYTES && free >= MIN_FREE_DISK_BYTES) break;
    if (entry === newest) break;
    await fs.promises.unlink(entry.filePath).catch(() => {});
    total -= entry.size;
    free += entry.size;
  }
}

// Conversions share one hard drive. The file on screen ('foreground') starts at once; warm-up copies for other channels and
// upcoming programmes ('background') run one at a time and wait while anything on screen is converting.
const transcodeWaiters = [];
let foregroundTranscodes = 0;
let backgroundTranscodeRunning = false;
function pumpBackgroundTranscodes() {
  if (backgroundTranscodeRunning || foregroundTranscodes > 0) return;
  const next = transcodeWaiters.shift();
  if (!next) return;
  backgroundTranscodeRunning = true;
  next.start();
}
function scheduleTranscode(entry, foreground) {
  entry.foreground = foreground;
  entry.started = false;
  entry.promise = new Promise((resolve, reject) => {
    entry.start = () => {
      if (entry.started) return;
      entry.started = true;
      const index = transcodeWaiters.indexOf(entry);
      if (index >= 0) transcodeWaiters.splice(index, 1);
      const counted = entry.foreground;
      if (counted) foregroundTranscodes += 1;
      entry.run().then(resolve, reject).finally(() => {
        if (counted) foregroundTranscodes -= 1;
        else backgroundTranscodeRunning = false;
        pumpBackgroundTranscodes();
      });
    };
  });
  if (foreground) entry.start();
  else {
    transcodeWaiters.push(entry);
    pumpBackgroundTranscodes();
  }
  return entry.promise;
}
function transcodeVideoAttempts(videoCodec, common, audioTail) {
  const encode = [...common, '-c:v', 'h264_videotoolbox', '-b:v', '2500k', '-pix_fmt', 'yuv420p', '-tag:v', 'avc1', ...audioTail];
  // H.264 and HEVC (Chromium decodes both in hardware on macOS) keep their picture; only the sound is converted.
  if (videoCodec === 'h264') return [[...common, '-c:v', 'copy', ...audioTail], encode];
  if (videoCodec === 'hevc') return [[...common, '-c:v', 'copy', '-tag:v', 'hvc1', ...audioTail], encode];
  return [encode];
}

function transcodeCacheLocation(source, stat) {
  const key = createHash('sha256').update(`${source}\0${stat.size}\0${stat.mtimeMs}`).digest('hex');
  const cacheDir = path.join(app.getPath('cache'), 'Saturday Tube', 'transcodes');
  return { key, cacheDir, output: path.join(cacheDir, `${key}.mp4`) };
}

async function transcodeMedia(_event, id, options = {}) {
  const source = mediaFiles.get(id);
  if (!source) throw new Error('That tape is no longer available.');
  const foreground = options?.priority !== 'background';
  const stat = await fs.promises.stat(source);
  const { key, cacheDir, output } = transcodeCacheLocation(source, stat);
  if ((await fs.promises.stat(output).catch(() => null))?.size > 0) {
    const now = new Date();
    await fs.promises.utimes(output, now, now).catch(() => {});
    return registerMediaFile(output);
  }
  const existing = transcodeJobs.get(key);
  if (existing) {
    // The viewer tuned to a programme that was waiting as a warm-up: start it now.
    if (foreground && !existing.started) {
      existing.foreground = true;
      existing.start();
    }
    return registerMediaFile(await existing.promise);
  }
  const entry = {
    run: async () => {
      await fs.promises.mkdir(cacheDir, { recursive: true });
      const temporary = path.join(cacheDir, `${key}.${process.pid}.partial.mp4`);
      const executables = transcodeExecutableCandidates();
      const common = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn'];
      // Stereo AAC: the TV mixes to two speakers anyway, and encoding 5.1/Atmos tracks takes about three times as long.
      const audioTail = ['-c:a', 'aac', '-ac', '2', '-b:a', '160k', '-movflags', '+faststart', temporary];
      const videoCodec = await commercialService.probeVideoCodec(source).catch(() => '');
      let lastError = null;
      for (const executable of executables) {
        for (const args of transcodeVideoAttempts(videoCodec, common, audioTail)) {
          try {
            await runFFmpeg(executable, args, { outputPath: temporary });
            const convertedStat = await fs.promises.stat(temporary);
            if (convertedStat.size > MAX_TRANSCODE_FILE_BYTES) throw new Error('Converted copy would exceed the 8 GB temporary-cache limit.');
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
    }
  };
  transcodeJobs.set(key, entry);
  try { return registerMediaFile(await scheduleTranscode(entry, foreground)); }
  finally { if (transcodeJobs.get(key) === entry) transcodeJobs.delete(key); }
}

// Live channel playback: files Chromium can't play as they are (AVI, MKV, AC-3/E-AC-3/DTS sound…) are converted on the
// fly into a fragmented MP4 piped straight to the picture, starting at the broadcast position, so they tune in about a
// second instead of waiting minutes for a whole converted copy (which also no longer needs gigabytes of disk).
const LIVE_NATIVE_CONTAINERS = /\.(?:mp4|m4v|mov|webm)$/i;
const LIVE_NATIVE_VIDEO = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1']);
const LIVE_SAFE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'none']);
// A copied picture must start on a keyframe; further than this from the broadcast position, the picture is re-encoded.
const LIVE_COPY_MAX_PREROLL_SECONDS = 1;
const MAX_LIVE_MEDIA_TOKENS = 8;
const liveMediaStreams = new Map();
let intermissionActive = false;
const liveMediaChildren = new Map();
const mediaStreamInfoCache = new Map();
const mediaStreamInfoJobs = new Map();
const mediaStreamInfoControllers = new Map();
const mediaStreamInfoFailures = new Map();
let channelMediaController = null;
async function mediaStreamInfo(source) {
  if (mediaStreamInfoJobs.has(source)) return mediaStreamInfoJobs.get(source);
  const failure = mediaStreamInfoFailures.get(source);
  if (failure && Date.now() - failure.at < 60_000) throw failure.error;
  const controller = new AbortController();
  mediaStreamInfoControllers.set(source, controller);
  const job = readMediaStreamInfo(source, controller.signal).catch(error => {
    if (error.name !== 'AbortError') {
      mediaStreamInfoFailures.set(source, { at: Date.now(), error });
      while (mediaStreamInfoFailures.size > 64) mediaStreamInfoFailures.delete(mediaStreamInfoFailures.keys().next().value);
    }
    throw error;
  }).finally(() => {
    mediaStreamInfoJobs.delete(source);
    mediaStreamInfoControllers.delete(source);
  });
  mediaStreamInfoJobs.set(source, job);
  return job;
}
async function readMediaStreamInfo(source, signal) {
  const stat = await fs.promises.stat(source);
  const cached = mediaStreamInfoCache.get(source);
  if (cached && cached.size === stat.size && cached.modified === stat.mtimeMs) return cached.info;
  signal.throwIfAborted();
  const info = await commercialService.probeStreams(source, { signal });
  if (info) {
    mediaStreamInfoCache.delete(source);
    mediaStreamInfoCache.set(source, { size: stat.size, modified: stat.mtimeMs, info });
    while (mediaStreamInfoCache.size > 2000) mediaStreamInfoCache.delete(mediaStreamInfoCache.keys().next().value);
  }
  return info;
}
function liveStreamPlan(info, extension) {
  const video = String(info?.video || '');
  const audio = String(info?.audio || '');
  const native = LIVE_NATIVE_CONTAINERS.test(extension) && LIVE_NATIVE_VIDEO.has(video) && LIVE_SAFE_AUDIO.has(audio);
  return { native, copyVideo: video === 'h264' || video === 'hevc', videoTag: video === 'hevc' ? 'hvc1' : 'avc1' };
}
async function openChannelMedia(_event, id, startSeconds, options = {}) {
  const source = mediaFiles.get(id);
  if (!source) throw new Error('That programme is no longer available.');
  let signal;
  if (!options?.prepareOnly) {
    channelMediaController?.abort();
    channelMediaController = new AbortController();
    signal = channelMediaController.signal;
    for (const [filePath, controller] of mediaStreamInfoControllers) {
      if (filePath !== source) controller.abort();
    }
  }
  const start = Math.max(0, Number(startSeconds) || 0);
  const forceLive = options?.forceLive === true;
  const stat = await fs.promises.stat(source);
  if (!forceLive) {
    const { output } = transcodeCacheLocation(source, stat);
    if ((await fs.promises.stat(output).catch(() => null))?.size > 0) return { live: false, ...registerMediaFile(output) };
  }
  signal?.throwIfAborted();
  const cached = mediaStreamInfoCache.get(source);
  const knownInfo = cached?.size === stat.size && cached.modified === stat.mtimeMs ? cached.info : null;
  // Let Chromium open common containers immediately; verify their audio without blocking the first picture.
  if (!forceLive && !options?.prepareOnly && !knownInfo && LIVE_NATIVE_CONTAINERS.test(path.extname(source))) {
    return { live: false, native: true, verifyAudio: true };
  }
  const info = await mediaStreamInfo(source).catch(error => {
    if (error.name === 'AbortError' || options?.prepareOnly) throw error;
    logLaunch('channel codec probe failed; trying live conversion', `${path.basename(source)}: ${error.message}`);
    return null;
  });
  const plan = liveStreamPlan(info, path.extname(source));
  signal?.throwIfAborted();
  if (options?.prepareOnly) return { prepared: true };
  if (!forceLive && plan.native) return { live: false, native: true, audio: info.audio };
  let mode = 'encode';
  let base = start;
  if (plan.copyVideo && options?.forceEncode !== true) {
    const containerStart = Number(info?.startTime) || 0;
    const keyframe = start < 0.05 ? containerStart : await commercialService.probeKeyframeBefore(source, start + containerStart, { signal }).catch(error => {
      if (error.name === 'AbortError') throw error;
      return null;
    });
    const keyframeSeconds = Number.isFinite(keyframe) ? keyframe - containerStart : NaN;
    if (keyframeSeconds >= 0 && start - keyframeSeconds <= LIVE_COPY_MAX_PREROLL_SECONDS) {
      mode = 'copy';
      base = keyframeSeconds;
    }
    signal?.throwIfAborted();
  }
  const token = randomUUID();
  liveMediaStreams.set(token, { source, startSeconds: base, mode, videoTag: plan.videoTag });
  while (liveMediaStreams.size > MAX_LIVE_MEDIA_TOKENS) liveMediaStreams.delete(liveMediaStreams.keys().next().value);
  return { live: true, url: `saturday://app/live/${token}`, startSeconds: base, mode, audio: info?.audio, title: path.basename(source), path: source };
}
function liveMediaArgs(entry) {
  const video = entry.mode === 'copy'
    ? ['-c:v', 'copy', '-tag:v', entry.videoTag]
    : ['-c:v', 'h264_videotoolbox', '-b:v', '4500k', '-maxrate', '6000k', '-bufsize', '6000k', '-pix_fmt', 'yuv420p', '-tag:v', 'avc1'];
  // A copied picture starts on its keyframe; seek a hair past it so FFmpeg can't land on the keyframe before.
  const seek = entry.mode === 'copy' && entry.startSeconds > 0 ? entry.startSeconds + 0.01 : entry.startSeconds;
  // Copied video starts wherever the demuxer lands (often an earlier MKV cue); audio must start there too,
  // or the muxer opens a silent gap that the player skips and the sound runs ahead of the picture.
  const seekArgs = seek > 0 ? [...(entry.mode === 'copy' ? ['-noaccurate_seek'] : []), '-ss', seek.toFixed(3)] : [];
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', ...seekArgs,
    '-readrate', '1', '-readrate_initial_burst', '6', '-readrate_catchup', '1.5', '-i', entry.source,
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', ...video,
    '-c:a', 'aac', '-ac', '2', '-b:a', '160k',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '1000000', 'pipe:1'
  ];
}
function stopLiveMedia() {
  for (const child of liveMediaChildren.keys()) {
    liveMediaChildren.delete(child);
    child.stdout.destroy();
    child.kill('SIGKILL');
  }
}
function serveLiveMedia(request, token) {
  if (intermissionActive) return new Response('Intermission', { status: 409 });
  if (!televisionWindow || televisionWindow.isDestroyed()) return new Response('TV is off', { status: 410 });
  const entry = liveMediaStreams.get(token);
  if (!entry) return new Response('Not found', { status: 404 });
  const headers = { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' };
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  if (request.signal?.aborted) return new Response('Request cancelled', { status: 499 });
  // Even a second request for the same token replaces the old encoder.
  stopLiveMedia();
  const executable = transcodeExecutableCandidates()[0];
  const child = spawn(executable, liveMediaArgs(entry), { stdio: ['ignore', 'pipe', 'pipe'] });
  liveMediaChildren.set(child, token);
  const abort = () => {
    child.stdout.destroy();
    child.kill('SIGKILL');
  };
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-1200); });
  child.once('error', error => logLaunch('live channel stream could not start', error?.message || String(error)));
  child.once('close', code => {
    liveMediaChildren.delete(child);
    request.signal?.removeEventListener('abort', abort);
    if (code && !/Broken pipe|EPIPE/i.test(stderr)) logLaunch('live channel stream stopped', `${path.basename(entry.source)} (${entry.mode}) code ${code}: ${stderr.trim().slice(-300)}`);
  });
  request.signal?.addEventListener('abort', abort, { once: true });
  child.stdout.once('close', () => {
    if (liveMediaChildren.has(child)) child.kill('SIGKILL');
  });
  return new Response(Readable.toWeb(child.stdout), { status: 200, headers });
}

function ffmpegStreamListing(executable, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-nostdin', '-hide_banner', '-i', source], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { if (stderr.length < 200000) stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    // FFmpeg exits non-zero without an output file; the stream list it prints first is all that is needed.
    child.once('close', () => { clearTimeout(timer); resolve(stderr); });
  });
}

async function getMediaAudioCodec(_event, id) {
  const source = mediaFiles.get(id);
  if (!source) throw new Error('That tape is no longer available.');
  const probed = (await mediaStreamInfo(source))?.audio;
  const codec = String(probed || '').trim().split(/\s+/)[0].replace(/,$/, '');
  if (codec) return codec;
  // ffprobe is missing (packaged builds bundle only FFmpeg), failed, or found no audio: read the stream list from FFmpeg.
  for (const executable of transcodeExecutableCandidates()) {
    const listing = await ffmpegStreamListing(executable, source).catch(() => null);
    if (!listing || !/Input #0/.test(listing)) continue;
    const match = listing.match(/Stream #\d+:\d+[^:\n]*: Audio: ([a-z0-9_]+)/i);
    return match ? match[1].toLowerCase() : 'none';
  }
  return '';
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
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: app.isPackaged ? [] : ['--saturday-tube-developer-build'],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The TV keeps broadcasting (schedule sync, break cuts, audio fades) while covered or minimised, e.g. on the phone remote.
      backgroundThrottling: false
    }
  });
  televisionWindow = win;
  remoteServer?.publishState({ powered: true, playing: false, title: 'STARTING' });
  win.on('closed', () => {
    televisionWindow = null;
    clearTimeout(remotePointerRelease);
    remotePointerRelease = null;
    remotePointer = null;
    channelBreakFinder?.setPaused(true);
    stopLiveMedia();
    intermissionActive = false;
    liveMediaStreams.clear();
    remoteServer?.publishState({ powered: false, playing: false });
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
  const sendPictureVisibility = visible => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('picture-visibility-change', visible);
  };
  win.on('minimize', () => sendPictureVisibility(false));
  win.on('hide', () => sendPictureVisibility(false));
  win.on('restore', () => sendPictureVisibility(true));
  win.on('show', () => sendPictureVisibility(true));
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
    // ⌘F steps through the same views as the remote's fullscreen key.
    if (!win.webContents.isDestroyed()) win.webContents.send('fullscreen-cycle-request');
  });
  let rendererReady = false;
  let fallbackShown = false;
  win.webContents.ipc.once('renderer-ready', () => {
    if (fallbackShown || win.isDestroyed()) return;
    rendererReady = true;
    clearTimeout(startupTimer);
    win.show();
    logLaunch('renderer presentation ready');
  });
  const showStartupFallback = reason => {
    if (fallbackShown || win.isDestroyed()) return;
    fallbackShown = true;
    clearTimeout(startupTimer);
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
    if (fallbackShown && !win.isDestroyed()) win.show();
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
    if (!rendererReady) {
      logLaunch('renderer startup timed out', win.webContents.getURL());
      showStartupFallback('The player screen did not finish loading within 12 seconds. Check launch.log for details.');
    }
  }, 12000);
  startupTimer.unref?.();
  win.once('closed', () => clearTimeout(startupTimer));
  win.loadURL('saturday://app/index.html').catch(error => {
    logLaunch('window load rejected', error?.stack || String(error));
    showStartupFallback(error?.message || String(error));
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('render-process-gone', (_event, details) => {
    logLaunch('renderer stopped', JSON.stringify(details));
  });
}

app.on('before-quit', () => {
  void channelBreakFinder?.flush();
  void remoteServer?.stop();
});
app.on('will-quit', stopChildProcesses);
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.once(signal, () => {
    stopChildProcesses();
    app.quit();
  });
}

app.whenReady().then(() => {
  logLaunch('Electron ready');
  commercialService = new CommercialsService(path.join(app.getPath('userData'), 'Commercial Library'));
  channelBreakFinder = new ChannelBreakFinder({
    cachePath: path.join(app.getPath('userData'), 'channel-break-cache.json'),
    getExecutable: async () => (await commercialService.getFFmpegCapabilities()).executable,
    onResolved: filePath => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('channel-breaks-resolved', filePath);
      }
    }
  });
  channelBreakFinder.setPaused(true);
  remoteServer = new RemoteServer({
    settingsPath: path.join(app.getPath('userData'), 'phone-remote.json'),
    staticRoot: path.join(__dirname, 'remote'),
    onCommand: sendRemoteCommand,
    log: logLaunch
  });
  if (remoteServer.settings.enabled) {
    remoteServer.start().catch(error => logLaunch('phone remote could not start', error?.message || String(error)));
  }
  // Commercials are sourced from each channel's own folder; there is no shared WATCH folder.
  try {
    logLaunch('bundled FFmpeg decoder ready', ffmpegExecutable());
    setTimeout(() => catchUpChannelCommercials().catch(() => {}), 8000);
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
      if (parts[0] === 'live' && parts[1]) return serveLiveMedia(request, parts[1]);
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
  ipcMain.handle('choose-channel-source', chooseChannelSource);
  ipcMain.handle('restore-channel-folder', restoreChannelFolder);
  ipcMain.handle('rescan-channel-folder', rescanChannelFolder);
  ipcMain.handle('build-channel-round', buildChannelRound);
  ipcMain.handle('reconcile-channel-playback', (_event, shows, commercials, savedState) => reconcileChannelPlayback(shows, commercials, savedState));
  ipcMain.handle('resolve-channel-breaks', (event, entries) => {
    const roots = [...(channelRoots.get(event.sender.id) || [])];
    const trusted = (Array.isArray(entries) ? entries : []).slice(0, 2000)
      .map(entry => typeof entry?.path === 'string' && path.isAbsolute(entry.path) && roots.some(root => insideRoot(root, path.resolve(entry.path)))
        ? entry : null);
    return channelBreakFinder ? channelBreakFinder.resolve(trusted) : trusted.map(() => null);
  });
  ipcMain.handle('fill-channel-commercial-breaks', (_event, upcoming, commercials, rotation) => fillMissingCommercialBreaks(upcoming, commercials, rotation));
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
  ipcMain.handle('open-channel-media', openChannelMedia);
  ipcMain.handle('set-intermission-active', (_event, active) => {
    intermissionActive = active === true;
    if (intermissionActive) stopLiveMedia();
  });
  ipcMain.handle('get-media-audio-codec', getMediaAudioCodec);
  ipcMain.on('playback-priority', (event, active) => {
    if (event.sender !== televisionWindow?.webContents) return;
    channelBreakFinder?.setPaused(active === true);
  });
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
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !remoteServer?.server) app.quit();
});
