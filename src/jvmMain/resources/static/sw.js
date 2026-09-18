/**
 * Offline shell. The table needs the server to deal, but everything the browser
 * needs to *be* the app — stylesheet, scripts, anime.js — is cached here, so a cold
 * start on a bad connection is instant and a dropped one lands on /offline instead
 * of the browser's error page.
 */
const VERSION = 'bj-v3';
const SHELL = [
    '/',
    '/offline',
    '/solo',
    '/static/vendor/engine.js',
    '/static/output.css',
    '/static/vendor/anime.umd.min.js',
    '/static/bank.js',
    '/static/lobby.js',
    '/static/table.js',
    '/static/sw-register.js',
    '/static/img/favicon-32.png',
    '/static/img/apple-touch-icon.png',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png',
    '/static/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // The game itself is never cached: /api carries live state, and an SSE stream
    // put through a cache would hang forever.
    if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.origin !== location.origin) return;

    if (request.mode === 'navigate') {
        // Network first so a deploy is picked up, then this page from the cache, and
        // only then the apology. `/solo` is in the shell, so a plane still deals.
        event.respondWith(
            fetch(request).catch(() =>
                caches.match(request, {ignoreSearch: true}).then((hit) => hit || caches.match('/offline')),
            ),
        );
        return;
    }

    // Cached under the path alone. Assets carry a `?v=<build id>` that changes on
    // every restart, so keying on the full URL would both serve yesterday's script
    // to today's page and grow the cache by a full copy per deploy.
    const key = new Request(url.origin + url.pathname);
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(VERSION).then((cache) => cache.put(key, copy));
                }
                return response;
            })
            .catch(() => caches.match(key)),
    );
});
