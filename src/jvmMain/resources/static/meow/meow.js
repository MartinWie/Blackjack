/**
 * Hide & Meow board. Tap or drag to mark a spot with an X, double tap to look under
 * it. Rules, boards and hints come from `meow-engine.js`, faces from `meow-cats.js`;
 * this file only plays them.
 *
 * Two modes. The track is the engine's LADDER: a hundred levels each of Easy, Medium,
 * Hard and Expert, then Expert on. Finishing a band opens that difficulty's endless
 * mode, its own run of boards. localStorage holds the track level, the endless count
 * per difficulty, the board in progress and the power-up pouch — a fixed handful of
 * keys however long anyone plays.
 */
(function () {
    'use strict';

    const E = window.MeowEngine;
    const C = window.MeowCats;
    const FISH = 3;
    const MAX_FISH = 5;
    const DOUBLE_TAP_MS = 350;
    const UNDO_DEPTH = 40;
    const DROP_CHANCE = 1 / 7;
    const STORE_KEY = 'meow.v2';
    const COLOURS = ['#5FB3A6', '#EFA163', '#B9607A', '#8C7BC8', '#A9C98D', '#6FA9D6', '#DDA3B3', '#A5B6CF', '#E3BE5A'];
    const DIFFICULTY = {easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert'};

    const LINES = {
        start: ['Can you find where the cats are hiding?', 'Somebody is napping under one of these…', 'Shh. They think they are invisible.'],
        found: ['Found one! Mrrp.', 'Purr-fect.', 'Caught mid-nap!', 'A wild cat appears!', 'That one wanted to be found.'],
        miss: ['Nope, just a warm cushion.', 'Only crumbs here.', 'A cat was here an hour ago.', 'Empty! A fish swims off…'],
        saved: ['Empty, but the bell kept your fish safe.'],
        won: ['Every cat found! They demand treats.', 'All cats accounted for. Purrs all round.'],
        lost: ['Out of fish… the cats got bored and showed themselves.'],
        stepUp: ['New difficulty! The cats got sneakier.'],
        endless: ['Endless mode. Cats as far as the eye can see.'],
    };

    const X = '<svg class="x" viewBox="0 0 40 40" aria-hidden="true"><path d="M10 10 30 30M30 10 10 30" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>';
    const FISH_SVG = '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M6 20C14 6 34 4 46 14l12-8q3-1 2 3l-4 11 4 11q1 4-2 3l-12-8C34 36 14 34 6 20z" fill="#F2B544" stroke="#D18A1F" stroke-width="2.5" stroke-linejoin="round"/><circle cx="16" cy="18" r="2.8" fill="#5A3A1A"/><path d="M26 12q4 8 0 16" stroke="#D18A1F" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>';
    const HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="#F08AA4"/></svg>';

    // The four power-ups. Each starts with one in the pouch; more drop after a game.
    const POWERS = {
        catnip: {
            name: 'Catnip', what: 'Lures one hidden cat out for free.',
            icon: '<svg viewBox="0 0 48 48"><path d="M24 44V20" stroke="#4E8A3A" stroke-width="3" stroke-linecap="round"/><path d="M24 26c-9 0-15-6-15-14 9 0 15 5 15 14zM24 22c8-1 13-7 13-15-8 1-13 7-13 15z" fill="#7CC36E" stroke="#4E8A3A" stroke-width="2" stroke-linejoin="round"/><path d="M24 34c-6 0-10-4-10-9 6 0 10 4 10 9zM24 32c5 0 9-4 9-9-5 0-9 4-9 9z" fill="#A6DB8F" stroke="#4E8A3A" stroke-width="2" stroke-linejoin="round"/><circle cx="35" cy="30" r="2" fill="#F7E07A"/><circle cx="12" cy="34" r="1.6" fill="#F7E07A"/></svg>',
        },
        yarn: {
            name: 'Yarn ball', what: 'Marks every spot the cats you found rule out.',
            icon: '<svg viewBox="0 0 48 48"><circle cx="22" cy="24" r="15" fill="#F58BB3" stroke="#C9547F" stroke-width="2"/><path d="M10 18c8 2 18 10 22 18M13 31c4-8 13-15 23-15M17 11c2 9 0 21-5 26M28 10c-2 8 3 18 9 22" fill="none" stroke="#C9547F" stroke-width="2" stroke-linecap="round"/><path d="M36 30c4 2 6 6 4 10" fill="none" stroke="#C9547F" stroke-width="2.5" stroke-linecap="round"/></svg>',
        },
        fish: {
            name: 'Golden fish', what: 'One extra life for this board (up to five).',
            icon: '<svg viewBox="0 0 48 48"><path d="M4 24C10 13 25 11 34 19l9-6q3-1 2 2l-3 9 3 9q1 3-2 2l-9-6C25 37 10 35 4 24z" fill="#FFD34D" stroke="#D18A1F" stroke-width="2.5" stroke-linejoin="round"/><circle cx="12" cy="22" r="2.4" fill="#5A3A1A"/><path d="M20 16q4 8 0 16" stroke="#D18A1F" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M38 6l1.5 3.5L43 11l-3.5 1.5L38 16l-1.5-3.5L33 11l3.5-1.5z" fill="#FFF3B0"/></svg>',
        },
        bell: {
            name: 'Bell', what: 'Your next look costs no fish, even if nobody is home.',
            icon: '<svg viewBox="0 0 48 48"><path d="M24 8c-8 0-12 6-12 13v8l-4 5h32l-4-5v-8c0-7-4-13-12-13z" fill="#F2C14E" stroke="#C48A1C" stroke-width="2.2" stroke-linejoin="round"/><circle cx="24" cy="38" r="4" fill="#C48A1C"/><path d="M14 30h20" stroke="#E5304F" stroke-width="3.5"/><circle cx="24" cy="7" r="2.5" fill="#C48A1C"/><path d="M17 16q2-4 6-5" stroke="#FFF3B0" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
        },
    };
    const POWER_KEYS = Object.keys(POWERS);

    const $ = (id) => document.getElementById(id);
    const els = {
        level: $('level'), difficulty: $('difficulty'), board: $('board'), pillFill: $('pill-fill'), pillText: $('pill-text'),
        fish: $('fish'), message: $('message'), powerups: $('powerups'),
        levelsBtn: $('levels-btn'), hintBtn: $('hint-btn'), undoBtn: $('undo-btn'), restartBtn: $('restart-btn'), helpBtn: $('help-btn'),
        sheet: $('sheet'), sheetBody: $('sheet-body'), sheetClose: $('sheet-close'),
    };

    // --- persistence -----------------------------------------------------------

    function load() {
        const fresh = {mode: 'track', level: 1, unlocked: 1, endless: {}, game: null, items: {catnip: 1, yarn: 1, fish: 1, bell: 1}};
        try {
            localStorage.removeItem('meow.v1'); // per-difficulty progress, before the ladder
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            if (saved && saved.unlocked >= 1) {
                saved.items = {...fresh.items, ...(saved.items || {})};
                saved.level = Math.min(Math.max(1, Number(saved.level) || 1), saved.unlocked);
                saved.endless = saved.endless || {};
                saved.mode = saved.mode in DIFFICULTY ? saved.mode : 'track';
                return saved;
            }
        } catch (_) { /* private mode or junk: start fresh */ }
        return fresh;
    }

    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* no storage, no memory */ }
    }

    const store = load();
    let board = null;
    let game = null; // {level, marks, found, misses, fish, over, bell}
    let history = [];

    function persist() {
        store.game = {
            mode: store.mode, level: game.level, board: board.cats.join(), marks: [...game.marks], found: [...game.found],
            misses: [...game.misses], fish: game.fish, over: game.over, bell: game.bell,
        };
        save();
    }

    // --- setup -----------------------------------------------------------------

    /** The track level whose win opens a difficulty's endless mode. */
    function unlockAt(difficulty) {
        let end = 0;
        for (const [d, count] of E.LADDER) { end += count === Infinity ? E.BAND : count; if (d === difficulty) return end; }
        return Infinity;
    }

    const endlessOpen = (difficulty) => store.unlocked > unlockAt(difficulty);

    /** Opens a board: mode is 'track' or a difficulty (its endless mode). */
    function open(mode, level) {
        if (mode !== 'track' && !endlessOpen(mode)) { mode = 'track'; level = store.level; }
        store.mode = mode;
        if (mode === 'track') {
            store.level = Math.max(1, Math.min(level, store.unlocked));
            board = E.boardFor(store.level);
        } else {
            store.endless[mode] = Math.max(1, level);
            board = E.endlessBoard(mode, store.endless[mode]);
        }
        const saved = store.game;
        // The saved game must be for this very board: a generator change moves levels.
        game = saved && (saved.mode || 'track') === mode && saved.level === board.level && saved.board === board.cats.join()
            ? {
                level: board.level, marks: new Set(saved.marks), found: new Set(saved.found), misses: new Set(saved.misses),
                fish: Number(saved.fish) || 0, over: saved.over || null, bell: !!saved.bell,
            }
            : fresh(board.level);
        history = [];
        save();
        build();
        render();
        const stage = E.stage(store.level);
        const firstOfBand = mode === 'track' && stage.index === 1 && stage.difficulty !== 'easy';
        say(game.over ? game.over : game.found.size ? 'start' : mode !== 'track' && board.level === 1 ? 'endless' : firstOfBand ? 'stepUp' : 'start');
    }

    function fresh(level) {
        return {level, marks: new Set(), found: new Set(), misses: new Set(), fish: FISH, over: null, bell: false};
    }

    /** A breed per cat, fixed per level, so a cat keeps its face across reloads. */
    function breedOf(i) {
        return (board.cats.indexOf(i) + board.level * 3 + (store.mode === 'track' ? 0 : 1)) % C.BREEDS.length;
    }

    function build() {
        const n = board.size;
        els.board.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
        els.board.style.gap = n >= 9 ? '3px' : '4px';
        els.board.classList.remove('won');
        els.board.innerHTML = '';
        for (let i = 0; i < n * n; i++) {
            const cell = document.createElement('button');
            cell.className = 'cell';
            cell.dataset.i = i;
            cell.style.background = COLOURS[board.regions[i]];
            cell.style.boxShadow = edges(i);
            cell.innerHTML = X;
            cell.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`);
            els.board.appendChild(cell);
        }
        els.level.textContent = store.mode === 'track' ? `Level ${board.level}` : `Endless #${board.level}`;
        els.difficulty.textContent = DIFFICULTY[board.difficulty];
    }

    /** A darker seam where two colours meet, so regions read without colour too. */
    function edges(i) {
        const n = board.size, r = Math.floor(i / n), c = i % n, g = board.regions[i];
        const seam = 'rgba(70,40,30,.55)';
        const parts = [];
        if (c > 0 && board.regions[i - 1] !== g) parts.push(`inset 2px 0 0 ${seam}`);
        if (c < n - 1 && board.regions[i + 1] !== g) parts.push(`inset -2px 0 0 ${seam}`);
        if (r > 0 && board.regions[i - n] !== g) parts.push(`inset 0 2px 0 ${seam}`);
        if (r < n - 1 && board.regions[i + n] !== g) parts.push(`inset 0 -2px 0 ${seam}`);
        return parts.join(',') || 'none';
    }

    // --- drawing ---------------------------------------------------------------

    function render() {
        const n = board.size;
        const cats = new Set(board.cats);
        els.board.querySelectorAll('.cell').forEach((cell) => {
            const i = Number(cell.dataset.i);
            const found = game.found.has(i);
            const sleepy = game.over === 'lost' && cats.has(i) && !found;
            const mood = found ? (game.over === 'won' ? 'happy' : 'awake') : sleepy ? 'sleep' : null;
            cell.classList.toggle('marked', game.marks.has(i) && !found);
            cell.classList.toggle('miss', game.misses.has(i));
            cell.classList.toggle('found', found);
            cell.classList.toggle('sleepy', sleepy);
            const face = cell.querySelector('.cat');
            if (mood && (!face || !face.classList.contains(mood))) {
                if (face) face.remove();
                cell.insertAdjacentHTML('beforeend', C.cat(breedOf(i), mood, (i * 0.37) % 4));
            }
            if (!mood && face) face.remove();
        });
        els.pillText.textContent = `${game.found.size}/${n}`;
        els.pillFill.style.width = `${(game.found.size / n) * 100}%`;
        const slots = Math.max(FISH, game.fish);
        if (els.fish.children.length !== slots) els.fish.innerHTML = FISH_SVG.repeat(slots);
        [...els.fish.children].forEach((f, k) => f.classList.toggle('gone', k >= game.fish));
        els.undoBtn.disabled = !history.length || !!game.over;
        els.hintBtn.disabled = !!game.over;
        renderPowers();
    }

    function renderPowers() {
        els.powerups.innerHTML = '';
        for (const key of POWER_KEYS) {
            const p = POWERS[key];
            const b = document.createElement('button');
            b.className = 'power' + (key === 'bell' && game.bell ? ' armed' : '');
            b.dataset.power = key;
            b.disabled = !store.items[key] || !!game.over || (key === 'bell' && game.bell);
            b.setAttribute('aria-label', `${p.name}: ${p.what} You have ${store.items[key]}.`);
            b.innerHTML = `${p.icon}<span>${p.name}</span><b>${store.items[key]}</b>`;
            els.powerups.appendChild(b);
        }
    }

    function say(kind, text) {
        els.message.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = text || (LINES[kind][Math.floor(Math.random() * LINES[kind].length)]);
        els.message.appendChild(p);
        if (kind === 'won' || kind === 'lost') {
            const go = document.createElement('button');
            go.className = 'go';
            go.textContent = kind === 'won' ? 'Next level' : 'Try again';
            go.addEventListener('click', () => {
                if (kind === 'won') open(store.mode, game.level + 1);
                else restart();
            });
            els.message.appendChild(go);
        }
    }

    function hearts(cell) {
        for (let k = 0; k < 3; k++) {
            cell.insertAdjacentHTML('beforeend', HEART);
            const h = cell.lastElementChild;
            h.style.left = '50%';
            h.style.top = '20%';
            h.style.setProperty('--dx', `${(k - 1) * 18}px`);
            h.style.animationDelay = `${k * 90}ms`;
            h.addEventListener('animationend', () => h.remove());
        }
    }

    // --- celebrations ------------------------------------------------------------
    //
    // Every particle removes itself when its animation ends, so nothing piles up.

    const FIND_STYLES = ['hearts', 'jump', 'spin', 'peek', 'meow'];
    const MEOWS = ['Meow!', 'Mrrp!', 'Nya~', 'Purr…', 'Hi!', 'Mew?'];
    const WIN_BANNERS = ['Purr-fect!', 'Paw-some!', 'Meow-velous!', 'Clawsome!'];

    function particle(parent, cls, styles = {}) {
        const el = document.createElement('span');
        el.className = cls;
        Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v));
        parent.appendChild(el);
        // Only its own animation: a child's animationend bubbles up too.
        const done = (e) => { if (e.target === el) { el.removeEventListener('animationend', done); el.remove(); } };
        el.addEventListener('animationend', done);
        return el;
    }

    /** A different entrance for each find, and a ripple through the cells around it. */
    function celebrateFind(i) {
        const cell = els.board.children[i];
        const style = FIND_STYLES[Math.floor(Math.random() * FIND_STYLES.length)];
        cell.dataset.anim = style;
        setTimeout(() => { delete cell.dataset.anim; }, 1100);
        if (style === 'hearts') hearts(cell);
        if (style === 'jump') for (let k = 0; k < 6; k++) particle(cell, 'dust', {'--dx': `${(k - 2.5) * 12}px`, 'animation-delay': `${420 + k * 15}ms`});
        if (style === 'spin') for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            particle(cell, 'star', {'--dx': `${Math.cos(a) * 34}px`, '--dy': `${Math.sin(a) * 34}px`});
        }
        if (style === 'peek') particle(cell, 'paw-wave');
        if (style === 'meow') particle(cell, 'bubble').textContent = MEOWS[Math.floor(Math.random() * MEOWS.length)];
        const n = board.size, r = Math.floor(i / n), c = i % n;
        for (let k = 0; k < n * n; k++) {
            const d = Math.max(Math.abs(Math.floor(k / n) - r), Math.abs((k % n) - c));
            if (d === 0 || d > 2) continue;
            const other = els.board.children[k];
            other.style.setProperty('--ripple', `${d * 70}ms`);
            other.classList.remove('ripple');
            void other.offsetWidth;
            other.classList.add('ripple');
            setTimeout(() => other.classList.remove('ripple'), 700 + d * 70);
        }
    }

    /** The cats bounce in a wave, a banner lands, and one of three parties starts. */
    function celebrateWin() {
        const order = [...game.found].sort((a, b) => a - b);
        order.forEach((i, k) => els.board.children[i].style.setProperty('--wave', `${k * 110}ms`));
        const banner = particle(els.board, 'win-banner');
        banner.textContent = WIN_BANNERS[Math.floor(Math.random() * WIN_BANNERS.length)];
        const party = ['confetti', 'fireworks', 'balloons'][Math.floor(Math.random() * 3)];
        const layer = document.createElement('div');
        layer.className = 'party';
        document.body.appendChild(layer);
        setTimeout(() => layer.remove(), 4500);
        const colours = ['#F2C14E', '#E58A9A', '#5FB3A6', '#8C7BC8', '#EFA163', '#6FA9D6'];
        if (party === 'confetti') {
            const bits = ['🐾', '🐟', '💖', '', '', '', ''];
            for (let k = 0; k < 70; k++) {
                const bit = particle(layer, 'confetti', {
                    left: `${Math.random() * 100}%`, '--rot': `${Math.random() * 720 - 360}deg`, '--sway': `${Math.random() * 80 - 40}px`,
                    background: colours[k % colours.length], 'animation-delay': `${Math.random() * 900}ms`, 'animation-duration': `${2200 + Math.random() * 1200}ms`,
                });
                const emoji = bits[k % bits.length];
                if (emoji) { bit.textContent = emoji; bit.classList.add('emoji'); }
            }
        } else if (party === 'fireworks') {
            for (let b = 0; b < 6; b++) {
                const x = 15 + Math.random() * 70, y = 15 + Math.random() * 45, colour = colours[b % colours.length];
                for (let k = 0; k < 16; k++) {
                    const a = (k / 16) * Math.PI * 2, dist = 50 + Math.random() * 40;
                    particle(layer, 'firework', {
                        left: `${x}%`, top: `${y}%`, background: colour, '--dx': `${Math.cos(a) * dist}px`, '--dy': `${Math.sin(a) * dist}px`,
                        'animation-delay': `${b * 380}ms`,
                    });
                }
            }
        } else {
            for (let k = 0; k < 14; k++) {
                const balloon = particle(layer, 'balloon', {
                    left: `${4 + Math.random() * 88}%`, '--sway': `${Math.random() * 40 - 20}px`,
                    'animation-delay': `${Math.random() * 1200}ms`, 'animation-duration': `${2800 + Math.random() * 1000}ms`,
                });
                balloon.innerHTML = C.cat(k % C.BREEDS.length, 'happy');
            }
        }
    }

    const LOSS_BANNERS = ['The cats win this round!', 'Oh no!', 'Out-cat-ed!', 'Hiss-terical…'];

    /** Out of fish: the board quakes, a rain cloud drizzles, a fish bone tumbles away. */
    function mourn() {
        els.board.classList.remove('quake');
        void els.board.offsetWidth;
        els.board.classList.add('quake');
        setTimeout(() => els.board.classList.remove('quake'), 900);
        const cloud = particle(els.board, 'cloud');
        for (let k = 0; k < 18; k++) {
            particle(cloud, 'drop', {left: `${10 + Math.random() * 80}%`, 'animation-delay': `${600 + Math.random() * 1600}ms`});
        }
        const bone = particle(els.fish, 'fishbone');
        bone.innerHTML = '<svg viewBox="0 0 64 30" aria-hidden="true"><path d="M6 15h40M14 8l4 14M22 7l4 16M30 7l4 16M38 8l3 14" stroke="#C9B8AC" stroke-width="3" stroke-linecap="round"/><path d="M46 15l10-8v16z" fill="none" stroke="#C9B8AC" stroke-width="3" stroke-linejoin="round"/><circle cx="7" cy="15" r="5" fill="#E9DED6" stroke="#C9B8AC" stroke-width="2.5"/><path d="M5 13l3 3M8 13l-3 3" stroke="#7A4E3A" stroke-width="1.5"/></svg>';
        setTimeout(() => {
            particle(els.board, 'lose-banner').textContent = LOSS_BANNERS[Math.floor(Math.random() * LOSS_BANNERS.length)];
        }, 500);
    }

    /** A band is done: the padlock bursts and its endless mode floats out. */
    function unlockAnimation(difficulty, closed = () => {}) {
        const veil = document.createElement('div');
        veil.className = 'unlock';
        veil.innerHTML = `<div class="rays"></div>
            <svg class="lock" viewBox="0 0 100 120" aria-hidden="true">
                <path class="shackle" d="M28 52V36a22 22 0 0 1 44 0v16" fill="none" stroke="#C9A227" stroke-width="10" stroke-linecap="round"/>
                <rect class="body" x="16" y="50" width="68" height="58" rx="12" fill="#F2C14E" stroke="#C48A1C" stroke-width="4"/>
                <g class="body" fill="#C48A1C"><ellipse cx="50" cy="84" rx="9" ry="7"/><circle cx="38" cy="72" r="4"/><circle cx="46" cy="66" r="4"/><circle cx="54" cy="66" r="4"/><circle cx="62" cy="72" r="4"/></g>
            </svg>
            <div class="badge"><b>∞</b><span></span></div>
            <div class="unlock-text"><h2></h2><p>Its own endless run of boards is waiting in Levels.</p>
                <div class="unlock-actions"><button class="go" data-act="play">Play endless</button><button data-act="stay">Keep going</button></div></div>`;
        veil.querySelector('.badge span').textContent = DIFFICULTY[difficulty];
        veil.querySelector('h2').textContent = `Endless ${DIFFICULTY[difficulty]} unlocked!`;
        document.body.appendChild(veil);
        setTimeout(() => {
            veil.classList.add('open');
            const r = veil.querySelector('.lock').getBoundingClientRect();
            const colours = ['#F2C14E', '#F58BB3', '#7CC36E', '#6EC1F0', '#fff'];
            for (let k = 0; k < 34; k++) {
                const a = (k / 34) * Math.PI * 2, dist = 110 + Math.random() * 110;
                particle(document.body, 'burst', {
                    left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`, background: colours[k % colours.length],
                    '--dx': `${Math.cos(a) * dist}px`, '--dy': `${Math.sin(a) * dist}px`,
                });
            }
        }, 1500);
        veil.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (!act) return;
            veil.remove();
            if (act.dataset.act === 'play') open(difficulty, store.endless[difficulty] || 1);
            closed();
        });
    }

    function clearHint() {
        els.board.querySelectorAll('.hinted, .focus').forEach((c) => c.classList.remove('hinted', 'focus'));
    }

    // --- moves -----------------------------------------------------------------

    const locked = (i) => game.over || game.found.has(i) || game.misses.has(i);

    function remember(snapshot = [...game.marks]) {
        history.push(snapshot);
        if (history.length > UNDO_DEPTH) history.shift();
    }

    const sameMarks = (list) => list.length === game.marks.size && list.every((i) => game.marks.has(i));

    function setMark(i, on) {
        if (locked(i) || game.marks.has(i) === on) return;
        if (on) game.marks.add(i); else game.marks.delete(i);
        els.board.children[i].classList.toggle('marked', on);
    }

    function reveal(i) {
        if (locked(i)) return;
        clearHint();
        game.marks.delete(i);
        const cell = els.board.children[i];
        const bell = game.bell;
        game.bell = false;
        if (board.cats.includes(i)) {
            find(i);
        } else {
            game.misses.add(i);
            cell.classList.add('shake', 'miss');
            cell.addEventListener('animationend', () => cell.classList.remove('shake'), {once: true});
            if (bell) {
                render();
                say('saved');
            } else {
                game.fish--;
                const lost = els.fish.children[game.fish];
                lost.classList.add('swim');
                lost.addEventListener('animationend', () => { lost.classList.remove('swim'); render(); }, {once: true});
                if (game.fish <= 0) { game.over = 'lost'; setTimeout(render, 450); say('lost'); mourn(); finished(); }
                else { say('miss'); renderPowers(); }
            }
        }
        persist();
    }

    function find(i) {
        game.found.add(i);
        render();
        celebrateFind(i);
        if (game.found.size === board.size) win();
        else say('found');
    }

    function win() {
        game.over = 'won';
        let opened = null;
        if (store.mode === 'track') {
            opened = Object.keys(DIFFICULTY).find((d) => unlockAt(d) === game.level && !endlessOpen(d)) || null;
            store.unlocked = Math.max(store.unlocked, game.level + 1);
        }
        render();
        say('won');
        celebrateWin();
        if (opened) {
            let gift = null;
            finished((show) => { gift = show; });
            setTimeout(() => unlockAnimation(opened, () => gift && gift()), 2600);
        } else {
            finished();
        }
    }

    function restart() {
        game = fresh(game.level);
        history = [];
        persist();
        build();
        render();
        say('start');
    }

    /** After every finished game, win or lose: a one-in-seven chance of a gift. */
    /**
     * After every finished game, win or lose: a one-in-seven chance of a gift. The
     * prize is banked at once; the gift shows after `after` (the unlock, if one plays)
     * or once the win or loss animation has had its moment.
     */
    function finished(after) {
        persist();
        if (Math.random() >= DROP_CHANCE) return;
        const key = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
        store.items[key]++;
        save();
        const show = () => window.Gift.show({
            icon: POWERS[key].icon, name: POWERS[key].name,
            target: () => els.powerups.querySelector(`[data-power="${key}"]`),
            done: () => {
                renderPowers();
                const slot = els.powerups.querySelector(`[data-power="${key}"]`);
                if (slot) slot.classList.add('bump');
            },
        });
        if (after) after(show);
        else setTimeout(show, 3000);
    }

    // --- power-ups -------------------------------------------------------------

    function usePower(key) {
        if (!store.items[key] || game.over) return;
        clearHint();
        const used = {catnip: useCatnip, yarn: useYarn, fish: useFish, bell: useBell}[key]();
        if (!used) return;
        store.items[key]--;
        persist();
        if (!game.over) renderPowers();
    }

    function useCatnip() {
        const hidden = board.cats.filter((i) => !game.found.has(i));
        if (!hidden.length) return false;
        const i = hidden[Math.floor(Math.random() * hidden.length)];
        game.marks.delete(i);
        window.Gift.fly(POWERS.catnip.icon, els.powerups.querySelector('[data-power="catnip"]'), els.board.children[i]);
        find(i);
        if (!game.over) say('found', 'The catnip did the trick. Mrrrow!');
        return true;
    }

    function useYarn() {
        const n = board.size, ruled = new Set();
        for (const f of game.found) {
            const near = new Set(E.neighbours(n, f));
            for (let k = 0; k < n * n; k++) {
                if (k === f || locked(k) || game.marks.has(k)) continue;
                if (near.has(k) || Math.floor(k / n) === Math.floor(f / n) || k % n === f % n || board.regions[k] === board.regions[f]) ruled.add(k);
            }
        }
        if (!ruled.size) {
            say('start', game.found.size ? 'Nothing left to tidy. The yarn stays in the pouch.' : 'Find a cat first, then the yarn can tidy around it.');
            return false;
        }
        remember();
        // The marks are real at once; only their appearance is staggered.
        [...ruled].forEach((k, idx) => {
            els.board.children[k].style.setProperty('--mark-delay', `${idx * 25}ms`);
            setMark(k, true);
        });
        setTimeout(() => ruled.forEach((k) => els.board.children[k] && els.board.children[k].style.removeProperty('--mark-delay')), ruled.size * 25 + 300);
        persist();
        render();
        say('start', `The yarn rolled around and marked ${ruled.size} spots.`);
        return true;
    }

    function useFish() {
        if (game.fish >= MAX_FISH) { say('start', 'Your bowl is full already.'); return false; }
        game.fish++;
        render();
        say('start', 'A golden fish! One more life.');
        return true;
    }

    function useBell() {
        if (game.bell) return false;
        game.bell = true;
        say('start', 'Bell on. Your next look is free.');
        return true;
    }

    // --- hint, undo, sheets ------------------------------------------------------

    function showHint() {
        if (game.over) return;
        clearHint();
        const h = E.hint(board, game.found, game.misses, game.marks);
        if (!h) { say('start', 'Everything that can be known is already on the board.'); return; }
        (h.focus || []).forEach((k) => els.board.children[k].classList.add('focus'));
        els.board.children[h.cell].classList.add('hinted');
        say('start', (h.cat ? 'A cat must be here. ' : 'No cat can be here. ') + h.reason);
    }

    function undo() {
        if (!history.length || game.over) return;
        clearHint();
        game.marks = new Set(history.pop());
        persist();
        render();
    }

    function openSheet(html) {
        els.sheetBody.innerHTML = html;
        els.sheet.hidden = false;
    }

    function showLevels() {
        let html = '<h2>Levels</h2><h3>Mode</h3><div class="modes">';
        html += `<button data-mode="track" class="mode ${store.mode === 'track' ? 'on' : ''}"><b>Track</b><span>Level ${store.level}</span></button>`;
        for (const d of Object.keys(DIFFICULTY)) {
            const isOpen = endlessOpen(d);
            html += `<button data-mode="${d}" class="mode endless ${store.mode === d ? 'on' : ''}" ${isOpen ? '' : 'disabled'}>`
                + `<b>${isOpen ? '∞' : '🔒'} ${DIFFICULTY[d]}</b>`
                + `<span>${isOpen ? `Endless #${store.endless[d] || 1}` : `Finish level ${unlockAt(d)}`}</span></button>`;
        }
        html += '</div>';
        let start = 1;
        for (const [difficulty, count] of E.LADDER) {
            if (start > store.unlocked) break;
            const end = count === Infinity ? Math.max(start + E.BAND - 1, store.unlocked + 6) : start + count - 1;
            html += `<h3>${DIFFICULTY[difficulty]} · ${start}–${count === Infinity ? '∞' : end}</h3><div class="level-grid">`;
            for (let l = start; l <= end; l++) {
                const cls = store.mode === 'track' && l === store.level ? 'current' : l < store.unlocked ? 'solved' : '';
                html += `<button data-level="${l}" class="${cls}" ${l > store.unlocked ? 'disabled' : ''}>${l}</button>`;
            }
            html += '</div>';
            start += count;
        }
        openSheet(html);
        const current = els.sheetBody.querySelector('.current') || els.sheetBody.querySelector('.level-grid button:not(:disabled):last-of-type');
        if (current) current.scrollIntoView({block: 'center'});
    }

    function showRules() {
        const powers = POWER_KEYS.map((k) => `<div>${POWERS[k].icon}<p><b>${POWERS[k].name}.</b> ${POWERS[k].what}</p></div>`).join('');
        openSheet(`<h2>How to play</h2>
            <p>Every colour hides exactly one cat. Find them all.</p>
            <ul>
                <li>One cat per colour.</li>
                <li>One cat per row and one per column.</li>
                <li>Cats never touch, not even at the corners.</li>
            </ul>
            <h3>Controls</h3>
            <ul>
                <li>Tap or drag across spots to mark them with an X.</li>
                <li>Double tap a spot to look underneath. An empty spot costs a fish.</li>
                <li>Hint shows the next thing you can know for sure, and why.</li>
                <li>Undo takes back marks; a look stays looked.</li>
            </ul>
            <p>Every board has exactly one answer and can be solved without guessing. Levels get harder as you go.</p>
            <h3>Power-ups</h3>
            <div class="power-list">${powers}</div>
            <p>After every game, won or lost, there is a one-in-seven chance of a gift with a new power-up inside.</p>`);
    }

    // --- input -----------------------------------------------------------------
    //
    // Pointer events, not click/dblclick: a drag has to paint across cells, and the
    // first tap of a double tap must show its X at once. The second tap undoes that
    // X and looks under the spot instead.

    let drag = null;   // {mode, last}
    let lastTap = null; // {i, at, before, moved}

    function cellAt(x, y) {
        const el = document.elementFromPoint(x, y);
        const cell = el && el.closest('.cell');
        return cell && els.board.contains(cell) ? Number(cell.dataset.i) : null;
    }

    els.board.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const i = cellAt(e.clientX, e.clientY);
        if (i === null || game.over) return;
        e.preventDefault();
        clearHint();
        const now = performance.now();
        if (lastTap && lastTap.i === i && !lastTap.moved && now - lastTap.at < DOUBLE_TAP_MS) {
            if (lastTap.recorded) history.pop();
            setMark(i, lastTap.before);
            lastTap = null;
            drag = null;
            reveal(i);
            return;
        }
        const before = game.marks.has(i);
        drag = {mode: !before, last: i, start: [...game.marks]};
        lastTap = {i, at: now, before, moved: false, recorded: false};
        setMark(i, drag.mode);
        els.board.setPointerCapture(e.pointerId);
    });

    els.board.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const i = cellAt(e.clientX, e.clientY);
        if (i === null || i === drag.last) return;
        drag.last = i;
        if (lastTap) lastTap.moved = true;
        setMark(i, drag.mode);
    });

    // Undo only records a gesture that changed something.
    const endDrag = () => {
        if (drag) {
            if (!sameMarks(drag.start)) { remember(drag.start); if (lastTap) lastTap.recorded = true; }
            persist();
            render();
        }
        drag = null;
    };
    els.board.addEventListener('pointerup', endDrag);
    els.board.addEventListener('pointercancel', endDrag);

    // Keyboard: space marks, enter looks.
    els.board.addEventListener('keydown', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell || game.over) return;
        const i = Number(cell.dataset.i);
        if (e.key === ' ' && !locked(i)) { e.preventDefault(); remember(); setMark(i, !game.marks.has(i)); persist(); render(); }
        if (e.key === 'Enter') { e.preventDefault(); reveal(i); }
    });
    // Pointer handling owns taps; a synthesized click must not do anything twice.
    els.board.addEventListener('click', (e) => e.preventDefault());
    els.board.addEventListener('contextmenu', (e) => e.preventDefault());

    els.powerups.addEventListener('click', (e) => {
        const b = e.target.closest('[data-power]');
        if (b && !b.disabled) usePower(b.dataset.power);
    });
    els.levelsBtn.addEventListener('click', showLevels);
    els.hintBtn.addEventListener('click', showHint);
    els.undoBtn.addEventListener('click', undo);
    els.restartBtn.addEventListener('click', restart);
    els.helpBtn.addEventListener('click', showRules);
    els.sheetClose.addEventListener('click', () => { els.sheet.hidden = true; });
    els.sheet.addEventListener('click', (e) => {
        if (e.target === els.sheet) els.sheet.hidden = true;
        const b = e.target.closest('[data-level]');
        if (b && !b.disabled) { els.sheet.hidden = true; open('track', Number(b.dataset.level)); }
        const m = e.target.closest('[data-mode]');
        if (m && !m.disabled) {
            els.sheet.hidden = true;
            const mode = m.dataset.mode;
            open(mode, mode === 'track' ? store.level : store.endless[mode] || 1);
        }
    });

    open(store.mode, store.mode === 'track' ? store.level : store.endless[store.mode] || 1);
})();
