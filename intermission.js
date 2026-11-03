(() => {
  const DEFAULTS = { enabled: false, intervalMinutes: 60, durationMinutes: 15 };
  const MESSAGES = [
    'STRETCH YOUR LEGS!',
    'A LITTLE WATER GOES A LONG WAY.',
    'RESTROOM BREAK? NOW IS YOUR MOMENT.',
    'REST YOUR EYES. LOOK AT SOMETHING FAR AWAY.',
    'TAKE A 15 MINUTE BREAK FOR EVERY HOUR OF TV.',
    'ROLL YOUR SHOULDERS. UNCLENCH YOUR JAW.',
    'YOUR SHOWS WILL BE RIGHT HERE.',
    'A MESSAGE FROM YOUR FRIENDLY NEIGHBORHOOD TV.'
  ];
  function normalizeSettings(value) {
    const saved = value && typeof value === 'object' ? value : {};
    const minutes = (input, fallback, max) => Number.isFinite(input) ? Math.max(1, Math.min(max, Math.round(input))) : fallback;
    return {
      enabled: saved.enabled === true,
      intervalMinutes: minutes(saved.intervalMinutes, 60, 480),
      durationMinutes: minutes(saved.durationMinutes, 15, 120)
    };
  }
  function advanceWatching(watchedMs, deltaMs, enabled, active) {
    return watchedMs + (enabled && !active ? Math.max(0, deltaMs) : 0);
  }
  function resumedBroadcastStart(startedAtMs, breakStartedAt, now) {
    return startedAtMs + Math.max(0, now - Math.max(startedAtMs, breakStartedAt));
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeSettings, advanceWatching, resumedBroadcastStart, MESSAGES };
    return;
  }
  const KEY = 'saturday-tube-intermission-v1';
  const PROGRESS_KEY = 'saturday-tube-intermission-progress-v1';
  const dialog = document.querySelector('#intermissionDialog');
  const enable = document.querySelector('#intermissionEnabled');
  const interval = document.querySelector('#intermissionInterval');
  const duration = document.querySelector('#intermissionDuration');
  let settings = { ...DEFAULTS };
  try { settings = normalizeSettings(JSON.parse(localStorage.getItem(KEY) || 'null')); }
  catch (error) { console.warn('Intermission preferences could not be restored', error); }
  let hooks = null;
  let active = false;
  let finishing = false;
  let startedAt = 0;
  let endsAt = 0;
  let watchedMs = 0;
  try {
    const saved = Number(localStorage.getItem(PROGRESS_KEY));
    if (Number.isFinite(saved) && saved > 0) watchedMs = Math.min(saved, settings.intervalMinutes * 60000);
  } catch (error) { console.warn('Intermission timer progress could not be restored', error); }
  let lastTick = performance.now();
  let lastSave = lastTick;
  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, String(watchedMs)); }
    catch (error) { console.error('Intermission timer progress could not be saved', error); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); }
    catch (error) { console.error('Intermission preferences could not be saved', error); }
  }
  function sync() {
    enable.checked = settings.enabled;
    interval.value = String(settings.intervalMinutes);
    duration.value = String(settings.durationMinutes);
  }
  function renderSchedule() {
    const status = document.querySelector('#intermissionSchedule');
    const seconds = Math.max(0, Math.ceil((settings.intervalMinutes * 60000 - watchedMs) / 1000));
    status.textContent = active ? 'INTERMISSION IN PROGRESS'
      : settings.enabled ? `NEXT BREAK IN ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} · ALL INPUTS`
        : 'AUTOMATIC BREAKS OFF';
  }
  function render(now) {
    const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
    document.querySelector('#intermissionCountdown').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    document.querySelector('#intermissionMessage').textContent = MESSAGES[Math.floor((now - startedAt) / 9000) % MESSAGES.length];
  }
  function begin() {
    if (active || !hooks) return;
    active = true;
    startedAt = Date.now();
    endsAt = startedAt + settings.durationMinutes * 60000;
    watchedMs = 0;
    saveProgress();
    hooks.pause(startedAt);
    render(startedAt);
    dialog.showModal();
    document.body.classList.add('intermission-active');
    renderSchedule();
    document.querySelector('#intermissionEnd').focus();
  }
  async function end() {
    if (!active || finishing) return;
    finishing = true;
    try { await hooks.prepareResume(); }
    catch (error) {
      finishing = false;
      console.error('Intermission could not release live streaming', error);
      hooks.error();
      return;
    }
    const now = Date.now();
    hooks.shiftClocks(startedAt, now, resumedBroadcastStart);
    active = false;
    finishing = false;
    watchedMs = 0;
    saveProgress();
    lastTick = performance.now();
    dialog.close();
    document.body.classList.remove('intermission-active');
    renderSchedule();
    try { await hooks.resume(); }
    catch (error) {
      console.error('Playback could not resume after intermission', error);
      hooks.error();
    }
  }
  function tick() {
    const current = performance.now();
    const elapsed = current - lastTick;
    lastTick = current;
    if (!hooks) return;
    if (active) {
      hooks.keepPaused();
      const now = Date.now();
      render(now);
      if (now >= endsAt) void end();
    } else if (settings.enabled) {
      watchedMs = advanceWatching(watchedMs, elapsed, true, false);
      if (watchedMs >= settings.intervalMinutes * 60000) begin();
    }
    renderSchedule();
    if (current - lastSave >= 5000) {
      lastSave = current;
      saveProgress();
    }
  }
  const changeSettings = () => {
    settings = normalizeSettings({ enabled: enable.checked, intervalMinutes: Number(interval.value), durationMinutes: Number(duration.value) });
    sync();
    lastTick = performance.now();
    save();
    saveProgress();
    renderSchedule();
  };
  for (const control of [enable, interval, duration]) control.addEventListener('change', changeSettings);
  document.querySelector('#intermissionStart').addEventListener('click', begin);
  document.querySelector('#intermissionEnd').addEventListener('click', () => { void end(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); void end(); });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape' || event.key === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void end();
    } else if (!dialog.contains(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  sync();
  renderSchedule();
  window.addEventListener('beforeunload', saveProgress);
  window.addEventListener('pagehide', saveProgress);
  window.setInterval(tick, 250);
  window.SaturdayIntermission = {
    init(callbacks) { hooks = callbacks; lastTick = performance.now(); },
    get active() { return active; },
    get startedAt() { return startedAt; },
    end
  };
})();
