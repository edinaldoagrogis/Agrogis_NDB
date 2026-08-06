// Basic Service Worker for PWA (Progressive Web App)
const CACHE_NAME = 'agrogis-cache-v1';

self.addEventListener('install', (event) => {
    // Forces the waiting service worker to become the active service worker.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Tell the active service worker to take control of the page immediately.
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Simple pass-through fetch to satisfy PWA install requirements 
    // without causing aggressive caching bugs during active development.
    event.respondWith(fetch(event.request).catch(() => {
        return new Response('Offline. Conecte-se à internet para usar o GeoPortal.');
    }));
});
