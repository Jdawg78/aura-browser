// Aura Browser Renderer Logic

// Core Navigation Elements
const addressInput = document.getElementById('address-input');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const stealthBtn = document.getElementById('stealth-btn');
const aiToggleBtn = document.getElementById('ai-toggle-btn');
const auraSidebar = document.getElementById('aura-sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');

// AI Chat Elements
const aiInput = document.getElementById('ai-input');
const chatMessages = document.getElementById('chat-messages');
const stopAiBtn = document.getElementById('stop-ai-btn');
const sendAiBtn = document.getElementById('send-ai-btn');

// Hamburger Elements
const menuBtn = document.getElementById('menu-btn');
const mainMenuDropdown = document.getElementById('main-menu-dropdown');

document.addEventListener('DOMContentLoaded', () => {
    // Re-render Lucide icons because we injected new HTML
    if (window.lucide) {
        window.lucide.createIcons();
    }
});

// --- Navigation & Smart Address Bar ---
if (addressInput) {
    addressInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            let input = addressInput.value.trim();
            if (!input) return;

            const urlPattern = /^(https?:\/\/)?([\w.-]+\.[a-z]{2,})(\/.*)?$/i;
            const isUrl = urlPattern.test(input) || input.startsWith('localhost') || input.includes(':/');

            if (isUrl) {
                if (!input.includes('://')) input = 'https://' + input;
                window.electronAPI.navigate(input);
            } else {
                const currentEngine = window.lastSearchEngine || 'https://duckduckgo.com/?q=';
                window.electronAPI.navigate(currentEngine + encodeURIComponent(input));
            }
        }
    });
}

if (backBtn) backBtn.addEventListener('click', () => window.electronAPI.goBack());
if (forwardBtn) forwardBtn.addEventListener('click', () => window.electronAPI.goForward());
if (reloadBtn) reloadBtn.addEventListener('click', () => window.electronAPI.reload());

// --- Sidebar Toggle ---
if (aiToggleBtn && auraSidebar) {
    aiToggleBtn.addEventListener('click', () => {
        const isOpen = auraSidebar.classList.toggle('open');
        window.electronAPI.toggleSidebar();
    });
}

if (closeSidebarBtn && auraSidebar) {
    closeSidebarBtn.addEventListener('click', () => {
        auraSidebar.classList.remove('open');
        window.electronAPI.toggleSidebar();
    });
}

// --- Dropdown & Modal UI Logic ---
if (menuBtn && mainMenuDropdown) {
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = mainMenuDropdown.classList.toggle('active');
        window.electronAPI.setViewVisibility(!isActive);
    });
}

document.addEventListener('click', (e) => {
    if (mainMenuDropdown && mainMenuDropdown.classList.contains('active')) {
        if (!mainMenuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            mainMenuDropdown.classList.remove('active');
            window.electronAPI.setViewVisibility(true);
        }
    }
});

// Menu Navigation
const menuSettings = document.getElementById('menu-settings');
const menuVault = document.getElementById('menu-vault');
const menuNewTab = document.getElementById('menu-new-tab');

if (menuSettings) {
    menuSettings.addEventListener('click', () => {
        if (mainMenuDropdown) mainMenuDropdown.classList.remove('active');
        window.electronAPI.setViewVisibility(true);
        window.electronAPI.openSettings();
    });
}

if (menuVault) {
    menuVault.addEventListener('click', () => {
        if (mainMenuDropdown) mainMenuDropdown.classList.remove('active');
        window.electronAPI.setViewVisibility(true);
        window.electronAPI.openSettings();
    });
}

if (menuNewTab) {
    menuNewTab.addEventListener('click', () => {
        if (mainMenuDropdown) mainMenuDropdown.classList.remove('active');
        window.electronAPI.setViewVisibility(true);
        window.electronAPI.navigate('https://www.google.com');
    });
}



// --- Stealth Mode ---
if (stealthBtn) {
    let isStealthMode = false;
    stealthBtn.addEventListener('click', () => {
        isStealthMode = !isStealthMode;
        window.electronAPI.toggleStealth(isStealthMode);
        stealthBtn.style.color = isStealthMode ? 'var(--accent-purple)' : 'var(--text-secondary)';
    });
}

// --- AI Chat Interaction ---
function addMessage(text, isUser = false) {
    if (!chatMessages) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isUser ? 'user' : 'ai'} animate-fade-in`;
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
}

if (sendAiBtn) sendAiBtn.addEventListener('click', handleAiInput);
if (aiInput) {
    aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAiInput();
    });
}

if (stopAiBtn) {
    stopAiBtn.addEventListener('click', () => {
        window.electronAPI.abortAura();
    });
}

let currentAiMessage = null;

function handleAiInput() {
    const prompt = aiInput.value.trim();
    if (!prompt) return;

    addMessage(prompt, true);
    aiInput.value = '';

    currentAiMessage = addMessage('...', false);
    currentAiMessage.textContent = ''; 

    window.electronAPI.askAura(prompt);
    
    sendAiBtn.style.display = 'none';
    stopAiBtn.style.display = 'flex';
}

// --- IPC Listeners ---
window.electronAPI.onPageLoad((url) => {
    if (addressInput) addressInput.value = url;
});



window.electronAPI.onAIResponse((chunk) => {
    if (currentAiMessage) {
        currentAiMessage.textContent += chunk;
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

window.electronAPI.onAIFinished(() => {
    currentAiMessage = null;
    if (sendAiBtn) sendAiBtn.style.display = 'flex';
    if (stopAiBtn) stopAiBtn.style.display = 'none';
});

// Setup Wizard Logic
const setupWizard = document.getElementById('ai-setup-wizard');
const startSetupBtn = document.getElementById('start-setup-btn');
const setupProgress = document.getElementById('setup-progress');
const setupStatus = document.getElementById('setup-status');
const repairLink = document.getElementById('repair-link');

window.electronAPI.onAIStatus((status, err) => {
    if (!setupWizard) return;
    
    if (status === 'ready') {
        setupWizard.style.display = 'none';
    } else if (status === 'missing') {
        setupWizard.style.display = 'flex';
        if (startSetupBtn) {
            startSetupBtn.disabled = false;
            startSetupBtn.textContent = 'Download & Initialize';
        }
        if (setupStatus) setupStatus.textContent = 'Brain file not found. Ready to download.';
    } else if (status === 'loading-llama' || status === 'loading-model' || status === 'creating-context') {
        setupWizard.style.display = 'flex';
        if (startSetupBtn) {
            startSetupBtn.disabled = true;
            startSetupBtn.textContent = 'Waking up brain...';
        }
        if (setupStatus) setupStatus.textContent = 'Aura is initializing...';
    } else if (status === 'error') {
        if (setupStatus) setupStatus.textContent = 'Aura error: ' + err;
        if (startSetupBtn) startSetupBtn.disabled = false;
        if (repairLink) repairLink.style.display = 'block';
    }
});

if (startSetupBtn) {
    startSetupBtn.addEventListener('click', () => {
        startSetupBtn.disabled = true;
        window.electronAPI.downloadModel();
    });
}

window.electronAPI.onDownloadProgress((progress) => {
    if (setupProgress) setupProgress.style.width = `${progress}%`;
    if (setupStatus) setupStatus.textContent = `Downloading Brain: ${Math.round(progress)}%`;
});
