const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Navigation
    navigate: (url) => ipcRenderer.send('navigate', url),
    goBack: () => ipcRenderer.send('go-back'),
    goForward: () => ipcRenderer.send('go-forward'),
    reload: () => ipcRenderer.send('reload'),

    toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
    askAura: (prompt) => ipcRenderer.send('ask-aura', prompt),
    abortAura: () => ipcRenderer.send('abort-aura'),
    abortAura: () => ipcRenderer.send('abort-aura'),
    toggleStealth: (isEnabled) => ipcRenderer.send('toggle-stealth', isEnabled),
    downloadModel: () => ipcRenderer.send('download-model'),

    onPageLoad: (callback) => ipcRenderer.on('page-load', (_, url) => callback(url)),
    onAIResponse: (callback) => ipcRenderer.on('ai-response', (_, chunk) => callback(chunk)),
    onAIStatus: (callback) => ipcRenderer.on('ai-status', (_, status, err) => callback(status, err)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    onDownloadSuccess: (callback) => ipcRenderer.on('download-success', (_) => callback()),
    onDownloadError: (callback) => ipcRenderer.on('download-error', (_, err) => callback(err)),
    onBlockedCount: (callback) => ipcRenderer.on('update-blocked-count', (_, count) => callback(count)),
    onAIFinished: (callback) => ipcRenderer.on('ai-finished', (_) => callback())
});
