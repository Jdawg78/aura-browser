import { app, BrowserWindow, BrowserView, ipcMain, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { applyPrivacyShield } from './privacy.js';
import { vault } from './vault.js';
import https from 'https';
import os from 'os';

// Performance & Privacy Optimizations
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');

// Anti-Fingerprinting Switches
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-reading-from-canvas'); // Optional but helps

// Mask User-Agent to look like standard Chrome
const CHROME_VERSION = '133.0.0.0';
const MASKED_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
app.userAgentFallback = MASKED_UA;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let views = {};
let activeTabId = null;

let llama;
let model;
let context;
let chatSession;
let abortController;
let isSidebarOpen = false;
let isViewVisible = true;

function setViewBounds() {
    if (!mainWindow) return;
    const [width, height] = mainWindow.getContentSize();
    const sidebarWidth = isSidebarOpen ? 320 : 0;
    
    Object.keys(views).forEach(id => {
        const view = views[id];
        if (id === activeTabId && isViewVisible) {
            view.setBounds({ x: 0, y: 88, width: width - sidebarWidth, height: height - 88 });
        } else {
            view.setBounds({ x: width + 2000, y: 88, width: width, height: height - 88 });
        }
    });
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#0a0a0c',
        icon: path.join(__dirname, 'ui', 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
    
    mainWindow.on('resize', setViewBounds);

    // Send AI status once the shell is ready
    mainWindow.webContents.on('did-finish-load', () => {
        const startupUrl = vault.getSettings().startupPage || 'https://www.google.com';
        createNewTab(startupUrl);
        initAI();
    });
}

function createNewTab(urlStr) {
    const tabId = 'tab-' + Math.random().toString(36).substr(2, 9);
    const bv = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });
    
    views[tabId] = bv;
    mainWindow.addBrowserView(bv);

    const currentSession = bv.webContents.session;
    applyPrivacyShield(currentSession, () => {
        mainWindow.webContents.send('update-blocked-count', 1);
    });

    bv.webContents.on('did-navigate', (event, url) => {
        if (activeTabId === tabId) mainWindow.webContents.send('page-load', url);
        mainWindow.webContents.send('tab-updated', { id: tabId, url: url, title: bv.webContents.getTitle() });
    });

    bv.webContents.on('did-navigate-in-page', (event, url) => {
        if (activeTabId === tabId) mainWindow.webContents.send('page-load', url);
        mainWindow.webContents.send('tab-updated', { id: tabId, url: url, title: bv.webContents.getTitle() });
    });
    
    bv.webContents.on('page-title-updated', (event, title) => {
        mainWindow.webContents.send('tab-updated', { id: tabId, url: bv.webContents.getURL(), title });
    });

    if (urlStr) {
        bv.webContents.loadURL(urlStr);
    }
    
    mainWindow.webContents.send('tab-created', tabId);
    switchTab(tabId);
    return tabId;
}

function switchTab(tabId) {
    if (!views[tabId]) return;
    activeTabId = tabId;
    mainWindow.setTopBrowserView(views[tabId]);
    setViewBounds();
    mainWindow.webContents.send('page-load', views[tabId].webContents.getURL());
    mainWindow.webContents.send('tab-switched', tabId);
}

function closeTab(tabId) {
    const bv = views[tabId];
    if (!bv) return;
    
    mainWindow.removeBrowserView(bv);
    delete views[tabId];
    
    if (activeTabId === tabId) {
        const remainingTabs = Object.keys(views);
        if (remainingTabs.length > 0) {
            switchTab(remainingTabs[remainingTabs.length - 1]);
        } else {
            activeTabId = null;
            createNewTab('https://www.google.com');
        }
    } else {
        setViewBounds();
    }
    mainWindow.webContents.send('tab-closed', tabId);
}

// IPC Handlers
ipcMain.on('navigate', (event, url) => {
    if (activeTabId && views[activeTabId]) views[activeTabId].webContents.loadURL(url);
});

ipcMain.on('go-back', () => {
    if (activeTabId && views[activeTabId] && views[activeTabId].webContents.canGoBack()) {
        views[activeTabId].webContents.goBack();
    }
});

