(() => {
  const KEY_STORAGE = 'saturday-tube-remote-key';
  const hashKey = location.hash.match(/k=([a-f0-9]{32})/)?.[1];
  if (hashKey) {
    localStorage.setItem(KEY_STORAGE, hashKey);
    history.replaceState(null, '', location.pathname);
  }
  const key = localStorage.getItem(KEY_STORAGE) || '';
  // /remote/mirror shows what the paired phone remote is doing; it never sends a button press.
  const mirrorMode = /^\/remote\/mirror\/?$/.test(location.pathname);
  if (mirrorMode) {
    document.documentElement.classList.add('mirror');
    document.title = 'Saturday Tube Remote · Screen Mirror';
  }
  const led = document.querySelector('#led');
  const lcdMain = document.querySelector('#lcdMain');
  const lcdSub = document.querySelector('#lcdSub');
  const fullscreenKey = document.querySelector('#fullscreenKey');
  const pairAgain = document.querySelector('#pairAgain');
  let state = {};
  let flash = null;
  let flashTimer = null;
  let events = null;
  let reconnectTimer = null;

  // Phones: fill the width (less the body padding). Tablets and wide screens: fit the whole remote top to bottom, so it
  // stands as a narrow handset in the middle instead of a giant one. Proportions never change.
  const remoteFront = document.querySelector('.remote');
  const remoteBack = document.querySelector('#remoteBack');
  const workspace = document.querySelector('.remote-workspace');
  // 0 shows the whole remote with room around it for the trackpad; 100 fills the screen's width.
  const SIZE_STORAGE = 'saturday-tube-remote-size';
  const savedSize = Number(localStorage.getItem(SIZE_STORAGE));
  let remoteSize = Number.isFinite(savedSize) ? Math.max(0, Math.min(100, savedSize)) : 0;
  function fitToScreen() {
    const root = document.documentElement;
    const width = root.clientWidth || window.innerWidth;
    const height = window.visualViewport?.height || window.innerHeight;
    const fill = Math.min(1.6, (width - 20) / 340);
    let whole = fill;
    const remoteBody = workspace?.classList.contains('flipped') ? remoteBack : remoteFront;
    if (remoteBody) {
      root.style.setProperty('--remote-scale', '1');
      const natural = remoteBody.getBoundingClientRect().height;
      const style = getComputedStyle(document.body);
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      if (natural > 0) whole = Math.min(fill, (height - padding) / natural);
    }
    const scale = Math.max(0.35, whole + (fill - whole) * remoteSize / 100);
    root.style.setProperty('--remote-scale', scale.toFixed(3));
  }
  fitToScreen();
  window.addEventListener('resize', fitToScreen);
  window.addEventListener('orientationchange', fitToScreen);

  // ---- Ambient light, backlight and idle sleep ----
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const keepAwakeVideo = document.querySelector('#keepAwake');
  const brand = document.querySelector('#brand');
  const LIGHT_STORAGE = 'saturday-tube-remote-light';
  // Stored as 'auto' or a darkness from 0 (lit room) to 100 (pitch dark); older builds stored named modes.
  const LEGACY_LIGHT_MODES = { bright: 0, dim: 60, dark: 100 };
  const BACKLIGHT_MS = 3000;
  const SLEEP_AFTER_MS = 30000;
  // After this long asleep the remote stops holding the screen on, so the phone can lock itself.
  const RELEASE_AWAKE_AFTER_MS = 10 * 60 * 1000;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  const settingsSheet = document.querySelector('#remoteSettings');
  const settingsKey = document.querySelector('#remoteSettingsKey');
  const darknessSlider = document.querySelector('#darknessSlider');
  const darknessAuto = document.querySelector('#darknessAuto');
  const darknessReadout = document.querySelector('#darknessReadout');
  function readLightSetting() {
    const saved = localStorage.getItem(LIGHT_STORAGE);
    if (saved in LEGACY_LIGHT_MODES) return LEGACY_LIGHT_MODES[saved];
    const level = Number(saved);
    return saved !== null && saved !== '' && Number.isFinite(level) ? Math.max(0, Math.min(100, Math.round(level))) : null;
  }
  // null follows the light sensor (or the time of day); a number fixes the darkness.
  let manualDarkness = readLightSetting();
  let sensorDarkness = null;
  let backlightTimer = null;
  let sleepTimer = null;
  let releaseTimer = null;
  let wakeLock = null;
  let wakeLockPending = false;

  const clamp01 = value => Math.max(0, Math.min(1, value));

  // Without a light sensor, estimate the room from the clock and the phone's light/dark appearance.
  function estimatedDarkness(date = new Date()) {
    const hour = date.getHours() + date.getMinutes() / 60;
    let darkness = 0;
    // Evenings indoors count as dark: fully dark 6 pm–7 am, easing in from 4:30 pm and out by 8 am.
    if (hour >= 18 || hour < 7) darkness = 1;
    else if (hour >= 16.5) darkness = 0.6 + (hour - 16.5) / 1.5 * 0.4;
    else if (hour < 8) darkness = 1 - (hour - 7);
    if (prefersDark?.matches) darkness = Math.max(darkness, 0.85);
    return clamp01(darkness);
  }

  let mirrorDarkness = null;
  function applyLight() {
    const darkness = mirrorMode && mirrorDarkness !== null ? mirrorDarkness
      : manualDarkness !== null ? manualDarkness / 100 : sensorDarkness ?? estimatedDarkness();
    root.style.setProperty('--dark', darkness.toFixed(2));
    root.classList.toggle('dim', darkness >= 0.45);
    themeColor?.setAttribute('content', darkness >= 0.45 ? '#000000' : '#1b1a19');
    syncLightControls(darkness);
  }

  function syncLightControls(darkness) {
    if (!darknessSlider) return;
    const auto = manualDarkness === null;
    darknessAuto.checked = auto;
    darknessSlider.value = String(Math.round(darkness * 100));
    darknessReadout.textContent = auto ? `AUTO ${Math.round(darkness * 100)}%` : `${manualDarkness}%`;
  }

  function setManualDarkness(level) {
    manualDarkness = level === null ? null : Math.max(0, Math.min(100, Math.round(Number(level) || 0)));
    localStorage.setItem(LIGHT_STORAGE, manualDarkness === null ? 'auto' : String(manualDarkness));
    applyLight();
  }

  // Lux to darkness on a log scale, tuned so dim light reads as dark: 40 lux or less (a lamp across the room) is fully
  // dark and only about 800 lux (daylight by a window) is fully bright.
  function startLightSensor() {
    if (mirrorMode || !('AmbientLightSensor' in window)) return;
    try {
      const sensor = new window.AmbientLightSensor({ frequency: 2 });
      sensor.addEventListener('reading', () => {
        const lux = Math.max(0.1, Number(sensor.illuminance) || 0);
        const darkness = clamp01(1 - (Math.log10(lux) - Math.log10(40)) / Math.log10(20));
        sensorDarkness = sensorDarkness === null ? darkness : sensorDarkness * 0.7 + darkness * 0.3;
        applyLight();
      });
      sensor.addEventListener('error', () => { sensorDarkness = null; applyLight(); });
      sensor.start();
    } catch {}
  }

  function lightKeys() {
    document.body.classList.add('lit');
    clearTimeout(backlightTimer);
    backlightTimer = setTimeout(() => document.body.classList.remove('lit'), BACKLIGHT_MS);
  }

  function playKeepAwakeVideo() {
    if (keepAwakeVideo?.paused) keepAwakeVideo.play().catch(() => {});
  }

  // Screen Wake Lock needs HTTPS, which a LAN remote rarely has, so a muted looping video is the fallback.
  function keepAwake() {
    if (mirrorMode || document.hidden) return;
    if (!navigator.wakeLock) return playKeepAwakeVideo();
    if (wakeLock || wakeLockPending) return;
    wakeLockPending = true;
    navigator.wakeLock.request('screen')
      .then(lock => { wakeLock = lock; lock.addEventListener('release', () => { wakeLock = null; }); })
      .catch(playKeepAwakeVideo)
      .finally(() => { wakeLockPending = false; });
  }

  function releaseKeepAwake() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    keepAwakeVideo?.pause();
  }

  function sleep() {
    document.body.classList.add('asleep');
    document.body.classList.remove('lit');
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(releaseKeepAwake, RELEASE_AWAKE_AFTER_MS);
  }

  function noteActivity() {
    if (mirrorMode) return;
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(sleep, SLEEP_AFTER_MS);
  }

  // Waking (a tap on the black screen, or the page coming back into view) doesn't light the keys;
  // only pressing a button does.
  function wake() {
    if (mirrorMode) {
      if (events?.readyState !== EventSource.OPEN) connect();
      return;
    }
    clearTimeout(releaseTimer);
    document.body.classList.remove('asleep');
    applyLight();
    keepAwake();
    noteActivity();
    if (events?.readyState !== EventSource.OPEN) connect();
  }

  // Capture phase, so the tap that wakes a sleeping remote never reaches a key.
  window.addEventListener('pointerdown', event => {
    if (mirrorMode) return;
    if (document.body.classList.contains('asleep')) {
      event.preventDefault();
      event.stopPropagation();
      return wake();
    }
    keepAwake();
    noteActivity();
  }, { capture: true });
  window.addEventListener('keydown', () => { if (document.body.classList.contains('asleep')) wake(); else noteActivity(); });

  function openSettings() {
    settingsSheet.hidden = false;
    settingsKey.setAttribute('aria-expanded', 'true');
    applyLight();
  }
  function closeSettings() {
    settingsSheet.hidden = true;
    settingsKey.setAttribute('aria-expanded', 'false');
  }
  const sizeSlider = document.querySelector('#sizeSlider');
  const sizeReadout = document.querySelector('#sizeReadout');
  function showSize() {
    if (sizeSlider) sizeSlider.value = String(remoteSize);
    if (sizeReadout) sizeReadout.textContent = remoteSize === 0 ? 'WHOLE' : remoteSize === 100 ? 'FULL' : `${Math.round(remoteSize)}%`;
  }
  sizeSlider?.addEventListener('input', () => {
    remoteSize = Number(sizeSlider.value);
    localStorage.setItem(SIZE_STORAGE, String(remoteSize));
    showSize();
    fitToScreen();
    noteActivity();
  });
  showSize();
  settingsKey?.addEventListener('click', openSettings);
  brand?.addEventListener('click', openSettings);
  document.querySelector('#remoteSettingsDone')?.addEventListener('click', closeSettings);
  settingsSheet?.addEventListener('click', event => { if (event.target === settingsSheet) closeSettings(); });
  darknessSlider?.addEventListener('input', () => setManualDarkness(darknessSlider.value));
  darknessAuto?.addEventListener('change', () => setManualDarkness(darknessAuto.checked ? null : darknessSlider.value));
  prefersDark?.addEventListener?.('change', applyLight);
  setInterval(applyLight, 60000);

  function showUnpaired() {
    pairAgain.hidden = false;
    led.className = 'led';
    lcdMain.textContent = 'NO SIGNAL';
    lcdSub.textContent = 'SCAN QR ON TV';
  }

  async function send(action, value) {
    if (mirrorMode) return false;
    if (!key) { showUnpaired(); return false; }
    if (action !== 'trackpad' && action !== 'set') navigator.vibrate?.(12);
    led.className = 'led blink';
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Remote-Key': key },
        body: JSON.stringify(value === undefined ? { action } : { action, value }),
        cache: 'no-store',
        signal: AbortSignal.timeout(3000)
      });
      if (response.status === 401) { showUnpaired(); return false; }
      led.className = response.ok ? 'led on' : 'led';
      return response.ok;
    } catch {
      led.className = 'led';
      lcdSub.textContent = 'TV NOT REACHABLE';
      return false;
    }
  }
  window.SaturdayRemote = { send, noteActivity, mirrorMode };
  const gamepad = document.querySelector('#genesisGamepad');
  const gamepadNoGame = document.querySelector('#genesisNoGame');
  const gameTitle = document.querySelector('#gameTitle');
  const heldGameButtons = new Set();
  const gameAxes = { lx: 0, ly: 0, rx: 0, ry: 0 };
  let gameModeActive = false;
  function sendGamepadState() { return send('gamepad', { buttons: [...heldGameButtons], axes: { ...gameAxes } }); }
  function releaseGamepad(sendRelease = true) {
    const changed = heldGameButtons.size || Object.values(gameAxes).some(value => value !== 0);
    heldGameButtons.clear();
    for (const key of Object.keys(gameAxes)) gameAxes[key] = 0;
    document.querySelectorAll('.analog-stick').forEach(stick => {
      stick.style.setProperty('--stick-x', '0px');
      stick.style.setProperty('--stick-y', '0px');
      delete stick.dataset.pointer;
    });
    document.querySelectorAll('[data-game-button].pressed').forEach(button => button.classList.remove('pressed'));
    if (changed && sendRelease) void sendGamepadState();
  }
  for (const button of document.querySelectorAll('#genesisGamepad [data-game-button]')) {
    const name = button.dataset.gameButton;
    const release = event => {
      if (event && button.dataset.pointer !== String(event.pointerId)) return;
      if (button.dataset.pointer) delete button.dataset.pointer;
      button.classList.remove('pressed');
      if (heldGameButtons.delete(name)) void sendGamepadState();
    };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.dataset.pointer = String(event.pointerId);
      heldGameButtons.add(name);
      button.classList.add('pressed');
      lightKeys();
      noteActivity();
      void sendGamepadState();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('click', event => {
      if (event.detail !== 0 || heldGameButtons.has(name)) return;
      heldGameButtons.add(name);
      button.classList.add('pressed');
      void sendGamepadState();
      setTimeout(() => { heldGameButtons.delete(name); button.classList.remove('pressed'); void sendGamepadState(); }, 140);
    });
    button.addEventListener('contextmenu', event => event.preventDefault());
  }
  for (const stick of document.querySelectorAll('.analog-stick')) {
    const side = stick.dataset.stick;
    const knob = stick.querySelector('i');
    const axes = side === 'left' ? ['lx', 'ly'] : ['rx', 'ry'];
    const updateStick = event => {
      if (stick.dataset.pointer !== String(event.pointerId)) return;
      const rect = stick.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const length = Math.hypot(dx, dy) || 1;
      const scale = Math.min(1, radius / length);
      const x = Math.round(dx * scale);
      const y = Math.round(dy * scale);
      const nextX = Math.max(-1, Math.min(1, dx / radius));
      const nextY = Math.max(-1, Math.min(1, dy / radius));
      stick.style.setProperty('--stick-x', `${x}px`);
      stick.style.setProperty('--stick-y', `${y}px`);
      if (gameAxes[axes[0]] === nextX && gameAxes[axes[1]] === nextY) return;
      gameAxes[axes[0]] = nextX;
      gameAxes[axes[1]] = nextY;
      void sendGamepadState();
    };
    const endStick = event => {
      if (stick.dataset.pointer !== String(event.pointerId)) return;
      delete stick.dataset.pointer;
      stick.style.setProperty('--stick-x', '0px');
      stick.style.setProperty('--stick-y', '0px');
      gameAxes[axes[0]] = gameAxes[axes[1]] = 0;
      void sendGamepadState();
    };
    stick.addEventListener('pointerdown', event => {
      event.preventDefault();
      stick.setPointerCapture?.(event.pointerId);
      stick.dataset.pointer = String(event.pointerId);
      lightKeys();
      noteActivity();
      updateStick(event);
    });
    stick.addEventListener('pointermove', updateStick);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, endStick);
    knob?.addEventListener('contextmenu', event => event.preventDefault());
  }
  setInterval(() => {
    if (gameModeActive && (heldGameButtons.size || Object.values(gameAxes).some(value => value !== 0))) void sendGamepadState();
  }, 400);
  function volumeBar(volume) {
    const filled = Math.round(Math.max(0, Math.min(100, volume)) / 10);
    return `VOL ${'▮'.repeat(filled)}${'▯'.repeat(10 - filled)}`;
  }

  function render() {
    renderState();
    if (mirrorMode) paintMirror();
  }

  function renderState() {
    const nextGameMode = state.input === 'aux' && !state.intermission;
    if (gameModeActive && !nextGameMode) releaseGamepad();
    gameModeActive = nextGameMode;
    if (gameModeActive) setFlipped(false, false);
    document.body.classList.toggle('game-active', gameModeActive);
    gamepad.hidden = !gameModeActive || state.auxGame !== true;
    gamepadNoGame.hidden = !gameModeActive || state.auxGame === true;
    if (gameTitle) gameTitle.textContent = state.title || 'GAME READY';
    for (const [id, enabled, name, bypass] of [['#videoFxKey', state.videoFx, 'Video', 'the picture filters'], ['#audioFxKey', state.audioFx, 'Audio', 'the audio effects']]) {
      const fxKey = document.querySelector(id);
      if (!fxKey || typeof enabled !== 'boolean') continue;
      fxKey.setAttribute('aria-pressed', String(enabled));
      fxKey.setAttribute('aria-label', enabled ? `${name} effects on; press to bypass ${bypass}` : `${name} effects bypassed; press to turn them back on`);
    }
    const screenTypeKey = document.querySelector('#screenTypeKey');
    if (screenTypeKey && state.displayMode) {
      screenTypeKey.textContent = state.displayMode === 'rear' ? 'REAR' : 'CRT';
      screenTypeKey.setAttribute('aria-label', `Switch between CRT and rear projection; currently ${state.displayMode === 'rear' ? 'rear projection' : 'CRT'}`);
    }
    const colorFilterKey = document.querySelector('#colorFilterKey');
    if (colorFilterKey && state.pictureMode) {
      colorFilterKey.textContent = COLOR_FILTER_NAMES[state.pictureMode] || 'COLOR';
      colorFilterKey.setAttribute('aria-label', `Next color filter; currently ${(COLOR_FILTER_NAMES[state.pictureMode] || 'color').toLowerCase()}`);
    }
    if (/^#[0-9a-f]{6}$/i.test(state.skinColor || '')) document.querySelector('#skinKey')?.style.setProperty('--skin', state.skinColor);
    renderBackPanel();
    const powerKey = document.querySelector('[data-action="power"]');
    if (powerKey) powerKey.setAttribute('aria-pressed', String(state.powered !== false));
    if (state.powered === false) {
      lcdMain.textContent = 'TV OFF';
      lcdSub.textContent = 'PRESS POWER';
      return;
    }
    if (fullscreenKey) {
      const mode = state.fullscreen || 'off';
      const label = { off: 'WINDOW', screen: 'SCREEN', tv: 'TV', dim: 'DIM', scene: 'ROOM' }[mode] || 'WINDOW';
      const description = `Change fullscreen view; currently ${label.toLowerCase()}`;
      fullscreenKey.dataset.mode = mode;
      fullscreenKey.querySelector('span').textContent = mode === 'off' ? '' : label;
      fullscreenKey.setAttribute('aria-label', description);
      fullscreenKey.title = description;
    }
    if (state.intermission) {
      lcdMain.textContent = 'INTERMISSION';
      lcdSub.textContent = 'ENTER: END BREAK EARLY';
      return;
    }
    if (flash) {
      lcdMain.textContent = flash;
    } else if (state.digits) {
      lcdMain.textContent = `CH ${state.digits}${state.digits.length < 2 ? '-' : ''}`;
    } else if (state.muted) {
      lcdMain.textContent = 'MUTE';
    } else if (state.input === 'tv') {
      lcdMain.textContent = state.channel ? `CH ${state.channel.number} ${state.channel.abbreviation}` : 'TV · NO CHANNELS';
    } else if (state.input === 'static') {
      lcdMain.textContent = 'INPUT · SAT';
    } else if (state.input === 'aux') {
      lcdMain.textContent = state.auxGame ? 'GENESIS AUX' : 'AUX · NO GAME';
    } else if (state.input) {
      lcdMain.textContent = `VCR ${state.playing ? '▶ PLAY' : '❚❚ PAUSE'}`;
    }
    const overlay = state.shelf ? 'SHELF' : state.guide ? 'GUIDE' : state.menu ? 'MENU' : '';
    if (overlay) lcdSub.textContent = `${overlay}${state.focus ? ` › ${state.focus}` : ''}${state.shelf && state.selection ? ` · ${state.selection} SEL` : ''}`;
    else if (state.input) lcdSub.textContent = state.loading || state.channelProgress || state.title || (state.input === 'tv' ? state.channel?.name || '' : state.input === 'aux' ? 'GAMEPAD READY' : 'NO TAPE');
  }

  function showFlash(text) {
    flash = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flash = null; render(); }, 1400);
    render();
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (!key) return showUnpaired();
    events?.close();
    events = new EventSource(`/api/events?k=${encodeURIComponent(key)}${mirrorMode ? '&mirror=1' : ''}`);
    events.addEventListener('open', () => { if (gameModeActive) void sendGamepadState(); });
    events.addEventListener('mirroring', event => {
      try { mirrorWatched = JSON.parse(event.data)?.watching === true; } catch { mirrorWatched = false; }
      if (mirrorWatched) reportMirror(true);
    });
    events.addEventListener('mirror', event => {
      try { mirrorSnapshot = JSON.parse(event.data); } catch { return; }
      paintMirror();
    });
    events.addEventListener('state', event => {
      const previous = state;
      try { state = JSON.parse(event.data) || {}; } catch { return; }
      pairAgain.hidden = true;
      led.className = 'led on';
      if (previous.volume !== undefined && state.volume !== previous.volume && !state.muted) showFlash(volumeBar(state.volume));
      else if (typeof previous.videoFx === 'boolean' && state.videoFx !== previous.videoFx) showFlash(`VIDEO FX ${state.videoFx ? 'ON' : 'OFF'}`);
      else if (typeof previous.audioFx === 'boolean' && state.audioFx !== previous.audioFx) showFlash(`AUDIO FX ${state.audioFx ? 'ON' : 'OFF'}`);
      else if (previous.displayMode && state.displayMode !== previous.displayMode) showFlash(state.displayMode === 'rear' ? 'REAR PROJECTION' : 'CRT SCREEN');
      else if (previous.pictureMode && state.pictureMode !== previous.pictureMode) showFlash(`FILTER ${COLOR_FILTER_NAMES[state.pictureMode] || 'COLOR'}`);
      else if (previous.skinColor && state.skinColor !== previous.skinColor) showFlash(`SKIN ${String(state.skinColor).toUpperCase()}`);
      else if (previous.fullscreen !== undefined && state.fullscreen !== previous.fullscreen) showFlash(({ off: 'WINDOW', screen: 'SCREEN ONLY', tv: 'WHOLE TV', dim: 'DIM ROOM', scene: state.room || 'VIRTUAL ROOM' })[state.fullscreen] || 'WINDOW');
      else if (state.fullscreen === 'scene' && previous.room !== state.room) showFlash(state.room || 'VIRTUAL ROOM');
      else render();
    });
    events.addEventListener('error', () => {
      led.className = 'led';
      if (events.readyState === EventSource.CLOSED) {
        // A closed stream usually means a new pairing code; check before retrying.
        fetch('/api/command', { method: 'POST', headers: { 'X-Remote-Key': key }, body: '{}' })
          .then(response => { if (response.status === 401) showUnpaired(); else reconnectTimer = setTimeout(connect, 2500); })
          .catch(() => { lcdSub.textContent = 'TV NOT REACHABLE'; reconnectTimer = setTimeout(connect, 3000); });
      }
    });
  }

  // ---- Back of the remote: analog controls ----
  const COLOR_FILTER_NAMES = { color: 'COLOR', lowstim: 'LOWSTIM', bw: 'B&W' };
  const BACK_GROUPS = { video: 'VIDEO', audio: 'AUDIO', scene: 'ROOM', intermission: 'INTERMISSION' };
  const backGroups = document.querySelector('#backGroups');
  const backStatus = document.querySelector('#backStatus');
  const backWidgets = new Map();
  let backSignature = '';
  let grabbedControl = '';

  function formatSetting(control, value) {
    if (control.id === 'hue') return `${Math.round((value - 50) * 3.6)}°`;
    if (control.id === 'scene-auto-zoom-rate') return Number(value).toFixed(1);
    if (control.id.startsWith('intermission-')) return String(Math.round(value));
    return `${Math.round(value)}%`;
  }
  // Knobs turn through 270°; a log scale gives zoom (25%–3200%) even travel.
  function knobFraction(control, value) {
    const { min, max } = control;
    if (control.scale === 'log' && min > 0) return (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
    return max > min ? (value - min) / (max - min) : 0;
  }
  function knobValue(control, fraction) {
    const { min, max } = control;
    const clamped = Math.max(0, Math.min(1, fraction));
    const value = control.scale === 'log' && min > 0 ? Math.exp(Math.log(min) + clamped * (Math.log(max) - Math.log(min))) : min + clamped * (max - min);
    const step = control.step || 1;
    return Math.max(min, Math.min(max, Math.round(value / step) * step));
  }
  function setControl(id, value) { return send('set', { id, value }); }

  function buildKnob(control) {
    const wrap = document.createElement('div');
    wrap.className = 'knob-control';
    const knob = document.createElement('button');
    knob.type = 'button';
    knob.className = 'knob';
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', control.label);
    knob.innerHTML = '<i class="knob-cap"></i>';
    const readout = document.createElement('output');
    const label = document.createElement('span');
    label.textContent = control.label;
    wrap.append(knob, readout, label);
    const widget = { control, element: wrap, value: control.value, holdUntil: 0, drag: null, sendTimer: null };
    widget.show = value => {
      widget.value = value;
      const fraction = knobFraction(widget.control, value);
      knob.style.setProperty('--angle', `${-135 + fraction * 270}deg`);
      knob.style.setProperty('--fill', `${fraction * 100}`);
      knob.setAttribute('aria-valuenow', String(value));
      knob.setAttribute('aria-valuetext', formatSetting(widget.control, value));
      readout.textContent = formatSetting(widget.control, value);
    };
    const queueSend = () => {
      if (widget.sendTimer !== null) return;
      widget.sendTimer = setTimeout(() => { widget.sendTimer = null; void setControl(control.id, widget.value); }, 70);
    };
    knob.addEventListener('pointerdown', event => {
      if (widget.control.disabled) return;
      event.preventDefault();
      knob.setPointerCapture?.(event.pointerId);
      widget.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, fraction: knobFraction(widget.control, widget.value) };
      grabbedControl = control.id;
      wrap.classList.add('turning');
      noteActivity();
    });
    knob.addEventListener('pointermove', event => {
      if (widget.drag?.id !== event.pointerId) return;
      // Up or right turns the knob clockwise; 160px of travel covers the whole range.
      const travel = (event.clientX - widget.drag.x) + (widget.drag.y - event.clientY);
      const next = knobValue(widget.control, widget.drag.fraction + travel / 160);
      if (next === widget.value) return;
      widget.show(next);
      navigator.vibrate?.(3);
      queueSend();
    });
    const release = event => {
      if (widget.drag?.id !== event.pointerId) return;
      widget.drag = null;
      widget.holdUntil = Date.now() + 1200;
      grabbedControl = '';
      wrap.classList.remove('turning');
      clearTimeout(widget.sendTimer);
      widget.sendTimer = null;
      void setControl(control.id, widget.value);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) knob.addEventListener(type, release);
    knob.addEventListener('keydown', event => {
      const direction = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key];
      if (!direction || widget.control.disabled) return;
      event.preventDefault();
      const next = knobValue(widget.control, knobFraction(widget.control, widget.value) + direction * 0.05);
      widget.show(next);
      widget.holdUntil = Date.now() + 1200;
      void setControl(control.id, next);
    });
    return widget;
  }

  function buildSwitch(control) {
    const wrap = document.createElement('div');
    wrap.className = 'switch-control';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle-switch';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', control.label);
    toggle.innerHTML = '<i></i>';
    const label = document.createElement('span');
    label.textContent = control.label;
    wrap.append(toggle, label);
    const widget = { control, element: wrap, value: control.value, holdUntil: 0 };
    widget.show = value => { widget.value = value; toggle.setAttribute('aria-checked', String(value === true)); };
    toggle.addEventListener('click', () => {
      if (widget.control.disabled) return;
      widget.show(!widget.value);
      widget.holdUntil = Date.now() + 1200;
      navigator.vibrate?.(12);
      void setControl(control.id, widget.value);
    });
    return widget;
  }

  function buildSelector(control) {
    const wrap = document.createElement('div');
    wrap.className = 'selector-control';
    const previous = document.createElement('button');
    const next = document.createElement('button');
    const window_ = document.createElement('output');
    previous.type = next.type = 'button';
    previous.className = next.className = 'selector-step';
    previous.textContent = '◀';
    next.textContent = '▶';
    previous.setAttribute('aria-label', `Previous ${control.label.toLowerCase()}`);
    next.setAttribute('aria-label', `Next ${control.label.toLowerCase()}`);
    const label = document.createElement('span');
    label.textContent = control.label;
    const row = document.createElement('div');
    row.className = 'selector-row';
    row.append(previous, window_, next);
    wrap.append(row, label);
    const widget = { control, element: wrap, value: control.value, holdUntil: 0 };
    widget.show = value => {
      widget.value = value;
      window_.textContent = widget.control.options?.find(option => option.value === value)?.label || String(value || '—');
    };
    const step = direction => {
      const options = widget.control.options || [];
      if (!options.length || widget.control.disabled) return;
      const index = options.findIndex(option => option.value === widget.value);
      const value = options[(index + direction + options.length) % options.length].value;
      widget.show(value);
      widget.holdUntil = Date.now() + 1200;
      navigator.vibrate?.(12);
      void setControl(control.id, value);
    };
    previous.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    window_.addEventListener('click', () => step(1));
    return widget;
  }

  function buildButton(control) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'back-button';
    button.textContent = control.label;
    button.addEventListener('click', () => { navigator.vibrate?.(12); void setControl(control.id, true); });
    return { control, element: button, show: () => {} };
  }

  function renderBackPanel() {
    const panel = Array.isArray(state.panel) ? state.panel : null;
    if (backStatus) backStatus.textContent = panel ? 'TURN · STEP · SLIDE' : 'WAITING FOR TV';
    if (!panel || !backGroups) return;
    const signature = JSON.stringify(panel.map(control => [control.id, control.kind, control.options?.map(option => option.value)]));
    if (signature !== backSignature) {
      backSignature = signature;
      backWidgets.clear();
      backGroups.replaceChildren();
      for (const [group, title] of Object.entries(BACK_GROUPS)) {
        const controls = panel.filter(control => control.group === group);
        if (!controls.length) continue;
        const section = document.createElement('section');
        section.className = `back-group ${group}`;
        const heading = document.createElement('h3');
        heading.textContent = title;
        const grid = document.createElement('div');
        grid.className = 'back-grid';
        for (const control of controls) {
          const build = { knob: buildKnob, switch: buildSwitch, selector: buildSelector, button: buildButton }[control.kind];
          if (!build) continue;
          const widget = build(control);
          widget.element.dataset.control = control.id;
          backWidgets.set(control.id, widget);
          grid.append(widget.element);
        }
        section.append(heading, grid);
        backGroups.append(section);
      }
      if (mirrorMode) for (const control of backGroups.querySelectorAll('button')) control.tabIndex = -1;
    }
    for (const control of panel) {
      const widget = backWidgets.get(control.id);
      if (!widget) continue;
      widget.control = control;
      widget.element.classList.toggle('disabled', control.disabled === true);
      // Don't snap a knob back while the finger is on it or the TV hasn't caught up yet.
      if (widget.drag || Date.now() < (widget.holdUntil || 0)) continue;
      widget.show(control.value);
    }
    if (mirrorMode) {
      for (const [id, widget] of backWidgets) widget.element.classList.toggle('turning', id === mirrorSnapshot?.grabbed);
    }
  }

  let flipTarget = false;
  let flipTimer = null;
  function setFlipped(flipped, animate = true) {
    if (!workspace || flipTarget === flipped) return;
    flipTarget = flipped;
    clearTimeout(flipTimer);
    const swap = () => {
      clearTimeout(flipTimer);
      workspace.classList.toggle('flipped', flipTarget);
      fitToScreen();
    };
    const still = document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || still || !workspace.animate) return swap();
    // Turn edge-on, swap sides, and turn back; the timer covers an animation the browser never finishes.
    const half = (from, to, easing) => workspace.animate([{ transform: `perspective(1400px) rotateY(${from}deg)` }, { transform: `perspective(1400px) rotateY(${to}deg)` }], { duration: 170, easing });
    flipTimer = setTimeout(swap, 260);
    half(0, 90, 'ease-in').finished.then(() => {
      if (workspace.classList.contains('flipped') === flipTarget) return;
      swap();
      half(-90, 0, 'ease-out');
    }).catch(swap);
  }
  if (!mirrorMode) {
    for (const flip of [document.querySelector('#flipKey'), document.querySelector('#backFlipKey')]) {
      flip?.addEventListener('click', () => {
        navigator.vibrate?.(12);
        noteActivity();
        setFlipped(!flipTarget);
      });
    }
  }

  // ---- Screen mirror ----
  // Buttons are matched by their position on the page, which is identical on the phone and the mirror.
  const mirrorButtons = [...document.querySelectorAll('.remote button')];
  const mirrorBadge = document.querySelector('#mirrorBadge');
  const trackpadStatus = document.querySelector('#trackpadStatus');
  const settingsSheetHidden = () => settingsSheet?.hidden !== false;
  let mirrorWatched = false;
  let mirrorSnapshot = null;
  let mirrorTimer = null;
  let mirrorSending = false;
  let mirrorAgain = false;
  let lastMirrorBody = '';

  function stickRadius(stick) {
    const rect = stick.getBoundingClientRect();
    return Math.max(1, Math.min(rect.width, rect.height) * 0.34);
  }

  function mirrorState() {
    const sticks = {};
    for (const stick of document.querySelectorAll('.analog-stick')) {
      const radius = stickRadius(stick);
      const axis = name => Math.max(-1, Math.min(1, (parseFloat(stick.style.getPropertyValue(name)) || 0) / radius));
      sticks[stick.dataset.stick] = [axis('--stick-x'), axis('--stick-y')];
    }
    return {
      pressed: mirrorButtons.flatMap((button, index) => button.classList.contains('pressed') ? [index] : []).slice(0, 32),
      sticks,
      dark: Math.max(0, Math.min(1, parseFloat(root.style.getPropertyValue('--dark')) || 0)),
      lit: document.body.classList.contains('lit'),
      flipped: workspace?.classList.contains('flipped') === true,
      grabbed: grabbedControl,
      asleep: document.body.classList.contains('asleep'),
      settings: !settingsSheetHidden(),
      unpaired: !pairAgain.hidden,
      lcd: { main: lcdMain.textContent, sub: lcdSub.textContent, led: led.classList.contains('blink') ? 'blink' : led.classList.contains('on') ? 'on' : 'off' },
      status: trackpadStatus?.textContent || ''
    };
  }

  async function postMirror() {
    mirrorTimer = null;
    if (mirrorSending) { mirrorAgain = true; return; }
    const body = JSON.stringify(mirrorState());
    if (body === lastMirrorBody) return;
    mirrorSending = true;
    lastMirrorBody = body;
    try {
      const response = await fetch('/api/mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Remote-Key': key },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) mirrorWatched = (await response.json())?.watching === true;
      else lastMirrorBody = '';
    } catch {
      lastMirrorBody = '';
    } finally {
      mirrorSending = false;
      if (mirrorAgain) { mirrorAgain = false; reportMirror(); }
    }
  }

  function reportMirror(force = false) {
    if (mirrorMode || !key || !mirrorWatched) return;
    if (force) lastMirrorBody = '';
    if (mirrorTimer === null) mirrorTimer = setTimeout(() => { void postMirror(); }, 40);
  }

  function paintMirror() {
    if (!mirrorMode) return;
    const snapshot = mirrorSnapshot;
    if (mirrorBadge) {
      mirrorBadge.textContent = snapshot ? 'SCREEN MIRROR · LIVE' : 'SCREEN MIRROR · WAITING FOR PHONE';
      mirrorBadge.classList.toggle('live', Boolean(snapshot));
    }
    if (!snapshot) return;
    mirrorButtons.forEach((button, index) => button.classList.toggle('pressed', snapshot.pressed.includes(index)));
    for (const stick of document.querySelectorAll('.analog-stick')) {
      const [x, y] = snapshot.sticks?.[stick.dataset.stick] || [0, 0];
      const radius = stickRadius(stick);
      const scale = Math.min(1, 1 / (Math.hypot(x, y) || 1));
      stick.style.setProperty('--stick-x', `${Math.round(x * scale * radius)}px`);
      stick.style.setProperty('--stick-y', `${Math.round(y * scale * radius)}px`);
    }
    document.body.classList.toggle('lit', snapshot.lit);
    setFlipped(snapshot.flipped === true);
    renderBackPanel();
    document.body.classList.toggle('asleep', snapshot.asleep);
    mirrorDarkness = snapshot.dark;
    applyLight();
    if (settingsSheet) settingsSheet.hidden = !snapshot.settings;
    pairAgain.hidden = !snapshot.unpaired;
    lcdMain.textContent = snapshot.lcd.main;
    lcdSub.textContent = snapshot.lcd.sub;
    led.className = snapshot.lcd.led === 'off' ? 'led' : `led ${snapshot.lcd.led}`;
    if (trackpadStatus) trackpadStatus.textContent = snapshot.status;
  }

  if (mirrorMode) {
    // Nothing on the mirror is pressable; it only follows the phone.
    for (const control of document.querySelectorAll('button, input')) control.tabIndex = -1;
    paintMirror();
  } else {
    // Anything that changes how the remote looks (keys, backlight, LCD, sleep, sticks) is a DOM change.
    new MutationObserver(() => reportMirror()).observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden']
    });
  }

  for (const button of document.querySelectorAll('button[data-action]')) {
    const action = button.dataset.action;
    const value = button.dataset.value === undefined ? undefined : Number(button.dataset.value);
    const repeat = button.dataset.repeat;
    let delayTimer = null;
    let repeatTimer = null;
    const stop = () => {
      clearTimeout(delayTimer);
      clearInterval(repeatTimer);
      delayTimer = repeatTimer = null;
      button.classList.remove('pressed');
    };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('pressed');
      lightKeys();
      void send(action, value);
      if (repeat === undefined) return;
      const every = repeat === 'slow' ? 420 : 140;
      delayTimer = setTimeout(() => { repeatTimer = setInterval(() => void send(action, value), every); }, 420);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, stop);
    // Keyboard and label activation arrive as clicks without a pointer press.
    button.addEventListener('click', event => { if (event.detail === 0) { lightKeys(); void send(action, value); } });
    button.addEventListener('contextmenu', event => event.preventDefault());
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { releaseGamepad(); return; }
    wake();
  });
  window.addEventListener('blur', () => releaseGamepad());
  applyLight();
  startLightSensor();
  keepAwake();
  noteActivity();
  connect();
})();
