import { app, BrowserWindow, BrowserView, ipcMain, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { applyPrivacyShield } from './privacy.js';
import https from 'https';
import os from 'os';

// Performance Optimizations for low-end PCs
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let browserView;
let llama;
let model;
let context;
let chatSession;
let abortController;
let isSidebarOpen = false;

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

    // Create BrowserView for web content
    browserView = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });

    mainWindow.setBrowserView(browserView);
    
    // Position the BrowserView (toolbar is 48px high)
    const setViewBounds = () => {
        const [width, height] = mainWindow.getContentSize();
        // Leave room for toolbar (48px) and potentially a bit of padding
        browserView.setBounds({ x: 0, y: 48, width: width, height: height - 48 });
    };

    setViewBounds();
    mainWindow.on('resize', setViewBounds);

    // Initial navigation
    browserView.webContents.loadURL('https://www.google.com');

    // Apply Privacy Shield back to the session
    const currentSession = browserView.webContents.session;
    let blockedCount = 0;
    applyPrivacyShield(currentSession, () => {
        blockedCount++;
        mainWindow.webContents.send('update-blocked-count', blockedCount);
    });

    // Sync address bar
    browserView.webContents.on('did-navigate', (event, url) => {
        mainWindow.webContents.send('page-load', url);
    });

    browserView.webContents.on('did-navigate-in-page', (event, url) => {
        mainWindow.webContents.send('page-load', url);
    });

    // Send AI status once the shell is ready
    mainWindow.webContents.on('did-finish-load', () => {
        initAI();
    });
}

// IPC Handlers
ipcMain.on('navigate', (event, url) => {
    browserView.webContents.loadURL(url);
});

ipcMain.on('go-back', () => {
    if (browserView.webContents.canGoBack()) browserView.webContents.goBack();
});

ipcMain.on('go-forward', () => {
    if (browserView.webContents.canGoForward()) browserView.webContents.goForward();
});

ipcMain.on('reload', () => {
    browserView.webContents.reload();
});

ipcMain.on('toggle-stealth', (event, isEnabled) => {
    // ... (stealth logic)
});

ipcMain.on('toggle-sidebar', (event) => {
    isSidebarOpen = !isSidebarOpen;
    const [width, height] = mainWindow.getContentSize();
    const sidebarWidth = 320;

    if (isSidebarOpen) {
        // Shrink BrowserView to make room for sidebar
        browserView.setBounds({ 
            x: 0, 
            y: 48, 
            width: width - sidebarWidth, 
            height: height - 48 
        });
    } else {
        // Expand BrowserView to fill the screen
        browserView.setBounds({ 
            x: 0, 
            y: 48, 
            width: width, 
            height: height - 48 
        });
    }
});

// AI Logic
async function initAI() {
    try {
        const modelsDir = path.join(app.getAppPath(), 'models');
        const modelPath = path.join(modelsDir, 'gemma-2b-it.gguf');
        
        console.log('[Aura Brain] Scanning path:', modelPath);
        
        if (!fs.existsSync(modelPath)) {
            console.log('[Aura Brain] Missing model file.');
            mainWindow.webContents.send('ai-status', 'missing');
            return;
        }

        mainWindow.webContents.send('ai-status', 'loading-llama');
        console.log('[Aura Brain] Waking up engine...');
        const llama = await getLlama();
        
        mainWindow.webContents.send('ai-status', 'loading-model');
        console.log('[Aura Brain] Loading model (Hybrid Mode)...');
        model = await llama.loadModel({
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

ipcMain.on('download-model', (event) => {
    const modelsDir = path.join(app.getAppPath(), 'models');
    const dest = path.join(modelsDir, 'gemma-2b-it.gguf');

    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    // Repair Logic: If file exists and is likely correct size, just re-init
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1500000000) {
        console.log('Brain file exists and is correct size. Attempting repair init...');
        initAI();
        return;
    }

    const modelUrl = 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf';
    
    downloadFile(
        modelUrl, 
        dest, 
        (progress) => event.reply('download-progress', progress),
        () => {
            event.reply('download-success');
            initAI();
        },
        (err) => event.reply('download-error', err.message)
    );
});

ipcMain.on('abort-aura', () => {
    if (abortController) {
        abortController.abort();
        console.log('[Aura Brain] Prompt Aborted by user.');
    }
});

ipcMain.on('ask-aura', async (event, prompt) => {
    // Auto-init if model just appeared but session isn't ready
    if (!chatSession) {
        const modelsDir = path.join(app.getAppPath(), 'models');
        const modelPath = path.join(modelsDir, 'gemma-2b-it.gguf');
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
        // Simple page context extraction
        const pageText = await browserView.webContents.executeJavaScript(`
            document.body.innerText.substring(0, 2000);
        `).catch(() => "");

        const enhancedPrompt = `Context from current page: "${pageText}"\n\nUser Question: ${prompt}`;

        abortController = new AbortController();
        
        // Streaming response in v3
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
    createWindow();
    // initAI is now called on did-finish-load for better sync
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