ipcMain.on('go-forward', () => {
    if (activeTabId && views[activeTabId] && views[activeTabId].webContents.canGoForward()) {
        views[activeTabId].webContents.goForward();
    }
});

ipcMain.on('reload', () => {
    if (activeTabId && views[activeTabId]) views[activeTabId].webContents.reload();
});

ipcMain.on('new-tab', (event, url) => {
    createNewTab(url || 'https://www.google.com');
});

ipcMain.on('switch-tab', (event, id) => {
    switchTab(id);
});

ipcMain.on('close-tab', (event, id) => {
    closeTab(id);
});

ipcMain.on('toggle-stealth', (event, isEnabled) => {
    // ... (stealth logic)
});

// --- Vault & Settings IPC ---
ipcMain.on('get-vault-status', (event) => {
    event.reply('vault-status', {
        isLocked: vault.isLocked,
        useMasterPassword: vault.getSettings().useMasterPassword,
        searchEngine: vault.getSettings().searchEngine
    });
});

ipcMain.on('unlock-vault', (event, password) => {
    const success = vault.unlock(password);
    event.reply('unlock-result', success);
    if (success) {
        event.reply('profile-data', vault.getProfile());
    }
});

ipcMain.on('save-profile', (event, profile) => {
    const success = vault.updateProfile(profile);
    event.reply('save-result', success);
});

ipcMain.on('get-profile', (event) => {
    event.reply('profile-data', vault.getProfile());
});

ipcMain.on('set-master-password', (event, password) => {
    vault.setMasterPassword(password);
    event.reply('vault-status', {
        isLocked: vault.isLocked,
        useMasterPassword: vault.getSettings().useMasterPassword,
        searchEngine: vault.getSettings().searchEngine
    });
});

ipcMain.on('set-search-engine', (event, engineUrl) => {
    const settings = vault.getSettings();
    settings.searchEngine = engineUrl;
    vault.save();
    event.reply('vault-status', {
        isLocked: vault.isLocked,
        useMasterPassword: vault.getSettings().useMasterPassword,
        searchEngine: vault.getSettings().searchEngine
    });
});

ipcMain.on('fill-form', async (event) => {
    const profile = vault.getProfile();
    if (profile && !vault.isLocked) {
        mainWindow.webContents.send('execute-autofill', profile);
    }
});

ipcMain.on('toggle-sidebar', (event) => {
    isSidebarOpen = !isSidebarOpen;
    setViewBounds();
});

ipcMain.on('set-view-visibility', (event, isVisible) => {
    isViewVisible = isVisible;
    setViewBounds();
});

let settingsWindow;
ipcMain.on('open-settings', () => {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }
    settingsWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: '#0a0a0c',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'ui', 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        }
    });

    settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings.html'));

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
});

// AI Logic
async function initAI() {
    try {
        const activeAiModel = vault.getSettings().activeAiModel || 'gemma-2b-it.gguf';
        const modelsDir = path.join(app.getAppPath(), 'models');
        const modelPath = path.join(modelsDir, activeAiModel);
        
        console.log('[Aura Brain] Scanning path:', modelPath);
        
        if (!fs.existsSync(modelPath)) {
            console.log('[Aura Brain] Missing model file:', activeAiModel);
            mainWindow.webContents.send('ai-status', 'missing');
            return;
        }

        mainWindow.webContents.send('ai-status', 'loading-llama');
        console.log('[Aura Brain] Waking up engine...');
        const llamaInstance = await getLlama();
        
        mainWindow.webContents.send('ai-status', 'loading-model');
        console.log('[Aura Brain] Loading model (Hybrid Mode)...');
        model = await llamaInstance.loadModel({
            modelPath: modelPath,
            gpuLayers: 10 // Safe hybrid speedup
        });

        mainWindow.webContents.send('ai-status', 'creating-context');
        console.log('[Aura Brain] Initializing memory...');
        context = await model.createContext({
            contextSize: 1024,
            threads: os.cpus().length || 4
        });

        console.log('[Aura Brain] Establishing Sequence...');
        const sequence = await context.getSequence();

        chatSession = new LlamaChatSession({
            contextSequence: sequence,
            systemPrompt: "You are Aura, a helpful AI assistant built into the Aura Browser. Be concise and friendly."
        });

        console.log('[Aura Brain] Successfully Online.');
        mainWindow.webContents.send('ai-status', 'ready');
    } catch (err) {
        console.error('[Aura Brain] Critical Error:', err);
        // Ensure we send a string, even if err is weird
        const errorMsg = err instanceof Error ? err.message : String(err);
        mainWindow.webContents.send('ai-status', 'error', errorMsg);
    }
}

