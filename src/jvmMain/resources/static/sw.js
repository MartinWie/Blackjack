/**
 * Offline shell. The launcher, solo blackjack and Hide & Meow run with no network;
 * shared tables and marbles need the server, but everything the browser needs to *be*
 * the app — stylesheet, scripts, anime.js — is cached here, so a cold
 * start on a bad connection is instant and a dropped one lands on /offline instead
 * of the browser's error page.
 */
const VERSION = 'bj-v7';
const SHELL = [
    '/',
    '/blackjack',
    '/games',
    '/meow',
    '/sweets',
    '/offline',
    '/solo',
    '/static/hub.js',
    '/static/gift.js',
    '/static/meow/meow-engine.js',
    '/static/meow/meow-cats.js',
    '/static/meow/meow.js',
    '/static/meow/meow.css',
    '/static/meow/cat.svg',
    '/static/sweets/sweets-engine.js',
    '/static/sweets/sweets.js',
    '/static/sweets/sweets.css',
    '/static/vendor/engine.js',
    '/static/output.css',
    '/static/vendor/anime.umd.min.js',
    '/static/bank.js',
    '/static/lobby.js',
    '/static/table.js',
    '/static/sw-register.js',
    '/static/img/favicon-32.png',
    '/static/img/icon-192.png',
    '/static/img/games/hub-32.png',
    '/static/img/games/hub-180.png',
    '/static/img/games/hub-192.png',
    '/static/img/games/hub-512.png',
    '/static/img/games/meow-192.png',
    '/static/img/games/sweets-192.png',
    '/static/img/games/marbles-192.png',
    '/static/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
    // Fetched one by one so a redirect (`/` on a marbles.* host) is skipped, not cached.
    event.waitUntil(
        caches.open(VERSION)
            .then((cache) => Promise.all(SHELL.map((path) => fetch(path).then((response) => {
                if (!response.ok) throw new Error(`precache ${path}: ${response.status}`);
                if (!response.redirected) return cache.put(path, response);
            }))))
            .then(() => self.skipWaiting()),
    );
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

    if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        // Network first so a deploy is picked up, then this page from the cache, and
        // only then the apology. `/solo` is in the shell, so a plane still deals.
        // A shell page is re-cached on every online visit, so offline never runs
        // yesterday's HTML against today's scripts. Redirects are never cached: a
        // navigation cannot be answered with one.
        event.respondWith(
            fetch(request).then((response) => {
                if (response.ok && !response.redirected && SHELL.includes(url.pathname)) {
                    const copy = response.clone();
                    caches.open(VERSION).then((cache) => cache.put(url.pathname, copy));
                }
                return response;
            }).catch(() =>
                caches.match(request, {ignoreSearch: true}).then((hit) => hit || caches.match('/offline')),
            ),
        );
        return;
    }

    // Live games are never cached: /api carries live state, and an SSE stream put
    // through a cache would hang forever. Marbles is online only — its pages and QR
    // codes pass straight through; its assets under /static/marbles cache as usual.
    if (url.pathname.startsWith('/marbles')) return;

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
