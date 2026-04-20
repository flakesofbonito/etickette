self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
    event.waitUntil(
        clients.claim().then(() => {
            return clients.matchAll({ type: 'window' }).then(windowClients => {
                windowClients.forEach(windowClient => windowClient.navigate(windowClient.url));
            });
        })
    );
});

try {
    importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {
    console.warn('[OneSignal SW] Failed:', e.message);
}