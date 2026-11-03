const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeRemoteCommand } = require('../remote-server.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function trackpad(send = async () => true) {
  const handlers = {};
  const windows = {};
  const timers = new Map();
  const sent = [];
  let time = 0;
  let id = 0;
  const status = {};
  const pad = { addEventListener: (name, callback) => { handlers[name] = callback; }, setPointerCapture() {} };
  vm.runInNewContext(read('remote/trackpad.js'), {
    document: { documentElement: pad, querySelector: () => status, addEventListener() {} },
    window: {
      SaturdayRemote: { send: async (action, value) => { sent.push({ ...value }); return send(value); }, noteActivity() {} },
      addEventListener: (name, callback) => { windows[name] = callback; }
    },
    performance: { now: () => time },
    setTimeout(callback) { timers.set(++id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    sent, status, windows,
    event(type, pointerId, x = 50, y = 50, extra = {}) {
      time += 10;
      handlers[type]({ type, pointerId, button: 0, clientX: x, clientY: y,
        target: { closest() { return null; } }, preventDefault() {}, stopPropagation() {}, ...extra });
    },
    async flush() {
      await new Promise(resolve => setImmediate(resolve));
      for (let turn = 0; turn < 10 && timers.size; turn++) {
        const batch = [...timers.entries()];
        for (const [id, callback] of batch) { if (timers.delete(id)) callback(); }
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  };
}

test('trackpad protocol only accepts finite, bounded app pointer input', () => {
  for (const value of [
    { type: 'move', dx: -25.5, dy: 80 }, { type: 'scroll', dx: 0, dy: -100 },
    { type: 'zoom', factor: 1.2 }, { type: 'down' }, { type: 'up' }, { type: 'click' }
  ]) assert.deepEqual(normalizeRemoteCommand({ action: 'trackpad', value }), { action: 'trackpad', value });
  for (const value of [
    null, {}, { type: 'move', dx: Infinity, dy: 0 }, { type: 'move', dx: '2', dy: 0 },
    { type: 'scroll', dx: 0, dy: -2001 }, { type: 'zoom', factor: NaN },
    { type: 'zoom', factor: 0 }, { type: 'zoom', factor: 3 }, { type: 'keyDown', key: 'Meta' }
  ]) assert.equal(normalizeRemoteCommand({ action: 'trackpad', value }), null);
});

test('one finger moves, taps click, and double-tap-and-hold produces an ordered native drag', async () => {
  const app = trackpad();
  app.event('pointerdown', 1);
  app.event('pointermove', 1, 80, 60);
  app.event('pointerup', 1, 80, 60);
  await app.flush();
  assert.deepEqual(app.sent, [{ type: 'move', dx: 60, dy: 20 }]);
  app.sent.length = 0;
  app.event('pointerdown', 1);
  app.event('pointerup', 1);
  app.event('pointerdown', 2);
  app.event('pointermove', 2, 70, 50);
  app.event('pointerup', 2, 70, 50);
  await app.flush();
  assert.deepEqual(app.sent, [{ type: 'click' }, { type: 'down' }, { type: 'move', dx: 40, dy: 0 }, { type: 'up' }]);
});

test('two fingers pinch without clicking, dragging or moving the TV cursor', async () => {
  const app = trackpad();
  app.event('pointerdown', 1, 50, 50);
  app.event('pointerdown', 2, 150, 50);
  app.event('pointermove', 1, 25, 50);
  app.event('pointermove', 2, 175, 50);
  await app.flush();
  app.event('pointerup', 1);
  app.event('pointerup', 2);
  await app.flush();
  assert.deepEqual(app.sent, [{ type: 'zoom', factor: 1.5 }]);
});

test('parallel two-finger motion scrolls menus instead of accidentally zooming', async () => {
  const app = trackpad();
  app.event('pointerdown', 1, 50, 50);
  app.event('pointerdown', 2, 150, 50);
  app.event('pointermove', 1, 70, 60);
  app.event('pointermove', 2, 170, 60);
  await app.flush();
  assert.deepEqual(app.sent, [{ type: 'scroll', dx: -40, dy: -20 }]);
  app.event('pointerup', 1);
  app.event('pointermove', 2, 190, 60);
  app.event('pointerup', 2);
  await app.flush();
  assert.equal(app.sent.length, 1, 'lifting a pinch finger cannot accidentally move/click the TV');
});

test('cancellation and leaving the remote always release an in-progress drag', async () => {
  for (const release of ['pointercancel', 'lostpointercapture', 'blur']) {
    const app = trackpad();
    app.event('pointerdown', 1);
    app.event('pointerup', 1);
    app.event('pointerdown', 2);
    if (release === 'blur') app.windows.blur();
    else app.event(release, 2);
    await app.flush();
    assert.deepEqual(app.sent.map(value => value.type), ['click', 'down', 'up'], release);
  }
});

test('trackpad HTTP requests are serialized and motion is coalesced while the network is busy', async () => {
  let finish;
  const app = trackpad(() => new Promise(resolve => { finish = resolve; }));
  app.event('pointerdown', 1);
  app.event('pointermove', 1, 70);
  await app.flush();
  for (let x = 71; x <= 170; x++) app.event('pointermove', 1, x);
  await app.flush();
  assert.equal(app.sent.length, 1);
  finish(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.sent.length, 2);
  assert.deepEqual(app.sent[1], { type: 'move', dx: 200, dy: 0 });
  finish(true);
  await new Promise(resolve => setImmediate(resolve));
});

test('connection errors are visible and do not replay stale gestures later', async () => {
  const app = trackpad(async () => false);
  app.event('pointerdown', 1);
  app.event('pointerup', 1);
  app.event('pointerdown', 2);
  await app.flush();
  assert.match(app.status.textContent, /not reachable/);
  assert.equal(app.sent.length, 1);
});

test('non-macOS fallback clamps TV input and releases disconnected drags', () => {
  const main = read('main.cjs');
  const source = main.match(/function sendTrackpadInput\(value\) \{[\s\S]*?\n\}/)[0];
  const events = [];
  const messages = [];
  let release;
  const context = {
    process: { platform: 'linux' },
    remotePointer: null, remotePointerRelease: null,
    televisionWindow: {
      isDestroyed: () => false, getContentSize: () => [1000, 700],
      webContents: { isDestroyed: () => false, send: (...args) => messages.push(args), sendInputEvent: event => events.push(event) }
    },
    setTimeout(callback) { release = callback; return 1; }, clearTimeout() {}
  };
  const input = vm.runInNewContext(`${source}; sendTrackpadInput`, context);
  input({ type: 'move', dx: 2000, dy: -2000 });
  assert.equal(events.at(-1).x, 999);
  assert.equal(events.at(-1).y, 0);
  input({ type: 'down' });
  input({ type: 'move', dx: -10, dy: 10 });
  assert.deepEqual([...events.at(-1).modifiers], ['leftButtonDown']);
  release();
  assert.equal(events.at(-1).type, 'mouseUp');
  assert.equal(events.at(-1).x, 989);
  const count = events.length;
  input({ type: 'zoom', factor: 1.2 });
  assert.equal(events.length, count, 'pinch goes through the shared scene zoom rather than browser zoom');
  assert.equal(messages.at(-1)[1].value.factor, 1.2);
  context.televisionWindow = null;
  input({ type: 'click' });
  assert.equal(events.length, count, 'TV off never sends input elsewhere');
});

test('outside gestures continue across the handset while handset starts stay buttons', async () => {
  const app = trackpad();
  const inside = { target: { closest() { return {}; } } };
  app.event('pointerdown', 1, 50, 50, inside);
  app.event('pointerup', 1);
  await app.flush();
  assert.equal(app.sent.length, 0);
  app.event('pointerdown', 2);
  app.event('pointermove', 2, 80, 60, inside);
  app.event('pointerup', 2, 80, 60, inside);
  await app.flush();
  assert.deepEqual(app.sent, [{ type: 'move', dx: 60, dy: 20 }]);
});

test('macOS routes cursor events to the desktop helper instead of an invisible TV pointer', () => {
  const source = read('main.cjs').match(/function sendTrackpadInput\(value\) \{[\s\S]*?\n\}/)[0];
  const sent = [];
  const input = vm.runInNewContext(`${source}; sendTrackpadInput`, {
    process: { platform: 'darwin' }, sendDesktopTrackpad: value => sent.push(value)
  });
  input({ type: 'move', dx: 10, dy: 20 });
  input({ type: 'click' });
  assert.equal(sent.length, 2);
});
