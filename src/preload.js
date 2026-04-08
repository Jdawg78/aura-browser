const { contextBridge, ipcRenderer } = require('electron');

// --- Anti-Fingerprinting Protections ---
// We override these properties before any site scripts can read them.
const genericProtections = {
    webdriver: { value: false, configurable: false },
    hardwareConcurrency: { value: 4, configurable: false },
    deviceMemory: { value: 8, configurable: false },
    platform: { value: 'Win32', configurable: false },
    languages: { value: ['en-US', 'en'], configurable: false }
};

for (const [prop, config] of Object.entries(genericProtections)) {
    try {
        Object.defineProperty(navigator, prop, config);
    } catch (e) {
        console.warn(`[Aura Guard] Failed to spoof ${prop}`);
    }
}

// Mask plugins and mimetypes to prevent enumeration
Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: false });
Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: false });

// ----------------------------------------

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
    openSettings: () => ipcRenderer.send('open-settings'),

    // Vault & Settings
    getVaultStatus: () => ipcRenderer.send('get-vault-status'),
    unlockVault: (password) => ipcRenderer.send('unlock-vault', password),
    saveProfile: (profile) => ipcRenderer.send('save-profile', profile),
    getProfile: () => ipcRenderer.send('get-profile'),
    setMasterPassword: (password) => ipcRenderer.send('set-master-password', password),
    setSearchEngine: (engineUrl) => ipcRenderer.send('set-search-engine', engineUrl),
    setViewVisibility: (isVisible) => ipcRenderer.send('set-view-visibility', isVisible),
    fillForm: () => ipcRenderer.send('fill-form'),

    onVaultStatus: (callback) => ipcRenderer.on('vault-status', (_, status) => callback(status)),
    onUnlockResult: (callback) => ipcRenderer.on('unlock-result', (_, success) => callback(success)),
    onProfileData: (callback) => ipcRenderer.on('profile-data', (_, data) => callback(data)),
    onSaveResult: (callback) => ipcRenderer.on('save-result', (_, success) => callback(success)),

    onPageLoad: (callback) => ipcRenderer.on('page-load', (_, url) => callback(url)),
    onAIResponse: (callback) => ipcRenderer.on('ai-response', (_, chunk) => callback(chunk)),
    onAIStatus: (callback) => ipcRenderer.on('ai-status', (_, status, err) => callback(status, err)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    onDownloadSuccess: (callback) => ipcRenderer.on('download-success', (_) => callback()),
    onDownloadError: (callback) => ipcRenderer.on('download-error', (_, err) => callback(err)),
    onBlockedCount: (callback) => ipcRenderer.on('update-blocked-count', (_, count) => callback(count)),
    onAIFinished: (callback) => ipcRenderer.on('ai-finished', (_) => callback())
});

// --- Auto-Fill Logic ---
// This runs inside the context of the page being browsed
ipcRenderer.on('execute-autofill', (_, profile) => {
    console.log('[Aura Guard] Auto-filling form fields...');
    
    const fill = (selector, value) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            if (el.value !== undefined) {
                el.value = value;
                // Trigger events so React/Vue/etc. pick up the change
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                // Visual feedback
                el.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                setTimeout(() => el.style.backgroundColor = '', 1000);
            }
        });
    };

    if (profile.name) {
        fill('input[name*="name"], input[id*="name"], input[placeholder*="Name"]', profile.name);
    }
    if (profile.email) {
        fill('input[type="email"], input[name*="email"], input[id*="email"]', profile.email);
    }
    if (profile.phone) {
        fill('input[type="tel"], input[name*="phone"], input[id*="phone"]', profile.phone);
    }
    if (profile.address) {
        fill('textarea[name*="address"], textarea[id*="address"], input[name*="address"]', profile.address);
    }
});
