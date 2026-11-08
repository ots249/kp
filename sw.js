// Civil 4th Semester — upgraded PWA Service Worker
// App shell/navigation: network-first with cached/offline fallback.
// API GET: network-first with cached fallback. YouTube embeds remain network-only.
const CACHE_PREFIX = 'civil-4th-';
const CACHE_NAME = 'civil-4th-shell-v6';
const API_CACHE_NAME = 'civil-4th-api-v6';
const RUNTIME_CACHE_NAME = 'civil-4th-runtime-v6';

const CORE_ASSETS = [
    '/', '/index.html', '/style.css', '/script.js',
    '/manifest.json', '/offline.html', '/icons/pwa-icon.svg', '/icons/diploma-tutor-logo.svg'
];
const EXTERNAL_STATIC_HOSTS = new Set([
    'cdnjs.cloudflare.com', 'fonts.googleapis.com',
    'fonts.gstatic.com', 'i.postimg.cc'
]);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(CORE_ASSETS.map(async path => {
            try {
                const response = await fetch(new Request(new URL(path, self.location.origin), { cache: 'reload' }));
                if (response && response.ok) await cache.put(path, response);
            } catch (error) {
                console.warn('[SW] Core asset cache skipped:', path, error.message);
            }
        }));
        // Keep this worker waiting until the user accepts the in-app update.
    })());
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => {
            if (key.startsWith(CACHE_PREFIX) &&
                ![CACHE_NAME, API_CACHE_NAME, RUNTIME_CACHE_NAME].includes(key)) {
                return caches.delete(key);
            }
            return Promise.resolve(false);
        }));
        await self.clients.claim();
    })());
});

async function networkFirst(request, cacheName, fallbackUrls = []) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
            try {
                await cache.put(request, response.clone());
            } catch (cacheError) {
                console.warn('[SW] Response cache write skipped:', cacheError.message);
            }
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        for (const path of fallbackUrls) {
            const fallback = await cache.match(path) || await caches.match(path);
            if (fallback) return fallback;
        }
        throw error;
    }
}

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
        try {
            const cache = await caches.open(cacheName);
            await cache.put(request, response.clone());
        } catch (cacheError) {
            console.warn('[SW] Runtime asset cache write skipped:', cacheError.message);
        }
    }
    return response;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (!['http:', 'https:'].includes(url.protocol)) return;

    // Do not cache YouTube playback, thumbnails or embeds.
    if (url.hostname === 'youtube.com' ||
        url.hostname.endsWith('.youtube.com') ||
        url.hostname === 'youtube-nocookie.com' ||
        url.hostname.endsWith('.youtube-nocookie.com') ||
        url.hostname === 'ytimg.com' ||
        url.hostname.endsWith('.ytimg.com')) return;

    if (url.hostname === 'sheetapi249.vercel.app' &&
        url.pathname.startsWith('/api/v1/diploma-tutor/')) {
        event.respondWith(networkFirst(request, API_CACHE_NAME));
        return;
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/youtube/')) {
        event.respondWith(networkFirst(request, API_CACHE_NAME));
        return;
    }
    if (EXTERNAL_STATIC_HOSTS.has(url.hostname)) {
        event.respondWith(cacheFirst(request, RUNTIME_CACHE_NAME).catch(() =>
            new Response('', { status: 503, statusText: 'Offline asset unavailable' })
        ));
        return;
    }
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, CACHE_NAME, [
            url.pathname === '/' ? '/index.html' : '/',
            '/offline.html'
        ]));
        return;
    }
    if (request.destination === 'script' || request.destination === 'style' ||
        request.destination === 'font' || request.destination === 'image' ||
        request.destination === 'worker' ||
        ['.css', '.js', '.mjs', '.json', '.svg', '.png', '.webp', '.woff', '.woff2']
            .some(extension => url.pathname.toLowerCase().endsWith(extension))) {
        event.respondWith(networkFirst(request, CACHE_NAME));
    }
});

self.addEventListener('sync', event => {
    if (event.tag === 'sync-progress') {
        console.info('[SW] Progress sync requested; no server sync endpoint is configured.');
    }
});

self.addEventListener('push', event => {
    let payload = { title: 'Civil 4th Semester', body: 'নতুন ক্লাস যোগ হয়েছে!', url: '/' };
    try { if (event.data) payload = { ...payload, ...event.data.json() }; }
    catch (error) { try { if (event.data) payload.body = event.data.text(); } catch (_) {} }
    const options = {
        body: payload.body, icon: '/icons/diploma-tutor-logo.svg', badge: '/icons/diploma-tutor-logo.svg',
        vibrate: [100, 50, 100],
        data: { url: payload.url || '/', dateOfArrival: Date.now(), primaryKey: 1 },
        actions: [{ action: 'open', title: 'খুলুন' }, { action: 'close', title: 'বন্ধ করুন' }]
    };
    event.waitUntil(self.registration.showNotification(payload.title || 'Civil 4th Semester', options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'close') return;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if (client.url.startsWith(self.location.origin) && 'focus' in client) if ('navigate' in client) await client.navigate(event.notification.data?.url || '/'); return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(event.notification.data?.url || '/');
    })());
});

self.addEventListener('error', event => console.error('[SW] Runtime error:', event.error));
self.addEventListener('unhandledrejection', event => console.error('[SW] Unhandled rejection:', event.reason));
