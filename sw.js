const CACHE_NAME = 'agrogis-v53';

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
                    coreAssets.map(url => fetch(url).then(r => { if(r.ok) return cache.put(url, r); }))
                );
                // Tile caching is now handled by the SYNC_TILES message from the client
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

    const url = new URL(event.request.url);

    // Cache-First Strategy para as fatias do mapa offline (extrema fluidez)
    if (url.pathname.includes('/offline_tiles/')) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse; // Retorna imediatamente do celular, zero delay
                }
                // Se não estiver no cache (ainda baixando), tenta a rede
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                }).catch(() => {
                    return new Response('', { status: 404, statusText: 'Offline' });
                });
            })
        );
        return;
    }

    // Network-First Strategy para o resto (código, interface, atualizações)
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
                    return new Response('', { status: 404, statusText: 'Offline' });
                });
            })
    );
});

self.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'SYNC_TILES') {
        if (typeof OFFLINE_TILES_LIST === 'undefined') return;
        
        try {
            const cache = await caches.open(CACHE_NAME);
            let missingTiles = [];
            
            // Find missing tiles
            for (const url of OFFLINE_TILES_LIST) {
                const cached = await cache.match(url);
                if (!cached) missingTiles.push(url);
            }
            
            const total = OFFLINE_TILES_LIST.length;
            let downloaded = total - missingTiles.length;
            
            if (missingTiles.length === 0) {
                // Already synced
                event.source.postMessage({ type: 'SYNC_PROGRESS', downloaded, total, done: true });
                return;
            }

            // Notify start
            event.source.postMessage({ type: 'SYNC_PROGRESS', downloaded, total, done: false });
            
            const batchSize = 10; // 10 at a time for stable background sync
            for (let i = 0; i < missingTiles.length; i += batchSize) {
                const batch = missingTiles.slice(i, i + batchSize);
                await Promise.allSettled(
                    batch.map(url => fetch(url).then(r => {
                        if (r.ok) {
                            return cache.put(url, r).then(() => {
                                downloaded++;
                                // Send progress back to the page
                                event.source.postMessage({ type: 'SYNC_PROGRESS', downloaded, total, done: false });
                            });
                        }
                    }).catch(() => {}))
                );
            }
            
            // Notify done
            event.source.postMessage({ type: 'SYNC_PROGRESS', downloaded, total, done: true });
        } catch (e) {
            console.error('[ServiceWorker] Sync error:', e);
        }
    }
});
