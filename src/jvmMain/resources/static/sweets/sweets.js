/**
 * Sweet Swap page: the level map and the board. Every rule is in `sweets-engine.js`;
 * this file draws its snapshots and turns swipes and taps into `swap` calls.
 *
 * Progress lives in localStorage: the highest level unlocked and the best stars per
 * level. Nothing about a level is stored, because a level is its seed.
 */
(function () {
    'use strict';

    const E = window.SweetsEngine;
    const STORE_KEY = 'sweets.v1';
    const DROP_CHANCE = 1 / 7;
    const HINT_MS = 6000;
    const TYPE_LABEL = {
        score: 'Reach the score', jelly: 'Clear the jelly', orders: 'Fill the order',
        ingredients: 'Drop the cherries', blockers: 'Clear the blockers', timed: 'Beat the clock',
    };
    const TYPE_TAG = {score: 'score', jelly: 'jelly', orders: 'order', ingredients: 'drop', blockers: 'break', timed: 'timed'};
    const CHEERS = ['', '', 'Sweet!', 'Tasty!', 'Delicious!', 'Divine!', 'Sugar-licious!'];

    // --- art ------------------------------------------------------------------

    const COLOURS = ['#F0435A', '#FF9A2E', '#FFCF33', '#4CC86A', '#3FA9F5', '#9B5DE5'];
    const DARK = ['#B8243A', '#D46F10', '#D9A400', '#2E9A4B', '#1C7CC4', '#6D36B8'];
    const SHAPE = [
        (c, d) => `<ellipse cx="20" cy="20" rx="15.5" ry="10.5" transform="rotate(-28 20 20)" fill="${c}" stroke="${d}" stroke-width="1.5"/>`,
        (c, d) => `<rect x="9" y="9" width="22" height="22" rx="6" transform="rotate(45 20 20)" fill="${c}" stroke="${d}" stroke-width="1.5"/>`,
        (c, d) => `<path d="M20 4.5c6 8.5 12.5 13.5 12.5 20.5a12.5 12.5 0 0 1-25 0c0-7 6.5-12 12.5-20.5z" fill="${c}" stroke="${d}" stroke-width="1.5"/>`,
        (c, d) => `<rect x="6" y="6" width="28" height="28" rx="8" fill="${c}" stroke="${d}" stroke-width="1.5"/><rect x="12" y="12" width="16" height="16" rx="4" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`,
        (c, d) => `<circle cx="20" cy="20" r="14.5" fill="${c}" stroke="${d}" stroke-width="1.5"/><circle cx="20" cy="20" r="8" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2.5"/>`,
        (c, d) => `<path d="M20 5l13 7.5v15L20 35 7 27.5v-15z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`,
    ];
    const SHINE = '<ellipse cx="14.5" cy="13" rx="5" ry="3" transform="rotate(-30 14.5 13)" fill="#fff" opacity=".6"/>';

    function candySvg(t) {
        if (t.kind === 'ingredient') {
            return t.look === 1
                ? '<svg viewBox="0 0 40 40"><path d="M20 9c8 0 13 6 13 14s-6 13-13 13S7 31 7 23 12 9 20 9z" fill="#B97A45" stroke="#7B4A22" stroke-width="1.5"/><path d="M9 17c3-6 19-6 22 0-6-3-16-3-22 0z" fill="#7B4A22"/><path d="M20 4v6" stroke="#7B4A22" stroke-width="2.5" stroke-linecap="round"/>' + SHINE + '</svg>'
                : '<svg viewBox="0 0 40 40"><path d="M20 6c0 8-4 12-8 16M20 6c2 8 6 12 9 14" fill="none" stroke="#3C8D2F" stroke-width="2.5" stroke-linecap="round"/><path d="M20 6c4-3 9-2 11 1-4 2-8 2-11-1z" fill="#4CC86A"/><circle cx="12" cy="26" r="8" fill="#E0213F" stroke="#9C1028" stroke-width="1.5"/><circle cx="28" cy="25" r="8" fill="#E0213F" stroke="#9C1028" stroke-width="1.5"/><circle cx="9.5" cy="23.5" r="2.2" fill="#fff" opacity=".7"/><circle cx="25.5" cy="22.5" r="2.2" fill="#fff" opacity=".7"/></svg>';
        }
        if (t.special === 'bomb') {
            const dots = [[13, 14, 0], [24, 11, 3], [28, 22, 4], [17, 26, 5], [23, 29, 2], [11, 21, 1], [20, 18, 3]]
                .map(([x, y, k]) => `<rect x="${x}" y="${y}" width="5" height="2.4" rx="1.2" transform="rotate(${x * 7} ${x} ${y})" fill="${COLOURS[k]}"/>`).join('');
            return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#5B3A29" stroke="#3B2216" stroke-width="1.5"/>${dots}${SHINE}</svg>`;
        }
        const c = COLOURS[t.color], d = DARK[t.color];
        let body = SHAPE[t.color](c, d);
        if (t.special === 'wrap') {
            body = `<path d="M3 13l8 7-8 7zM37 13l-8 7 8 7z" fill="${c}" stroke="${d}" stroke-width="1.5" stroke-linejoin="round"/>`
                + `<g transform="translate(20 20) scale(.78) translate(-20 -20)">${body}</g>`
                + '<rect x="9" y="17.5" width="22" height="5" rx="2.5" fill="#fff" opacity=".8"/>';
        }
        let stripes = '';
        if (t.special === 'h') stripes = [13, 18.5, 24].map((y) => `<rect x="8" y="${y}" width="24" height="3" rx="1.5" fill="#fff" opacity=".85"/>`).join('');
        if (t.special === 'v') stripes = [13, 18.5, 24].map((x) => `<rect x="${x}" y="8" width="3" height="24" rx="1.5" fill="#fff" opacity=".85"/>`).join('');
        const timer = t.timer > 0
            ? `<circle cx="20" cy="20" r="9" fill="#fff" stroke="${t.timer <= 3 ? '#E5304F' : '#5B2A4E'}" stroke-width="2"/><text x="20" y="24.5" text-anchor="middle" font-size="12" font-weight="900" font-family="system-ui" fill="${t.timer <= 3 ? '#E5304F' : '#5B2A4E'}">${t.timer}</text>`
            : '';
        return `<svg viewBox="0 0 40 40">${body}${stripes}${SHINE}${timer}</svg>`;
    }

    function blockerSvg(b) {
        if (b.type === 'chocolate') {
            return '<svg viewBox="0 0 40 40"><rect x="2.5" y="2.5" width="35" height="35" rx="8" fill="#6B4228" stroke="#4A2B17" stroke-width="2"/><rect x="7" y="7" width="11" height="11" rx="2.5" fill="#83553A"/><rect x="22" y="7" width="11" height="11" rx="2.5" fill="#83553A"/><rect x="7" y="22" width="11" height="11" rx="2.5" fill="#83553A"/><rect x="22" y="22" width="11" height="11" rx="2.5" fill="#83553A"/></svg>';
        }
        const fill = ['#FFFFFF', '#FFF1DA', '#FFD7EC'][b.hp - 1] || '#FFD7EC';
        const lines = [...Array(b.hp).keys()].map((k) => `<path d="M7 ${12 + k * 7}q4 3 8 0t9 0 9 0" fill="none" stroke="#E8B9D0" stroke-width="2" stroke-linecap="round"/>`).join('');
        return `<svg viewBox="0 0 40 40"><rect x="2.5" y="2.5" width="35" height="35" rx="9" fill="${fill}" stroke="#E2A9C6" stroke-width="2"/>${lines}<circle cx="11" cy="9" r="2" fill="#fff"/></svg>`;
    }

    const LOCK = '<svg viewBox="0 0 40 40"><path d="M6 6l28 28M34 6L6 34" stroke="#2B1B24" stroke-width="6" stroke-linecap="round" opacity=".85"/><path d="M6 6l28 28M34 6L6 34" stroke="#5A3A4B" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 4"/></svg>';
    const JELLY_ICON = '<svg viewBox="0 0 40 40"><rect x="5" y="9" width="30" height="24" rx="8" fill="#FF8CC8" stroke="#E0569E" stroke-width="2"/><ellipse cx="14" cy="15" rx="5" ry="2.5" fill="#fff" opacity=".7"/></svg>';
    const TARGET_ICON = '<svg viewBox="0 0 40 40"><path d="M20 4l4.7 9.6 10.6 1.5-7.7 7.5 1.8 10.5L20 28l-9.4 5.1 1.8-10.5-7.7-7.5 10.6-1.5z" fill="#FFC93C" stroke="#B88300" stroke-width="1.5" stroke-linejoin="round"/></svg>';

    // Four boosters, a few in the pouch at the start; more drop after a game.
    const BOOSTERS = {
        hammer: {
            name: 'Hammer', what: 'Smash any one candy or blocker.', aim: 'Tap the candy to smash',
            icon: '<svg viewBox="0 0 40 40"><path d="M21 22l12 13" stroke="#E9D5C3" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="16" r="12" fill="#FF7CBF" stroke="#D9468E" stroke-width="1.5"/><path d="M16 16m-7 0a7 7 0 1 1 7 7a4 4 0 1 1 4-4" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
        },
        switch: {
            name: 'Switch', what: 'Swap two neighbours, match or not.', aim: 'Swipe any two neighbours',
            icon: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#9B7BFF" stroke="#6A4BD1" stroke-width="1.5"/><path d="M12 16h14l-4-4M28 24H14l4 4" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        },
        moves: {
            name: '+5 moves', what: 'Five more moves, or fifteen seconds on the clock.',
            icon: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#4CC86A" stroke="#2E9A4B" stroke-width="1.5"/><text x="20" y="26" text-anchor="middle" font-size="16" font-weight="900" font-family="system-ui" fill="#fff">+5</text></svg>',
        },
        bomb: {
            name: 'Colour bomb', what: 'Drops a colour bomb onto the board.',
            icon: null, // drawn from the candy art below
        },
    };
    const BOOSTER_KEYS = Object.keys(BOOSTERS);

    function orderIcon(o) {
        if (o.kind === 'color') return candySvg({kind: 'candy', color: o.color});
        if (o.kind === 'stripe') return candySvg({kind: 'candy', color: 4, special: 'h'});
        if (o.kind === 'wrap') return candySvg({kind: 'candy', color: 5, special: 'wrap'});
        if (o.kind === 'bomb') return candySvg({kind: 'candy', special: 'bomb'});
        return blockerSvg({type: 'frosting', hp: 1});
    }

    // --- dom ------------------------------------------------------------------

    const $ = (id) => document.getElementById(id);
    const els = {
        map: $('map'), play: $('play'), levels: $('levels'),
        typeLabel: $('type-label'), lvlNum: $('lvl-num'), counter: $('counter'), counterLabel: $('counter-label'), counterBox: $('counter-box'),
        scoreFill: $('score-fill'), score: $('score'), stars: [...document.querySelectorAll('.scorebar .star')],
        goals: $('goals'), wrap: $('boardwrap'), board: $('board'), fx: $('fx'), banner: $('banner'),
        sugarFill: $('sugar-fill'), sugarMeter: $('sugar-meter'), boosters: $('boosters'), tip: $('tip'),
        mapBtn: $('map-btn'), restartBtn: $('restart-btn'), helpBtn: $('help-btn'),
        sheet: $('sheet'), sheetBody: $('sheet-body'), sheetClose: $('sheet-close'),
        overlay: $('overlay'), ovTitle: $('ov-title'), ovStars: $('ov-stars'), ovText: $('ov-text'), ovGoals: $('ov-goals'), ovActions: $('ov-actions'),
    };

    // --- progress ---------------------------------------------------------------

    const START_ITEMS = {hammer: 2, switch: 1, moves: 1, bomb: 1};

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            if (saved && saved.unlocked >= 1) return {unlocked: saved.unlocked, stars: saved.stars || {}, items: {...START_ITEMS, ...(saved.items || {})}};
        } catch (_) { /* private mode or junk */ }
        return {unlocked: 1, stars: {}, items: {...START_ITEMS}};
    }
    const store = load();
    function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* no storage */ } }

    // --- map --------------------------------------------------------------------

    function showMap() {
        gen++;
        clearTimeout(bakeTimer);
        setBusy(false);
        stopClock();
        clearTimeout(hintTimer);
        const fromPlay = !els.play.hidden;
        els.play.hidden = true;
        els.map.hidden = false;
        // Coming from a level, the map slides up from the bottom.
        if (fromPlay) {
            els.map.classList.remove('slide-in');
            void els.map.offsetWidth;
            els.map.classList.add('slide-in');
        }
        const last = store.unlocked + 9;
        els.levels.innerHTML = '';
        for (let n = last; n >= 1; n--) {
            const b = document.createElement('button');
            b.className = 'level-btn';
            b.textContent = n;
            const stars = store.stars[n] || 0;
            if (n > store.unlocked) b.disabled = true;
            else {
                if (stars) b.classList.add('done');
                if (n === store.unlocked) b.classList.add('current');
                b.addEventListener('click', () => openLevel(n));
            }
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = n <= store.unlocked ? TYPE_TAG[E.design(n, 0).type] : 'locked';
            b.appendChild(tag);
            if (stars) {
                const s = document.createElement('span');
                s.className = 'stars';
                s.textContent = '★'.repeat(stars);
                b.appendChild(s);
            }
            els.levels.appendChild(b);
        }
        const current = els.levels.querySelector('.current');
        if (current) current.scrollIntoView({block: 'center'});
    }

    // --- play -------------------------------------------------------------------

    // `rolled`: this attempt already had its gift roll (continuing must not roll again).
    let L = null, state = null, cell = 40, busy = false, picked = null, aim = null, rolled = false;
    // Bumped whenever the board is replaced; anything async from the old one stops.
    let gen = 0, bakeTimer = null;
    // Mirrored on <body> so a test (or a stylesheet) can see when the board is animating.
    function setBusy(on) { busy = on; document.body.classList.toggle('busy', on); }
    const tiles = new Map();
    const bgs = [], decos = [];

    /** Opens level n; `flipIn` (a restart) flips the fresh candies in instead of popping them. */
    function openLevel(n, flipIn = false) {
        els.map.hidden = true;
        els.play.hidden = false;
        els.overlay.hidden = true;
        if (!flipIn) els.board.innerHTML = '<p class="tip" style="padding-top:40%">Baking the level…</p>';
        els.goals.innerHTML = '';
        // Let the page paint first; the bot calibrating a new level takes a moment.
        gen++;
        state = null;
        setBusy(false);
        stopClock();
        clearTimeout(bakeTimer);
        clearTimeout(hintTimer);
        bakeTimer = setTimeout(() => {
            L = E.level(n);
            state = E.start(L);
            rolled = false;
            buildBoard();
            render(E.snapshot(state), {instant: true});
            if (flipIn) {
                tiles.forEach((el) => {
                    const m = el.style.transform.match(/-?[\d.]+/g);
                    el.style.setProperty('--flip', `${(Math.round(Number(m[0]) / cell) + Math.round(Number(m[1]) / cell)) * 28}ms`);
                    el.classList.add('flip-in');
                    setTimeout(() => el.classList.remove('flip-in'), 320 + (L.w + L.h) * 28);
                });
            }
            els.typeLabel.textContent = TYPE_LABEL[L.type];
            els.lvlNum.textContent = `Level ${n}`;
            els.counterLabel.textContent = L.type === 'timed' ? 'Time' : 'Moves';
            setAim(null);
            if (L.type === 'timed') startClock(L.time);
            scheduleHint();
        }, 30);
    }

    function buildBoard() {
        const max = Math.min(window.innerWidth - 32, 480);
        cell = Math.floor(max / L.w);
        els.board.innerHTML = '';
        els.fx.innerHTML = '';
        els.wrap.style.setProperty('--cell', `${cell}px`);
        els.board.style.width = `${cell * L.w}px`;
        els.board.style.height = `${cell * L.h + 10}px`;
        tiles.clear();
        bgs.length = 0;
        decos.length = 0;
        state.cells.forEach((c, i) => {
            if (c.hole) { bgs.push(null); decos.push(null); return; }
            const bg = document.createElement('div');
            bg.className = 'bg';
            bg.style.transform = `translate(${x(i)}px, ${y(i)}px) scale(.94)`;
            els.board.appendChild(bg);
            bgs.push(bg);
            const deco = document.createElement('div');
            deco.className = 'deco';
            deco.style.transform = `translate(${x(i)}px, ${y(i)}px)`;
            els.board.appendChild(deco);
            decos.push(deco);
        });
    }

    const x = (i) => (i % L.w) * cell;
    const y = (i) => Math.floor(i / L.w) * cell;
    const place = (el, px, py) => { el.style.transform = `translate(${px}px, ${py}px)`; };

    /** Moves the board to a snapshot: tiles found by id slide, new ones appear, gone ones pop. */
    function render(snap, opt = {}) {
        const seen = new Set();
        const spawn = new Map((opt.spawned || []).map((s) => [s.id, s]));
        let longest = 0;
        snap.cells.forEach((c, i) => {
            if (!c) return;
            bgs[i].className = 'bg' + (c.jelly ? ` jelly${c.jelly}` : '') + (c.exit ? ' exit' : '');
            const decoKey = c.blocker ? `${c.blocker.type}${c.blocker.hp}` : c.lock ? 'lock' : '';
            if (decos[i].dataset.key !== decoKey) {
                if (decos[i].dataset.key && decoKey !== '') decos[i].classList.add('hit');
                decos[i].dataset.key = decoKey;
                decos[i].innerHTML = c.blocker ? blockerSvg(c.blocker) : c.lock ? LOCK : '';
                setTimeout(() => decos[i] && decos[i].classList.remove('hit'), 320);
            }
            if (!c.tile) return;
            const t = c.tile;
            seen.add(t.id);
            const look = `${t.kind}${t.color}${t.special}${t.timer}${t.look}`;
            let el = tiles.get(t.id);
            if (!el) {
                el = document.createElement('div');
                el.className = 'tile';
                el.innerHTML = candySvg(t);
                el.dataset.look = look;
                const s = spawn.get(t.id);
                el.style.transitionDuration = '0s';
                place(el, x(i), s ? -s.depth * cell : y(i));
                if (!s && !opt.instant) el.classList.add('born');
                els.board.appendChild(el);
                tiles.set(t.id, el);
                el.getBoundingClientRect();
            } else if (el.dataset.look !== look) {
                el.innerHTML = candySvg(t);
                el.dataset.look = look;
                el.classList.add('born');
            }
            el.classList.toggle('special-glow', !!t.special);
            const now = el.style.transform.match(/-?[\d.]+/g);
            const fromY = now ? Number(now[1]) : y(i);
            const dist = Math.abs(y(i) - fromY) / cell + Math.abs(x(i) - (now ? Number(now[0]) : x(i))) / cell;
            const ms = opt.instant ? 0 : opt.fall ? 90 + dist * 55 : opt.slow ? 380 : 180;
            longest = Math.max(longest, ms);
            el.style.transitionDuration = `${ms}ms`;
            place(el, x(i), y(i));
        });
        for (const [id, el] of tiles) {
            if (seen.has(id)) continue;
            tiles.delete(id);
            el.classList.remove('special-glow', 'pick', 'hint');
            el.classList.add('pop');
            el.style.transform += ' scale(0.2)';
            setTimeout(() => el.remove(), 240);
        }
        hud(snap);
        return longest;
    }

    function hud(snap) {
        els.counter.textContent = L.type === 'timed' ? formatTime(clockLeft) : snap.moves;
        els.counterBox.classList.toggle('low', L.type === 'timed' ? clockLeft <= 10 : snap.moves <= 3);
        els.score.textContent = snap.score.toLocaleString();
        const top = L.stars[2] || 1;
        els.scoreFill.style.width = `${Math.min(100, (snap.score / top) * 100)}%`;
        els.stars.forEach((star, k) => {
            const at = Math.min(100, ((L.stars[k] || 0) / top) * 100);
            star.style.left = `${Math.max(6, Math.min(96, at))}%`;
            star.classList.toggle('lit', snap.score >= L.stars[k] && (k > 0 || E.goalMet(state)));
        });
        els.sugarFill.style.width = `${(snap.sugar / E.SUGAR_MAX) * 100}%`;
        els.sugarMeter.classList.toggle('full', snap.sugar / E.SUGAR_MAX > 0.85);
        renderGoals(els.goals, snap);
    }

    function goalChips(snap) {
        const g = L.goal;
        const chip = (icon, value, done) => ({icon, value, done});
        switch (L.type) {
            case 'score':
            case 'timed': return [chip(TARGET_ICON, g.score.toLocaleString(), snap.score >= g.score)];
            case 'jelly': {
                const left = snap.cells.reduce((n, c) => n + (c ? c.jelly : 0), 0);
                return [chip(JELLY_ICON, left, left === 0)];
            }
            case 'ingredients': {
                const left = Math.max(0, g.ingredients - snap.progress.ingredients);
                return [chip(candySvg({kind: 'ingredient', look: 0}), left, left === 0)];
            }
            case 'blockers': {
                const left = snap.cells.reduce((n, c) => n + (c && c.blocker ? (c.blocker.type === 'frosting' ? c.blocker.hp : 1) : 0), 0);
                const choc = snap.cells.some((c) => c && c.blocker && c.blocker.type === 'chocolate');
                return [chip(blockerSvg({type: choc ? 'chocolate' : 'frosting', hp: 1}), left, left === 0)];
            }
            case 'orders': return g.orders.map((o) => {
                const done = o.kind === 'color' ? snap.progress.colors[o.color] : snap.progress[o.kind];
                const left = Math.max(0, o.need - done);
                return chip(orderIcon(o), left, left === 0);
            });
        }
        return [];
    }

    function renderGoals(box, snap) {
        const chips = goalChips(snap);
        const key = chips.map((c) => `${c.value}${c.done}`).join('|');
        if (box.dataset.key === key) return;
        const before = box.dataset.key;
        box.dataset.key = key;
        box.innerHTML = '';
        chips.forEach((c) => {
            const el = document.createElement('span');
            el.className = 'goal' + (c.done ? ' done' : '') + (before ? ' bump' : '');
            el.innerHTML = c.icon + `<span>${c.done ? '✓' : c.value}</span>`;
            box.appendChild(el);
        });
    }

    // --- effects ----------------------------------------------------------------

    function fxAt(cls, left, top, w, h) {
        const el = document.createElement('div');
        el.className = cls;
        Object.assign(el.style, {left: `${left}px`, top: `${top}px`, width: w ? `${w}px` : '', height: h ? `${h}px` : ''});
        els.fx.appendChild(el);
        // Only its own animation: a child's animationend bubbles up too.
        const done = (e) => { if (e.target === el) { el.removeEventListener('animationend', done); el.remove(); } };
        el.addEventListener('animationend', done);
        return el;
    }

    /** Sparkles flying out of a cell's centre. */
    function sparkle(i, count = 8, spread = 1) {
        const colours = ['#FFE27A', '#FF8DC8', '#9B7BFF', '#7FE0A0', '#fff'];
        for (let k = 0; k < count; k++) {
            const a = (k / count) * Math.PI * 2 + Math.random() * .4, d = cell * (0.6 + Math.random() * 0.6) * spread;
            const s = fxAt('spark', x(i) + cell / 2 - 5, y(i) + cell / 2 - 5, 10, 10);
            s.style.background = colours[k % colours.length];
            s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
            s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
        }
    }

    // --- booster moments ----------------------------------------------------------
    //
    // Loud on purpose: a booster is a treat, so it gets the whole screen.

    const SHARD_COLOURS = ['#F0435A', '#FF9A2E', '#FFCF33', '#4CC86A', '#3FA9F5', '#9B5DE5', '#FF8DC8', '#fff'];

    const centre = (i) => [x(i) + cell / 2, y(i) + cell / 2];

    /** Shakes the whole play screen; strength s, m or l. */
    function shake(strength) {
        els.play.classList.remove('shake-s', 'shake-m', 'shake-l');
        void els.play.offsetWidth;
        els.play.classList.add(`shake-${strength}`);
        setTimeout(() => els.play.classList.remove(`shake-${strength}`), 700);
    }

    /** A full-screen flash of colour. */
    function flash(colour) {
        const f = document.createElement('div');
        f.className = 'flash';
        f.style.background = colour;
        document.body.appendChild(f);
        f.addEventListener('animationend', () => f.remove(), {once: true});
    }

    /** A comic-book starburst with a word on it. */
    function comic(text, px, py, colour = '#FF5FAE') {
        // Kept inside the board so a burst near an edge is not cut off.
        const half = 100, w = L.w * cell, h = L.h * cell;
        const el = fxAt('comic', Math.min(Math.max(px, half), w - half), Math.min(Math.max(py, 70), h - 70));
        el.style.setProperty('--ink', colour);
        el.innerHTML = '<i></i><b></b>';
        el.querySelector('b').textContent = text;
    }

    /** Candy shards that fly out and tumble down. */
    function shards(px, py, count, reach = 3) {
        for (let k = 0; k < count; k++) {
            const a = Math.random() * Math.PI * 2, d = cell * (0.8 + Math.random() * reach);
            const s = fxAt('shard', px - 6, py - 6, 12, 12);
            s.style.background = SHARD_COLOURS[k % SHARD_COLOURS.length];
            s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
            s.style.setProperty('--dy', `${Math.sin(a) * d - cell}px`);
            s.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`);
            s.style.animationDelay = `${Math.random() * 60}ms`;
        }
    }

    function shockwave(px, py, size, delay = 0) {
        const w = fxAt('shock', px - size / 2, py - size / 2, size, size);
        w.style.animationDelay = `${delay}ms`;
    }

    /** Sparkles flying out of a cell's centre. */
    function sparkle(i, count = 8, spread = 1) {
        const [cx, cy] = centre(i);
        for (let k = 0; k < count; k++) {
            const a = (k / count) * Math.PI * 2 + Math.random() * .4, d = cell * (0.8 + Math.random() * 0.9) * spread;
            const s = fxAt('spark', cx - 7, cy - 7, 14, 14);
            s.style.background = SHARD_COLOURS[k % SHARD_COLOURS.length];
            s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
            s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
        }
    }

    /** A giant lollipop swings in from off the board and smashes the cell. */
    async function hammerSwing(i) {
        const [cx, cy] = centre(i);
        const size = cell * 3.2;
        // The head sits at the top left of the icon; the pivot is the stick's end.
        const h = fxAt('hammer-fx', cx - size * 0.38, cy - size * 0.38, size, size);
        h.innerHTML = BOOSTERS.hammer.icon;
        await sleep(380);
        flash('rgba(255,255,255,.85)');
        shake('l');
        shockwave(cx, cy, cell * 5);
        shockwave(cx, cy, cell * 3, 90);
        shards(cx, cy, 26);
        comic('SMASH!', cx, cy - cell * 0.6, '#FF5FAE');
        await sleep(260);
    }

    /** Both candies lift, spin around each other, and a rainbow trail follows. */
    function switchTrail(a, b, ids) {
        ids.forEach((id) => {
            const el = tiles.get(id);
            if (!el) return;
            el.classList.add('lift');
            setTimeout(() => el.classList.remove('lift'), 750);
        });
        const [ax, ay] = centre(a), [bx, by] = centre(b);
        for (let k = 0; k <= 10; k++) {
            const t = k / 10;
            const s = fxAt('trail', ax + (bx - ax) * t - 10, ay + (by - ay) * t - 10 - Math.sin(t * Math.PI) * cell * 0.9, 20, 20);
            s.style.background = `radial-gradient(#fff, ${SHARD_COLOURS[k % 6]} 55%, transparent 70%)`;
            s.style.animationDelay = `${k * 30}ms`;
        }
        [a, b].forEach((i) => { fxAt('swirl', x(i) - cell * 0.4, y(i) - cell * 0.4, cell * 1.8, cell * 1.8); sparkle(i, 12, 1.3); });
        comic('SWITCH!', (ax + bx) / 2, (ay + by) / 2 - cell * 1.1, '#9B7BFF');
        shake('s');
    }

    /** A colour bomb plunges from the top of the screen and lands with a boom. */
    async function bombDrop(i) {
        const [cx, cy] = centre(i);
        const size = cell * 1.6;
        const b = fxAt('bomb-drop', cx - size / 2, cy - size / 2, size, size);
        b.innerHTML = candySvg({kind: 'candy', special: 'bomb'});
        b.style.setProperty('--fall', `${-(cy + els.wrap.getBoundingClientRect().top + size)}px`);
        // a trail of sparks behind it on the way down
        for (let k = 0; k < 8; k++) {
            const t = fxAt('trail', cx - 10, cy - 10 - (8 - k) * cell * 0.5, 20, 20);
            t.style.animationDelay = `${120 + k * 45}ms`;
        }
        await sleep(560);
        flash('rgba(255,236,150,.8)');
        shake('l');
        shockwave(cx, cy, cell * 6);
        shockwave(cx, cy, cell * 3.5, 120);
        shards(cx, cy, 34, 3.5);
        comic('BOOM!', cx, cy - cell * 0.6, '#5B3A29');
        await sleep(300);
    }

    /** A huge "+5" bursts out of the board and rockets into the moves counter. */
    async function movesFly(from) {
        const r = els.board.getBoundingClientRect();
        const big = document.createElement('div');
        big.className = 'plus-five';
        big.textContent = L.type === 'timed' ? '+15s' : '+5';
        Object.assign(big.style, {left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`});
        document.body.appendChild(big);
        flash('rgba(120,230,150,.55)');
        await sleep(650);
        const target = els.counterBox.getBoundingClientRect();
        big.classList.add('go');
        big.style.left = `${target.left + target.width / 2}px`;
        big.style.top = `${target.top + target.height / 2}px`;
        await sleep(450);
        big.remove();
        els.counterBox.classList.remove('bump');
        void els.counterBox.offsetWidth;
        els.counterBox.classList.add('bump');
        for (let k = 0; k < 18; k++) {
            const s = document.createElement('div');
            s.className = 'page-spark';
            const a = (k / 18) * Math.PI * 2, d = 50 + Math.random() * 40;
            Object.assign(s.style, {left: `${target.left + target.width / 2}px`, top: `${target.top + target.height / 2}px`, background: SHARD_COLOURS[k % SHARD_COLOURS.length]});
            s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
            s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
            document.body.appendChild(s);
            s.addEventListener('animationend', () => s.remove(), {once: true});
        }
        shake('s');
        void from;
    }

    function thud() {
        els.board.classList.remove('thud');
        void els.board.offsetWidth;
        els.board.classList.add('thud');
    }

    function playFx(fx) {
        if (!fx || !fx.length) return;
        if (fx.length >= 2 || fx.some((f) => f.kind === 'bomb' || (f.r || 0) >= 2)) { shake('m'); flash('rgba(255,255,255,.45)'); }
        for (const f of fx) {
            const [cx, cy] = centre(f.i);
            if (f.kind === 'line') {
                const thick = f.wide ? cell * 3 : cell * 0.9;
                if (f.dir === 'h') fxAt('beam', -cell, cy - thick / 2, (L.w + 2) * cell, thick);
                else fxAt('beam v', cx - thick / 2, -cell, thick, (L.h + 2) * cell);
                sparkle(f.i, 10, 1.5);
            } else if (f.kind === 'blast') {
                const r = ((f.r || 0) * 2 + 1) * cell;
                shockwave(cx, cy, r * 1.6);
                fxAt('ring', cx - r / 2, cy - r / 2, r, r);
                shards(cx, cy, 14 + (f.r || 0) * 10, 1.5 + (f.r || 0));
            } else if (f.kind === 'smash') {
                fxAt('ring', cx - cell / 2, cy - cell / 2, cell, cell);
            } else if (f.kind === 'bomb') {
                flash('rgba(255,243,154,.6)');
                // Lightning from the bomb to everything it takes.
                (f.targets || []).slice(0, 45).forEach((k, n) => {
                    const [tx, ty] = centre(k);
                    const dx = tx - cx, dy = ty - cy, len = Math.hypot(dx, dy);
                    if (len > 1) {
                        const bolt = fxAt('bolt', cx, cy - 4, len, 8);
                        bolt.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
                        bolt.style.animationDelay = `${n * 14}ms`;
                    }
                    fxAt('zap', x(k) - cell * 0.25, y(k) - cell * 0.25, cell * 1.5, cell * 1.5).style.animationDelay = `${n * 14 + 90}ms`;
                });
                comic('ZAP!', cx, cy - cell * 0.8, '#3FA9F5');
            }
        }
    }

    function popup(text, i) {
        const el = fxAt('popup', x(i) + cell / 2, y(i));
        el.textContent = text;
    }

    function banner(text) {
        els.banner.textContent = text;
        els.banner.classList.remove('show');
        void els.banner.offsetWidth;
        els.banner.classList.add('show');
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /** Plays events in order; false if the board was replaced part way. */
    async function play(events) {
        const mine = gen;
        let lastScore = null;
        for (const ev of events || []) {
            if (mine !== gen) return false;
            if (lastScore === null) lastScore = ev.snap.score;
            if (ev.t === 'swap') { await sleep(render(ev.snap) + 10); continue; }
            if (ev.t === 'clear') {
                playFx(ev.fx);
                if (ev.cascade >= 2) banner(CHEERS[Math.min(ev.cascade, CHEERS.length - 1)]);
                const gained = ev.snap.score - lastScore;
                if (gained > 0 && ev.hits.length) popup(`+${gained}`, ev.hits[Math.floor(ev.hits.length / 2)]);
                render(ev.snap);
                await sleep(ev.fx && ev.fx.length ? 300 : 230);
            } else if (ev.t === 'fall') {
                await sleep(render(ev.snap, {fall: true, spawned: ev.spawned}) + 20);
            } else if (ev.t === 'shuffle') {
                banner('Shuffle!');
                await sleep(render(ev.snap, {slow: true}) + 100);
            } else if (ev.t === 'sugar') {
                render(ev.snap);
                if (!ev.bonus) banner('Sugar Rush!');
                fxAt('ring', x(ev.i), y(ev.i), cell, cell);
                await sleep(ev.bonus ? 110 : 500);
            } else if (ev.t === 'collect') {
                ev.cells.forEach((i) => popup('+1000', i));
                render(ev.snap);
                await sleep(300);
            } else {
                render(ev.snap);
                await sleep(ev.t === 'spread' ? 280 : 120);
            }
            lastScore = ev.snap.score;
        }
        return mine === gen;
    }

    // --- turns ------------------------------------------------------------------

    async function trySwap(a, b) {
        if (busy || !state || state.over) return;
        const free = aim === 'switch';
        const ids = [a, b].map((i) => state.cells[i].tile && state.cells[i].tile.id);
        const result = free ? E.freeSwitch(state, a, b) : E.swap(state, a, b);
        if (!result) return;
        if (free) spend('switch');
        setBusy(true);
        clearPick();
        clearTimeout(hintTimer);
        if (free) switchTrail(a, b, ids);
        if (!(await play(result.events))) return;
        setBusy(false);
        await afterTurn();
    }

    async function trySmash(i) {
        if (busy || !state || state.over) return;
        const result = E.smash(state, i);
        if (!result) return;
        spend('hammer');
        setBusy(true);
        const mine = gen;
        await hammerSwing(i);
        if (mine !== gen) return;
        if (!(await play(result.events))) return;
        setBusy(false);
        await afterTurn();
    }

    async function afterTurn() {
        if (state.over === 'won') return win();
        if (state.over === 'lost') return lose();
        if (pendingTimeUp) { pendingTimeUp = false; E.timeUp(state); return state.over === 'won' ? win() : lose(); }
        scheduleHint();
    }

    async function win() {
        stopClock();
        setBusy(true);
        banner('Sugar Crush!');
        const mine = gen;
        await sleep(900);
        if (mine !== gen) return;
        if (!(await play(E.bonus(state)))) return;
        setBusy(false);
        const stars = L.stars.filter((s, k) => k === 0 || state.score >= s).length;
        store.stars[L.n] = Math.max(store.stars[L.n] || 0, stars);
        store.unlocked = Math.max(store.unlocked, L.n + 1);
        save();
        renderBoosters();
        maybeGift();
        overlay({
            title: ['Sweet!', 'Tasty!', 'Delicious!'][stars - 1] || 'Sweet!', stars,
            text: `${state.score.toLocaleString()} points`,
            actions: [['Map', showMap], ['Next level', () => openLevel(L.n + 1), true]],
        });
    }

    function lose() {
        stopClock();
        // The board quakes and every candy sags, then the card lands.
        els.board.classList.remove('quake');
        void els.board.offsetWidth;
        els.board.classList.add('quake');
        setTimeout(() => els.board.classList.remove('quake'), 2600);
        banner(['Oh no!', 'Sticky situation!', 'Sugar crash!'][Math.floor(Math.random() * 3)]);
        renderBoosters();
        maybeGift();
        const why = {bomb: 'A candy bomb went off!', time: 'The clock ran out.', moves: 'Out of moves.', stuck: 'No moves left on the board.'}[state.reason] || 'Out of moves.';
        const actions = [['Map', showMap], ['Try again', () => openLevel(L.n), !store.items.moves]];
        // Out of moves with a +5 in the pouch: keep playing, like the originals offer.
        if (state.reason === 'moves' && store.items.moves > 0) actions.push(['+5 moves', keepPlaying, true]);
        setTimeout(() => {
            if (state && state.over === 'lost') overlay({title: 'So close!', text: why, goals: true, actions});
        }, 1300);
    }

    async function keepPlaying() {
        state.over = null;
        state.reason = null;
        const result = E.extraMoves(state);
        spend('moves');
        setBusy(true);
        await movesFly(els.boosters.querySelector('[data-booster="moves"]'));
        banner('+5 moves!');
        if (!(await play(result.events))) return;
        setBusy(false);
        await afterTurn();
    }

    function overlay({title, stars, text, goals, actions}) {
        els.ovTitle.textContent = title;
        els.ovStars.innerHTML = stars === undefined ? '' : [0, 1, 2].map((k) => `<span class="${k < stars ? 'lit' : ''}" style="animation-delay:${k * 150}ms">★</span>`).join('');
        els.ovText.textContent = text;
        els.ovGoals.innerHTML = '';
        els.ovGoals.dataset.key = '';
        if (goals) renderGoals(els.ovGoals, E.snapshot(state));
        els.ovActions.innerHTML = '';
        for (const [label, fn, primary] of actions) {
            const b = document.createElement('button');
            b.className = 'btn' + (primary ? ' go' : '');
            b.textContent = label;
            b.addEventListener('click', () => { els.overlay.hidden = true; fn(); });
            els.ovActions.appendChild(b);
        }
        els.overlay.hidden = false;
    }

    // --- clock (timed levels) ----------------------------------------------------

    let clockLeft = 0, clockTimer = null, pendingTimeUp = false;

    function startClock(seconds) {
        stopClock();
        clockLeft = seconds;
        pendingTimeUp = false;
        els.counter.textContent = formatTime(clockLeft);
        clockTimer = setInterval(() => {
            if (document.hidden || !els.overlay.hidden) return;
            clockLeft = Math.max(0, clockLeft - 1);
            els.counter.textContent = formatTime(clockLeft);
            els.counterBox.classList.toggle('low', clockLeft <= 10);
            if (clockLeft > 0) return;
            stopClock();
            // Never cut a cascade short: the turn in flight finishes first.
            if (busy) pendingTimeUp = true;
            else { E.timeUp(state); state.over === 'won' ? win() : lose(); }
        }, 1000);
    }

    function stopClock() { clearInterval(clockTimer); clockTimer = null; }
    const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    // --- boosters --------------------------------------------------------------

    function renderBoosters() {
        els.boosters.innerHTML = '';
        for (const key of BOOSTER_KEYS) {
            const bo = BOOSTERS[key];
            const b = document.createElement('button');
            b.className = 'booster';
            b.dataset.booster = key;
            b.setAttribute('aria-pressed', String(aim === key));
            b.disabled = !store.items[key] || !state || !!state.over;
            b.setAttribute('aria-label', `${bo.name}: ${bo.what} You have ${store.items[key]}.`);
            b.innerHTML = `${boosterIcon(key)}<span>${bo.name}</span><b>${store.items[key]}</b>`;
            els.boosters.appendChild(b);
        }
    }

    const boosterIcon = (key) => BOOSTERS[key].icon || candySvg({kind: 'candy', special: 'bomb'});

    function setAim(kind) {
        aim = kind && store.items[kind] ? kind : null;
        clearPick();
        els.tip.classList.toggle('aim', !!aim);
        els.wrap.classList.toggle('aim-hammer', aim === 'hammer');
        els.wrap.classList.toggle('aim-switch', aim === 'switch');
        els.tip.textContent = aim ? BOOSTERS[aim].aim : 'Swipe or tap two neighbours to swap them';
        renderBoosters();
    }

    function spend(key) {
        store.items[key]--;
        save();
        setAim(null);
    }

    async function useBooster(key) {
        if (busy || !state || state.over || !store.items[key]) return;
        if (key === 'hammer' || key === 'switch') { setAim(aim === key ? null : key); return; }
        let result = null;
        if (key === 'moves') {
            if (L.type === 'timed') {
                clockLeft += 15;
                els.counter.textContent = formatTime(clockLeft);
                result = {events: []};
            } else result = E.extraMoves(state);
        } else result = E.plantBomb(state);
        if (!result) return;
        const button = els.boosters.querySelector(`[data-booster="${key}"]`);
        spend(key);
        setBusy(true);
        const mine = gen;
        if (key === 'moves') {
            await movesFly(button);
            banner(L.type === 'timed' ? '+15 seconds!' : '+5 moves!');
        } else {
            const ev = result.events.find((e) => e.t === 'sugar');
            if (ev) await bombDrop(ev.i);
        }
        if (mine !== gen) return;
        if (!(await play(result.events))) return;
        setBusy(false);
        await afterTurn();
    }

    /** After every finished game, win or lose: a one-in-seven chance of a gift. */
    function maybeGift() {
        if (rolled) return;
        rolled = true;
        if (Math.random() >= DROP_CHANCE) return;
        const key = BOOSTER_KEYS[Math.floor(Math.random() * BOOSTER_KEYS.length)];
        store.items[key]++;
        save();
        setTimeout(() => window.Gift.show({
            icon: boosterIcon(key), name: BOOSTERS[key].name,
            target: () => (els.overlay.hidden ? els.boosters.querySelector(`[data-booster="${key}"]`) : els.ovActions),
            done: () => renderBoosters(),
        }), 700);
    }

    // --- sheets -----------------------------------------------------------------

    function closeSheet() {
        if (els.sheet.hidden || els.sheet.classList.contains('closing')) return;
        els.sheet.classList.add('closing');
        setTimeout(() => { els.sheet.hidden = true; els.sheet.classList.remove('closing'); }, 280);
    }

    /** Every candy flips over in a diagonal wave, then the level starts again. */
    async function flipRestart() {
        if (!L || busy) return;
        setBusy(true);
        const mine = gen;
        const tilesNow = [...tiles.values()];
        tilesNow.forEach((el) => {
            const m = el.style.transform.match(/-?[\d.]+/g);
            const col = m ? Math.round(Number(m[0]) / cell) : 0, row = m ? Math.round(Number(m[1]) / cell) : 0;
            el.style.setProperty('--flip', `${(row + col) * 28}ms`);
            el.classList.add('flip-out');
        });
        await sleep(260 + (L.w + L.h) * 28);
        if (mine !== gen) return;
        setBusy(false);
        openLevel(L.n, true);
    }

    function showRules() {
        const boosters = BOOSTER_KEYS.map((k) => `<div>${boosterIcon(k)}<p><b>${BOOSTERS[k].name}:</b> ${BOOSTERS[k].what}</p></div>`).join('');
        const specials = [
            [candySvg({kind: 'candy', color: 4, special: 'h'}), '4 in a row: striped, clears a line'],
            [candySvg({kind: 'candy', color: 5, special: 'wrap'}), 'L or T: wrapped, blasts around it'],
            [candySvg({kind: 'candy', special: 'bomb'}), '5 in a row: colour bomb, clears a colour'],
        ].map(([icon, text]) => `<div>${icon}<p>${text}</p></div>`).join('');
        els.sheetBody.innerHTML = `<h2>How to play</h2>
            <p>Swap neighbours to match three or more. Swap two specials for a bigger blast.</p>
            <div class="list">${specials}</div>
            <h3>Boosters</h3><div class="list">${boosters}</div>`;
        els.sheet.classList.remove('closing');
        els.sheet.hidden = false;
    }

    // --- hints, input -----------------------------------------------------------

    let hintTimer = null;
    function scheduleHint() {
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => { showHint(); scheduleHint(); }, HINT_MS);
    }

    function showHint() {
        if (busy || !state || state.over) return;
        const moves = E.validMoves(state);
        if (!moves.length) return;
        const [a, b] = moves[Math.floor(Math.random() * moves.length)];
        for (const i of [a, b]) {
            const t = state.cells[i].tile;
            const el = t && tiles.get(t.id);
            if (el) { el.classList.remove('hint'); void el.offsetWidth; el.classList.add('hint'); }
        }
    }

    function clearPick() {
        if (picked !== null) {
            const t = state.cells[picked].tile;
            const el = t && tiles.get(t.id);
            if (el) el.classList.remove('pick');
        }
        picked = null;
    }

    function cellAt(e) {
        const r = els.board.getBoundingClientRect();
        const cx = Math.floor((e.clientX - r.left) / cell), cy = Math.floor((e.clientY - r.top) / cell);
        if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) return null;
        const i = cy * L.w + cx;
        return state.cells[i].hole ? null : i;
    }

    let press = null;
    els.wrap.addEventListener('pointerdown', (e) => {
        if (!state || busy || state.over || e.button !== 0) return;
        const i = cellAt(e);
        if (i === null) return;
        e.preventDefault();
        if (aim === 'hammer') { trySmash(i); return; }
        press = {i, x: e.clientX, y: e.clientY, swiped: false};
        els.wrap.setPointerCapture(e.pointerId);
    });

    els.wrap.addEventListener('pointermove', (e) => {
        if (!press || press.swiped) return;
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.35) return;
        press.swiped = true;
        const cx = press.i % L.w, cy = Math.floor(press.i / L.w);
        const tx = cx + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0);
        const ty = cy + (Math.abs(dx) > Math.abs(dy) ? 0 : Math.sign(dy));
        if (tx >= 0 && ty >= 0 && tx < L.w && ty < L.h) trySwap(press.i, ty * L.w + tx);
    });

    els.wrap.addEventListener('pointerup', () => {
        if (!press) return;
        const {i, swiped} = press;
        press = null;
        if (swiped) return;
        // Tap one candy, then a neighbour.
        if (picked !== null && picked !== i) {
            const a = picked;
            const near = Math.abs(a % L.w - i % L.w) + Math.abs(Math.floor(a / L.w) - Math.floor(i / L.w)) === 1;
            clearPick();
            if (near) { trySwap(a, i); return; }
        }
        if (picked === i) { clearPick(); return; }
        const t = state.cells[i].tile;
        const el = t && tiles.get(t.id);
        if (!el) return;
        picked = i;
        el.classList.add('pick');
    });
    els.wrap.addEventListener('pointercancel', () => { press = null; });
    els.wrap.addEventListener('contextmenu', (e) => e.preventDefault());

    els.boosters.addEventListener('click', (e) => {
        const b = e.target.closest('[data-booster]');
        if (b && !b.disabled) useBooster(b.dataset.booster);
    });
    els.mapBtn.addEventListener('click', showMap);
    els.restartBtn.addEventListener('click', flipRestart);
    els.helpBtn.addEventListener('click', showRules);
    els.sheetClose.addEventListener('click', closeSheet);
    els.sheet.addEventListener('click', (e) => { if (e.target === els.sheet) closeSheet(); });

    showMap();
})();
