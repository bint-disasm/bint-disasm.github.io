// Service Worker for bin't PWA
// Bump CACHE_NAME whenever STATIC_ASSETS changes so clients pull fresh.
const CACHE_NAME = 'bint-v9';

// Files to pre-cache at install time. Spec files for the Ghidra
// decompiler are NOT listed here — they're fetched lazily and cached on
// first use via the runtime fetch handler below, so an offline-only user
// only pays for the archs they've actually decompiled.
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/main.css',
    '/css/themes/dark.css',
    '/css/components/panel.css',
    '/css/components/dock.css',
    '/css/vendor/prism-tomorrow.css',
    '/js/vendor/prism.js',
    '/js/vendor/dagre.min.js',
    '/js/main.js',
    '/js/core/api.js',
    '/js/core/events.js',
    '/js/core/wasm-api.js',
    '/js/utils/format.js',
    '/js/utils/storage.js',
    '/js/components/bint-app.js',
    '/js/components/bint-console.js',
    '/js/components/bint-decompile-view.js',
    '/js/components/bint-disassembly.js',
    '/js/components/bint-names-list.js',
    '/js/components/bint-hex-view.js',
    '/js/components/bint-panel.js',
    '/js/components/bint-strings.js',
    '/js/components/bint-xrefs.js',
    '/wasm/bint.js',
    '/wasm/bint_bg.wasm',
    // Ghidra decompiler: the module, its loader, the worker, and the
    // client stub are always needed if the user ever hits the Decompile
    // tab, so we pre-cache them like the core app.
    '/decompiler/client.js',
    '/decompiler/worker.js',
    '/decompiler/dist/bint_decompiler.js',
    '/decompiler/dist/bint_decompiler.wasm',
    '/decompiler/spec-manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((response) => {
                // Don't cache non-successful responses or non-GET requests
                if (!response || response.status !== 200 || event.request.method !== 'GET') {
                    return response;
                }
                // Clone and cache the response
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return response;
            });
        })
    );
});
