/* ===================================================
   JAGRUTHI WOMEN SAFETY - SERVICE WORKER (PWA)
   Version: 1.0.0
   Provides offline capability, caching & installability
   =================================================== */

const CACHE_NAME = 'jagruthi-pwa-v1.0.0';

const PRECACHE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './supabaseClient.js',
    './mediaService.js',
    './manifest.json',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/icon-512-maskable.png',
    './assets/icons/apple-touch-icon.png',
    './assets/icons/favicon.png'
];

// 1. Service Worker Installation
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Precaching core application assets...');
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('[SW] Non-critical precache warning:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// 2. Service Worker Activation & Cache Cleanup
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Clearing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Network Fetch Strategy
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Bypass non-GET requests and Supabase REST/Realtime/Auth calls
    if (request.method !== 'GET') return;
    if (url.hostname.includes('supabase.co')) return;
    if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;

    // HTML Navigation requests: Network-first with cache fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then((networkResponse) => {
                // Clone & cache fresh page
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(async () => {
                const cachedPage = await caches.match(request);
                if (cachedPage) return cachedPage;
                const fallbackIndex = await caches.match('./index.html');
                return fallbackIndex || Response.error();
            })
        );
        return;
    }

    // Static Assets & CDN files: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // If offline and request failed, return nothing
            });

            return cachedResponse || fetchPromise;
        })
    );
});

// 4. Handle Notification click if web notifications triggered
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});
