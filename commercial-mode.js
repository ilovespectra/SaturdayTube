(() => {
  const modeButton = document.querySelector('#commercialModeToggle');
  const manageButton = document.querySelector('#commercialManageButton');
  const statusLine = document.querySelector('#commercialStatus');
  const dialog = document.querySelector('#commercialDialog');
  const closeButton = document.querySelector('#commercialCloseButton');
  const addButton = document.querySelector('#commercialAddButton');
  const progress = document.querySelector('#commercialProgress');
  const sourceSummary = document.querySelector('#commercialSourceSummary');
  const clipList = document.querySelector('#commercialClipList');
  const librarySummary = document.querySelector('#commercialLibrarySummary');
  const MODE_KEY = 'saturdayTube.commercialMode.v1';
  const RECENT_KEY = 'saturdayTube.recentCommercials.v1';
  const AD_SECONDS_PER_PROGRAM_SECOND = 11 / 49;
  const MIN_MIDROLL_SECONDS = 15 * 60;
  let enabled = localStorage.getItem(MODE_KEY) === 'true';
  let library = { sources: [], clips: [], reviewCount: 0 };
  let plan = null;
  let planPromise = null;
  let planForPath = '';
  let activeTrackPath = '';
  let consumedBreaks = new Set();
  let adSession = null;
  let analysisToken = 0;
  let managerShouldResume = false;
  let frameTimer = null;
  let pendingSeek = false;
  let ignorePauseUntil = 0;
  let programPlaybackActive = false;

  function currentTrack() { return activePlaylist()?.tracks[currentIndex] || null; }
  function shouldUseBoundaryBreak(durationSeconds, hasNextVideo) {
    const duration = Number(durationSeconds);
    return Boolean(hasNextVideo) && Number.isFinite(duration) && duration > 0 && duration < MIN_MIDROLL_SECONDS;
  }
  function formatDuration(seconds) {
    const whole = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  function setMessage(message) {
    statusLine.textContent = message;
    statusLine.title = message;
  }
  function updateModeButton() {
    modeButton.setAttribute('aria-pressed', String(enabled));
    modeButton.textContent = enabled ? 'WITH COMMERCIALS · ON' : 'WITH COMMERCIALS · OFF';
    modeButton.classList.toggle('is-on', enabled);
  }
  function enabledClips() {
    if (selectedInput === 'tv') {
      return (activeChannelCommercials() || []).filter(clip => clip.enabled !== false && clip.url && Number(clip.durationSeconds) >= 2.5);
    }
    return library.clips.filter(clip => clip.enabled !== false && clip.url && Number(clip.durationSeconds) >= 2.5);
  }
  function recentIds() {
    try {
      const items = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(items) ? items.filter(id => typeof id === 'string').slice(0, 8) : [];
    } catch { return []; }
  }
  function recordRecent(id) {
    const items = [id, ...recentIds().filter(old => old !== id)].slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(items)); } catch { /* Commercial playback still works for this session. */ }
  }
  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
  function buildAdQueue(targetSeconds) {
    const available = enabledClips();
    if (!available.length || targetSeconds <= 0) return [];
    const recent = new Set(recentIds());
    const fresh = shuffle(available.filter(clip => !recent.has(clip.id)));
    const shuffled = [...fresh, ...shuffle(available.filter(clip => recent.has(clip.id)))];
    const queue = [];
    let total = 0;
    for (const clip of shuffled) {
      if (total >= targetSeconds) break;
      const length = Number(clip.durationSeconds) || 0;
      if (queue.length && total + length > targetSeconds + 22) continue;
      queue.push(clip);
      total += length;
    }
    if (!queue.length && shuffled.length) queue.push(shuffled[0]);
    return queue;
  }
  async function refreshLibrary() {
    try {
      library = await window.tube.getCommercialLibrary();
      library.clips = Array.isArray(library.clips) ? library.clips : [];
      library.sources = Array.isArray(library.sources) ? library.sources : [];
      library.reviewCount = Number(library.reviewCount) || 0;
      renderLibrary();
      updateStatusLine();
      return library;
    } catch (error) {
      console.error('Commercial library could not be opened', error);
      setMessage(error.message || 'COMMERCIAL LIBRARY UNAVAILABLE');
      return library;
    }
  }
  function updateStatusLine() {
    const count = enabledClips().length;
    const pending = Number(library.reviewCount) || 0;
    if (selectedInput === 'tv') {
      const current = currentTrack();
      setMessage(current?.channelAd
        ? `${count} CHANNEL ADS READY · COMMERCIAL ON AIR`
        : `${count} CHANNEL ADS READY · BROADCAST CLOCK LIVE`);
    } else if (enabled) {
      const breakCount = plan?.breaks?.length;
      const nextIndex = findNextPlayableTrack(currentIndex + 1);
      const shortEpisode = hasVideo && Number.isFinite(video.duration) && video.duration < MIN_MIDROLL_SECONDS;
      setMessage(!hasVideo
        ? count ? `${count} ADS READY · AWAITING TAPE` : 'ADD COMMERCIALS IN MANAGE ADS'
        : shortEpisode
          ? count ? (nextIndex >= 0 ? `${count} ADS READY · BREAK BEFORE NEXT VIDEO` : 'SHORT EPISODE · WILL PLAY THROUGH') : 'ADD COMMERCIALS IN MANAGE ADS'
          : breakCount
            ? `${count} ADS READY · ${breakCount} BLACK-FADE BREAK${breakCount === 1 ? '' : 'S'}`
            : count ? 'FINDING SAFE FADE POINTS…' : 'ADD COMMERCIALS IN MANAGE ADS');
    } else {
      setMessage(`${count} ADS SAVED${pending ? ` · ${pending} CUTS TO REVIEW` : ''}`);
    }
    librarySummary.textContent = `${count} playable · ${pending} ${pending === 1 ? 'boundary' : 'boundaries'} flagged for review`;
  }
  function showProgress(message, busy = true) {
    progress.hidden = !message;
    progress.setAttribute('aria-busy', String(busy));
    progress.textContent = message || '';
  }
  async function ensureBreakPlan() {
    if (!enabled || selectedInput === 'tv' || !hasVideo || !Number.isFinite(video.duration) || video.duration < MIN_MIDROLL_SECONDS) return null;
    const track = currentTrack();
    if (!track?.path) return null;
    if (planForPath === track.path && plan) return plan;
    if (planPromise && planForPath === track.path) return planPromise;
    const requestedPath = track.path;
    const token = ++analysisToken;
    planForPath = requestedPath;
    plan = null;
    setMessage('ANALYZING BLACK-FADE BREAKS…');
    showProgress('Scanning this tape for fade-to-black transitions…');
    planPromise = window.tube.analyzeCommercialBreaks(requestedPath, video.duration)
      .then(result => {
        if (token !== analysisToken || currentTrack()?.path !== requestedPath) return null;
        plan = result;
        consumedBreaks = new Set((plan.breaks || []).filter(item => item.at < video.currentTime - 1).map(item => item.id));
        showProgress('', false);
        updateStatusLine();
        if (!plan.breaks?.length && enabledClips().length) {
          setMessage('NO SAFE BLACK FADE FOUND · NO AD WILL INTERRUPT THIS TAPE');
        }
        return plan;
      })
      .catch(error => {
        if (token === analysisToken) {
          plan = null;
          showProgress('', false);
          setMessage(error.message || 'FADE ANALYSIS UNAVAILABLE · PLAYBACK IS UNCHANGED');
        }
        return null;
      })
      .finally(() => {
        if (token === analysisToken) planPromise = null;
      });
    return planPromise;
  }
  function createProgramRestore(shouldResume) {
    const session = adSession;
    if (!session) return null;
    return {
      trackPath: session.trackPath,
      currentTime: session.programTime,
      wasPlaying: Boolean(shouldResume),
      input: selectedInput === 'static' ? 'static' : 'video'
    };
  }
  function restoreProgram(reason = '') {
    const session = adSession;
    if (!session || session.phase === 'returning') return;
    const shouldResume = session.wasPlaying && !session.pausedByUser;
    if (Number.isInteger(session.boundaryNextIndex)) {
      const nextTrack = activePlaylist()?.tracks[session.boundaryNextIndex];
      session.phase = 'returning';
      adSession = null;
      if (!nextTrack) return;
      programPlaybackActive = shouldResume;
      setMessage('RETURNING TO THE NEXT TAPE…');
      playTrack(session.boundaryNextIndex, {
        trackPath: nextTrack.path,
        currentTime: 0,
        wasPlaying: shouldResume,
        input: 'video'
      });
      return;
    }
    session.phase = 'returning';
    session.returnReason = reason;
    pendingPlaybackRestore = createProgramRestore(shouldResume);
    switchingTracks = true;
    video.pause();
    video.src = session.programUrl;
    video.load();
    switchingTracks = false;
    setMessage('RETURNING TO THE TAPE…');
  }
  function loadAd(index) {
    const session = adSession;
    if (!session || !session.queue[index]) return restoreProgram('commercial list ended');
    session.index = index;
    session.phase = 'ad';
    session.pausedByUser = false;
    const ad = session.queue[index];
    recordRecent(ad.id);
    ignorePauseUntil = performance.now() + 600;
    switchingTracks = true;
    video.pause();
    video.src = ad.url;
    video.load();
    switchingTracks = false;
    setMessage(`COMMERCIAL ${index + 1} OF ${session.queue.length} · ${ad.title}`);
  }
  function startCommercialBreak(item) {
    if (adSession || !enabled || video.paused || selectedInput === 'static' || selectedInput === 'tv') return;
    const track = currentTrack();
    if (!track?.path) return;
    const programSecondsPerBreak = video.duration * AD_SECONDS_PER_PROGRAM_SECOND / Math.max(1, plan.breaks.length);
    const queue = buildAdQueue(programSecondsPerBreak);
    if (!queue.length) {
      consumedBreaks.add(item.id);
      setMessage('NO ENABLED ADS · PROGRAM CONTINUES');
      return;
    }
    const programUrl = video.currentSrc || video.src;
    const session = {
      phase: 'seeking',
      trackPath: track.path,
      programUrl,
      programTime: item.at,
      wasPlaying: !video.paused,
      pausedByUser: false,
      textTrackModes: Array.from(video.textTracks || []).map(track => track.mode),
      queue,
      index: -1,
      selectedInput
    };
    adSession = session;
    consumedBreaks.add(item.id);
    video.pause();
    try { video.currentTime = item.at; } catch { /* The current frame may already be at this exact edit. */ }
    setMessage(`FADE TO BLACK · ${queue.length} RANDOM ADS`);
    const begin = () => {
      if (adSession !== session || session.phase !== 'seeking') return;
      loadAd(0);
    };
    if (video.seeking) video.addEventListener('seeked', begin, { once: true });
    else window.setTimeout(begin, 40);
  }
  function startBoundaryBreak(nextIndex) {
    if (adSession || !enabled || selectedInput === 'static' || selectedInput === 'tv' || !programPlaybackActive) return false;
    const track = currentTrack();
    if (!track?.path || !shouldUseBoundaryBreak(video.duration, nextIndex >= 0)) return false;
    const queue = buildAdQueue(video.duration * AD_SECONDS_PER_PROGRAM_SECOND);
    if (!queue.length) return false;
    adSession = {
      phase: 'seeking',
      trackPath: track.path,
      programUrl: null,
      programTime: Number.isFinite(video.duration) ? video.duration : 0,
      wasPlaying: true,
      pausedByUser: false,
      textTrackModes: Array.from(video.textTracks || []).map(item => item.mode),
      queue,
      index: -1,
      selectedInput,
      boundaryNextIndex: nextIndex
    };
    setMessage(`EPISODE COMPLETE · ${queue.length} ADS BEFORE THE NEXT VIDEO`);
    loadAd(0);
    return true;
  }
  function checkForBreak() {
    if (!enabled || adSession || !hasVideo || video.paused || video.seeking || selectedInput === 'static' || selectedInput === 'tv' || !plan || currentTrack()?.path !== planForPath) return;
    const next = (plan.breaks || []).find(item => !consumedBreaks.has(item.id) && video.currentTime >= item.at - 0.055);
    if (next) startCommercialBreak(next);
  }
  function renderLibrary() {
    const sources = library.sources || [];
    sourceSummary.textContent = sources.length
      ? sources.map(source => `${source.name} · ${source.clipCount || 0} ads`).join('  /  ')
      : 'No compilations yet. Add one to split it into reusable ads.';
    clipList.replaceChildren();
    if (!library.clips.length) {
      const empty = document.createElement('p');
      empty.className = 'commercial-empty';
      empty.textContent = 'The commercial shelf is empty. Add a compilation to get started.';
      clipList.append(empty);
      librarySummary.textContent = '0 playable · 0 boundaries flagged for review';
      return;
    }
    for (const clip of library.clips) {
      const row = document.createElement('article');
      row.className = 'commercial-clip';
      row.dataset.review = String(Boolean(clip.needsReview && !clip.reviewed));
      const heading = document.createElement('div');
      heading.className = 'commercial-clip-heading';
      const title = document.createElement('input');
      title.className = 'commercial-clip-title';
      title.type = 'text';
      title.maxLength = 80;
      title.value = clip.title;
      title.setAttribute('aria-label', `Commercial ${clip.ordinal} title`);
      const duration = document.createElement('span');
      duration.className = 'commercial-clip-duration';
      duration.textContent = formatDuration(clip.durationSeconds);
      const confidence = document.createElement('span');
      confidence.className = 'commercial-confidence';
      confidence.textContent = clip.needsReview && !clip.reviewed ? `REVIEW · ${Math.round((clip.boundaryConfidence || 0) * 100)}%` : 'CUT OK';
      heading.append(title, duration, confidence);

      const controls = document.createElement('div');
      controls.className = 'commercial-clip-controls';
      const enabledLabel = document.createElement('label');
      enabledLabel.className = 'commercial-check';
      const enabledInput = document.createElement('input');
      enabledInput.type = 'checkbox';
      enabledInput.checked = clip.enabled !== false;
      enabledInput.setAttribute('aria-label', `Include ${clip.title} in random playback`);
      enabledLabel.append(enabledInput, document.createTextNode(' INCLUDE'));
      const reviewedButton = document.createElement('button');
      reviewedButton.type = 'button';
      reviewedButton.className = 'commercial-review-button';
      reviewedButton.textContent = clip.reviewed ? 'REOPEN REVIEW' : 'MARK REVIEWED';
      controls.append(enabledLabel, reviewedButton);

      const details = document.createElement('details');
      details.className = 'commercial-clip-details';
      const summary = document.createElement('summary');
      summary.textContent = 'PREVIEW / ADJUST CUT';
      const preview = document.createElement('video');
      preview.controls = true;
      preview.preload = 'none';
      preview.playsInline = true;
      preview.setAttribute('aria-label', `Preview ${clip.title}`);
      const fields = document.createElement('div');
      fields.className = 'commercial-cut-fields';
      const startLabel = document.createElement('label');
      startLabel.textContent = 'SOURCE IN';
      const startInput = document.createElement('input');
      startInput.type = 'number';
      startInput.min = '0';
      startInput.max = '99999';
      startInput.step = '0.05';
      startInput.value = Number(clip.sourceStart).toFixed(3);
      const endLabel = document.createElement('label');
      endLabel.textContent = 'SOURCE OUT';
      const endInput = document.createElement('input');
      endInput.type = 'number';
      endInput.min = '0';
      endInput.max = '99999';
      endInput.step = '0.05';
      endInput.value = Number(clip.sourceEnd).toFixed(3);
      const recut = document.createElement('button');
      recut.type = 'button';
      recut.className = 'commercial-recut-button';
      recut.textContent = 'RE-CUT THIS AD';
      fields.append(startLabel, startInput, endLabel, endInput, recut);
      details.append(summary, preview, fields);
      row.append(heading, controls, details);

      details.addEventListener('toggle', () => {
        if (details.open && !preview.src) preview.src = clip.url;
        if (!details.open) preview.pause();
      });
      title.addEventListener('change', async () => {
        await window.tube.updateCommercialClip(clip.id, { title: title.value });
        await refreshLibrary();
      });
      enabledInput.addEventListener('change', async () => {
        await window.tube.updateCommercialClip(clip.id, { enabled: enabledInput.checked });
        await refreshLibrary();
      });
      reviewedButton.addEventListener('click', async () => {
        await window.tube.updateCommercialClip(clip.id, { reviewed: !clip.reviewed });
        await refreshLibrary();
      });
      recut.addEventListener('click', async () => {
        recut.disabled = true;
        recut.textContent = 'RE-CUTTING…';
        try {
          await window.tube.retimeCommercialClip(clip.id, Number(startInput.value), Number(endInput.value));
          await refreshLibrary();
          showProgress('Cut rebuilt and saved to the local commercial library.', false);
          window.setTimeout(() => showProgress('', false), 2500);
        } catch (error) {
          showProgress(error.message || 'Could not rebuild this cut.', false);
          recut.disabled = false;
          recut.textContent = 'RE-CUT THIS AD';
        }
      });
      clipList.append(row);
    }
    updateStatusLine();
  }
  async function openManager() {
    managerShouldResume = !video.paused;
    if (managerShouldResume) video.pause();
    await refreshLibrary();
    if (!dialog.open) dialog.showModal();
  }
  function closeManager() {
    if (dialog.open) dialog.close();
  }
  async function addCompilation() {
    addButton.disabled = true;
    showProgress('Choose a source compilation. The original file will be kept unchanged.');
    try {
      await window.tube.importCommercialCompilation();
      await refreshLibrary();
      showProgress('Commercial library updated; uncertain cuts are labeled for review.', false);
      window.setTimeout(() => showProgress('', false), 4000);
    } catch (error) {
      showProgress(error.message || 'Import failed. The original file remains unchanged.', false);
    } finally {
      addButton.disabled = false;
    }
  }
  function onImportProgress(item) {
    if (!item) return;
    if (item.phase === 'watch-import-complete') {
      showProgress(`Added ${item.title} from the watched Commercials folder.`, false);
      void refreshLibrary();
      window.setTimeout(() => showProgress('', false), 2500);
      return;
    }
    const current = Number(item.current) || 0;
    const total = Number(item.total) || 0;
    if (item.phase === 'copying-source') showProgress(`Copying ${item.name}; original is untouched…`);
    else if (item.phase === 'scanning') showProgress('Scanning black transitions in the compilation…');
    else if (item.phase === 'splitting') showProgress(`Saving ad ${current} of ${total}…`);
    else if (item.phase === 'clip-complete') showProgress(`Saved ad ${current} of ${total}${item.needsReview ? ' · boundary flagged for review' : ''}…`);
    else if (item.phase === 'complete') showProgress(`Imported ${item.clipCount} ads. ${item.reviewCount || 0} cuts flagged for review.`, false);
  }

  const originalSavePlaybackSession = savePlaybackSession;
  savePlaybackSession = function saveSessionWithCommercialResume() {
    if (!adSession) return originalSavePlaybackSession();
    if (selectedInput === 'tv') {
      saveChannelPlaybackState(adSession.programTime, adSession.wasPlaying && !adSession.pausedByUser);
      return;
    }
    const track = activePlaylist()?.tracks[currentIndex];
    if (!track?.path) return;
    const resumeTrack = Number.isInteger(adSession.boundaryNextIndex)
      ? activePlaylist()?.tracks[adSession.boundaryNextIndex] || track
      : track;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        playlistId: activePlaylistId,
        trackPath: resumeTrack.path,
        currentTime: Number.isInteger(adSession.boundaryNextIndex) ? 0 : adSession.programTime,
        wasPlaying: adSession.wasPlaying && !adSession.pausedByUser,
        input: selectedInput
      }));
    } catch (error) { console.warn('Commercial playback resume point could not be saved', error); }
  };

  modeButton.addEventListener('click', async () => {
    enabled = !enabled;
    localStorage.setItem(MODE_KEY, String(enabled));
    updateModeButton();
    if (!enabled && adSession) restoreProgram('commercial mode turned off');
    else if (enabled) {
      await refreshLibrary();
      await ensureBreakPlan();
    }
    updateStatusLine();
  });
  manageButton.addEventListener('click', openManager);
  closeButton.addEventListener('click', closeManager);
  dialog.addEventListener('click', event => { if (event.target === dialog) closeManager(); });
  dialog.addEventListener('close', () => {
    const resume = managerShouldResume;
    managerShouldResume = false;
    if (resume && video.paused) video.play().catch(() => {});
  });
  addButton.addEventListener('click', addCompilation);
  window.tube.onCommercialsProgress(onImportProgress);
  window.addEventListener('saturdayTube-input-changing', () => {
    if (adSession) restoreProgram('input changed');
  });
  window.addEventListener('saturdayTube-channel-change', () => {
    if (adSession) restoreProgram('channel changed');
    plan = null;
    planPromise = null;
    planForPath = '';
    activeTrackPath = '';
    consumedBreaks.clear();
    updateStatusLine();
  });

  video.addEventListener('play', () => { if (!adSession) programPlaybackActive = true; }, true);
  video.addEventListener('pause', () => { if (!adSession && !video.ended) programPlaybackActive = false; }, true);
  video.addEventListener('seeking', () => { if (!adSession) pendingSeek = true; }, true);
  video.addEventListener('seeked', () => {
    if (adSession) return;
    if (pendingSeek && plan && currentTrack()?.path === planForPath) {
      for (const item of plan.breaks || []) if (item.at <= video.currentTime + 0.5) consumedBreaks.add(item.id);
    }
    pendingSeek = false;
  }, true);
  video.addEventListener('ended', event => {
    if (window.saturdayTubeMoviePrerollActive) return;
    if (!adSession) {
      if (selectedInput === 'tv') return;
      const nextIndex = findNextPlayableTrack(currentIndex + 1);
      if (enabled && programPlaybackActive && selectedInput !== 'static'
        && shouldUseBoundaryBreak(video.duration, nextIndex >= 0) && startBoundaryBreak(nextIndex)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (adSession.phase !== 'ad') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!adSession.pausedByUser && adSession.index + 1 < adSession.queue.length) loadAd(adSession.index + 1);
    else if (!adSession.pausedByUser) restoreProgram('commercial break complete');
  }, true);
  video.addEventListener('pause', () => {
    if (adSession?.phase === 'ad' && performance.now() >= ignorePauseUntil && !switchingTracks && !video.ended && selectedInput !== 'static') {
      adSession.pausedByUser = true;
      setMessage('COMMERCIAL PAUSED · TAPE WILL RESUME AT THE SAME FADE');
    }
  });
  video.addEventListener('play', () => {
    if (adSession?.phase === 'ad') {
      adSession.pausedByUser = false;
      const clip = adSession.queue[adSession.index];
      setMessage(`COMMERCIAL ${adSession.index + 1} OF ${adSession.queue.length} · ${clip?.title || ''}`);
    }
  });
  video.addEventListener('loadedmetadata', () => {
    if (adSession?.phase === 'ad') {
      for (const track of Array.from(video.textTracks || [])) track.mode = 'disabled';
      return;
    }
    if (adSession?.phase === 'returning') {
      if (currentTrack()?.path === adSession.trackPath) {
        const modes = adSession.textTrackModes || [];
        Array.from(video.textTracks || []).forEach((track, index) => { track.mode = modes[index] || 'disabled'; });
        adSession = null;
        updateStatusLine();
        return;
      }
      adSession = null;
    }
    if (adSession && currentTrack()?.path !== adSession.trackPath) adSession = null;
    const track = currentTrack();
    if (track?.path && track.path !== activeTrackPath) {
      activeTrackPath = track.path;
      planForPath = '';
      plan = null;
      consumedBreaks.clear();
      pendingSeek = false;
    }
    if (enabled && hasVideo && selectedInput !== 'tv') void ensureBreakPlan();
    updateStatusLine();
  });
  video.addEventListener('timeupdate', checkForBreak);
  if (!frameTimer) frameTimer = window.setInterval(checkForBreak, 100);

  updateModeButton();
  void refreshLibrary().then(() => {
    if (enabled && hasVideo && Number.isFinite(video.duration) && selectedInput !== 'tv') void ensureBreakPlan();
  });
})();
