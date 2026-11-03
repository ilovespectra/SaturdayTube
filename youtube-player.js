(function attachYoutubePlayer(root, create) {
  if (root) root.SaturdayTubeYouTubePlayer = create(root);
})(typeof window === 'object' ? window : null, function createYoutubePlayer(windowRef) {
  let generation = 0;
  let player = null;
  let phase = 'program';
  let readyPromise = null;
  let currentStarter = null;
  let statusCallback = () => {};
  let stage = null;
  let host = null;

  function setStatus(message) {
    try { statusCallback(String(message || '')); } catch { /* Status reporting must not interrupt playback. */ }
  }

  function loadPlayerApi() {
    if (windowRef.YT?.Player) return Promise.resolve(windowRef.YT);
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve, reject) => {
      const timeout = windowRef.setTimeout(() => reject(new Error('YouTube player API did not load.')), 15000);
      const previousReady = windowRef.onYouTubeIframeAPIReady;
      windowRef.onYouTubeIframeAPIReady = () => {
        try { if (typeof previousReady === 'function') previousReady(); } catch { /* Keep this player ready if another listener fails. */ }
        windowRef.clearTimeout(timeout);
        if (windowRef.YT?.Player) resolve(windowRef.YT);
        else reject(new Error('YouTube player API did not initialize.'));
      };
      let script = windowRef.document.querySelector('script[data-saturday-youtube-api]');
      if (!script) {
        script = windowRef.document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.referrerPolicy = 'strict-origin-when-cross-origin';
        script.dataset.saturdayYoutubeApi = 'true';
        script.addEventListener('error', () => {
          windowRef.clearTimeout(timeout);
          reject(new Error('YouTube player API could not be reached.'));
        }, { once: true });
        windowRef.document.head.append(script);
      }
    }).finally(() => { readyPromise = null; });
    return readyPromise;
  }

  function loadSource(source) {
    if (!player || !source) return;
    if (source.kind === 'playlist') {
      player.loadPlaylist({ listType: 'playlist', list: source.id, index: 0, startSeconds: 0 });
    } else if (source.kind === 'video') {
      player.loadVideoById({ videoId: source.id });
    }
  }

  function loadProgram() {
    if (!currentStarter?.program) return;
    phase = 'program';
    loadSource(currentStarter.program);
  }

  function stateChanged(event, token) {
    if (token !== generation || !currentStarter || !windowRef.YT?.PlayerState) return;
    if (event.data === windowRef.YT.PlayerState.ENDED) {
      if (phase === 'program' && currentStarter.commercials) {
        phase = 'commercials';
        loadSource(currentStarter.commercials);
      } else loadProgram();
    }
    if (event.data === windowRef.YT.PlayerState.PLAYING) setStatus(`YOUTUBE · ${currentStarter.name}`);
  }

  function playerError(event, token) {
    if (token !== generation) return;
    if (phase === 'commercials' && currentStarter?.program) {
      setStatus('COMMERCIAL PLAYLIST UNAVAILABLE · RETURNING TO PROGRAMS');
      loadProgram();
      return;
    }
    setStatus(`YOUTUBE VIDEO UNAVAILABLE HERE · CHECK EMBEDDING OR REGION (ERROR ${Number(event?.data) || 'UNKNOWN'})`);
  }

  async function start(options, onStatus = () => {}) {
    stop();
    const token = ++generation;
    currentStarter = options;
    statusCallback = onStatus;
    stage = windowRef.document.querySelector('#stage');
    host = windowRef.document.querySelector('#youtubePlayerHost');
    if (!stage || !host || !currentStarter?.program) throw new Error('A YouTube channel source is required.');
    stage.classList.add('youtube-active');
    stage.classList.remove('empty', 'tv-loading');
    windowRef.document.querySelector('#emptyState').hidden = true;
    host.hidden = false;
    host.replaceChildren();
    const mount = windowRef.document.createElement('div');
    host.append(mount);
    windowRef.document.querySelector('#mediaTitle').textContent = currentStarter.name;
    windowRef.document.querySelector('#displayBadge').textContent = 'YOUTUBE PLAYER';
    setStatus(`LOADING YOUTUBE · ${currentStarter.name}`);

    try {
      const YT = await loadPlayerApi();
      if (token !== generation) return;
      player = new YT.Player(mount, {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,
          enablejsapi: 1,
          playsinline: 1,
          origin: windowRef.location.origin
        },
        events: {
          onReady: event => {
            if (token !== generation) { event.target.destroy(); return; }
            player = event.target;
            setStatus(`YOUTUBE · ${currentStarter.name}`);
            loadProgram();
          },
          onStateChange: event => stateChanged(event, token),
          onError: event => playerError(event, token)
        }
      });
    } catch (error) {
      if (token === generation) setStatus(`YOUTUBE PLAYER UNAVAILABLE · ${error?.message || 'CHECK CONNECTION'}`);
    }
  }

  function stop() {
    generation += 1;
    const oldPlayer = player;
    player = null;
    currentStarter = null;
    if (oldPlayer) {
      try { oldPlayer.destroy(); } catch { /* The YouTube frame may already have closed. */ }
    }
    if (host) {
      host.replaceChildren();
      host.hidden = true;
    }
    stage?.classList.remove('youtube-active');
    stage = null;
    host = null;
  }

  function togglePlayback() {
    if (!player || !windowRef.YT?.PlayerState) return false;
    if (player.getPlayerState() === windowRef.YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
    return true;
  }

  function previous() {
    if (!player) return false;
    if (Number(player.getCurrentTime()) > 3) player.seekTo(0, true);
    else player.previousVideo();
    return true;
  }

  function next() {
    if (!player) return false;
    player.nextVideo();
    return true;
  }

  function seekBy(seconds) {
    if (!player || !Number.isFinite(Number(seconds))) return false;
    const duration = Number(player.getDuration()) || Infinity;
    player.seekTo(Math.max(0, Math.min(duration, (Number(player.getCurrentTime()) || 0) + Number(seconds))), true);
    return true;
  }

  function setVolume(percent, muted = false) {
    if (!player) return;
    player.setVolume(Math.max(0, Math.min(100, Math.round(Number(percent) || 0))));
    if (muted) player.mute(); else player.unMute();
  }

  function isPlaying() {
    return Boolean(player && windowRef.YT?.PlayerState && player.getPlayerState() === windowRef.YT.PlayerState.PLAYING);
  }

  function isStarted(id) {
    return Boolean(currentStarter && currentStarter.id === id);
  }

  return Object.freeze({ start, stop, togglePlayback, previous, next, seekBy, setVolume, isPlaying, isStarted, getPlayer: () => player });
});
