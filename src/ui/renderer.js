// Aura Browser Renderer Logic

const addressInput = document.getElementById('address-input');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const stealthBtn = document.getElementById('stealth-btn');
const aiToggleBtn = document.getElementById('ai-toggle-btn');
const auraSidebar = document.getElementById('aura-sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const aiInput = document.getElementById('ai-input');
const chatMessages = document.getElementById('chat-messages');
const stopAiBtn = document.getElementById('stop-ai-btn');
const sendAiBtn = document.getElementById('send-ai-btn');

// Navigation
addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        let url = addressInput.value.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        window.electronAPI.navigate(url);
    }
});

backBtn.addEventListener('click', () => window.electronAPI.goBack());
forwardBtn.addEventListener('click', () => window.electronAPI.goForward());
reloadBtn.addEventListener('click', () => window.electronAPI.reload());

// Sidebar Toggle
aiToggleBtn.addEventListener('click', () => {
    console.log('Sparkle clicked! Toggling sidebar...');
    auraSidebar.classList.toggle('open');
    window.electronAPI.toggleSidebar(); // Inform main process to resize browser view
});

closeSidebarBtn.addEventListener('click', () => {
    auraSidebar.classList.remove('open');
    window.electronAPI.toggleSidebar(); // Restore browser view size
});

// Stealth Mode Toggle
let isStealthMode = false;
stealthBtn.addEventListener('click', () => {
    isStealthMode = !isStealthMode;
    window.electronAPI.toggleStealth(isStealthMode);
    
    // UI Feedback
    if (isStealthMode) {
        stealthBtn.style.color = 'var(--accent-purple)';
        stealthBtn.title = 'Stealth Mode (Active)';
        // Change icon to shield if possible, or just color
    } else {
        stealthBtn.style.color = 'var(--text-secondary)';
        stealthBtn.title = 'Stealth Mode';
    }
});

// AI Interaction
function addMessage(text, isUser = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isUser ? 'user' : 'ai'} animate-fade-in`;
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
}

sendAiBtn.addEventListener('click', handleAiInput);
aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAiInput();
});

stopAiBtn.addEventListener('click', () => {
    window.electronAPI.abortAura();
});

let currentAiMessage = null;

function handleAiInput() {
    const prompt = aiInput.value.trim();
    if (!prompt) return;

    addMessage(prompt, true);
    aiInput.value = '';

    // Create a new AI message placeholder
    currentAiMessage = addMessage('...', false);
    currentAiMessage.textContent = ''; // Clear the dots

    window.electronAPI.askAura(prompt);
    
    // Toggle buttons
    sendAiBtn.style.display = 'none';
    stopAiBtn.style.display = 'flex';
}

// IPC Listeners
window.electronAPI.onPageLoad((url) => {
    addressInput.value = url;
});

window.electronAPI.onBlockedCount((count) => {
    const shieldBtn = document.getElementById('stealth-btn');
    if (count > 0) {
        shieldBtn.style.color = 'var(--accent-blue)';
        shieldBtn.title = `Privacy Shield: ${count} trackers blocked`;
        // Create a small badge if it doesn't exist
        let badge = shieldBtn.querySelector('.badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'badge';
            shieldBtn.appendChild(badge);
        }
        badge.textContent = count;
    }
});

window.electronAPI.onAIResponse((chunk) => {
    if (currentAiMessage) {
        currentAiMessage.textContent += chunk;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

window.electronAPI.onAIFinished(() => {
    currentAiMessage = null;
    sendAiBtn.style.display = 'flex';
    stopAiBtn.style.display = 'none';
});

// Setup Wizard Logic
const setupWizard = document.getElementById('ai-setup-wizard');
const startSetupBtn = document.getElementById('start-setup-btn');
const setupProgress = document.getElementById('setup-progress');
const setupStatus = document.getElementById('setup-status');

const repairLink = document.getElementById('repair-link');

window.electronAPI.onAIStatus((status, err) => {
    if (status === 'ready') {
        setupWizard.style.display = 'none';
        auraSidebar.classList.remove('setup-mode');
    } else if (status === 'missing') {
        setupWizard.style.display = 'flex';
        startSetupBtn.disabled = false;
        startSetupBtn.textContent = 'Download & Initialize';
        setupStatus.textContent = 'Brain file not found. Ready to download.';
    } else if (status === 'loading-llama' || status === 'loading-model' || status === 'creating-context') {
        setupWizard.style.display = 'flex';
        startSetupBtn.disabled = true;
        startSetupBtn.textContent = 'Waking up brain...';
        setupStatus.textContent = 'Aura is initializing (' + status.replace('loading-', '') + ')...';
    } else if (status === 'error') {
        setupStatus.textContent = 'Aura had a hiccup: ' + err;
        startSetupBtn.disabled = false;
        startSetupBtn.textContent = 'Force Re-Download';
        repairLink.style.display = 'block';
    }
});

repairLink.addEventListener('click', () => {
    setupStatus.textContent = 'Retrying initialization...';
    repairLink.style.display = 'none';
    window.electronAPI.downloadModel(); // In main, if file exists, it will skip download and just init
});

startSetupBtn.addEventListener('click', () => {
    startSetupBtn.disabled = true;
    startSetupBtn.textContent = 'Downloading...';
    window.electronAPI.downloadModel();
});

window.electronAPI.onDownloadProgress((progress) => {
    setupProgress.style.width = `${progress}%`;
    setupStatus.textContent = `Downloading Brain: ${Math.round(progress)}%`;
});

window.electronAPI.onDownloadSuccess(() => {
    setupStatus.textContent = 'Initializing Aura...';
    // Success will be followed by ai-status: ready
});

window.electronAPI.onDownloadError((err) => {
    startSetupBtn.disabled = false;
    startSetupBtn.textContent = 'Retry Download';
    setupStatus.textContent = `Error: ${err}`;
    setupStatus.style.color = '#ef4444';
});
