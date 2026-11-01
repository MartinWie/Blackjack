/**
 * Ant Picnic board. Tap a lane's front nest to send its ants to a seat; they eat what
 * they can reach. Rules and levels are in `picnic-engine.js`; this file draws them.
 *
 * Progress is a handful of localStorage keys: the track level, the endless count per
 * difficulty, the power-up pouch, and the board in progress as the list of actions
 * taken on it. The engine is deterministic, so replaying that list rebuilds the board.
 */
(function () {
    'use strict';

    const E = window.PicnicEngine;
    const N = E.N;
    const STORE_KEY = 'picnic.v1';
    const DROP_CHANCE = 1 / 7;
    const DIFFICULTY = {easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert'};

    /** A colour mixed toward black (f < 0) or white (f > 0). */
    function shade(hex, f) {
        const n = parseInt(hex.slice(1), 16), t = f < 0 ? 0 : 255, p = Math.abs(f);
        const mix = (v) => Math.round((t - v) * p + v);
        return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
    }

    // The ant wears exactly its pixel colour; its outline and legs are that colour, darker.
    const LEGS = (l) => `<g stroke="${l}" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M14 19 7 14M14 23H6M15 27l-7 5M26 19l7-5M26 23h8M25 27l7 5"/></g>`;
    const ANT = (c, legs = true) => {
        const o = shade(c, -0.45), l = shade(c, -0.55);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" aria-hidden="true">`
            + (legs ? LEGS(l) : '')
            + `<g stroke="${l}" stroke-width="2" stroke-linecap="round" fill="none"><path d="M17 7 13 2.5M23 7l4-4.5"/></g>`
            + `<circle cx="13" cy="2.8" r="1.9" fill="${c}" stroke="${o}" stroke-width="1"/><circle cx="27" cy="2.8" r="1.9" fill="${c}" stroke="${o}" stroke-width="1"/>`
            + `<ellipse cx="20" cy="31" rx="7.5" ry="7" fill="${c}" stroke="${o}" stroke-width="1.6"/>`
            + `<ellipse cx="20" cy="21" rx="4.6" ry="4.2" fill="${c}" stroke="${o}" stroke-width="1.6"/>`
            + `<ellipse cx="20" cy="11" rx="6.6" ry="6" fill="${c}" stroke="${o}" stroke-width="1.6"/>`
            + `<circle cx="17.3" cy="10.2" r="2.4" fill="#fff"/><circle cx="22.7" cy="10.2" r="2.4" fill="#fff"/>`
            + `<circle cx="17.7" cy="10.7" r="1.2" fill="#2B2B33"/><circle cx="23.1" cy="10.7" r="1.2" fill="#2B2B33"/>`
            + `<ellipse cx="17" cy="28.5" rx="2.6" ry="1.7" fill="#fff" opacity=".5"/></svg>`;
    };

    // A walking ant is two cached images, legs and body; the legs swing by transform, so
    // walking never repaints.
    const sprites = new Map();
    function walkerArt(c) {
        if (!sprites.has(c)) {
            const url = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
            const l = shade(c, -0.55);
            const legs = url(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${LEGS(l)}</svg>`);
            sprites.set(c, `<img class="legs" src="${legs}" alt=""><img src="${url(ANT(c, false))}" alt="">`);
        }
        return sprites.get(c);
    }

    // One symbol per colour, so the game never relies on telling colours apart
    // (red-green colour blindness above all). Shown on nests and jars always, and on
    // the picture's pixels in colour-blind mode.
    const SYMBOLS = [
        '<circle cx="10" cy="10" r="6"/>',
        '<path d="M10 2.5 17.5 16h-15z"/>',
        '<rect x="4" y="4" width="12" height="12" rx="1.5"/>',
        '<path d="M10 2 18 10 10 18 2 10z"/>',
        '<path d="M10 1.8l2.5 5.1 5.6.7-4.1 3.9 1.1 5.5L10 14.2l-5.1 2.8 1.1-5.5-4.1-3.9 5.6-.7z"/>',
        '<path d="M10 17.5S2.5 13 2.5 8a4 4 0 0 1 7.5-2 4 4 0 0 1 7.5 2c0 5-7.5 9.5-7.5 9.5z"/>',
        '<path d="M7.5 2.5h5v5h5v5h-5v5h-5v-5h-5v-5h5z"/>',
        '<circle cx="10" cy="10" r="5.5" fill="none" stroke-width="3.4"/>',
    ];

    /** Light or dark ink, whichever reads on this colour. */
    function ink(hex) {
        const n = parseInt(hex.slice(1), 16);
        const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
        return lum > 0.62 ? '#4B3A2F' : '#FFFFFF';
    }

    function symbol(index, colour, cls = 'sym') {
        const c = ink(colour);
        return `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true" fill="${c}" stroke="${c}">${SYMBOLS[index % SYMBOLS.length]}</svg>`;
    }

    /** Hard and Expert keep the nests behind the front row a mystery. */
    const mysteries = () => L.difficulty === 'hard' || L.difficulty === 'expert';

    /** A nest: a rounded tile in its exact colour, its count, and its colour's symbol. */
    function token(nest) {
        const t = document.createElement('div');
        t.className = 'token';
        t.dataset.id = nest.id;
        paintToken(t, nest, false);
        return t;
    }

    function paintToken(t, nest, hidden) {
        const c = hidden ? '#8C7BC8' : L.palette[nest.colour];
        t.classList.toggle('mystery', hidden);
        t.style.setProperty('--c', c);
        t.style.setProperty('--c-dark', shade(c, -0.35));
        t.style.setProperty('--c-light', shade(c, 0.3));
        t.dataset.look = hidden ? 'mystery' : `${nest.colour}${store.symbols ? '+' : ''}`;
        t.innerHTML = hidden ? '<b class="q">?</b>' : `${store.symbols ? symbol(nest.colour, c) : ''}<b>${nest.count}</b>`;
    }

    /** A jar on the shelf, in its group's colour. */
    function jar(g) {
        const c = L.palette[g.colour];
        const el = document.createElement('div');
        el.className = 'group';
        el.dataset.id = g.id;
        el.style.setProperty('--c', c);
        el.style.setProperty('--c-dark', shade(c, -0.35));
        el.style.setProperty('--c-light', shade(c, 0.3));
        el.innerHTML = `${store.symbols ? symbol(g.colour, c) : ''}<b>${g.left}</b>`;
        return el;
    }

    const POWERS = {
        seat: {name: 'Extra seat', what: 'One more seat for waiting ants on this board.',
            icon: '<svg viewBox="0 0 48 48"><rect x="8" y="20" width="32" height="8" rx="4" fill="#E9A15A"/><rect x="12" y="28" width="5" height="12" rx="2" fill="#B9773A"/><rect x="31" y="28" width="5" height="12" rx="2" fill="#B9773A"/><circle cx="36" cy="12" r="9" fill="#5DBB63"/><path d="M36 7v10M31 12h10" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'},
        dig: {name: 'Digger', what: 'The next ants dig down to their colour, buried or not.',
            icon: '<svg viewBox="0 0 48 48"><path d="M10 38 30 18" stroke="#8A5A35" stroke-width="5" stroke-linecap="round"/><path d="M27 9c7-2 13 4 11 11l-6 2-7-7z" fill="#A9B4C2" stroke="#6B7685" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="38" r="3" fill="#8A5A35"/></svg>'},
        recall: {name: 'Recall', what: 'Tap a waiting group to send it back to a lane.',
            icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="#6FA9D6"/><path d="M17 20h12a6 6 0 0 1 0 12h-6" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M21 15l-5 5 5 5" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'},
        feast: {name: 'Feast', what: 'The next nest sends twice the ants.',
            icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="15" fill="#F2B544"/><text x="24" y="32" text-anchor="middle" font-size="16" font-weight="900" font-family="system-ui" fill="#fff">×2</text><path d="M16 9l4 5M32 9l-4 5M24 6v6" stroke="#E5484D" stroke-width="3" stroke-linecap="round"/></svg>'},
    };
    const POWER_KEYS = Object.keys(POWERS);
    const LINES = {
        start: ['Lunch is served. Which nest goes first?', 'The ants are hungry. Pick wisely.', 'Clear the plate, one colour at a time.'],
        won: ['Plate licked clean!', 'Not a crumb left.', 'The ants loved it.'],
        lost: ['Too many ants waiting, and nobody can reach their food.'],
        stepUp: ['New difficulty! Smaller nests, trickier plates.'],
        endless: ['Endless mode. The picnic never ends.'],
    };

    const $ = (id) => document.getElementById(id);
    const els = {
        level: $('level'), difficulty: $('difficulty'), plate: $('plate'), board: $('board'), seats: $('seats'), lanes: $('lanes'),
        message: $('message'), powerups: $('powerups'), fly: $('fly'), hole: $('hole'), ants: $('ants'),
        levelsBtn: $('levels-btn'), restartBtn: $('restart-btn'), helpBtn: $('help-btn'),
        sheet: $('sheet'), sheetBody: $('sheet-body'), sheetClose: $('sheet-close'),
    };

    // --- persistence ----------------------------------------------------------------

    function load() {
        const fresh = {mode: 'track', level: 1, unlocked: 1, endless: {}, game: null, symbols: false, items: {seat: 1, dig: 1, recall: 1, feast: 1}};
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            if (saved && saved.unlocked >= 1) {
                saved.items = {...fresh.items, ...(saved.items || {})};
                saved.endless = saved.endless || {};
                saved.mode = saved.mode in DIFFICULTY ? saved.mode : 'track';
                saved.level = Math.min(Math.max(1, Number(saved.level) || 1), saved.unlocked);
                return saved;
            }
        } catch (_) { /* private mode or junk */ }
        return fresh;
    }
    const store = load();
    function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* no storage */ } }

    let L = null, s = null, actions = [], aim = null, endTimer = null, gen = 0, ended = false;
    // The engine resolves a tap at once; the screen catches up seat by seat. `view` is
    // what the seats show right now, `queues` holds each seat's animations in order, and
    // `pending` counts the ones still to play, so taps never wait for ants to walk;
    // `inFlight` counts ants on their way to a pixel they have not picked up yet.
    let view = {seats: []}, queues = [], pending = 0, inFlight = 0;
    // Groups are drawn in the seat that looks free when they arrive, which need not be
    // the engine's seat (the engine frees a seat the moment its group is done eating).
    // `placed` maps an engine seat to its current group and on-screen seat; `taken`
    // marks on-screen seats whose group has not yet hopped off.
    let placed = [], taken = [];
    function snapshot() {
        const seats = new Array(s.seats.length).fill(null);
        s.seats.forEach((g, k) => {
            if (!g) return;
            const v = placed[k] && placed[k].id === g.id ? placed[k].vis : k;
            seats[seats[v] ? seats.indexOf(null) : v] = {...g};
        });
        return {seats};
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Busy until every ant has picked up its pixel (carriers may still be walking home);
    // mirrored on <body> for tests and stylesheets.
    const busy = () => pending > 0 || inFlight > 0;
    const markBusy = () => document.body.classList.toggle('busy', busy());

    // A save is only replayed onto the very board it was made on: a generator change
    // moves levels, and replaying taps onto a different board would scramble it.
    const fingerprint = () => L.lanes.map((l) => l.map((n) => `${n.colour}:${n.count}`).join(',')).join('|');

    function persist() {
        store.game = {mode: store.mode, level: L.level, board: fingerprint(), actions};
        save();
    }

    // --- unlocking -------------------------------------------------------------------

    function unlockAt(difficulty) {
        let end = 0;
        for (const [d, count] of E.LADDER) { end += count === Infinity ? E.BAND : count; if (d === difficulty) return end; }
        return Infinity;
    }
    const endlessOpen = (d) => store.unlocked > unlockAt(d);

    // --- setup -----------------------------------------------------------------------

    function open(mode, level) {
        if (mode !== 'track' && !endlessOpen(mode)) { mode = 'track'; level = store.level; }
        gen++;
        // Ants of the old board resolve, see the new `gen` and leave.
        grabWaits.forEach((list) => list.forEach((resolve) => resolve()));
        grabWaits = new Map();
        order = new Map();
        holds = new Set();
        queues = [];
        placed = [];
        taken = [];
        pending = 0;
        inFlight = 0;
        ended = false;
        markBusy();
        els.fly.innerHTML = '';
        els.ants.innerHTML = '';
        clearTimeout(endTimer);
        store.mode = mode;
        if (mode === 'track') { store.level = Math.max(1, Math.min(level, store.unlocked)); L = E.level(store.level); }
        else { store.endless[mode] = Math.max(1, level); L = E.endless(mode, store.endless[mode]); }
        s = E.start(L);
        actions = [];
        // A board in progress is replayed from its actions.
        const saved = store.game;
        if (saved && (saved.mode || 'track') === mode && saved.level === L.level && saved.board === fingerprint() && Array.isArray(saved.actions)) {
            for (const a of saved.actions) if (apply(a)) actions.push(a);
        }
        persist();
        view = snapshot();
        setAim(null);
        build();
        render();
        els.level.textContent = mode === 'track' ? `Level ${L.level}` : `Endless #${L.level}`;
        els.difficulty.textContent = DIFFICULTY[L.difficulty];
        const st = E.stage(store.level);
        if (s.over) showEnd(s.over, 0);
        say(s.over ? s.over : actions.length ? 'start' : mode !== 'track' && L.level === 1 ? 'endless' : mode === 'track' && st.index === 1 && st.difficulty !== 'easy' ? 'stepUp' : 'start');
    }

    /** Applies one saved action to the engine; false if it no longer makes sense. */
    function apply(a) {
        if (a.t === 'tap') return !!E.tap(s, a.lane);
        if (a.t === 'seat') return !!E.addSeat(s);
        if (a.t === 'recall') return !!E.recall(s, a.seat);
        if (a.t === 'dig') { s.dig = true; return true; }
        if (a.t === 'feast') { s.feast = true; return true; }
        return false;
    }

    function build() {
        clearTimeout(endTimer);
        // The end-of-game layer lives on the mat, not in the board it covers.
        els.plate.querySelectorAll('.board-end, .yum, .dancer').forEach((el) => el.remove());
        els.board.innerHTML = '';
        els.board.classList.remove('won', 'quake');
        crop = windowFor(L.grid);
        // Fixed tracks: content (a colour-blind symbol) must never resize a row or column.
        els.board.style.gridTemplateColumns = els.board.style.gridTemplateRows = `repeat(${crop.M}, minmax(0, 1fr))`;
        for (let k = 0; k < crop.M * crop.M; k++) {
            const px = document.createElement('div');
            px.className = 'px';
            els.board.appendChild(px);
        }
    }

    // --- drawing ---------------------------------------------------------------------

    function render() {
        // While ants are out, the plate shows what they have actually taken (`shown`),
        // not the engine's board, which is already ahead.
        if (!busy()) {
            syncShown();
            s.board.grid.forEach((v, i) => { const px = pxAt(i); if (px) paintPx(px, v); });
        }
        renderSeats();
        renderLanes();
        renderPowers();
    }

    /** One pixel in colour v (-1 for gone), with its symbol in colour-blind mode. */
    function paintPx(px, v) {
        const colour = v >= 0 ? L.palette[v] : '';
        const look = colour + (store.symbols ? '+' : '');
        if (px.dataset.look === look) return;
        px.dataset.look = look;
        px.style.backgroundColor = colour || 'transparent';
        px.classList.toggle('gone', !colour);
        px.innerHTML = colour && store.symbols ? symbol(v, colour, 'psym') : '';
    }

    /** Symbols on or off for the pixels still on the plate (ants may be out). */
    function repaintSymbols() {
        L.grid.forEach((v, i) => {
            const px = pxAt(i);
            if (px && v >= 0 && !px.classList.contains('gone')) paintPx(px, v);
        });
    }

    /** Seats stay on screen; a group appears, ticks down and hops off in place. */
    function renderSeats() {
        const src = view;
        while (els.seats.children.length < src.seats.length) {
            const seat = document.createElement('button');
            seat.className = 'seat';
            seat.dataset.seat = els.seats.children.length;
            els.seats.appendChild(seat);
        }
        while (els.seats.children.length > src.seats.length) els.seats.lastElementChild.remove();
        src.seats.forEach((g, k) => {
            const seat = els.seats.children[k];
            const group = seat.querySelector('.group');
            seat.classList.toggle('pickable', aim === 'recall' && !!g);
            seat.setAttribute('aria-label', g ? `Seat ${k + 1}: ${g.left} ants waiting` : `Seat ${k + 1}: empty`);
            if (g && (!group || group.dataset.id !== String(g.id))) {
                if (group) group.remove();
                seat.appendChild(jar(g));
                seat.classList.add('full');
            } else if (g) {
                group.querySelector('b').textContent = g.left;
            } else if (group && !group.classList.contains('hop')) {
                group.remove();
                seat.classList.remove('full');
            }
        });
    }

    /** Lanes stay on screen; when a nest leaves, the ones behind glide forward. */
    function renderLanes() {
        const src = s;
        if (els.lanes.children.length !== src.lanes.length) {
            els.lanes.innerHTML = '';
            els.lanes.style.gridTemplateColumns = `repeat(${src.lanes.length}, 1fr)`;
            src.lanes.forEach(() => {
                const col = document.createElement('div');
                col.className = 'lane';
                col.innerHTML = '<span class="more"></span>';
                els.lanes.appendChild(col);
            });
        }
        src.lanes.forEach((lane, k) => {
            const col = els.lanes.children[k];
            const keep = new Set();
            lane.slice(0, 3).forEach((nest, d) => {
                let t = col.querySelector(`.token[data-id="${nest.id}"]`);
                if (!t) {
                    t = token(nest);
                    t.style.setProperty('--d', 3);
                    col.appendChild(t);
                    t.getBoundingClientRect();
                }
                const hidden = d > 0 && mysteries();
                if (t.dataset.look !== (hidden ? 'mystery' : `${nest.colour}${store.symbols ? '+' : ''}`)) paintToken(t, nest, hidden);
                else if (!hidden) t.querySelector('b').textContent = nest.count;
                t.style.setProperty('--d', d);
                t.classList.toggle('front', d === 0);
                if (d === 0) {
                    t.dataset.lane = k;
                    t.setAttribute('role', 'button');
                    t.setAttribute('aria-label', `Nest of ${nest.count} ants`);
                    t.classList.toggle('off', !!s.over);
                }
                keep.add(String(nest.id));
            });
            col.querySelectorAll('.token').forEach((t) => { if (!keep.has(t.dataset.id) && !t.classList.contains('sent')) t.remove(); });
            col.querySelector('.more').textContent = lane.length > 3 ? `+${lane.length - 3}` : '';
        });
    }

    function renderPowers() {
        els.powerups.innerHTML = '';
        for (const key of POWER_KEYS) {
            const p = POWERS[key];
            const b = document.createElement('button');
            const armed = aim === key || (key === 'dig' && s.dig) || (key === 'feast' && s.feast);
            b.className = 'power' + (armed ? ' armed' : '');
            b.dataset.power = key;
            b.disabled = !store.items[key] || s.over === 'won' || (s.over === 'lost' && key !== 'seat' && key !== 'recall') || armed && key !== 'recall';
            b.setAttribute('aria-label', `${p.name}: ${p.what} You have ${store.items[key]}.`);
            b.innerHTML = `${p.icon}<span>${p.name}</span><b>${store.items[key]}</b>`;
            els.powerups.appendChild(b);
        }
    }

    function say(kind, text) {
        els.message.textContent = text || LINES[kind][Math.floor(Math.random() * LINES[kind].length)];
    }

    // --- routes ----------------------------------------------------------------------------
    //
    // An ant walks through open space only: out of its jar, around the outside of the
    // picture, in along empty cells to the cell beside its block, and back out the same
    // way to the hole. Routes are planned in grid cells and turned into pixels only when
    // a walk starts. `shown` is which pixels are still on screen, since the engine runs
    // ahead of the screen.
    //
    // The plate shows a window onto the grid: the picture plus a ring of open space, so
    // pixels (and the ants beside them) come out as big as the mat allows. Every cell
    // outside the window is empty.

    let shown = [];
    // Engine order of each eaten cell, so an ant may plan through pixels that earlier
    // ants will take (never later ones: nothing can wait in a circle).
    let order = new Map(), seq = 0;
    let grabWaits = new Map();     // cell -> resolvers waiting for its pixel to be taken
    let holds = new Set();         // cells where an ant stands waiting
    let crop = {x0: 0, y0: 0, M: N};

    function syncShown() {
        shown = s.board.grid.map((v) => v >= 0);
    }

    function windowFor(grid) {
        let x0 = N, y0 = N, x1 = -1, y1 = -1;
        grid.forEach((v, i) => {
            if (v < 0) return;
            const x = i % N, y = Math.floor(i / N);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        });
        if (x1 < 0) return {x0: 0, y0: 0, M: N};
        const M = Math.min(N, Math.max(x1 - x0, y1 - y0) + 3);
        const fit = (lo, hi) => Math.max(0, Math.min(N - M, Math.round((lo + hi + 1 - M) / 2)));
        return {x0: fit(x0, x1), y0: fit(y0, y1), M};
    }

    const local = (k) => [k % N - crop.x0, Math.floor(k / N) - crop.y0];
    const inCrop = (k) => { const [x, y] = local(k); return x >= 0 && y >= 0 && x < crop.M && y < crop.M; };
    const atBorder = (k) => { const [x, y] = local(k); return x === 0 || y === 0 || x === crop.M - 1 || y === crop.M - 1; };
    const pxAt = (k) => { if (!inCrop(k)) return null; const [x, y] = local(k); return els.board.children[y * crop.M + x]; };
    const step = (k) => {
        const x = k % N;
        return [k + N, k - 1, k + 1, k - N].filter((j) => j >= 0 && j < N * N && !(j === k - 1 && x === 0) && !(j === k + 1 && x === N - 1) && inCrop(j));
    };

    /** Empty cells from pixel i out to the window's edge ([] when it is on the edge), or null. */
    function routeFrom(i, blocked) {
        if (atBorder(i)) return [];
        const prev = new Int32Array(N * N).fill(-2);
        const queue = [];
        for (const j of step(i)) if (!blocked(j)) { prev[j] = -1; queue.push(j); }
        for (let q = 0; q < queue.length; q++) {
            const k = queue[q];
            if (atBorder(k)) {
                const path = [];
                for (let c = k; c !== -1; c = prev[c]) path.unshift(c);
                return path;
            }
            for (const j of step(k)) if (prev[j] === -2 && j !== i && !blocked(j)) { prev[j] = k; queue.push(j); }
        }
        return null;
    }

    /** The way in to pixel i: open space, or pixels earlier ants are going to take. */
    function plan(i) {
        const mine = order.get(i) ?? Infinity;
        // Null when a Digger left it walled in: its ant tunnels too.
        return routeFrom(i, (k) => shown[k] && !((order.get(k) ?? Infinity) < mine));
    }

    /**
     * Resolves once pixel k has been picked up (or after a long safety wait), with this
     * ant's place among those waiting on it, so a queue moves off one by one.
     */
    function whenGrabbed(k) {
        if (!shown[k]) return Promise.resolve(0);
        return new Promise((resolve) => {
            if (!grabWaits.has(k)) grabWaits.set(k, []);
            const rank = grabWaits.get(k).length;
            const t = setTimeout(() => resolve(rank), 30000);
            grabWaits.get(k).push(() => { clearTimeout(t); resolve(rank); });
        });
    }

    /** Pixel i has left the picture: ants waiting on it may go on. */
    function grabbed(i) {
        shown[i] = false;
        const list = grabWaits.get(i);
        grabWaits.delete(i);
        if (list) list.forEach((resolve) => resolve());
    }

    const centreOf = (k) => [k % N + 0.5, Math.floor(k / N) + 0.5];
    const heading = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 90;

    /**
     * From the end of a route out of the picture (or from pixel i itself on the edge):
     * a step off the picture and around its outside, in grid cells (0.5 is a cell's centre).
     */
    function exitsFrom(i, route) {
        const {x0, y0, M} = crop;
        const [ex, ey] = centreOf(route.length ? route.at(-1) : i);
        // Just outside the window on each side, on the mat's rim.
        const left = x0 - 0.7, right = x0 + M + 0.7, top = y0 - 0.7, bottom = y0 + M + 0.7;
        if (ey > y0 + M - 1) return [[ex, bottom]];
        if (ex < x0 + 1) return [[left, ey], [left, bottom]];
        if (ex > x0 + M - 1) return [[right, ey], [right, bottom]];
        const side = ex < x0 + M / 2 ? left : right;
        return [[ex, top], [side, top], [side, bottom]];
    }

    // An ant is about a cell long and narrower than one, so it fits a one-cell gap
    // without touching the pixels on either side; what it carries fits too.
    const ANT_CELLS = 1.1;
    // A carried pixel, scaled, held over the ant's head (cells, forward is up): small
    // enough that its corners stay inside the cell when the ant turns on the spot.
    const LOAD = 0.68;
    const LOAD_AT = -0.04;

    /** Cell size and the ant's half width, in pixels, for the mat as it is now. */
    function geo() {
        const c = els.ants.clientWidth / crop.M;
        return {c, half: (c * ANT_CELLS) / 2};
    }

    /** Pixels, not percentages: Chrome runs only pixel translates on the compositor. */
    const pose = (g, [x, y], deg) =>
        `translate(${((x - crop.x0) * g.c - g.half).toFixed(1)}px, ${((y - crop.y0) * g.c - g.half).toFixed(1)}px) rotate(${deg.toFixed(1)}deg)`;

    /**
     * Keyframes along a path of cell points at an even walking pace. The ant keeps its
     * heading along each straight stretch and turns briskly at the corner, rather than
     * swinging round over the whole stretch (which looked like drifting sideways).
     */
    function along(g, pts) {
        const clean = pts.filter((p, k) => k === 0 || Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) > 0.01);
        if (clean.length < 2) clean.push(clean[0]);
        const lens = [0];
        for (let k = 1; k < clean.length; k++) lens.push(lens[k - 1] + Math.hypot(clean[k][0] - clean[k - 1][0], clean[k][1] - clean[k - 1][1]));
        const total = lens.at(-1) || 1;
        const duration = Math.max(120, total * 62);
        const first = heading(clean[0], clean[1]);
        const frames = [];
        let prev = first;
        for (let k = 0; k < clean.length - 1; k++) {
            let h = heading(clean[k], clean[k + 1]);
            while (h - prev > 180) h -= 360;          // turn the short way round
            while (h - prev < -180) h += 360;
            const o0 = lens[k] / total, o1 = lens[k + 1] / total;
            const turn = Math.min((o1 - o0) * 0.4, 90 / duration);
            if (k > 0) frames.push({transform: pose(g, clean[k], prev), offset: o0});
            frames.push({transform: pose(g, clean[k], h), offset: k === 0 ? 0 : o0 + turn});
            prev = h;
        }
        frames.push({transform: pose(g, clean.at(-1), prev), offset: 1});
        return {frames, duration, first, end: prev};
    }

    /** Where an element's centre sits, in grid cells (may lie off the mat). */
    function inCells(el) {
        const box = els.ants.getBoundingClientRect(), r = el.getBoundingClientRect();
        return [crop.x0 + ((r.left + r.width / 2 - box.left) / box.width) * crop.M, crop.y0 + ((r.top + r.height / 2 - box.top) / box.height) * crop.M];
    }

    /**
     * Plays keyframes and leaves the element where they end as plain style. A finished
     * animation kept alive by `fill` would sit under the next one, and two transform
     * animations on one element keep Chrome from running either on the compositor.
     */
    async function play(el, frames, duration, easing = 'linear') {
        const a = el.animate(frames, {duration, easing, fill: 'forwards'});
        await a.finished;
        el.style.transform = frames.at(-1).transform;
        a.cancel();
    }

    /** Turns an ant on the spot, the short way round; returns the heading it ends on. */
    async function turn(ant, g, at, from, to) {
        while (to - from > 180) to -= 360;
        while (to - from < -180) to += 360;
        if (Math.abs(to - from) < 1) return from;
        await play(ant, [{transform: pose(g, at, from)}, {transform: pose(g, at, to)}], 60 + Math.abs(to - from) * 0.9, 'ease-in-out');
        return to;
    }

    /** An ant in its pixel's colour, with the pixel it will carry hidden in its jaws. */
    function makeAnt(g, colour, px) {
        const ant = document.createElement('div');
        ant.className = 'walker';
        ant.style.width = ant.style.height = `${(ANT_CELLS / crop.M) * 100}%`;
        ant.innerHTML = `<div class="rig">${walkerArt(colour)}<div class="load" hidden><i class="px"></i></div></div>`;
        const load = ant.querySelector('.load');
        // A pixel is a cell less the board's 1px gap; centred on the ant, moved by transform.
        const size = g.c - 1;
        Object.assign(load.style, {width: `${size}px`, height: `${size}px`, margin: `${-size / 2}px 0 0 ${-size / 2}px`});
        load.firstChild.style.backgroundColor = colour;
        if (px) load.firstChild.innerHTML = px.innerHTML;
        els.ants.appendChild(ant);
        return ant;
    }

    /**
     * The hand-over: the pixel leaves the picture and, in the same frame, the very same
     * block appears in the ant's jaws (`from` cells ahead), so nothing on the plate moves.
     * The ant leans in and tugs; the block lifts, turns square to the ant and settles
     * over its head. `facing` is the ant's heading: the block starts counter-turned by
     * it, so it looks exactly like the pixel it replaces.
     */
    async function pickUp(ant, g, i, from, facing) {
        const rig = ant.firstChild, load = rig.lastChild;
        grabbed(i);
        const px = pxAt(i);
        if (px) px.classList.add('gone');
        load.hidden = false;
        rig.animate([{transform: 'none'}, {transform: `translateY(${-0.1 * g.c}px)`, offset: .3}, {transform: `translateY(${0.08 * g.c}px)`, offset: .65}, {transform: 'none'}],
            {duration: 380, easing: 'ease-in-out'});
        const r = ((((-facing + 180) % 360) + 360) % 360) - 180;
        ant.classList.add('carrying');
        await play(load, [
            {transform: `translateY(${from * g.c}px) scale(1) rotate(${r}deg)`},
            {transform: `translateY(${(from + 0.06) * g.c}px) scale(1.12) rotate(${r * 0.6}deg)`, offset: .35},
            {transform: `translateY(${LOAD_AT * g.c}px) scale(${LOAD}) rotate(0deg)`},
        ], 380, 'cubic-bezier(.3, .7, .4, 1)');
    }

    /** Down the hole: the block drops in first, the ant dives after it. */
    async function dive(ant) {
        const rig = ant.firstChild, load = rig.lastChild;
        if (!load.hidden) load.animate([{opacity: 1}, {transform: `${load.style.transform} scale(.4)`, opacity: 0}], {duration: 160, easing: 'ease-in', fill: 'forwards'});
        await rig.animate([{transform: 'none', opacity: 1}, {transform: 'scale(.35)', opacity: 0}], {duration: 240, delay: 60, easing: 'ease-in', fill: 'forwards'}).finished;
        ant.remove();
    }

    function holeBump() {
        // One bump at a time: overlapping ones would keep each other off the compositor.
        els.hole.getAnimations().forEach((x) => x.cancel());
        els.hole.animate([{transform: 'translateX(-50%) scale(1)'}, {transform: 'translateX(-50%) scale(1.12, .9)'}, {transform: 'translateX(-50%) scale(1)'}], {duration: 200});
    }

    /** Sends one ant for pixel i; it counts as in flight until it has picked up. */
    async function fetchBlock(jar, hole, i, colour, dig, mine) {
        if (mine !== gen) return;
        inFlight++;
        markBusy();
        let counted = true;
        // Once its pixel is taken the ant no longer holds the plate up.
        const landed = () => {
            if (!counted) return;
            counted = false;
            if (mine !== gen) return;
            inFlight--;
            markBusy();
            if (!busy()) idle();
        };
        try {
            await walkTo(jar, hole, i, colour, dig, mine, landed);
        } finally {
            landed();
        }
    }

    /**
     * One ant climbs out of its jar, walks round the picture and in through open space
     * to the cell beside its block, faces it, picks it up, turns round and carries it
     * back out the same way and down the hole.
     */
    async function walkTo(jar, hole, i, colour, dig, mine, landed) {
        const g = geo();
        const ant = makeAnt(g, colour, pxAt(i));
        const route = dig ? null : plan(i);
        if (!route) { await tunnel(ant, g, i, mine, landed); return; }
        const exits = exitsFrom(i, route);
        // Where it walks in, each point with the cell it stands in (-1 off the picture).
        const stops = [jar, [jar[0], hole[1]], ...exits.slice().reverse()].map((p) => ({p, k: -1}))
            .concat(route.slice().reverse().map((k) => ({p: centreOf(k), k})));
        if (!route.length) stops.push({p: exits[0], k: -1});
        ant.firstChild.animate([{transform: 'scale(.5)', opacity: 0}, {transform: 'none', opacity: 1}], {duration: 220, easing: 'ease-out'});
        const arrived = await approach(ant, g, stops, mine);
        if (mine !== gen) { ant.remove(); return; }
        const facing = await turn(ant, g, stops.at(-1).p, arrived, heading(stops.at(-1).p, centreOf(i)));
        if (mine !== gen) { ant.remove(); return; }
        const end = stops.at(-1).p, [bx, by] = centreOf(i);
        await pickUp(ant, g, i, -Math.hypot(bx - end[0], by - end[1]), facing);
        landed();
        if (mine !== gen) { ant.remove(); return; }
        const home = along(g, [stops.at(-1).p, ...route.slice(1).map(centreOf), ...exits, hole]);
        await turn(ant, g, stops.at(-1).p, facing, home.first);
        await play(ant, home.frames, home.duration);
        await dive(ant);
        if (mine === gen) holeBump();
    }

    /**
     * Walks in along `stops`, queueing like an ant: two cells short of a pixel that an
     * earlier ant has yet to take (further back if another ant already waits there), legs
     * still, until that pixel is lifted clear. Returns the heading it arrives on.
     */
    async function approach(ant, g, stops, mine) {
        const H = holds;                // this board's, even if a new one opens meanwhile
        const spot = (st) => (st.k >= 0 ? st.k : st.p.join());
        const passed = new Set();       // pixels it gave up waiting for (a safety net only)
        let at = 0, deg = 0;
        while (at < stops.length - 1) {
            const j = stops.findIndex((st, n) => n > at && st.k >= 0 && shown[st.k] && !passed.has(st.k));
            let stop = j < 0 ? stops.length - 1 : Math.max(at, j - 2);
            while (j >= 0 && stop > at && H.has(spot(stops[stop]))) stop--;
            const held = j >= 0 ? spot(stops[stop]) : null;
            if (held !== null) H.add(held);
            if (stop > at) {
                const leg = along(g, stops.slice(at, stop + 1).map((st) => st.p));
                if (at > 0) await turn(ant, g, stops[at].p, deg, leg.first);
                await play(ant, leg.frames, leg.duration);
                deg = leg.end;
                at = stop;
                if (mine !== gen) return deg;
            }
            if (j >= 0) {
                ant.classList.add('waiting');
                const rank = await whenGrabbed(stops[j].k);
                if (shown[stops[j].k]) passed.add(stops[j].k);
                // its ant lifts it clear; then the queue moves off one at a time
                else await sleep(450 + rank * 160);
                ant.classList.remove('waiting');
            }
            if (held !== null) H.delete(held);
            if (mine !== gen) return deg;
        }
        return deg;
    }

    /** A digger tunnels up right under its block, lifts it and goes back down with it. */
    async function tunnel(ant, g, i, mine, landed) {
        ant.style.transform = pose(g, centreOf(i), 0);
        for (const img of ant.querySelectorAll('img')) img.animate([{opacity: 0, transform: 'scale(.3)'}, {opacity: 1, transform: 'none'}], {duration: 260, easing: 'ease-out'});
        await pickUp(ant, g, i, 0, 0);
        landed();
        await sleep(120);
        if (mine !== gen) { ant.remove(); return; }
        await dive(ant);
    }

    /** The tapped tile glides from its lane into the jar's slot and becomes the jar. */
    async function glideIn(ghost, seatEl) {
        const from = ghost.getBoundingClientRect(), to = seatEl.getBoundingClientRect();
        const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
        await ghost.animate([
            {transform: 'translate(0, 0) scale(1)'},
            {transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 18}px) scale(1.08)`, offset: .5},
            {transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`},
        ], {duration: 380, easing: 'cubic-bezier(.4, 0, .25, 1)', fill: 'forwards'}).finished;
        ghost.remove();
    }

    /** Plays one event on its seat. Every seat plays its own events in order. */
    async function animate(ev, from, mine) {
        if (mine !== gen) return;
        const seat = els.seats.children[ev.seat];
        if (!seat) return;
        if (ev.t === 'dispatch') {
            if (from && from.isConnected) await glideIn(from, seat);
            if (mine !== gen) return;
            view.seats[ev.seat] = {id: ev.nest.id, colour: ev.nest.colour, left: ev.left};
            renderSeats();
            const g = seat.querySelector('.group');
            if (g) g.animate([{transform: 'scale(.92)'}, {transform: 'scale(1.06)', offset: .55}, {transform: 'scale(1)'}], {duration: 260, easing: 'ease-out'});
        } else if (ev.t === 'eat') {
            const count = seat.querySelector('.group b');
            // A steady single file: about two ant lengths apart.
            const gap = Math.max(90, Math.min(140, 2000 / ev.cells.length));
            const jarAt = inCells(seat), holeAt = inCells(els.hole);
            // Every ant sets off in turn and queues in the picture behind pixels still to be
            // taken; the jar can go as soon as the last has left.
            for (const i of ev.cells) {
                if (mine !== gen) return;
                if (view.seats[ev.seat]) {
                    view.seats[ev.seat].left--;
                    if (count) count.textContent = Math.max(0, view.seats[ev.seat].left);
                }
                fetchBlock(jarAt, holeAt, i, L.palette[ev.colour], !!ev.dig, mine).catch((err) => console.error(err));
                await sleep(gap);
            }
        } else if (ev.t === 'leave') {
            const g = seat.querySelector('.group');
            if (g) {
                g.classList.add('hop');
                await g.animate([{transform: 'scale(1)', opacity: 1}, {transform: 'scale(1.05)', opacity: 1, offset: .3}, {transform: 'scale(.6)', opacity: 0}],
                    {duration: 300, easing: 'ease-in', fill: 'forwards'}).finished;
                g.remove();
            }
            if (mine !== gen) return;
            view.seats[ev.seat] = null;
            renderSeats();
        }
    }

    /** Queues a tap's events on their seats; the game's end shows when all are played. */
    function enqueue(events, from) {
        const mine = gen;
        for (const raw of events) {
            if (raw.seat === undefined || raw.t === 'seat' || raw.t === 'recall') continue;
            // Map the engine's seat to the seat this group is drawn in.
            let vis;
            if (raw.t === 'dispatch') {
                vis = taken[raw.seat] ? s.seats.findIndex((_, v) => !taken[v]) : raw.seat;
                if (vis < 0) vis = raw.seat;
                taken[vis] = true;
                placed[raw.seat] = {id: raw.nest.id, vis};
            } else {
                vis = placed[raw.seat] ? placed[raw.seat].vis : raw.seat;
            }
            const ev = {...raw, seat: vis};
            if (raw.t === 'leave') {
                const v = vis;
                ev.release = () => { taken[v] = false; };
            }
            if (raw.t === 'eat') for (const c of raw.cells) order.set(c, ++seq);
            pending++;
            const k = vis;
            queues[k] = (queues[k] || Promise.resolve()).then(() => animate(ev, ev.t === 'dispatch' ? from : null, mine)).catch(() => {}).then(() => {
                if (ev.release) ev.release();
                if (mine !== gen) return;
                pending--;
                markBusy();
                if (!busy()) idle();
            });
        }
        markBusy();
    }

    /** Everything has played out: the screen matches the engine again. */
    function idle() {
        view = snapshot();
        render();
        if (s.over && !ended) {
            ended = true;
            if (s.over === 'won') win(); else lose();
        }
    }

    // --- turns -----------------------------------------------------------------------------

    function act(action) {
        if (s.over && action.t === 'tap') return;
        if (action.t === 'tap') {
            const t = els.lanes.children[action.lane] && els.lanes.children[action.lane].querySelector('.token.front');
            // A slot counts as taken until its jar has left the screen, not just until
            // the engine is done with it: otherwise a tile would land on a jar still there.
            const visiblyFull = s.seats.every((_, v) => taken[v]);
            const events = visiblyFull ? null : E.tap(s, action.lane);
            if (!events) {
                // Every seat taken: the seats shuffle to say so.
                els.seats.animate([{transform: 'none'}, {transform: 'translateX(-6px)'}, {transform: 'translateX(6px)'}, {transform: 'none'}], {duration: 300});
                return;
            }
            actions.push(action);
            persist();
            // The tile leaves its lane at once (the next one slides up); a copy of it
            // glides to the jar.
            let ghost = null;
            if (t) {
                const rect = t.getBoundingClientRect();
                ghost = t.cloneNode(true);
                ghost.classList.remove('front');
                ghost.classList.add('ghost');
                Object.assign(ghost.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: 'none'});
                els.fly.appendChild(ghost);
                t.remove();
            }
            renderLanes();
            enqueue(events, ghost);
            return;
        }
        let events = null;
        if (action.t === 'seat') events = E.addSeat(s);
        else if (action.t === 'recall') events = E.recall(s, action.seat);
        if (!events) return;
        actions.push(action);
        persist();
        ended = false;
        if (action.t === 'seat') view.seats.push(null);
        else view = snapshot();
        render();
    }

    function win() {
        let opened = null;
        if (store.mode === 'track') {
            opened = Object.keys(DIFFICULTY).find((d) => unlockAt(d) === L.level && !endlessOpen(d)) || null;
            store.unlocked = Math.max(store.unlocked, L.level + 1);
        } else {
            store.endless[store.mode] = L.level + 1;
        }
        store.game = null;
        save();
        render();
        say('won');
        els.board.classList.add('won');
        celebrate();
        showEnd('won', 2400);
        if (opened) setTimeout(() => say('won', `Endless ${DIFFICULTY[opened]} unlocked! Find it in Levels.`), 2600);
        maybeGift();
    }

    function lose() {
        render();
        say('lost');
        els.board.classList.remove('quake');
        void els.board.offsetWidth;
        els.board.classList.add('quake');
        els.seats.classList.add('crowded');
        setTimeout(() => els.seats.classList.remove('crowded'), 1200);
        showEnd('lost', 1600);
        maybeGift();
    }

    function celebrate() {
        const plate = els.plate;
        const banner = document.createElement('div');
        banner.className = 'yum';
        banner.textContent = ['Yum!', 'Delicious!', 'Crumbs!'][Math.floor(Math.random() * 3)];
        plate.appendChild(banner);
        banner.addEventListener('animationend', () => banner.remove(), {once: true});
        for (let k = 0; k < 14; k++) {
            const a = document.createElement('div');
            a.className = 'dancer';
            a.innerHTML = ANT(L.palette[k % L.palette.length]);
            a.style.left = `${6 + (k % 7) * 14}%`;
            a.style.top = k < 7 ? '-6%' : '96%';
            a.style.animationDelay = `${k * 70}ms`;
            plate.appendChild(a);
            setTimeout(() => a.remove(), 2600);
        }
    }

    function showEnd(kind, delay) {
        clearTimeout(endTimer);
        endTimer = setTimeout(() => {
            const veil = document.createElement('div');
            veil.className = `board-end ${kind}`;
            const go = document.createElement('button');
            go.className = 'go';
            go.textContent = kind === 'won' ? 'Next level' : 'Try again';
            go.addEventListener('click', () => (kind === 'won' ? open(store.mode, L.level + 1) : restart()));
            veil.appendChild(go);
            els.plate.appendChild(veil);
        }, delay);
    }

    /** The plate wipes down in a wave and the full picture is served again. */
    async function restart() {
        gen++;
        clearTimeout(endTimer);
        els.plate.querySelectorAll('.board-end').forEach((v) => v.remove());
        store.game = null;
        save();
        els.board.classList.add('wipe');
        await sleep(380);
        open(store.mode, L.level);
        els.board.classList.remove('wipe');
        els.board.classList.add('serve');
        setTimeout(() => els.board.classList.remove('serve'), 700);
    }

    function maybeGift() {
        if (Math.random() >= DROP_CHANCE) return;
        const key = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
        store.items[key]++;
        save();
        setTimeout(() => window.Gift.show({
            icon: POWERS[key].icon, name: POWERS[key].name,
            target: () => els.powerups.querySelector(`[data-power="${key}"]`),
            done: () => { renderPowers(); const b = els.powerups.querySelector(`[data-power="${key}"]`); if (b) b.classList.add('bump'); },
        }), 3000);
    }

    // --- power-ups ---------------------------------------------------------------------

    function setAim(kind) {
        aim = kind;
        if (s) { renderSeats(); renderPowers(); }
    }

    function usePower(key) {
        if (!store.items[key]) return;
        if (key === 'recall') {
            if (busy()) { say('start', 'Let the ants finish their trip first.'); return; }
            if (!s.seats.some(Boolean)) { say('start', 'Nobody is waiting. Recall works on a seated group.'); return; }
            setAim(aim === 'recall' ? null : 'recall');
            if (aim) say('start', 'Tap a waiting group to send it back.');
            return;
        }
        if (key === 'seat') {
            if (s.seats.length >= 7) { say('start', 'Seven seats is the most the blanket fits.'); return; }
            store.items.seat--;
            save();
            act({t: 'seat'});
            ended = false;
            clearTimeout(endTimer);
            els.plate.querySelectorAll('.board-end').forEach((v) => v.remove());
            say('start', 'One more seat on the blanket.');
            return;
        }
        // Digger and Feast change the next nest tapped.
        store.items[key]--;
        if (key === 'dig') s.dig = true;
        if (key === 'feast') s.feast = true;
        actions.push({t: key});
        persist();
        renderPowers();
        say('start', key === 'dig' ? 'The next ants dig straight to their colour.' : 'The next nest sends twice the ants.');
    }

    // --- sheets ------------------------------------------------------------------------

    function openSheet(html) {
        els.sheetBody.innerHTML = html;
        els.sheet.classList.remove('closing');
        els.sheet.hidden = false;
    }

    function closeSheet() {
        if (els.sheet.hidden || els.sheet.classList.contains('closing')) return;
        els.sheet.classList.add('closing');
        setTimeout(() => { els.sheet.hidden = true; els.sheet.classList.remove('closing'); }, 280);
    }

    function showLevels() {
        let html = '<h2>Levels</h2><h3>Mode</h3><div class="modes">';
        html += `<button data-mode="track" class="mode ${store.mode === 'track' ? 'on' : ''}"><b>Track</b><span>Level ${store.level}</span></button>`;
        for (const d of Object.keys(DIFFICULTY)) {
            const isOpen = endlessOpen(d);
            html += `<button data-mode="${d}" class="mode endless ${store.mode === d ? 'on' : ''}" ${isOpen ? '' : 'disabled'}>`
                + `<b>${isOpen ? '∞' : '🔒'} ${DIFFICULTY[d]}</b><span>${isOpen ? `Endless #${store.endless[d] || 1}` : `Finish level ${unlockAt(d)}`}</span></button>`;
        }
        html += '</div>';
        let first = 1;
        for (const [difficulty, count] of E.LADDER) {
            if (first > store.unlocked) break;
            const end = count === Infinity ? Math.max(first + E.BAND - 1, store.unlocked + 6) : first + count - 1;
            html += `<h3>${DIFFICULTY[difficulty]} · ${first}–${count === Infinity ? '∞' : end}</h3><div class="level-grid">`;
            for (let l = first; l <= end; l++) {
                const cls = store.mode === 'track' && l === store.level ? 'current' : l < store.unlocked ? 'solved' : '';
                html += `<button data-level="${l}" class="${cls}" ${l > store.unlocked ? 'disabled' : ''}>${l}</button>`;
            }
            html += '</div>';
            first += count;
        }
        openSheet(html);
        const current = els.sheetBody.querySelector('.current');
        if (current) current.scrollIntoView({block: 'nearest'});
    }

    function showRules() {
        const powers = POWER_KEYS.map((k) => `<div>${POWERS[k].icon}<p><b>${POWERS[k].name}:</b> ${POWERS[k].what}</p></div>`).join('');
        const sample = (k, c) => `<span class="rule-token" style="--c:${c};--c-dark:${shade(c, -0.35)}">${symbol(k, c)}</span>`;
        openSheet(`<h2>How to play</h2>
            <div class="list">
                <div>${sample(0, '#E5484D')}<p>Tap a nest in the front row. Its number is how many ants it sends.</p></div>
                <div>${sample(1, '#5DBB63')}<p>Ants take pixels of their own colour, but only ones open to the outside on some side.</p></div>
                <div>${sample(4, '#9AA5B1')}<p>Ants that cannot reach anything wait in a jar. All jars full: lunch is over.</p></div>
            </div>
            <button class="toggle ${store.symbols ? 'on' : ''}" id="symbols-toggle"><span></span>Colour-blind mode: symbols on the picture</button>
            <h3>Power-ups</h3><div class="list">${powers}</div>`);
    }

    // --- input ---------------------------------------------------------------------------

    els.lanes.addEventListener('click', (e) => {
        const t = e.target.closest('.token.front');
        if (t && !t.classList.contains('off') && !t.classList.contains('sent')) act({t: 'tap', lane: Number(t.dataset.lane)});
    });
    els.seats.addEventListener('click', (e) => {
        const b = e.target.closest('[data-seat]');
        if (!b || aim !== 'recall' || !view.seats[Number(b.dataset.seat)]) return;
        if (busy()) { setAim(null); say('start', 'Let the ants finish their trip first.'); return; }
        const vis = Number(b.dataset.seat);
        const engineSeat = s.seats.findIndex((g, k) => g && (placed[k] && placed[k].id === g.id ? placed[k].vis : k) === vis);
        if (engineSeat < 0) return;
        store.items.recall--;
        save();
        setAim(null);
        clearTimeout(endTimer);
        els.plate.querySelectorAll('.board-end').forEach((v) => v.remove());
        if (placed[engineSeat]) taken[placed[engineSeat].vis] = false;
        placed[engineSeat] = null;
        act({t: 'recall', seat: engineSeat});
        say('start', 'Back to the nest they go.');
    });
    els.powerups.addEventListener('click', (e) => {
        const b = e.target.closest('[data-power]');
        if (b && !b.disabled) usePower(b.dataset.power);
    });
    els.levelsBtn.addEventListener('click', showLevels);
    els.restartBtn.addEventListener('click', restart);
    els.helpBtn.addEventListener('click', showRules);
    els.sheetClose.addEventListener('click', closeSheet);
    els.sheet.addEventListener('click', (e) => {
        if (e.target === els.sheet) closeSheet();
        const toggle = e.target.closest('#symbols-toggle');
        if (toggle) {
            store.symbols = !store.symbols;
            save();
            toggle.classList.toggle('on', store.symbols);
            // Nests and jars carry the symbols only in colour-blind mode: redraw them.
            els.lanes.querySelectorAll('.token').forEach((t) => { delete t.dataset.look; });
            els.seats.querySelectorAll('.group').forEach((g) => g.remove());
            repaintSymbols();
            render();
        }
        const b = e.target.closest('[data-level]');
        if (b && !b.disabled) { closeSheet(); open('track', Number(b.dataset.level)); }
        const m = e.target.closest('[data-mode]');
        if (m && !m.disabled) { closeSheet(); open(m.dataset.mode, m.dataset.mode === 'track' ? store.level : store.endless[m.dataset.mode] || 1); }
    });

    open(store.mode, store.mode === 'track' ? store.level : store.endless[store.mode] || 1);
})();
