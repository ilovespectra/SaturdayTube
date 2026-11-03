const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const qrcode = require('./vendor/qrcode-generator/qrcode.js');

const REMOTE_PORT = 47390;
const REMOTE_ACTIONS = new Set([
  'ch-up', 'ch-down', 'ch-last', 'digit', 'enter',
  'vol-up', 'vol-down', 'mute', 'power',
  'play', 'rew', 'ff', 'prev', 'next', 'track-up', 'track-down',
  'input-tv', 'input-vcr', 'input-cycle', 'fullscreen', 'scene-next',
  'up', 'down', 'left', 'right', 'ok', 'back', 'page-prev', 'page-next', 'gamepad',
  'menu', 'guide', 'shelf', 'info', 'add', 'queue', 'trackpad', 'video-fx', 'audio-fx',
  'screen-type', 'color-filter', 'skin-random', 'set'
]);
const STATIC_FILES = {
  '/remote': ['index.html', 'text/html; charset=utf-8'],
  '/remote/': ['index.html', 'text/html; charset=utf-8'],
  '/remote/mirror': ['index.html', 'text/html; charset=utf-8'],
  '/remote/remote.css': ['remote.css', 'text/css; charset=utf-8'],
  '/remote/remote.js': ['remote.js', 'text/javascript; charset=utf-8'],
  '/remote/trackpad.js': ['trackpad.js', 'text/javascript; charset=utf-8'],
  '/remote/icon.png': ['../assets/SaturdayTube.png', 'image/png'],
  '/remote/keepawake.mp4': ['keepawake.mp4', 'video/mp4']
};
const GAMEPAD_BUTTONS = new Set(['up', 'down', 'left', 'right', 'cross', 'square', 'circle', 'triangle', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3', 'start', 'select']);
const GAMEPAD_AXES = ['lx', 'ly', 'rx', 'ry'];
const MIRROR_LEDS = new Set(['off', 'on', 'blink']);
const MIRROR_MAX_PRESSED = 32;
const MIRROR_MAX_BUTTON = 499;
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

function normalizeRemoteCommand(input) {
  if (!input || typeof input !== 'object') return null;
  const action = String(input.action || '');
  if (!REMOTE_ACTIONS.has(action)) return null;
  if (action === 'gamepad') {
    const value = input.value;
    if (!value || typeof value !== 'object' || !Array.isArray(value.buttons) || value.buttons.length > GAMEPAD_BUTTONS.size) return null;
    if (value.buttons.some(button => typeof button !== 'string' || !GAMEPAD_BUTTONS.has(button))) return null;
    const axes = value.axes ?? {};
    if (!axes || typeof axes !== 'object' || Array.isArray(axes)) return null;
    for (const key of Object.keys(axes)) if (!GAMEPAD_AXES.includes(key)) return null;
    if (Object.values(axes).some(number => typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 1)) return null;
    return { action, value: { buttons: [...new Set(value.buttons)], axes: Object.fromEntries(GAMEPAD_AXES.map(key => [key, axes[key] ?? 0])) } };
  }
  if (action === 'trackpad') {
    const value = input.value;
    if (!value || typeof value !== 'object') return null;
    if (['click', 'down', 'up'].includes(value.type)) return { action, value: { type: value.type } };
    if (value.type === 'zoom' && typeof value.factor === 'number' && Number.isFinite(value.factor) && value.factor >= 0.5 && value.factor <= 2) {
      return { action, value: { type: 'zoom', factor: value.factor } };
    }
    if (['move', 'scroll'].includes(value.type) && [value.dx, value.dy].every(number => typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 2000)) {
      return { action, value: { type: value.type, dx: value.dx, dy: value.dy } };
    }
    return null;
  }
  if (action === 'set') {
    // The TV checks the id and value against its own list of back-panel controls; this only keeps them plain.
    const value = input.value;
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value.id)) return null;
    const setting = value.value;
    const plain = typeof setting === 'boolean'
      || (typeof setting === 'number' && Number.isFinite(setting) && Math.abs(setting) <= 100000)
      || (typeof setting === 'string' && /^[\w.#-]{0,64}$/.test(setting));
    return plain ? { action, value: { id: value.id, value: setting } } : null;
  }
  if (action !== 'digit') return { action };
  const value = Number(input.value);
  return Number.isInteger(value) && value >= 0 && value <= 9 ? { action, value } : null;
}

// What a phone remote looks like right now, for the read-only mirror page. Only plain values cross the wire.
function normalizeMirrorSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const pressed = input.pressed ?? [];
  if (!Array.isArray(pressed) || pressed.length > MIRROR_MAX_PRESSED) return null;
  if (pressed.some(index => !Number.isInteger(index) || index < 0 || index > MIRROR_MAX_BUTTON)) return null;
  const dark = Number(input.dark);
  if (!Number.isFinite(dark) || dark < 0 || dark > 1) return null;
  const sticks = {};
  for (const side of ['left', 'right']) {
    const point = input.sticks?.[side] ?? [0, 0];
    if (!Array.isArray(point) || point.length !== 2 || point.some(number => typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 1)) return null;
    sticks[side] = [point[0], point[1]];
  }
  const lcd = input.lcd && typeof input.lcd === 'object' ? input.lcd : {};
  const text = (value, limit) => String(value ?? '').slice(0, limit);
  return {
    pressed: [...new Set(pressed)],
    sticks,
    dark,
    lit: input.lit === true,
    flipped: input.flipped === true,
    grabbed: typeof input.grabbed === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(input.grabbed) ? input.grabbed : '',
    asleep: input.asleep === true,
    settings: input.settings === true,
    unpaired: input.unpaired === true,
    lcd: { main: text(lcd.main, 48), sub: text(lcd.sub, 96), led: MIRROR_LEDS.has(lcd.led) ? lcd.led : 'off' },
    status: text(input.status, 120)
  };
}

function lanAddress(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces || {})) {
    for (const entry of entries || []) {
      const family = typeof entry.family === 'string' ? entry.family : `IPv${entry.family}`;
      if (family !== 'IPv4' || entry.internal || entry.address.startsWith('169.254.')) continue;
      // Wi-Fi/Ethernet first; VPN and bridge adapters are rarely reachable from a phone.
      const rank = /^en\d/.test(name) ? 0 : /^(eth|wlan|wl)/.test(name) ? 1 : /^(utun|tun|tap|bridge|vmnet|vbox|docker|llw|awdl)/.test(name) ? 3 : 2;
      candidates.push({ rank, name, address: entry.address });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return candidates[0]?.address || null;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}

class RemoteServer {
  constructor({ settingsPath, staticRoot, onCommand = () => {}, port = REMOTE_PORT, log = () => {} }) {
    this.settingsPath = settingsPath;
    this.staticRoot = staticRoot;
    this.onCommand = onCommand;
    this.preferredPort = port;
    this.log = log;
    this.server = null;
    this.port = 0;
    this.clients = new Set();
    this.mirrors = new Set();
    this.mirrorSnapshot = null;
    this.state = {};
    this.heartbeat = null;
    this.settings = this.readSettings();
  }

  readSettings() {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')); } catch {}
    const settings = {
      enabled: saved.enabled === true,
      key: /^[a-f0-9]{32}$/.test(saved.key || '') ? saved.key : randomBytes(16).toString('hex')
    };
    if (settings.key !== saved.key) this.writeSettings(settings);
    return settings;
  }

  writeSettings(settings = this.settings) {
    try {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings), { mode: 0o600 });
    } catch (error) {
      this.log('remote settings could not be saved', error?.message || String(error));
    }
  }

  authorized(candidate) {
    const expected = Buffer.from(this.settings.key);
    const given = Buffer.from(String(candidate || ''));
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  url() {
    const address = lanAddress();
    return address && this.port ? `http://${address}:${this.port}/remote#k=${this.settings.key}` : null;
  }

  localUrl(page = '/remote') {
    return this.server && this.port ? `http://127.0.0.1:${this.port}${page}#k=${this.settings.key}` : null;
  }

  mirrorUrl() {
    return this.localUrl('/remote/mirror');
  }

  pairing() {
    const url = this.server ? this.url() : null;
    return {
      enabled: this.settings.enabled,
      running: Boolean(this.server),
      url,
      displayUrl: url ? url.replace(/#.*$/, '') : null,
      svg: url ? qrSvg(url) : null,
      clients: this.clients.size,
      mirrors: this.mirrors.size
    };
  }

  async setEnabled(enabled) {
    this.settings.enabled = enabled === true;
    this.writeSettings();
    if (this.settings.enabled) await this.start();
    else await this.stop();
    return this.pairing();
  }

  async resetKey() {
    this.settings.key = randomBytes(16).toString('hex');
    this.writeSettings();
    this.disconnectAll();
    return this.pairing();
  }

  publishState(state) {
    this.state = state && typeof state === 'object' ? state : {};
    const payload = `event: state\ndata: ${JSON.stringify(this.state)}\n\n`;
    for (const client of this.clients) client.write(payload);
    for (const mirror of this.mirrors) mirror.write(payload);
  }

  // Phones only report their looks while somebody is watching the mirror.
  mirroringPayload() {
    return `event: mirroring\ndata: ${JSON.stringify({ watching: this.mirrors.size > 0 })}\n\n`;
  }

  announceMirroring() {
    const payload = this.mirroringPayload();
    for (const client of this.clients) client.write(payload);
  }

  publishMirror(snapshot) {
    this.mirrorSnapshot = snapshot;
    const payload = `event: mirror\ndata: ${JSON.stringify(snapshot)}\n\n`;
    for (const mirror of this.mirrors) mirror.write(payload);
  }

  disconnectAll() {
    for (const client of this.clients) client.end();
    for (const mirror of this.mirrors) mirror.end();
    this.clients.clear();
    this.mirrors.clear();
    this.mirrorSnapshot = null;
  }

  async start() {
    if (this.server) return;
    const server = http.createServer((request, response) => { void this.handle(request, response); });
    const listen = port => new Promise((resolve, reject) => {
      const onError = error => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '0.0.0.0');
    });
    try {
      await listen(this.preferredPort);
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
      await listen(0);
    }
    this.server = server;
    this.port = server.address().port;
    this.heartbeat = setInterval(() => { for (const client of [...this.clients, ...this.mirrors]) client.write(': still here\n\n'); }, 20000);
    this.log('phone remote listening', `port ${this.port}`);
  }

  async stop() {
    if (!this.server) return;
    clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.disconnectAll();
    const server = this.server;
    this.server = null;
    this.port = 0;
    // Idle keep-alive sockets from earlier presses would otherwise hold close() open for several seconds.
    await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
  }

  async handle(request, response) {
    const url = new URL(request.url, 'http://remote.invalid');
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(302, { ...SECURITY_HEADERS, Location: '/remote' });
        return response.end();
      }
      if (request.method === 'GET' && STATIC_FILES[url.pathname]) {
        const [file, type] = STATIC_FILES[url.pathname];
        const body = await fs.promises.readFile(path.join(this.staticRoot, file));
        // iOS Safari only plays video that is served with byte ranges.
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
        if (range && (range[1] || range[2])) {
          const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
          if (start > end || start >= body.length) {
            response.writeHead(416, { ...SECURITY_HEADERS, 'Content-Range': `bytes */${body.length}` });
            return response.end();
          }
          response.writeHead(206, { ...SECURITY_HEADERS, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
          return response.end(body.subarray(start, end + 1));
        }
        response.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': body.length });
        return response.end(body);
      }
      if (request.method === 'GET' && url.pathname === '/api/events') {
        if (!this.authorized(url.searchParams.get('k'))) return this.reply(response, 401, { error: 'pair-again' });
        response.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        const hello = `retry: 2000\nevent: state\ndata: ${JSON.stringify(this.state)}\n\n`;
        if (url.searchParams.get('mirror') === '1') {
          response.write(this.mirrorSnapshot ? `${hello}event: mirror\ndata: ${JSON.stringify(this.mirrorSnapshot)}\n\n` : hello);
          this.mirrors.add(response);
          if (this.mirrors.size === 1) this.announceMirroring();
          request.on('close', () => {
            if (this.mirrors.delete(response) && !this.mirrors.size) this.announceMirroring();
          });
          return;
        }
        response.write(`${hello}${this.mirroringPayload()}`);
        this.clients.add(response);
        request.on('close', () => this.clients.delete(response));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/mirror') {
        if (!this.authorized(request.headers['x-remote-key'])) return this.reply(response, 401, { error: 'pair-again' });
        const snapshot = normalizeMirrorSnapshot(await readJson(request, 4096));
        if (!snapshot) return this.reply(response, 400, { error: 'bad-mirror' });
        this.publishMirror(snapshot);
        return this.reply(response, 200, { ok: true, watching: this.mirrors.size > 0 });
      }
      if (request.method === 'POST' && url.pathname === '/api/command') {
        if (!this.authorized(request.headers['x-remote-key'])) return this.reply(response, 401, { error: 'pair-again' });
        const command = normalizeRemoteCommand(await readJson(request));
        if (!command) return this.reply(response, 400, { error: 'unknown-button' });
        this.onCommand(command);
        return this.reply(response, 200, { ok: true });
      }
      return this.reply(response, 404, { error: 'not-found' });
    } catch (error) {
      this.log('phone remote request failed', error?.message || String(error));
      if (!response.headersSent) this.reply(response, 400, { error: 'bad-request' });
      else response.end();
    }
  }

  reply(response, status, body) {
    response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  }
}

function readJson(request, limit = 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Remote command is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

module.exports = { RemoteServer, REMOTE_ACTIONS, REMOTE_PORT, normalizeRemoteCommand, normalizeMirrorSnapshot, lanAddress, qrSvg };
