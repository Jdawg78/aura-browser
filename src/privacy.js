// Aura Browser Privacy Shield - Lightweight Blocklist

// Common tracker/ad domains (simplified for performance)
export const BLOCKLIST = [
    '*://*.doubleclick.net/*',
    '*://*.google-analytics.com/*',
    '*://*.googletagmanager.com/*',
    '*://*.googlesyndication.com/*',
    '*://*.adservice.google.com/*',
    '*://*.adnxs.com/*',
    '*://*.taboola.com/*',
    '*://*.outbrain.com/*',
    '*://*.facebook.net/*',
    '*://*.amazon-adsystem.com/*',
    '*://*.ads-twitter.com/*',
    '*://*.pixel.ads.com/*'
];

// Privacy-enhancing headers
export const PRIVACY_HEADERS = {
    'DNT': '1', // Do Not Track
    'Sec-GPC': '1', // Global Privacy Control
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
};

/**
 * Apply the Privacy Shield to a given session
 * @param {import('electron').Session} session 
 * @param {Function} [onBlock] callback when a request is blocked
 */
export function applyPrivacyShield(session, onBlock) {
    const filter = { urls: BLOCKLIST };

    // 1. Block Trackers & Ads
    session.webRequest.onBeforeRequest(filter, (details, callback) => {
        // console.log(`[Privacy Shield] Blocked: ${details.url}`);
        if (onBlock) onBlock(details.url);
        callback({ cancel: true });
    });

    // 2. Inject Privacy Headers
    session.webRequest.onBeforeSendHeaders((details, callback) => {
        const requestHeaders = {
            ...details.requestHeaders,
            ...PRIVACY_HEADERS
        };
        callback({ requestHeaders });
    });

    // 3. Prevent Client-side Tracking (optional, can break sites)
    // session.setPermissionRequestHandler((webContents, permission, callback) => {
    //     if (permission === 'geolocation' || permission === 'notifications') {
    //         return callback(false); // Default deny
    //     }
    //     callback(true);
    // });
}
