import { safeStorage, app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const VAULT_FILE = path.join(app.getPath('userData'), 'vault.json');

class VaultManager {
    constructor() {
        this.data = {
            profile: {
                name: '',
                email: '',
                phone: '',
                address: ''
            },
            settings: {
                autoFillEnabled: true,
                useMasterPassword: false,
                searchEngine: 'https://duckduckgo.com/?q=',
                startupPage: 'https://www.google.com',
                activeAiModel: 'gemma-2b-it.gguf'
            }
        };
        this.isLocked = false;
        this.masterKey = null;
    }

    load() {
        if (!fs.existsSync(VAULT_FILE)) {
            this.save();
            return;
        }

        try {
            const encrypted = fs.readFileSync(VAULT_FILE);
            if (encrypted.length === 0) return;

            // If it's using a master password, we don't decrypt here, we wait for the key
            const rawData = JSON.parse(encrypted.toString());
            
            if (rawData.isPasswordProtected) {
                this.isLocked = true;
                this.data.settings.useMasterPassword = true;
                // Store the encrypted blob to decrypt later
                this.encryptedBlob = rawData.blob;
                this.salt = rawData.salt;
            } else {
                // Decrypt using system-level safeStorage
                const decrypted = safeStorage.decryptString(Buffer.from(rawData.blob, 'base64'));
                this.data = JSON.parse(decrypted);
                this.isLocked = false;
            }
        } catch (err) {
            console.error('[Aura Vault] Load failed:', err);
        }
    }

    save() {
        try {
            let blob;
            let result;

            if (this.data.settings.useMasterPassword && this.masterKey) {
                // Encrypt with Master Password (AES-256-GCM)
                const iv = crypto.randomBytes(12);
                const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
                let encrypted = cipher.update(JSON.stringify(this.data), 'utf8', 'base64');
                encrypted += cipher.final('base64');
                const authTag = cipher.getAuthTag().toString('base64');
                
                blob = JSON.stringify({
                    iv: iv.toString('base64'),
                    content: encrypted,
                    authTag: authTag
                });

                result = {
                    isPasswordProtected: true,
                    salt: this.salt,
                    blob: blob
                };
            } else {
                // Encrypt with System-level safeStorage
                blob = safeStorage.encryptString(JSON.stringify(this.data)).toString('base64');
                result = {
                    isPasswordProtected: false,
                    blob: blob
                };
            }

            fs.writeFileSync(VAULT_FILE, JSON.stringify(result, null, 2));
        } catch (err) {
            console.error('[Aura Vault] Save failed:', err);
        }
    }

    unlock(password) {
        if (!this.salt || !this.encryptedBlob) return false;

        try {
            const key = crypto.pbkdf2Sync(password, Buffer.from(this.salt, 'base64'), 100000, 32, 'sha256');
            const blob = JSON.parse(this.encryptedBlob);
            const iv = Buffer.from(blob.iv, 'base64');
            const authTag = Buffer.from(blob.authTag, 'base64');
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(blob.content, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            this.data = JSON.parse(decrypted);
            this.masterKey = key;
            this.isLocked = false;
            return true;
        } catch (err) {
            console.error('[Aura Vault] Unlock failed:', err);
            return false;
        }
    }

    setMasterPassword(password) {
        if (password) {
            this.salt = crypto.randomBytes(16).toString('base64');
            this.masterKey = crypto.pbkdf2Sync(password, Buffer.from(this.salt, 'base64'), 100000, 32, 'sha256');
            this.data.settings.useMasterPassword = true;
        } else {
            this.data.settings.useMasterPassword = false;
            this.masterKey = null;
            this.salt = null;
        }
        this.save();
    }

    getProfile() {
        if (this.isLocked) return null;
        return this.data.profile;
    }

    updateProfile(newProfile) {
        if (this.isLocked) return false;
        this.data.profile = { ...this.data.profile, ...newProfile };
        this.save();
        return true;
    }

    getSettings() {
        return this.data.settings;
    }

    updateSettings(newSettings) {
        this.data.settings = { ...this.data.settings, ...newSettings };
        this.save();
    }
}

export const vault = new VaultManager();
