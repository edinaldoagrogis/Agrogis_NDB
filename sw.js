const CACHE_NAME = 'agrogis-v50';

// Core assets to pre-cache when the Service Worker installs
try {
    importScripts('./offline_tiles_list.js');
} catch (e) {
    console.warn("Offline tiles list not available yet.");
}

self.addEventListener('install', event => {
    // Skip waiting ensures the new service worker takes over immediately
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async cache => {
                console.log('[ServiceWorker] Pre-caching core assets');
                
                // 1. Array de assets base
                const coreAssets = [
                    './',
                    './index.html',
                    './style.css',
                    './app.js',
                    './auth.js',
                    './layers_data.js',
                    './manifest.json',
                    './icone_drone.png.png',
                    './logo.png.jpg',
                    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
                    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
                    'https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.css',
                    'https://unpkg.com/@turf/turf@6/turf.min.js',
                    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
                    'https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.js',
                    'https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate.js'
                ];
                
                await Promise.allSettled(
                    coreAssets.map(url => fetch(url).then(r => { if(r.ok) cache.put(url, r); }))
                );

                // 2. Array de tiles (se existir) baixado em lotes controlados
                if (typeof OFFLINE_TILES_LIST !== 'undefined') {
                    console.log(`[ServiceWorker] Pre-caching ${OFFLINE_TILES_LIST.length} tiles in batches`);
                    const batchSize = 25; // Baixar 25 por vez para não esgotar as conexões do celular
                    for (let i = 0; i < OFFLINE_TILES_LIST.length; i += batchSize) {
                        const batch = OFFLINE_TILES_LIST.slice(i, i + batchSize);
                        await Promise.allSettled(
                            batch.map(url => fetch(url).then(r => { if(r.ok) cache.put(url, r); }).catch(() => {}))
                        );
                    }
                }
                console.log('[ServiceWorker] Install complete');
            })
    );
});

self.addEventListener('activate', event => {
    // Delete old caches when a new version activates
    const currentCaches = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
        }).then(cachesToDelete => {
            return Promise.all(cachesToDelete.map(cacheToDelete => {
                console.log('[ServiceWorker] Deleting old cache', cacheToDelete);
                return caches.delete(cacheToDelete);
            }));
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // We only want to handle GET requests
    if (event.request.method !== 'GET') return;

    // Network-First Strategy
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // If we got a valid response, clone it and stick it in the cache
                // Note: opaque responses (status 0) from CORS are also cached.
                if (!response || (response.status !== 200 && response.type !== 'opaque')) {
                    return response;
                }
                
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            })
            .catch(() => {
                // Network failed (we are offline). Look in the cache!
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // If it's not in the cache either, we just fail gracefully.
                    // For HTML requests, we could return a custom offline page here.
                    console.log('[ServiceWorker] Request not found in cache for:', event.request.url);
                });
            })
    );
});
