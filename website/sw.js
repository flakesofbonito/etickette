const CACHE = 'etickette-v1';
const STATIC = [
    '/tracker/', '/css/variables.css', '/css/tracker.css',
    '/css/patch.css', '/assets/logo.png', '/js/tracker.js', '/js/utils.js',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request).then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
                caches.open(CACHE).then(c => c.put(e.request, res.clone()));
            }
            return res;
        }))
    );
});

self.addEventListener('push', e => {
    const data = e.data?.json() || {};
    e.waitUntil(self.registration.showNotification(data.title || "It's Your Turn!", {
        body: data.body || 'Please proceed to the counter now.',
        icon: '/assets/logo.png',
        badge: '/assets/logo.png',
        tag: 'etickette-call',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 400]
    }));
});