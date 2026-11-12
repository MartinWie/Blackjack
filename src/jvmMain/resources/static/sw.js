/**
 * Offline shell. The launcher, solo blackjack and the client games (Hide & Meow, Sweet
 * Swap, Ant Picnic, solo Draft Battle, Cell Survivor) run with no network; shared
 * tables, Draft Battle rooms and marbles need the server, but everything the browser needs to *be*
 * the app — stylesheet, scripts, anime.js — is cached here, so a cold
 * start on a bad connection is instant and a dropped one lands on /offline instead
 * of the browser's error page.
 */
const VERSION = 'bj-v8';
const SHELL = [
    '/',
    '/blackjack',
    '/games',
    '/meow',
    '/sweets',
    '/picnic',
    '/draft',
    '/cells',
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
    '/static/picnic/picnic-pics.js',
    '/static/picnic/picnic-engine.js',
    '/static/picnic/picnic.js',
    '/static/picnic/picnic.css',
    '/static/draft/draft-engine.js',
    '/static/draft/draft-bot.js',
    '/static/draft/img/archer-blue-anim.webp',
    '/static/draft/img/archer-red-anim.webp',
    '/static/draft/img/dragon-blue-anim.webp',
    '/static/draft/img/dragon-red-anim.webp',
    '/static/draft/img/giant-blue-anim.webp',
    '/static/draft/img/giant-red-anim.webp',
    '/static/draft/img/goblin-blue-anim.webp',
    '/static/draft/img/goblin-red-anim.webp',
    '/static/draft/img/knight-blue-anim.webp',
    '/static/draft/img/knight-red-anim.webp',
    '/static/draft/img/mage-blue-anim.webp',
    '/static/draft/img/mage-red-anim.webp',
    '/static/draft/img/spear-blue-anim.webp',
    '/static/draft/img/spear-red-anim.webp',
    '/static/draft/img/catapult-blue-anim.webp',
    '/static/draft/img/catapult-red-anim.webp',
    '/static/draft/img/tower-blue-anim.webp',
    '/static/draft/img/tower-red-anim.webp',
    '/static/draft/img/archer-blue.webp',
    '/static/draft/img/archer-red.webp',
    '/static/draft/img/armor.webp',
    '/static/draft/img/arms.webp',
    '/static/draft/img/berserk.webp',
    '/static/draft/img/bomb.webp',
    '/static/draft/img/catapult-blue.webp',
    '/static/draft/img/catapult-red.webp',
    '/static/draft/img/dragon-blue.webp',
    '/static/draft/img/dragon-red.webp',
    '/static/draft/img/fireball.webp',
    '/static/draft/img/frost.webp',
    '/static/draft/img/giant-blue.webp',
    '/static/draft/img/giant-red.webp',
    '/static/draft/img/goblin-blue.webp',
    '/static/draft/img/goblin-red.webp',
    '/static/draft/img/ground.webp',
    '/static/draft/img/haste.webp',
    '/static/draft/img/knight-blue.webp',
    '/static/draft/img/knight-red.webp',
    '/static/draft/img/lightning.webp',
    '/static/draft/img/mage-blue.webp',
    '/static/draft/img/mage-red.webp',
    '/static/draft/img/medics.webp',
    '/static/draft/img/meteor.webp',
    '/static/draft/img/rage.webp',
    '/static/draft/img/rally.webp',
    '/static/draft/img/shields.webp',
    '/static/draft/img/spear-blue.webp',
    '/static/draft/img/spear-red.webp',
    '/static/draft/img/tower-blue.webp',
    '/static/draft/img/tower-red.webp',
    '/static/draft/img/vampire.webp',
    '/static/draft/img/wall.webp',
    '/static/draft/draft.js',
    '/static/draft/draft.css',
    '/static/cells/cells-engine.js',
    '/static/cells/cells.js',
    '/static/cells/cells.css',
    '/static/cells/img/body-boss.webp',
    '/static/cells/img/body-green.webp',
    '/static/cells/img/body-orange.webp',
    '/static/cells/img/body-purple.webp',
    '/static/cells/img/body-red.webp',
    '/static/cells/img/bubble.webp',
    '/static/cells/img/chain.webp',
    '/static/cells/img/chest.webp',
    '/static/cells/img/crit.webp',
    '/static/cells/img/dish.webp',
    '/static/cells/img/dna.webp',
    '/static/cells/img/evolve.webp',
    '/static/cells/img/haste.webp',
    '/static/cells/img/heart.webp',
    '/static/cells/img/hero-breathe.webp',
    '/static/cells/img/hero-windup.webp',
    '/static/cells/img/hero-blink.webp',
    '/static/cells/img/hero-shoot.webp',
    '/static/cells/img/virus-boss-bite.webp',
    '/static/cells/img/virus-green-bite.webp',
    '/static/cells/img/virus-orange-bite.webp',
    '/static/cells/img/virus-purple-bite.webp',
    '/static/cells/img/virus-red-bite.webp',
    '/static/cells/img/hero.webp',
    '/static/cells/img/learn.webp',
    '/static/cells/img/maw.webp',
    '/static/cells/img/mend.webp',
    '/static/cells/img/might.webp',
    '/static/cells/img/needles.webp',
    '/static/cells/img/pill.webp',
    '/static/cells/img/reach.webp',
    '/static/cells/img/ricochet.webp',
    '/static/cells/img/satellite.webp',
    '/static/cells/img/scalpel.webp',
    '/static/cells/img/shock.webp',
    '/static/cells/img/swab.webp',
    '/static/cells/img/tower.webp',
    '/static/cells/img/twin.webp',
    '/static/cells/img/virus-boss.webp',
    '/static/cells/img/virus-green.webp',
    '/static/cells/img/virus-orange.webp',
    '/static/cells/img/virus-purple.webp',
    '/static/cells/img/virus-red.webp',
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
    '/static/img/games/picnic-192.png',
    '/static/img/games/draft-192.png',
    '/static/img/games/cells-192.png',
    '/static/img/games/marbles-192.png',
    '/static/install.js',
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
