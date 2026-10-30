const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tube', Object.freeze({
  openVideos: () => ipcRenderer.invoke('open-videos'),
  openVideo: async () => {
    const files = await ipcRenderer.invoke('open-videos');
    return files && files[0] || null;
  },
  restoreVideos: (paths) => ipcRenderer.invoke('restore-videos', paths),
  transcodeMedia: (id) => ipcRenderer.invoke('transcode-media', id),
  chooseLibraryFolder: () => ipcRenderer.invoke('choose-library-folder'),
  browseLibraryFolder: (folderPath) => ipcRenderer.invoke('browse-library-folder', folderPath),
  openLibraryFiles: (paths) => ipcRenderer.invoke('open-library-files', paths),
  lookupMetadata: (filename) => ipcRenderer.invoke('lookup-metadata', filename),
  openSubtitle: () => ipcRenderer.invoke('open-subtitle')
}));
