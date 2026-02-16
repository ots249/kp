const CACHE_NAME = 'kp-3rd-civil-v1';
const API_CACHE_NAME = 'kp-api-v1';

// Assets to cache on install (নতুন লোগো যোগ করা হয়েছে)
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
    'https://i.postimg.cc/TwWJj5W5/KP-3rd-Semester.jpg',
    'https://i.postimg.cc/6pw4D0fF/kp-logo.png'
];

// Install event
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching static assets...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('Static assets cached successfully');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Cache installation failed:', error);
            })
    );
});

// Activate event
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Handle API requests
    if (url.href.includes('api.karigoripathsala.com')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache successful API responses
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(API_CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseClone);
                                console.log('API response cached:', url.pathname);
                            });
                    }
                    return response;
                })
                .catch(() => {
                    // Return cached API response if available
                    return caches.match(event.request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                console.log('Serving API from cache:', url.pathname);
                                return cachedResponse;
                            }
                            // Return offline fallback
                            return new Response(
                                JSON.stringify({ 
                                    error: 'You are offline. Please check your internet connection.' 
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
    
    // Handle static assets
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    console.log('Serving from cache:', url.pathname);
                    return cachedResponse;
                }
                
                return fetch(event.request)
                    .then(response => {
                        // Cache successful responses for static assets
                        if (response.ok && 
                            (event.request.url.includes('postimg.cc') || 
                             event.request.url.includes('cloudflare.com') ||
                             event.request.url.includes('fonts.googleapis.com'))) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseClone);
                                    console.log('Asset cached:', url.pathname);
                                });
                        }
                        return response;
                    })
                    .catch(error => {
                        console.error('Fetch failed:', error);
                        
                        // Return offline fallback for HTML requests
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/');
                        }
                        
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// Background sync for offline data
self.addEventListener('sync', event => {
    if (event.tag === 'sync-progress') {
        console.log('Background sync triggered');
        // Sync progress data if needed
    }
});

// Push notifications (নতুন লোগো ব্যবহার করা হয়েছে)
self.addEventListener('push', event => {
    const options = {
        body: event.data.text(),
        icon: 'https://i.postimg.cc/6pw4D0fF/kp-logo.png',
        badge: 'https://i.postimg.cc/6pw4D0fF/kp-logo.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'open',
                title: 'খুলুন'
            },
            {
                action: 'close',
                title: 'বন্ধ করুন'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('কারিগরি পাঠশালা', options)
    );
});

// Notification click event
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Handle errors
self.addEventListener('error', event => {
    console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
    console.error('Unhandled rejection in Service Worker:', event.reason);
});

console.log('Service Worker loaded');