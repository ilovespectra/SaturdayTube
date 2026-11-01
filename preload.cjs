const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tube', Object.freeze({
  getStaticInput: () => ipcRenderer.invoke('get-static-input'),
  getMovieTrailers: () => ipcRenderer.invoke('get-movie-trailers'),
  chooseChannelFolder: () => ipcRenderer.invoke('choose-channel-folder'),
  discoverSiblingChannels: (roots) => ipcRenderer.invoke('discover-sibling-channels', roots),
  restoreChannelFolder: (root) => ipcRenderer.invoke('restore-channel-folder', root),
  rescanChannelFolder: (root) => ipcRenderer.invoke('rescan-channel-folder', root),
  buildChannelRound: (root, shows, commercials, state, minimumDurationSeconds) => ipcRenderer.invoke('build-channel-round', root, shows, commercials, state, minimumDurationSeconds),
  reconcileChannelPlayback: (shows, commercials, savedState) => ipcRenderer.invoke('reconcile-channel-playback', shows, commercials, savedState),
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
  getWindowFullscreen: () => ipcRenderer.invoke('get-window-fullscreen'),
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
  transcodeMedia: (id) => ipcRenderer.invoke('transcode-media', id),
  getMediaAudioCodec: (id) => ipcRenderer.invoke('get-media-audio-codec', id),
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
  openSubtitle: () => ipcRenderer.invoke('open-subtitle')
}));
