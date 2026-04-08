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

    // 2. Inject Privacy Headers & Referer Control
    session.webRequest.onBeforeSendHeaders((details, callback) => {
        const requestHeaders = { ...details.requestHeaders };

        // Apply standard Privacy Headers
        Object.assign(requestHeaders, {
            'DNT': '1',
            'Sec-GPC': '1'
        });

        // Referer Control: Minimize data shared with 3rd parties
        if (requestHeaders['Referer']) {
            try {
                const refererUrl = new URL(requestHeaders['Referer']);
                const targetUrl = new URL(details.url);

                // If cross-origin, only send the origin, or strip if it's a known sensitive site
                if (refererUrl.origin !== targetUrl.origin) {
                    requestHeaders['Referer'] = refererUrl.origin + '/';
                }
            } catch (e) {
                delete requestHeaders['Referer'];
            }
        }

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
