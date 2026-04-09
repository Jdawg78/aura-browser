// UI Elements
const modalNavItems = document.querySelectorAll('.modal-nav-item[data-tab]');
const modalTabContents = document.querySelectorAll('.modal-tab-content');
const closeSettingsBtn = document.getElementById('close-settings-btn');

// Vault Elements
const mVaultLockedState = document.getElementById('modal-vault-locked');
const mVaultUnlockedState = document.getElementById('modal-vault-unlocked');
const mVaultPasswordInput = document.getElementById('modal-vault-password');
const mUnlockBtn = document.getElementById('modal-unlock-btn');

const mProfileFields = {
    name: document.getElementById('m-profile-name'),
    email: document.getElementById('m-profile-email'),
    phone: document.getElementById('m-profile-phone'),
    address: document.getElementById('m-profile-address')
};

// General Settings
const searchEngineSelect = document.getElementById('setting-search-engine');
const startupPageInput = document.getElementById('setting-startup-page');

// Security Settings
const mNewPasswordInput = document.getElementById('m-new-password');
const mSetPasswordBtn = document.getElementById('m-set-password-btn');
const mRemovePasswordBtn = document.getElementById('m-remove-password-btn');

document.addEventListener('DOMContentLoaded', () => {
    // Check initial vault status
    window.electronAPI.getVaultStatus();
});

// Tab Navigation
function switchModalTab(tabId) {
    modalNavItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabId);
    });
    modalTabContents.forEach(content => {
        content.classList.toggle('active', content.id === `modal-tab-${tabId}`);
    });

    if (tabId === 'forms' || tabId === 'general') {
        window.electronAPI.getVaultStatus();
    }
}

modalNavItems.forEach(item => {
    item.addEventListener('click', () => switchModalTab(item.dataset.tab));
});

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        window.close();
    });
}

// Vault Logic
if (mUnlockBtn) {
    mUnlockBtn.addEventListener('click', () => {
        const password = mVaultPasswordInput.value;
        if (password) window.electronAPI.unlockVault(password);
    });
}

const mSaveProfileBtn = document.getElementById('m-save-profile-btn');
if (mSaveProfileBtn) {
    mSaveProfileBtn.addEventListener('click', () => {
        const profile = {
            name: mProfileFields.name.value,
            email: mProfileFields.email.value,
            phone: mProfileFields.phone.value,
            address: mProfileFields.address.value
        };
        window.electronAPI.saveProfile(profile);
    });
}

if (searchEngineSelect) {
    searchEngineSelect.addEventListener('change', () => {
        window.electronAPI.setSearchEngine(searchEngineSelect.value);
    });
}

if (mSetPasswordBtn) {
    mSetPasswordBtn.addEventListener('click', () => {
        const password = mNewPasswordInput.value;
        window.electronAPI.setMasterPassword(password);
        mNewPasswordInput.value = '';
    });
}

if (mRemovePasswordBtn) {
    mRemovePasswordBtn.addEventListener('click', () => {
        window.electronAPI.setMasterPassword(null);
    });
}

// Listeners
window.electronAPI.onVaultStatus((status) => {
    if (status.isLocked) {
        if (mVaultLockedState) mVaultLockedState.style.display = 'flex';
        if (mVaultUnlockedState) mVaultUnlockedState.style.display = 'none';
    } else {
        if (mVaultLockedState) mVaultLockedState.style.display = 'none';
        if (mVaultUnlockedState) mVaultUnlockedState.style.display = 'block';
        window.electronAPI.getProfile();
    }
    
    if (mRemovePasswordBtn) mRemovePasswordBtn.style.display = status.useMasterPassword ? 'block' : 'none';
    
    if (status.searchEngine) {
        if (searchEngineSelect) searchEngineSelect.value = status.searchEngine;
    }
});

window.electronAPI.onProfileData((data) => {
    if (data && mProfileFields.name) {
        mProfileFields.name.value = data.name || '';
        mProfileFields.email.value = data.email || '';
        mProfileFields.phone.value = data.phone || '';
        mProfileFields.address.value = data.address || '';
    }
});

window.electronAPI.onSaveResult((success) => {
    if (success && mSaveProfileBtn) {
        mSaveProfileBtn.textContent = 'Saved!';
        setTimeout(() => mSaveProfileBtn.textContent = 'Save Identity', 2000);
    }
});

// Manage Agents
const installModelBtns = document.querySelectorAll('.install-model-btn');
installModelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        installModelBtns.forEach(b => {
            b.textContent = 'Install & Activate';
            b.disabled = false;
            b.style.opacity = '1';
        });

        const url = btn.dataset.url;
        const filename = btn.dataset.filename;
        btn.textContent = 'Installing...';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        window.electronAPI.downloadModel(url, filename);
    });
});

if (window.electronAPI.onDownloadProgress) {
    window.electronAPI.onDownloadProgress((progress) => {
        installModelBtns.forEach(btn => {
            if (btn.disabled) {
                btn.textContent = `Downloading ${Math.round(progress)}%...`;
            }
        });
    });
}

if (window.electronAPI.onDownloadSuccess) {
    window.electronAPI.onDownloadSuccess(() => {
        installModelBtns.forEach(btn => {
            if (btn.disabled) {
                btn.textContent = `Active Model`;
                btn.style.background = '#10b981'; // Green
                btn.style.borderColor = '#059669';
                btn.style.opacity = '1';
                setTimeout(() => {
                    btn.style.background = '';
                    btn.style.borderColor = '';
                }, 3000);
            }
        });
    });
}
