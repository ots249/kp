// ============================================================
// Service Worker — Civil 4th Semester
// ============================================================
const CACHE_NAME = 'civil-4th-v1';
const API_CACHE_NAME = 'civil-4th-api-v1';

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/fa-solid-900.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/fa-brands-400.woff2',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://i.postimg.cc/MKx5W94w/4thct.webp',
    'https://i.postimg.cc/7YKJhGyY/logo.png'
];

// ============================================================
// Install — cache static assets
// ============================================================
self.addEventListener('install', event => {
    console.log('📦 Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Caching static assets...');
                // ✅ Individual add instead of addAll (কোনো একটা fail করলেও বাকি গুলো cache হবে)
                return Promise.all(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(err => 
                            console.warn(`⚠️ Failed to cache ${url}:`, err.message)
                        )
                    )
                );
            })
            .then(() => {
                console.log('✅ Static assets cached');
                return self.skipWaiting();
            })
    );
});

// ============================================================
// Activate — old cache delete
// ============================================================
self.addEventListener('activate', event => {
    console.log('🚀 Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

// ============================================================
// Fetch — API + static asset handling
// ============================================================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests (POST, PUT, DELETE)
    if (event.request.method !== 'GET') return;
    
    // Skip Chrome extension requests
    if (url.protocol === 'chrome-extension:') return;
    
    // ============================================================
    // ✅ Handle API requests (Sheety, SheetDB, Sheet2API)
    // ============================================================
    const isAPIRequest = 
        url.href.includes('api.sheety.co') ||
        url.href.includes('sheetdb.io') ||
        url.href.includes('sheet2api.com') ||
        url.href.includes('script.google.com') ||
        url.href.includes('googleapis.com/youtube');
    
    if (isAPIRequest) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(API_CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseClone);
                                console.log('✅ API cached:', url.pathname);
                            })
                            .catch(err => console.warn('Cache put failed:', err.message));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline — cached API response
                    return caches.match(event.request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                console.log('📦 Serving API from cache:', url.pathname);
                                return cachedResponse;
                            }
                            // JSON offline fallback
                            return new Response(
                                JSON.stringify({ 
                                    error: 'You are offline. Please check your internet connection.',
                                    offline: true
                                }),
                                {
                                    status: 503,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        });
                })
        );
        return;
    }
    
    // ============================================================
    // ✅ Handle YouTube iframe & other embeds — network only
    // ============================================================
    if (url.href.includes('youtube.com') || 
        url.href.includes('youtube-nocookie.com') ||
        url.href.includes('ytimg.com')) {
        // Don't cache YouTube, always fetch
        return;
    }
    
    // ============================================================
    // ✅ Static assets — cache first, network fallback
    // ============================================================
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request)
                    .then(response => {
                        // Cache successful responses for static assets
                        if (response.ok && 
                            (event.request.url.includes('postimg.cc') || 
                             event.request.url.includes('cloudflare.com') ||
                             event.request.url.includes('fonts.googleapis.com') ||
                             event.request.url.includes('fonts.gstatic.com'))) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseClone)
                                        .catch(err => console.warn('Cache put failed:', err.message));
                                });
                        }
                        return response;
                    })
                    .catch(error => {
                        console.error('❌ Fetch failed:', event.request.url, error.message);
                        
                        // Return offline fallback for HTML requests
                        const acceptHeader = event.request.headers.get('accept') || '';
                        if (acceptHeader.includes('text/html')) {
                            return caches.match('/') || caches.match('/index.html');
                        }
                        
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// ============================================================
// Background sync (progress)
// ============================================================
self.addEventListener('sync', event => {
    if (event.tag === 'sync-progress') {
        console.log('🔄 Background sync triggered');
    }
});

// ============================================================
// Push notifications — ✅ FIXED SYNTAX
// ============================================================
self.addEventListener('push', event => {
    console.log('🔔 Push received');
    
    let body = 'নতুন ক্লাস যোগ হয়েছে!';
    try {
        if (event.data) {
            body = event.data.text();
        }
    } catch (err) {
        console.warn('Push data parse error:', err);
    }
    
    const options = {
        body: body,
        icon: 'https://i.postimg.cc/7YKJhGyY/logo.png',
        badge: 'https://i.postimg.cc/7YKJhGyY/logo.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            { action: 'open', title: 'খুলুন' },
            { action: 'close', title: 'বন্ধ করুন' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Civil 4th Semester', options)
    );
});

// ============================================================
// Notification click
// ============================================================
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // If a window is already open, focus it
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open new window
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

// ============================================================
// Error handling
// ============================================================
self.addEventListener('error', event => {
    console.error('❌ Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
    console.error('❌ Unhandled rejection:', event.reason);
});

console.log('✅ Service Worker loaded — Civil 4th Semester');