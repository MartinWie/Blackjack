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

    const ANT = (colour) => `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="#3B2A22" stroke-width="2" stroke-linecap="round" fill="none"><path d="M14 18 6 12M14 22 5 22M15 26 7 32M26 18l8-6M26 22h9M25 26l8 6M17 9l-3-6M23 9l3-6"/></g><ellipse cx="20" cy="12" rx="5" ry="4.5" fill="${colour}" stroke="#3B2A22" stroke-width="1.5"/><ellipse cx="20" cy="21" rx="4.5" ry="4" fill="${colour}" stroke="#3B2A22" stroke-width="1.5"/><ellipse cx="20" cy="31" rx="6.5" ry="6" fill="${colour}" stroke="#3B2A22" stroke-width="1.5"/><circle cx="18" cy="11" r="1.1" fill="#3B2A22"/><circle cx="22" cy="11" r="1.1" fill="#3B2A22"/></svg>`;
    const NEST = (colour) => `<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M4 38C8 16 20 6 30 6s22 10 26 32z" fill="${colour}" stroke="rgba(0,0,0,.25)" stroke-width="2"/><path d="M4 38C8 16 20 6 30 6" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="3" stroke-linecap="round"/><ellipse cx="30" cy="30" rx="7" ry="5" fill="rgba(0,0,0,.35)"/></svg>`;

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
        message: $('message'), powerups: $('powerups'), fly: $('fly'),
        levelsBtn: $('levels-btn'), restartBtn: $('restart-btn'), helpBtn: $('help-btn'),
        sheet: $('sheet'), sheetBody: $('sheet-body'), sheetClose: $('sheet-close'),
    };

    // --- persistence ----------------------------------------------------------------

    function load() {
        const fresh = {mode: 'track', level: 1, unlocked: 1, endless: {}, game: null, items: {seat: 1, dig: 1, recall: 1, feast: 1}};
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

    let L = null, s = null, actions = [], busy = false, aim = null, endTimer = null, gen = 0;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Mirrored on <body> so a test (or a stylesheet) can see when ants are on the move.
    function setBusy(on) { busy = on; document.body.classList.toggle('busy', on); }

    function persist() {
        store.game = {mode: store.mode, level: L.level, actions};
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
        setBusy(false);
        clearTimeout(endTimer);
        store.mode = mode;
        if (mode === 'track') { store.level = Math.max(1, Math.min(level, store.unlocked)); L = E.level(store.level); }
        else { store.endless[mode] = Math.max(1, level); L = E.endless(mode, store.endless[mode]); }
        s = E.start(L);
        actions = [];
        // A board in progress is replayed from its actions.
        const saved = store.game;
        if (saved && (saved.mode || 'track') === mode && saved.level === L.level && Array.isArray(saved.actions)) {
            for (const a of saved.actions) if (apply(a)) actions.push(a);
        }
        persist();
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
        els.board.innerHTML = '';
        els.board.classList.remove('won', 'quake');
        for (let i = 0; i < N * N; i++) {
            const px = document.createElement('div');
            px.className = 'px';
            els.board.appendChild(px);
        }
    }

    // --- drawing ---------------------------------------------------------------------

    function render() {
        s.board.grid.forEach((v, i) => {
            const px = els.board.children[i];
            const colour = v >= 0 ? L.palette[v] : '';
            if (px.dataset.c !== colour) {
                px.dataset.c = colour;
                px.style.background = colour || 'transparent';
                px.classList.toggle('gone', !colour);
            }
        });
        renderSeats();
        renderLanes();
        renderPowers();
    }

    function renderSeats() {
        els.seats.innerHTML = '';
        s.seats.forEach((g, k) => {
            const seat = document.createElement('button');
            seat.className = 'seat' + (g ? ' full' : '') + (aim === 'recall' && g ? ' pickable' : '');
            seat.dataset.seat = k;
            seat.setAttribute('aria-label', g ? `Seat ${k + 1}: ${g.left} ants waiting` : `Seat ${k + 1}: empty`);
            if (g) seat.innerHTML = `${ANT(L.palette[g.colour])}<b>${g.left}</b>`;
            els.seats.appendChild(seat);
        });
    }

    function renderLanes() {
        els.lanes.innerHTML = '';
        els.lanes.style.gridTemplateColumns = `repeat(${s.lanes.length}, 1fr)`;
        s.lanes.forEach((lane, k) => {
            const col = document.createElement('div');
            col.className = 'lane';
            lane.slice(0, 3).forEach((nest, d) => {
                const b = document.createElement(d === 0 ? 'button' : 'div');
                b.className = `nest depth-${d}`;
                if (d === 0) {
                    b.dataset.lane = k;
                    b.setAttribute('aria-label', `Nest of ${nest.count} ants`);
                    b.disabled = !!s.over;
                }
                b.innerHTML = `${NEST(L.palette[nest.colour])}<b>${nest.count}</b>`;
                col.appendChild(b);
            });
            if (lane.length > 3) {
                const more = document.createElement('span');
                more.className = 'more';
                more.textContent = `+${lane.length - 3}`;
                col.appendChild(more);
            }
            els.lanes.appendChild(col);
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

    // --- animation -----------------------------------------------------------------------

    const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

    /** An ant walks from its seat to a pixel; the pixel crumbles when it arrives. */
    function antTo(fromEl, i, colour, delay) {
        const px = els.board.children[i];
        const [fx, fy] = centre(fromEl), [tx, ty] = centre(px);
        const ant = document.createElement('div');
        ant.className = 'walker';
        ant.innerHTML = ANT(colour);
        ant.style.left = `${fx - 9}px`;
        ant.style.top = `${fy - 9}px`;
        ant.style.transform = `rotate(${Math.atan2(ty - fy, tx - fx) * 180 / Math.PI + 90}deg)`;
        els.fly.appendChild(ant);
        setTimeout(() => {
            ant.style.transitionDuration = '420ms';
            ant.style.transform += ` translate(0, -${Math.hypot(tx - fx, ty - fy)}px)`;
        }, delay);
        setTimeout(() => {
            ant.remove();
            px.dataset.c = '';
            px.classList.add('eaten');
            for (let k = 0; k < 3; k++) {
                const c = document.createElement('i');
                c.className = 'crumb';
                c.style.background = colour;
                c.style.setProperty('--dx', `${(Math.random() - 0.5) * 18}px`);
                c.style.setProperty('--dy', `${Math.random() * 10 + 4}px`);
                px.appendChild(c);
                c.addEventListener('animationend', () => c.remove(), {once: true});
            }
        }, delay + 430);
    }

    async function play(events) {
        const mine = gen;
        for (const ev of events) {
            if (mine !== gen) return false;
            if (ev.t === 'dispatch') {
                const from = els.lanes.children[ev.lane] && els.lanes.children[ev.lane].querySelector('.nest');
                if (from) from.classList.add('launch');
                await sleep(220);
                renderLanes();
                renderSeats();
                const seat = els.seats.children[ev.seat];
                if (seat) { seat.classList.add('arrive'); }
            } else if (ev.t === 'eat') {
                const seat = els.seats.children[ev.seat];
                const step = Math.max(14, Math.min(45, 900 / ev.cells.length));
                ev.cells.forEach((i, k) => antTo(seat, i, L.palette[ev.colour], k * step));
                await sleep(ev.cells.length * step + 460);
                renderSeats();
            } else if (ev.t === 'leave') {
                const seat = els.seats.children[ev.seat];
                if (seat) seat.classList.add('leaving');
                await sleep(200);
                renderSeats();
            } else if (ev.t === 'recall' || ev.t === 'seat') {
                render();
                await sleep(250);
            }
        }
        render();
        return mine === gen;
    }

    // --- turns -----------------------------------------------------------------------------

    async function act(action) {
        if (busy) return;
        let events = null;
        if (action.t === 'tap') events = E.tap(s, action.lane);
        else if (action.t === 'seat') events = E.addSeat(s);
        else if (action.t === 'recall') events = E.recall(s, action.seat);
        if (!events) return;
        actions.push(action);
        persist();
        setBusy(true);
        const mine = gen;
        if (!(await play(events))) return;
        setBusy(false);
        if (mine !== gen) return;
        if (s.over === 'won') win();
        else if (s.over === 'lost') lose();
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
        if (busy) return;
        setBusy(true);
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
        if (busy || !store.items[key]) return;
        if (key === 'recall') {
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
        openSheet(`<h2>How to play</h2>
            <div class="list">
                <div>${NEST('#E5484D')}<p>Tap the front nest of a lane. Its number is how many ants it sends.</p></div>
                <div>${ANT('#E5484D')}<p>Ants climb up from the blanket: they eat their own colour, but only a pixel with nothing below it.</p></div>
                <div>${ANT('#9AA5B1')}<p>Ants that cannot reach anything wait on a seat. All seats full: lunch is over.</p></div>
            </div>
            <h3>Power-ups</h3><div class="list">${powers}</div>`);
    }

    // --- input ---------------------------------------------------------------------------

    els.lanes.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lane]');
        if (b && !b.disabled) act({t: 'tap', lane: Number(b.dataset.lane)});
    });
    els.seats.addEventListener('click', (e) => {
        const b = e.target.closest('[data-seat]');
        if (!b || aim !== 'recall' || !s.seats[Number(b.dataset.seat)]) return;
        store.items.recall--;
        save();
        setAim(null);
        clearTimeout(endTimer);
        els.plate.querySelectorAll('.board-end').forEach((v) => v.remove());
        act({t: 'recall', seat: Number(b.dataset.seat)});
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
        const b = e.target.closest('[data-level]');
        if (b && !b.disabled) { closeSheet(); open('track', Number(b.dataset.level)); }
        const m = e.target.closest('[data-mode]');
        if (m && !m.disabled) { closeSheet(); open(m.dataset.mode, m.dataset.mode === 'track' ? store.level : store.endless[m.dataset.mode] || 1); }
    });

    open(store.mode, store.mode === 'track' ? store.level : store.endless[store.mode] || 1);
})();
