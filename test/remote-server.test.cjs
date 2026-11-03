const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { RemoteServer, normalizeRemoteCommand, normalizeMirrorSnapshot, lanAddress, qrSvg, REMOTE_ACTIONS } = require('../remote-server.cjs');

const read = file => readFileSync(path.join(__dirname, '..', file), 'utf8');

async function startServer(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tube-remote-'));
  const commands = [];
  const server = new RemoteServer({ settingsPath: path.join(dir, 'phone-remote.json'), staticRoot: path.join(__dirname, '..', 'remote'), onCommand: command => commands.push(command), port: 0 });
  await server.setEnabled(true);
  t.after(async () => { await server.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.port}`;
  const press = (body, key = server.settings.key) => fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Remote-Key': key }, body: JSON.stringify(body) });
  return { server, commands, base, press, dir };
}

test('remote commands are whitelisted and digits must be single numbers', () => {
  assert.deepEqual(normalizeRemoteCommand({ action: 'power' }), { action: 'power' });
  assert.deepEqual(normalizeRemoteCommand({ action: 'scene-next' }), { action: 'scene-next' });
  assert.deepEqual(normalizeRemoteCommand({ action: 'ch-up', value: 'ignored' }), { action: 'ch-up' });
  assert.deepEqual(normalizeRemoteCommand({ action: 'digit', value: 7 }), { action: 'digit', value: 7 });
  for (const bad of [null, {}, { action: 'eval' }, { action: 'digit', value: 12 }, { action: 'digit', value: '3; rm' }, { action: '__proto__' }]) {
    assert.equal(normalizeRemoteCommand(bad), null);
  }
  for (const action of ['input-tv', 'input-vcr', 'input-cycle', 'menu', 'guide', 'shelf', 'up', 'down', 'left', 'right', 'ok', 'back', 'play', 'track-up', 'track-down', 'vol-up', 'vol-down', 'add', 'queue']) {
    assert.ok(REMOTE_ACTIONS.has(action), `${action} is a remote button`);
  }
});

test('the Genesis phone gamepad validates, forwards, and releases controller input', async t => {
  const normalized = normalizeRemoteCommand({ action: 'gamepad', value: {
    buttons: ['up', 'cross', 'start', 'cross'], axes: { lx: -0.8, ry: 0.3 }
  } });
  assert.deepEqual(normalized, { action: 'gamepad', value: {
    buttons: ['up', 'cross', 'start'], axes: { lx: -0.8, ly: 0, rx: 0, ry: 0.3 }
  } });
  for (const value of [
    { buttons: ['teleport'], axes: {} },
    { buttons: ['up'], axes: { lx: 1.01 } },
    { buttons: ['up'], axes: { sideways: 1 } },
    { buttons: Array(17).fill('up'), axes: {} },
    { buttons: ['up'], axes: { ly: Infinity } }
  ]) assert.equal(normalizeRemoteCommand({ action: 'gamepad', value }), null);

  const { commands, base, press } = await startServer(t);
  const page = await fetch(`${base}/remote`);
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const button of ['up', 'down', 'left', 'right', 'cross', 'square', 'circle', 'triangle', 'l1', 'r1', 'start', 'select']) {
    assert.match(html, new RegExp(`data-game-button="${button}"`), `${button} exists on the mobile pad`);
  }
  const remote = read('remote/remote.js');
  assert.match(remote, /const nextGameMode = state\.input === 'aux' && !state\.intermission/);
  assert.match(remote, /gamepad\.hidden = !gameModeActive \|\| state\.auxGame !== true/);
  assert.match(remote, /button\.setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(remote, /if \(gameModeActive && \(heldGameButtons\.size \|\| Object\.values\(gameAxes\)\.some\(value => value !== 0\)\)\) void sendGamepadState\(\)/);
  const renderer = read('renderer.js');
  assert.match(renderer, /window\.SaturdayGenesisAux\?\.setPhoneInput\(Array\.isArray\(value\?\.buttons\) \? value\.buttons : \[\], value\?\.axes \|\| \{\}\)/);
  assert.match(renderer, /window\.SaturdayGenesisAux\?\.clearPhoneInput\(\)/);

  assert.equal((await press({ action: 'gamepad', value: { buttons: ['up', 'cross'], axes: { lx: -1 } } })).status, 200);
  assert.deepEqual(commands, [{ action: 'gamepad', value: {
    buttons: ['up', 'cross'], axes: { lx: -1, ly: 0, rx: 0, ry: 0 }
  } }]);
});

test('remote power closes playback and reopens the TV without a renderer to receive the command', () => {
  const main = read('main.cjs');
  const command = main.match(/function sendRemoteCommand\(command\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(command);
  let closed = 0;
  let opened = 0;
  const context = {
    televisionWindow: { isDestroyed: () => false, close: () => { closed += 1; } },
    createWindow: () => { opened += 1; },
    BrowserWindow: { getAllWindows: () => assert.fail('power must not be sent to a renderer') }
  };
  vm.createContext(context);
  vm.runInContext(`${command}\nsendRemoteCommand({ action: 'power' });`, context);
  assert.equal(closed, 1);
  assert.equal(opened, 0);
  context.televisionWindow = null;
  vm.runInContext("sendRemoteCommand({ action: 'power' });", context);
  assert.equal(opened, 1);
  assert.match(main, /win\.on\('closed', \(\) => \{\s*televisionWindow = null;[\s\S]*?remotePointer = null;\s*channelBreakFinder\?\.setPaused\(true\);\s*stopLiveMedia\(\);\s*intermissionActive = false;\s*liveMediaStreams\.clear\(\);/);
  assert.match(main, /if \(!televisionWindow \|\| televisionWindow\.isDestroyed\(\)\) return new Response\('TV is off', \{ status: 410 \}\);/);
  assert.match(read('remote/index.html'), /data-action="power" aria-label="TV power"/);
  assert.match(read('remote/remote.js'), /if \(state\.powered === false\)/);
});

test('the pairing QR points phones at the Wi-Fi address with the key kept out of requests', () => {
  assert.equal(lanAddress({
    lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    utun3: [{ family: 'IPv4', address: '10.8.0.2', internal: false }],
    bridge100: [{ family: 'IPv4', address: '192.168.64.1', internal: false }],
    en0: [{ family: 'IPv6', address: 'fe80::1', internal: false }, { family: 'IPv4', address: '192.168.1.20', internal: false }]
  }), '192.168.1.20');
  assert.equal(lanAddress({ en0: [{ family: 'IPv4', address: '169.254.3.3', internal: false }] }), null);
  const svg = qrSvg('http://192.168.1.20:47390/remote#k=0123456789abcdef0123456789abcdef');
  assert.match(svg, /^<svg[\s\S]*<path/);
  assert.match(read('remote/remote.js'), /history\.replaceState\(null, '', location\.pathname\)/, 'the key leaves the address bar once stored');
});

test('the phone remote only obeys a paired phone and forwards presses to the TV', async t => {
  const { server, commands, base, press, dir } = await startServer(t);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'phone-remote.json'), 'utf8'));
  assert.equal(saved.enabled, true);
  assert.match(saved.key, /^[a-f0-9]{32}$/);

  const page = await fetch(`${base}/remote`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  const html = await page.text();
  for (const action of ['guide', 'menu', 'shelf', 'input-cycle', 'ch-up', 'vol-down', 'play', 'scene-next', 'ok', 'back', 'add', 'queue']) {
    assert.match(html, new RegExp(`data-action="${action}"`), `${action} button is on the remote`);
  }
  assert.equal((html.match(/data-action="digit"/g) || []).length, 10);
  assert.equal((await fetch(`${base}/remote/../main.cjs`)).status, 404);

  assert.equal((await press({ action: 'ch-up' }, 'f'.repeat(32))).status, 401);
  assert.equal((await press({ action: 'ch-up' }, '')).status, 401);
  assert.equal((await press({ action: 'launch-missiles' })).status, 400);
  assert.equal((await press({ action: 'digit', value: 9 })).status, 200);
  assert.equal((await press({ action: 'guide' })).status, 200);
  assert.deepEqual(commands, [{ action: 'digit', value: 9 }, { action: 'guide' }]);

  assert.equal((await fetch(`${base}/api/events?k=nope`)).status, 401);
  const controller = new AbortController();
  const events = await fetch(`${base}/api/events?k=${server.settings.key}`, { signal: controller.signal });
  assert.equal(events.headers.get('content-type'), 'text/event-stream');
  const reader = events.body.getReader();
  await reader.read();
  server.publishState({ input: 'tv', channel: { number: 9, abbreviation: 'DSNY' } });
  const { value } = await reader.read();
  assert.match(Buffer.from(value).toString(), /event: state\ndata: \{"input":"tv","channel":\{"number":9,"abbreviation":"DSNY"\}\}/);
  controller.abort();

  const oldKey = server.settings.key;
  await server.resetKey();
  assert.equal((await press({ action: 'ch-up' }, oldKey)).status, 401, 'a new pairing code disconnects old phones');
  assert.equal((await press({ action: 'ch-up' })).status, 200);
  const pairing = server.pairing();
  assert.equal(pairing.running, true);
  if (pairing.url) assert.ok(pairing.url.endsWith(`/remote#k=${server.settings.key}`));
  const localUrl = server.localUrl();
  assert.equal(localUrl, `http://127.0.0.1:${server.port}/remote#k=${server.settings.key}`);
  const localPairing = new URL(localUrl);
  const localKey = new URLSearchParams(localPairing.hash.slice(1)).get('k');
  assert.equal((await fetch(`${localPairing.origin}/api/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Remote-Key': localKey },
    body: JSON.stringify({ action: 'ch-up' })
  })).status, 200, 'the same-device link carries the existing pairing authorization');

  await server.setEnabled(false);
  await assert.rejects(fetch(`${base}/remote`));
});

test('remote buttons drive the same controls as the cabinet', () => {
  const renderer = read('renderer.js');
  const main = read('main.cjs');
  assert.match(main, /remoteServer\.settings\.enabled/, 'the remote stays off until switched on in settings');
  assert.match(renderer, /case 'guide': void remoteGuide\(\)/);
  assert.match(renderer, /if \(selectedInput !== 'tv'\) setInputSource\('tv'\);\n  if \(await waitForTVInput\(\)\) openTVGuide\(\);/);
  assert.match(renderer, /case 'menu':[\s\S]*?tvSettingsDialog\.close\(\)[\s\S]*?showScreenDialog\(tvSettingsDialog\)/);
  assert.match(renderer, /case 'shelf': if \(libraryDialog\.open\) libraryDialog\.close\(\); else void openLibrary\(\)/);
  assert.match(renderer, /case 'input-cycle': inputButton\.click\(\)/);
  assert.match(renderer, /new MouseEvent\('click', \{ bubbles: true, cancelable: true, shiftKey: true \}\)/, 'ADD queues a tape like shift-tap');
  assert.match(renderer, /scope === libraryDialog && libraryView && libraryView\.current !== libraryView\.root/, 'BACK climbs the shelf before closing it');
  assert.match(renderer, /return Number\.isFinite\(numbered\) \? numbered : channels\.indexOf\(channel\) \+ 1;/, 'typed numbers follow the folder numbers');
});

test('the remote keeps the phone awake with a range-served video and sleeps itself after 30 seconds', async t => {
  const { base } = await startServer(t);
  const full = await fetch(`${base}/remote/keepawake.mp4`);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  assert.match(full.headers.get('content-security-policy'), /media-src 'self'/);
  const size = (await full.arrayBuffer()).byteLength;
  assert.ok(size > 0);
  const part = await fetch(`${base}/remote/keepawake.mp4`, { headers: { Range: 'bytes=0-1' } });
  assert.equal(part.status, 206, 'iOS needs byte ranges to play video');
  assert.equal(part.headers.get('content-range'), `bytes 0-1/${size}`);
  assert.equal((await part.arrayBuffer()).byteLength, 2);
  assert.equal((await fetch(`${base}/remote/keepawake.mp4`, { headers: { Range: `bytes=${size}-` } })).status, 416);

  const html = read('remote/index.html');
  assert.match(html, /<video class="keep-awake" id="keepAwake" src="\/remote\/keepawake\.mp4" muted playsinline loop/);
  assert.match(html, /id="sleepVeil"/);
  const js = read('remote/remote.js');
  assert.match(js, /const BACKLIGHT_MS = 3000;/);
  assert.match(js, /const SLEEP_AFTER_MS = 30000;/);
  assert.match(js, /AmbientLightSensor/);
  assert.match(js, /navigator\.wakeLock\.request\('screen'\)/);
  assert.match(js, /if \(document\.body\.classList\.contains\('asleep'\)\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*return wake\(\);/, 'the waking tap never presses a key');
  assert.match(js, /button\.classList\.add\('pressed'\);\s*lightKeys\(\);/, 'pressing a button lights the keys');
  assert.equal((js.match(/lightKeys\(\);/g) || []).length, 4, 'only deliberate control interactions light the keys, not waking or dragging');
  assert.match(read('remote/index.html'), /data-action="page-prev"[\s\S]*data-action="page-next"/);
  assert.ok(REMOTE_ACTIONS.has('page-prev') && REMOTE_ACTIONS.has('page-next'));
  const css = read('remote/remote.css');
  assert.match(css, /\.remote::before \{[^}]*opacity: var\(--dark\);/, 'the plastic fades fully out in a dark room');
  assert.match(js, /Math\.log10\(lux\) - Math\.log10\(40\)/, 'dim light (40 lux or less) reads as fully dark');
  assert.match(js, /if \(hour >= 18 \|\| hour < 7\) darkness = 1;/);
  assert.match(js, /if \(prefersDark\?\.matches\) darkness = Math\.max\(darkness, 0\.85\);/);
  assert.match(css, /body\.lit \.remote button, body\.lit \.rocker \{/, 'every press lights the keys, in any light');
  assert.match(css, /--glow: calc\(\.3 \+ var\(--dark\) \* \.7\)/, 'the glow is faint in a bright room and full in the dark');
  assert.doesNotMatch(css, /html\.dim body\.lit/);
  assert.match(css, /body\.asleep \.sleep-veil \{ opacity: 1; pointer-events: auto; \}/);
});

test('the same Mac can open an authorized remote without replacing phone QR pairing', () => {
  const html = read('index.html');
  const main = read('main.cjs');
  const preload = read('preload.cjs');
  const renderer = read('renderer.js');
  assert.match(html, /id="remoteOpenButton"[^>]*>OPEN ON THIS MAC/);
  assert.match(html, /id="remoteQr"[^>]*hidden/, 'the phone QR remains available');
  assert.match(preload, /openRemoteOnThisMac: \(\) => ipcRenderer\.invoke\('remote-open-on-this-mac'\)/);
  assert.match(main, /const url = remoteServer\?\.localUrl\(\);[\s\S]*?await shell\.openExternal\(url\)/);
  assert.match(renderer, /window\.tube\.openRemoteOnThisMac\(\)/);
  assert.match(read('remote-server.cjs'), /localUrl\(page = '\/remote'\) \{[\s\S]*?127\.0\.0\.1:\$\{this\.port\}\$\{page\}#k=\$\{this\.settings\.key\}/);
});

test('mirror snapshots are plain, bounded values', () => {
  const good = {
    pressed: [3, 3, 41], sticks: { left: [0.5, -1], right: [0, 0] }, dark: 0.62, lit: true, asleep: false,
    settings: false, unpaired: false, lcd: { main: 'CH 9 DSNY', sub: 'x'.repeat(200), led: 'blink' }, status: '', extra: '<script>'
  };
  const snapshot = normalizeMirrorSnapshot(good);
  assert.deepEqual(snapshot.pressed, [3, 41]);
  assert.equal(snapshot.lcd.sub.length, 96);
  assert.equal(snapshot.lcd.led, 'blink');
  assert.equal(snapshot.extra, undefined);
  assert.equal(normalizeMirrorSnapshot({ ...good, lcd: { led: 'rainbow' } }).lcd.led, 'off');
  for (const bad of [null, [], { ...good, dark: 2 }, { ...good, dark: undefined }, { ...good, pressed: [-1] }, { ...good, pressed: ['1'] },
    { ...good, pressed: Array.from({ length: 33 }, (_, i) => i) }, { ...good, sticks: { left: [2, 0] } }, { ...good, sticks: { right: [0] } }]) {
    assert.equal(normalizeMirrorSnapshot(bad), null);
  }
});

test('the screen mirror follows the paired phone without counting as a remote or pressing buttons', async t => {
  const { server, commands, base } = await startServer(t);
  const key = server.settings.key;
  const page = await fetch(`${base}/remote/mirror`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="mirrorBadge"/);
  assert.equal(server.mirrorUrl(), `http://127.0.0.1:${server.port}/remote/mirror#k=${key}`);

  const decoder = new TextDecoder();
  const open = async query => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/events?${query}`, { signal: controller.signal });
    const reader = response.body.getReader();
    let buffer = '';
    const next = async pattern => {
      while (!pattern.test(buffer)) buffer += decoder.decode((await reader.read()).value);
      const match = buffer.match(pattern);
      buffer = buffer.slice(match.index + match[0].length);
      return match;
    };
    t.after(() => controller.abort());
    return { response, next, close: () => controller.abort() };
  };
  const snapshot = { pressed: [4], sticks: { left: [0, 0], right: [0, 0] }, dark: 0.3, lit: true, flipped: false, grabbed: '', asleep: false, settings: false, unpaired: false, lcd: { main: 'CH 9', sub: 'DSNY', led: 'on' }, status: '' };
  const post = (body, k = key) => fetch(`${base}/api/mirror`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Remote-Key': k }, body: JSON.stringify(body) });

  const phone = await open(`k=${key}`);
  await phone.next(/event: mirroring\ndata: \{"watching":false\}/);
  assert.equal((await open('k=nope&mirror=1')).response.status, 401);
  assert.equal((await post(snapshot, 'f'.repeat(32))).status, 401);
  assert.equal((await post({ ...snapshot, dark: 9 })).status, 400);

  const mirror = await open(`k=${key}&mirror=1`);
  await phone.next(/event: mirroring\ndata: \{"watching":true\}/);
  assert.equal(server.pairing().clients, 1, 'the mirror is not counted as a paired phone');
  assert.equal(server.pairing().mirrors, 1);
  const response = await post(snapshot);
  assert.deepEqual(await response.json(), { ok: true, watching: true });
  const [, data] = await mirror.next(/event: mirror\ndata: (.*)\n\n/);
  assert.deepEqual(JSON.parse(data), snapshot);
  server.publishState({ input: 'tv' });
  await mirror.next(/event: state\ndata: \{"input":"tv"\}/);
  assert.deepEqual(commands, [], 'mirroring never presses a button');

  const late = await open(`k=${key}&mirror=1`);
  await late.next(/event: mirror\ndata: \{"pressed":\[4\]/);
  mirror.close();
  late.close();
  await phone.next(/event: mirroring\ndata: \{"watching":false\}/);
  await server.resetKey();
  assert.equal(server.mirrorSnapshot, null, 'a new pairing code forgets the last mirrored remote');
});

test('the mirror page is read-only and the TV settings open it in the browser', () => {
  const js = read('remote/remote.js');
  assert.match(js, /const mirrorMode = \/\^\\\/remote\\\/mirror\\\/\?\$\/\.test\(location\.pathname\)/);
  assert.match(js, /async function send\(action, value\) \{\s*if \(mirrorMode\) return false;/);
  assert.match(js, /if \(mirrorMode \|\| !key \|\| !mirrorWatched\) return;/, 'phones stay quiet until a mirror watches');
  assert.match(read('remote/trackpad.js'), /if \(window\.SaturdayRemote\.mirrorMode\) return;/);
  assert.match(read('remote/remote.css'), /html\.mirror \.remote-workspace[^{]*\{ pointer-events: none; \}/);
  assert.match(read('index.html'), /id="remoteMirrorButton"[^>]*>SCREEN MIRROR/);
  assert.match(read('preload.cjs'), /openRemoteMirror: \(\) => ipcRenderer\.invoke\('remote-open-mirror'\)/);
  assert.match(read('main.cjs'), /ipcMain\.handle\('remote-open-mirror'[\s\S]*?const url = remoteServer\?\.mirrorUrl\(\);[\s\S]*?await shell\.openExternal\(url\)/);
  assert.match(read('renderer.js'), /window\.tube\.openRemoteMirror\(\)/);
});

test('the fullscreen window button keeps its icon and accessible name without visible WINDOW text', () => {
  const html = read('remote/index.html');
  const js = read('remote/remote.js');
  assert.match(html, /id="fullscreenKey"[^>]*aria-label="Change fullscreen view; currently window"[^>]*title="Change fullscreen view; currently window"/);
  assert.match(html, /<span id="fullscreenMode" aria-hidden="true"><\/span>/);
  assert.match(js, /fullscreenKey\.querySelector\('span'\)\.textContent = mode === 'off' \? '' : label/);
  assert.match(js, /fullscreenKey\.setAttribute\('aria-label', description\);\s*fullscreenKey\.title = description/);
});

test('remote settings key opens a darkness slider and PAGE keys stay above the dark shade', () => {
  const html = read('remote/index.html');
  const css = read('remote/remote.css');
  const js = read('remote/remote.js');
  assert.match(html, /id="remoteSettingsKey"/);
  assert.match(html, /<input id="darknessSlider" type="range" min="0" max="100"/);
  assert.match(html, /<input id="darknessAuto" type="checkbox">/);
  assert.match(css, /\.page-key \{ position: absolute; top: 10px; z-index: 2;/, 'rotated PAGE labels form their own layer, so it must sit above the shade');
  assert.match(js, /const LEGACY_LIGHT_MODES = \{ bright: 0, dim: 60, dark: 100 \};/);
  assert.match(js, /manualDarkness !== null \? manualDarkness \/ 100 : sensorDarkness \?\? estimatedDarkness\(\)/);
  assert.match(js, /darknessSlider\?\.addEventListener\('input', \(\) => setManualDarkness\(darknessSlider\.value\)\);/);
});

test('the whole remote fits the screen by default, leaving trackpad room, and REMOTE SIZE can grow it to the full width', () => {
  const js = read('remote/remote.js');
  assert.match(js, /let remoteSize = Number\.isFinite\(savedSize\) \? Math\.max\(0, Math\.min\(100, savedSize\)\) : 0;/);
  assert.match(js, /const fill = Math\.min\(1\.6, \(width - 20\) \/ 340\);/);
  assert.match(js, /if \(natural > 0\) whole = Math\.min\(fill, \(height - padding\) \/ natural\);/);
  assert.match(js, /const scale = Math\.max\(0\.35, whole \+ \(fill - whole\) \* remoteSize \/ 100\);/);
  assert.match(js, /localStorage\.setItem\(SIZE_STORAGE, String\(remoteSize\)\);\s*showSize\(\);\s*fitToScreen\(\);/);
  assert.match(read('remote/index.html'), /<input id="sizeSlider" type="range" min="0" max="100" step="1" value="0"/);
});

test('the remote toggles the TV video and audio effects and lights each key while they are on', () => {
  assert.deepEqual(normalizeRemoteCommand({ action: 'video-fx' }), { action: 'video-fx' });
  assert.deepEqual(normalizeRemoteCommand({ action: 'audio-fx' }), { action: 'audio-fx' });
  const html = read('remote/index.html');
  assert.match(html, /id="videoFxKey"[^>]*data-action="video-fx"[^>]*aria-pressed="true"[\s\S]*?VIDEO FX/);
  assert.match(html, /id="audioFxKey"[^>]*data-action="audio-fx"[^>]*aria-pressed="true"[\s\S]*?AUDIO FX/);
  const renderer = read('renderer.js');
  assert.match(renderer, /case 'video-fx': pictureBypassToggle\.click\(\); break;/, 'the remote flips the same switch as PICTURE FILTER BYPASS');
  assert.match(renderer, /case 'audio-fx': audioBypassToggle\.click\(\); break;/, 'the remote flips the same switch as FX BYPASS');
  assert.match(renderer, /videoFx: pictureFiltersEnabled,\s*audioFx: audioFiltersEnabled/);
  const js = read('remote/remote.js');
  assert.match(js, /fxKey\.setAttribute\('aria-pressed', String\(enabled\)\)/);
  assert.match(js, /showFlash\(`VIDEO FX \$\{state\.videoFx \? 'ON' : 'OFF'\}`\)/);
  assert.match(read('remote/remote.css'), /\.fx-key\[aria-pressed="true"\] \.fx-led \{ background: #59ff74;/);
});

test('the remote switches the screen type, cycles color filters and paints the cabinet a random color', () => {
  for (const action of ['screen-type', 'color-filter', 'skin-random']) assert.deepEqual(normalizeRemoteCommand({ action }), { action });
  const html = read('remote/index.html');
  assert.match(html, /id="screenTypeKey"[^>]*data-action="screen-type"/);
  assert.match(html, /id="colorFilterKey"[^>]*data-action="color-filter"/);
  assert.match(html, /id="skinKey"[^>]*data-action="skin-random"[\s\S]*?class="skin-swatch"/);
  const renderer = read('renderer.js');
  assert.match(renderer, /case 'screen-type': setRemotePanelControl\('display-mode', displayMode === 'rear' \? 'crt' : 'rear'\)/);
  assert.match(renderer, /case 'skin-random': setCabinetTint\(randomCabinetTint\(\)\)/);
  assert.match(renderer, /displayMode,\s*pictureMode: selectedPictureMode,\s*skinColor: cabinetTint,\s*panel: remotePanelSnapshot\(\)/);
  const js = read('remote/remote.js');
  assert.match(js, /screenTypeKey\.textContent = state\.displayMode === 'rear' \? 'REAR' : 'CRT'/);
  assert.match(js, /style\.setProperty\('--skin', state\.skinColor\)/);
});

test('back-panel settings travel as a plain id and value only', () => {
  assert.deepEqual(normalizeRemoteCommand({ action: 'set', value: { id: 'scanlines', value: 40 } }), { action: 'set', value: { id: 'scanlines', value: 40 } });
  assert.deepEqual(normalizeRemoteCommand({ action: 'set', value: { id: 'picture-mode', value: 'bw', extra: 1 } }), { action: 'set', value: { id: 'picture-mode', value: 'bw' } });
  assert.deepEqual(normalizeRemoteCommand({ action: 'set', value: { id: 'intermission', value: false } }), { action: 'set', value: { id: 'intermission', value: false } });
  for (const value of [undefined, 'scanlines', { id: 'Scan Lines', value: 1 }, { id: 'scanlines', value: Infinity }, { id: 'scanlines', value: 1e9 },
    { id: 'scanlines', value: '<b>' }, { id: 'scanlines', value: { nested: 1 } }, { id: 'scanlines' }]) {
    assert.equal(normalizeRemoteCommand({ action: 'set', value }), null, JSON.stringify(value));
  }
  const mirror = { pressed: [], sticks: {}, dark: 0, lcd: {} };
  assert.deepEqual(normalizeMirrorSnapshot({ ...mirror, flipped: true, grabbed: 'scene-zoom' }), { ...normalizeMirrorSnapshot(mirror), flipped: true, grabbed: 'scene-zoom' });
  assert.equal(normalizeMirrorSnapshot({ ...mirror, grabbed: '<script>' }).grabbed, '');
});

test('the back panel drives the TV settings through the same elements and events as the menu', () => {
  const source = read('renderer.js');
  const start = source.indexOf('function randomCabinetTint()');
  const end = source.indexOf('function remoteStateSnapshot()');
  assert.ok(start > 0 && end > start);
  const events = [];
  const element = (id, props) => ({ id, disabled: false, dispatchEvent(event) { events.push([id, event.type]); }, ...props });
  const select = (id, values) => element(id, { tagName: 'SELECT', value: values[0], options: values.map(value => ({ value, textContent: value.toUpperCase(), disabled: false })) });
  const range = (id, min, max, step, value) => element(id, { tagName: 'INPUT', type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const checkbox = id => element(id, { tagName: 'INPUT', type: 'checkbox', checked: false });
  const elements = {
    '#pictureMode': select('pictureMode', ['color', 'lowstim', 'bw']),
    '#displayMode': select('displayMode', ['crt', 'rear']),
    '#sceneZoom': range('sceneZoom', 25, 3200, 1, 100),
    '#sceneAutoZoomRate': range('sceneAutoZoomRate', 0.1, 2, 0.1, 0.5),
    '#intermissionEnabled': checkbox('intermissionEnabled'),
    '#intermissionInterval': element('intermissionInterval', { tagName: 'INPUT', type: 'number', min: '1', max: '480', step: '1', value: '30' })
  };
  const dial = (id, value) => ({ id, value, getAttribute: name => ({ 'aria-valuemin': '0', 'aria-valuemax': '100' })[name] });
  const dials = Object.fromEntries(['scanlineDial', 'curveDial', 'edgeBlurDial', 'hueDial', 'vhsScanDial', 'glitchDial', 'brokenTapeDial', 'glowDial', 'brightnessDial', 'fxAmountDial'].map(name => [name, dial(name, 50)]));
  const changed = [];
  const dialChangeHandlers = new Map(Object.values(dials).map(item => [item, () => changed.push(item.id)]));
  let pictureClicks = 0;
  const context = vm.createContext({
    ...dials, dialChangeHandlers, Map, Math, Number, String, Event: class { constructor(type) { this.type = type; } },
    dialValue: item => item.value, setDialValue: (item, value) => { item.value = Math.max(0, Math.min(100, Math.round(value))); },
    pictureFiltersEnabled: true, audioFiltersEnabled: true, tvLevelerEnabled: true, soundEffectsEnabled: true,
    pictureBypassToggle: { click: () => { pictureClicks += 1; } }, audioBypassToggle: {}, tvLevelerToggle: {}, soundEffectsToggle: {},
    document: { querySelector: selector => elements[selector] || null }
  });
  vm.runInContext(`${source.slice(start, end)}; this.api = { REMOTE_PANEL_CONTROLS, remotePanelSnapshot, setRemotePanelControl, randomCabinetTint };`, context);
  const { remotePanelSnapshot, setRemotePanelControl, randomCabinetTint } = context.api;

  for (let index = 0; index < 50; index += 1) assert.match(randomCabinetTint(), /^#[0-9a-f]{6}$/);
  const panel = remotePanelSnapshot();
  const byId = Object.fromEntries(panel.map(item => [item.id, item]));
  assert.deepEqual(new Set(panel.map(item => item.group)), new Set(['video', 'audio', 'scene', 'intermission']));
  assert.deepEqual(JSON.parse(JSON.stringify(byId['picture-mode'].options.map(option => option.value))), ['color', 'lowstim', 'bw']);
  assert.equal(byId['scene-zoom'].scale, 'log');
  assert.equal(byId['intermission-interval'].max, 240, 'the remote knob stops at four hours');
  assert.equal(byId['scene-light'], undefined, 'controls missing from the page are left off the panel');

  setRemotePanelControl('scanlines', 140);
  assert.equal(dials.scanlineDial.value, 100);
  assert.deepEqual(changed, ['scanlineDial']);
  setRemotePanelControl('scanlines', 100);
  assert.deepEqual(changed, ['scanlineDial'], 'an unchanged dial is not re-applied');
  setRemotePanelControl('picture-mode', 'bw');
  setRemotePanelControl('picture-mode', 'sepia');
  assert.equal(elements['#pictureMode'].value, 'bw');
  setRemotePanelControl('scene-zoom', 5000);
  setRemotePanelControl('scene-auto-zoom-rate', 0.30000000000000004);
  setRemotePanelControl('intermission', true);
  setRemotePanelControl('intermission-interval', 999);
  assert.equal(elements['#sceneZoom'].value, '3200');
  assert.equal(elements['#sceneAutoZoomRate'].value, '0.3');
  assert.equal(elements['#intermissionEnabled'].checked, true);
  assert.equal(elements['#intermissionInterval'].value, '240');
  assert.deepEqual(events, [['pictureMode', 'change'], ['sceneZoom', 'input'], ['sceneAutoZoomRate', 'input'], ['intermissionEnabled', 'change'], ['intermissionInterval', 'change']]);
  setRemotePanelControl('picture-fx', true);
  setRemotePanelControl('picture-fx', false);
  assert.equal(pictureClicks, 1, 'toggles only flip when the requested state differs');
  setRemotePanelControl('constructor', 1);
  setRemotePanelControl('__proto__', 1);
});

test('the remote flips over to analog controls built from the TV panel, and the mirror follows the flip', () => {
  const html = read('remote/index.html');
  assert.match(html, /class="remote-foot">\s*<button class="key round dark flip-key" id="flipKey"/);
  assert.match(html, /<main class="remote-back" id="remoteBack"[\s\S]*?id="backGroups"[\s\S]*?id="backFlipKey"[\s\S]*?<\/main>\s*<output id="trackpadStatus"/);
  const js = read('remote/remote.js');
  assert.match(js, /const build = \{ knob: buildKnob, switch: buildSwitch, selector: buildSelector, button: buildButton \}\[control\.kind\]/);
  assert.match(js, /function setControl\(id, value\) \{ return send\('set', \{ id, value \}\); \}/);
  assert.match(js, /if \(widget\.drag \|\| Date\.now\(\) < \(widget\.holdUntil \|\| 0\)\) continue;/, 'a knob under a finger is not snapped back by the TV state');
  assert.match(js, /flipped: workspace\?\.classList\.contains\('flipped'\) === true/);
  assert.match(js, /setFlipped\(snapshot\.flipped === true\);/);
  assert.match(js, /if \(!mirrorMode\) \{\s*for \(const flip of/, 'the mirror cannot flip itself');
  assert.match(read('remote/trackpad.js'), /closest\('\.remote, \.remote-back, \.remote-settings'\)/);
  const css = read('remote/remote.css');
  assert.match(css, /\.remote-workspace\.flipped \.remote \{ display: none; \}/);
  assert.match(css, /html\.mirror \.remote-back \{ pointer-events: none; \}/);
});
