const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tube', Object.freeze({
  restoreVideos: (paths) => ipcRenderer.invoke('restore-videos', paths),
  transcodeMedia: (id) => ipcRenderer.invoke('transcode-media', id),
  chooseLibraryFolder: () => ipcRenderer.invoke('choose-library-folder'),
  restoreLibraryFolder: (root) => ipcRenderer.invoke('restore-library-folder', root),
  importLibraryFiles: () => ipcRenderer.invoke('import-library-files'),
  browseLibraryFolder: (folderPath) => ipcRenderer.invoke('browse-library-folder', folderPath),
  openLibraryFiles: (paths) => ipcRenderer.invoke('open-library-files', paths),
  lookupMetadata: (filename) => ipcRenderer.invoke('lookup-metadata', filename),
  openSubtitle: () => ipcRenderer.invoke('open-subtitle')
}));