// Download Logic using Node.js standard library (with redirect support)
function downloadFile(url, dest, onProgress, onFinish, onError) {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
            downloadFile(response.headers.location, dest, onProgress, onFinish, onError);
            return;
        }
        
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (onProgress) onProgress((downloadedSize / totalSize) * 100);
        });

        response.pipe(file);
        file.on('finish', () => {
            file.close();
            onFinish();
        });
    }).on('error', (err) => {
        fs.unlink(dest, () => {});
        onError(err);
    });
}

ipcMain.on('download-model', (event, modelUrl, modelFilename) => {
    modelUrl = modelUrl || 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf';
    modelFilename = modelFilename || 'gemma-2b-it.gguf';

    const modelsDir = path.join(app.getAppPath(), 'models');
    const dest = path.join(modelsDir, modelFilename);

    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000000) {
        console.log('Brain file exists and is likely correct size. Attempting repair init...');
        const settings = vault.getSettings();
        settings.activeAiModel = modelFilename;
        vault.updateSettings(settings);
        initAI();
        return;
    }
    
    downloadFile(
        modelUrl, 
        dest, 
        (progress) => event.reply('download-progress', progress),
        () => {
            event.reply('download-success');
            const settings = vault.getSettings();
            settings.activeAiModel = modelFilename;
            vault.updateSettings(settings);
            initAI();
        },
        (err) => event.reply('download-error', err.message)
    );
});

ipcMain.on('set-active-model', (event, modelFilename) => {
    chatSession = null; // Reset to trigger reload
    const settings = vault.getSettings();
    settings.activeAiModel = modelFilename;
    vault.updateSettings(settings);
    initAI();
});

ipcMain.on('abort-aura', () => {
    if (abortController) {
        abortController.abort();
        console.log('[Aura Brain] Prompt Aborted by user.');
    }
});

ipcMain.on('ask-aura', async (event, prompt) => {
    if (!chatSession) {
        const activeAiModel = vault.getSettings().activeAiModel || 'gemma-2b-it.gguf';
        const modelsDir = path.join(app.getAppPath(), 'models');
        const modelPath = path.join(modelsDir, activeAiModel);
        if (fs.existsSync(modelPath)) {
            console.log('[Aura Brain] Model found during chat attempt, initializing...');
            await initAI();
        }
    }

    if (!chatSession) {
        event.reply('ai-response', "Aura is still waking up. Please check the AI Setup Wizard.");
        event.reply('ai-finished');
        return;
    }

    try {
        let pageText = "";
        if (activeTabId && views[activeTabId]) {
            pageText = await views[activeTabId].webContents.executeJavaScript(`
                document.body.innerText.substring(0, 2000);
            `).catch(() => "");
        }

        const enhancedPrompt = `Context from current page: "${pageText}"\n\nUser Question: ${prompt}`;

        abortController = new AbortController();
        
        await chatSession.prompt(enhancedPrompt, {
            signal: abortController.signal,
            onTextChunk: (chunk) => {
                mainWindow.webContents.send('ai-response', chunk);
            }
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            mainWindow.webContents.send('ai-response', '\n[Generation Stopped]');
        } else {
            console.error('AI Error:', err);
            event.reply('ai-response', "Error: " + err.message);
        }
    } finally {
        mainWindow.webContents.send('ai-finished');
    }
});

app.whenReady().then(() => {
    vault.load();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
