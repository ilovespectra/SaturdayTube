(() => {
  if (window.SaturdayRemote.mirrorMode) return;
  const pad = document.documentElement;
  const outside = event => !event.target.closest('.remote, .remote-back, .remote-settings');
  const status = document.querySelector('#trackpadStatus');
  const { send, noteActivity } = window.SaturdayRemote;
  const pointers = new Map();
  let pending = [];
  let sending = false;
  let timer = null;
  let lastTap = null;
  let dragging = false;
  let multiTouch = false;
  let pair = null;
  let pairTimer = null;
  let safariScale = null;
  const clamp = (number, limit) => Math.max(-limit, Math.min(limit, number));

  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (sending) return;
    sending = true;
    try {
      while (pending.length) {
        const value = pending.shift();
        if (!await send('trackpad', value)) {
          pending = [];
          status.textContent = 'TV not reachable. Check the connection or pair again.';
          return;
        }
        status.textContent = '';
      }
    } finally { sending = false; }
  }
  function emit(value) {
    noteActivity();
    const previous = pending.at(-1);
    if (previous?.type === value.type && ['move', 'scroll'].includes(value.type)) {
      previous.dx = clamp(previous.dx + value.dx, 2000);
      previous.dy = clamp(previous.dy + value.dy, 2000);
    } else if (previous?.type === 'zoom' && value.type === 'zoom') {
      previous.factor = Math.max(0.5, Math.min(2, previous.factor * value.factor));
    } else if (pending.length >= 32) {
      pending = [{ type: 'up' }];
      status.textContent = 'Connection is slow; lift your fingers and try again.';
    } else pending.push(value);
    if (!sending && timer === null) timer = setTimeout(() => { void flush(); }, 16);
  }
  function geometry() {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function releaseDrag() {
    if (dragging) emit({ type: 'up' });
    dragging = false;
  }
  function movePair() {
    clearTimeout(pairTimer);
    pairTimer = null;
    if (pointers.size < 2) return;
    const current = geometry();
    if (pair && pair.distance > 0 && current.distance > 0 && safariScale === null) {
      const factor = current.distance / pair.distance;
      if (Math.abs(Math.log(factor)) > 0.008) {
        emit({ type: 'zoom', factor: Math.max(0.5, Math.min(2, factor)) });
      } else {
        emit({ type: 'scroll', dx: clamp((pair.x - current.x) * 2, 2000), dy: clamp((pair.y - current.y) * 2, 2000) });
      }
    }
    pair = current;
  }
  pad.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (!pointers.size && !outside(event))) return;
    event.preventDefault();
    event.stopPropagation();
    pad.setPointerCapture(event.pointerId);
    const now = performance.now();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, time: now, moved: false });
    if (pointers.size > 1) {
      multiTouch = true;
      lastTap = null;
      releaseDrag();
      pair = geometry();
    } else {
      multiTouch = false;
      if (lastTap && now - lastTap.time < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24) {
        dragging = true;
        lastTap = null;
        emit({ type: 'down' });
      }
    }
  }, { capture: true });
  pad.addEventListener('pointermove', event => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    event.preventDefault();
    const dx = event.clientX - point.x;
    const dy = event.clientY - point.y;
    point.x = event.clientX;
    point.y = event.clientY;
    point.moved ||= Math.hypot(point.x - point.startX, point.y - point.startY) > 6;
    if (pointers.size >= 2) {
      if (pairTimer === null) pairTimer = setTimeout(movePair, 16);
    } else if (!multiTouch && (point.moved || dragging)) {
      if (event.pointerType === 'mouse' && !dragging) {
        dragging = true;
        emit({ type: 'down' });
      }
      emit({ type: 'move', dx: clamp(dx * 2, 2000), dy: clamp(dy * 2, 2000) });
    }
  }, { capture: true });
  function finish(event) {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    if (pairTimer !== null) movePair();
    pointers.delete(event.pointerId);
    pair = null;
    if (!multiTouch && !dragging && event.type === 'pointerup' && !point.moved && performance.now() - point.time < 300) {
      emit({ type: 'click' });
      lastTap = { x: point.x, y: point.y, time: performance.now() };
    } else lastTap = null;
    releaseDrag();
    if (!pointers.size) multiTouch = false;
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, finish);
  pad.addEventListener('wheel', event => {
    if (!outside(event) && !pointers.size) return;
    event.preventDefault();
    if (event.ctrlKey) emit({ type: 'zoom', factor: Math.max(0.5, Math.min(2, Math.exp(-event.deltaY * 0.01))) });
    else emit({ type: 'scroll', dx: clamp(-event.deltaX, 2000), dy: clamp(-event.deltaY, 2000) });
  }, { passive: false });
  pad.addEventListener('gesturestart', event => {
    if (!outside(event) && !pointers.size) return;
    event.preventDefault(); safariScale = 1; releaseDrag();
  }, { passive: false });
  pad.addEventListener('gesturechange', event => {
    if (safariScale === null) return;
    event.preventDefault();
    if (safariScale !== null && event.scale > 0) {
      emit({ type: 'zoom', factor: Math.max(0.5, Math.min(2, event.scale / safariScale)) });
      safariScale = event.scale;
    }
  }, { passive: false });
  pad.addEventListener('gestureend', event => { event.preventDefault(); safariScale = null; }, { passive: false });
  pad.addEventListener('keydown', event => {
    if (!outside(event)) return;
    const direction = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
    if (direction) emit({ type: 'move', dx: direction[0], dy: direction[1] });
    else if (event.key === 'Enter' || event.key === ' ') emit({ type: 'click' });
    else if (['+', '=', '-'].includes(event.key)) emit({ type: 'zoom', factor: event.key === '-' ? 0.9 : 1.1 });
    else return;
    event.preventDefault();
  });
  pad.addEventListener('contextmenu', event => { if (outside(event)) event.preventDefault(); });
  function cancel() {
    clearTimeout(pairTimer);
    pairTimer = null;
    pointers.clear();
    pair = null;
    lastTap = null;
    multiTouch = false;
    safariScale = null;
    releaseDrag();
    void flush();
  }
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
})();
