const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tube', Object.freeze({
  isDeveloperBuild: process.defaultApp === true || process.argv.includes('--saturday-tube-developer-build'),
  notifyRendererReady: () => ipcRenderer.send('renderer-ready'),
  setIntermissionActive: active => ipcRenderer.invoke('set-intermission-active', active === true),
  getStaticInput: () => ipcRenderer.invoke('get-static-input'),
  getMovieTrailers: () => ipcRenderer.invoke('get-movie-trailers'),
  chooseChannelFolder: () => ipcRenderer.invoke('choose-channel-folder'),
  discoverSiblingChannels: (roots, sourceRoot) => ipcRenderer.invoke('discover-sibling-channels', roots, sourceRoot),
  chooseChannelSource: () => ipcRenderer.invoke('choose-channel-source'),
  restoreChannelFolder: (root) => ipcRenderer.invoke('restore-channel-folder', root),
  rescanChannelFolder: (root, options) => ipcRenderer.invoke('rescan-channel-folder', root, { force: options?.force === true }),
  buildChannelRound: (root, shows, commercials, state, minimumDurationSeconds) => ipcRenderer.invoke('build-channel-round', root, shows, commercials, state, minimumDurationSeconds),
  reconcileChannelPlayback: (shows, commercials, savedState) => ipcRenderer.invoke('reconcile-channel-playback', shows, commercials, savedState),
  resolveChannelBreaks: entries => ipcRenderer.invoke('resolve-channel-breaks', entries),
  onChannelBreaksResolved: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on('channel-breaks-resolved', listener);
    return () => ipcRenderer.removeListener('channel-breaks-resolved', listener);
  },
  fillChannelCommercialBreaks: (upcoming, commercials, rotation) => ipcRenderer.invoke('fill-channel-commercial-breaks', upcoming, commercials, rotation),
  onChannelCommercialsUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, commercialsRoot) => callback(String(commercialsRoot || ''));
    ipcRenderer.on('channel-commercials-updated', listener);
    return () => ipcRenderer.removeListener('channel-commercials-updated', listener);
  },
  getCommercialLibrary: () => ipcRenderer.invoke('get-commercial-library'),
  importCommercialCompilation: () => ipcRenderer.invoke('import-commercial-compilation'),
  analyzeCommercialBreaks: (filePath, durationSeconds) => ipcRenderer.invoke('analyze-commercial-breaks', filePath, durationSeconds),
  updateCommercialClip: (id, patch) => ipcRenderer.invoke('update-commercial-clip', id, patch),
  retimeCommercialClip: (id, start, end) => ipcRenderer.invoke('retime-commercial-clip', id, start, end),
  onCommercialsProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('commercials-progress', listener);
    return () => ipcRenderer.removeListener('commercials-progress', listener);
  },
  toggleWindowFullscreen: () => ipcRenderer.invoke('toggle-window-fullscreen'),
  setWindowFullscreen: (fullscreen) => ipcRenderer.invoke('set-window-fullscreen', fullscreen === true),
  getWindowFullscreen: () => ipcRenderer.invoke('get-window-fullscreen'),
  onPictureVisibilityChange: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, visible) => callback(visible === true);
    ipcRenderer.on('picture-visibility-change', listener);
    return () => ipcRenderer.removeListener('picture-visibility-change', listener);
  },
  setBackdropDim: (enabled) => ipcRenderer.invoke('set-backdrop-dim', enabled === true),
  onFullscreenCycleRequest: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('fullscreen-cycle-request', listener);
    return () => ipcRenderer.removeListener('fullscreen-cycle-request', listener);
  },
  onWindowFullscreenChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, isFullscreen) => callback(Boolean(isFullscreen));
    ipcRenderer.on('window-fullscreen-change', listener);
    return () => ipcRenderer.removeListener('window-fullscreen-change', listener);
  },
  restoreVideos: (paths) => ipcRenderer.invoke('restore-videos', paths),
  getManagedTapeShelf: () => ipcRenderer.invoke('get-managed-tape-shelf'),
  ensureLocalTape: (filePath) => ipcRenderer.invoke('ensure-local-tape', filePath),
  ejectManagedTape: (filePath) => ipcRenderer.invoke('eject-managed-tape', filePath),
  transcodeMedia: (id, options) => ipcRenderer.invoke('transcode-media', id, options && typeof options === 'object' ? { priority: options.priority === 'background' ? 'background' : 'foreground' } : {}),
  getMediaAudioCodec: (id) => ipcRenderer.invoke('get-media-audio-codec', id),
  setPlaybackPriority: (active) => ipcRenderer.send('playback-priority', active === true),
  openChannelMedia: (id, startSeconds, options) => ipcRenderer.invoke('open-channel-media', id, Number(startSeconds) || 0, {
    forceLive: options?.forceLive === true,
    forceEncode: options?.forceEncode === true,
    prepareOnly: options?.prepareOnly === true
  }),
  reportChannelTuneMetric: (metric) => ipcRenderer.send('channel-tune-metric', metric),
  chooseLibraryFolder: () => ipcRenderer.invoke('choose-library-folder'),
  restoreLibraryFolder: (root) => ipcRenderer.invoke('restore-library-folder', root),
  importLibraryFiles: () => ipcRenderer.invoke('import-library-files'),
  onLibraryImportProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('library-import-progress', listener);
    return () => ipcRenderer.removeListener('library-import-progress', listener);
  },
  browseLibraryFolder: (folderPath) => ipcRenderer.invoke('browse-library-folder', folderPath),
  openLibraryFiles: (paths) => ipcRenderer.invoke('open-library-files', paths),
  parseMetadataFilename: (filename) => ipcRenderer.sendSync('parse-metadata-filename', filename),
  lookupMetadata: (request) => ipcRenderer.invoke('lookup-metadata', request),
  openSubtitle: () => ipcRenderer.invoke('open-subtitle'),
  getRemotePairing: () => ipcRenderer.invoke('remote-get-pairing'),
  setRemoteEnabled: (enabled) => ipcRenderer.invoke('remote-set-enabled', enabled === true),
  resetRemoteKey: () => ipcRenderer.invoke('remote-reset-key'),
  openRemoteOnThisMac: () => ipcRenderer.invoke('remote-open-on-this-mac'),
  openRemoteMirror: () => ipcRenderer.invoke('remote-open-mirror'),
  reportRemoteState: (state) => ipcRenderer.send('remote-state', state),
  onRemoteCommand: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('remote-command', listener);
    return () => ipcRenderer.removeListener('remote-command', listener);
  }
}));
