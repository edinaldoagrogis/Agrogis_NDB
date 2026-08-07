const CACHE_NAME = 'agrogis-v20';

// Core assets to pre-cache when the Service Worker installs
const PRECACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './auth.js',
    './pdf_parser.js',
    './layers_data.js',
    './manifest.json',
    './icone_drone.png.png',
    './logo.png.jpg',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.css',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
    'https://unpkg.com/@turf/turf@6/turf.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.js'
];

self.addEventListener('install', event => {
    // Skip waiting ensures the new service worker takes over immediately
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[ServiceWorker] Pre-caching offline assets');
                // Use catch so if one external URL fails, the whole SW doesn't crash
                return Promise.allSettled(
                    PRECACHE_URLS.map(url => {
                        return fetch(url).then(response => {
                            if (!response.ok) throw new Error('Falha no fetch');
                            return cache.put(url, response);
                        });
                    })
                );
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
