/**
 * Hide & Meow board. Tap or drag to mark a spot with an X, double tap to look under
 * it. Rules and boards come from `meow-engine.js`; this file only plays them.
 *
 * Progress lives in localStorage: the level reached per difficulty and the board in
 * progress for each, so the store holds four boards at most however long anyone plays.
 */
(function () {
    'use strict';

    const E = window.MeowEngine;
    const FISH = 3;
    const DOUBLE_TAP_MS = 350;
    const STORE_KEY = 'meow.v1';
    const COLOURS = ['#5FB3A6', '#EFA163', '#B9607A', '#8C7BC8', '#A9C98D', '#6FA9D6', '#DDA3B3', '#A5B6CF', '#E3BE5A'];

    const LINES = {
        start: ['Can you find where the cats are hiding?', 'Somebody is napping under one of these…', 'Shh. They think they are invisible.'],
        found: ['Found one! Mrrp.', 'Purr-fect.', 'Caught mid-nap!', 'A wild cat appears!', 'That one wanted to be found.'],
        miss: ['Nope, just a warm cushion.', 'Only crumbs here.', 'A cat was here an hour ago.', 'Empty! A fish swims off…'],
        won: ['Every cat found! They demand treats.', 'All cats accounted for. Purrs all round.'],
        lost: ['Out of fish… the cats got bored and showed themselves.'],
    };

    const CAT = '<svg class="cat" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 48 18 11q2-5 7-2l19 17z" fill="#2B2B33"/><path d="M86 48 82 11q-2-5-7-2L56 26z" fill="#2B2B33"/><path d="m21 38 2-20 13 12z" fill="#F4A7B9"/><path d="m79 38-2-20-13 12z" fill="#F4A7B9"/><ellipse cx="50" cy="58" rx="40" ry="34" fill="#2B2B33"/><path d="M50 31c-6 10-10 16-20 25-12 12-6 35 20 35s32-23 20-35c-10-9-14-15-20-25z" fill="#fff"/>EYES<ellipse cx="29" cy="71" rx="5" ry="3" fill="#F7B6C6" opacity=".8"/><ellipse cx="71" cy="71" rx="5" ry="3" fill="#F7B6C6" opacity=".8"/><path d="M46 66h8l-4 5z" fill="#F08AA4"/><path d="M44 74q3 3 6 0 3 3 6 0" fill="none" stroke="#2B2B33" stroke-width="2" stroke-linecap="round"/></svg>';
    const AWAKE = '<ellipse cx="34" cy="55" rx="8" ry="9" fill="#fff"/><ellipse cx="66" cy="55" rx="8" ry="9" fill="#fff"/><circle cx="35" cy="56" r="5.5" fill="#222"/><circle cx="65" cy="56" r="5.5" fill="#222"/><circle cx="33" cy="53" r="1.9" fill="#fff"/><circle cx="63" cy="53" r="1.9" fill="#fff"/>';
    const ASLEEP = '<ellipse cx="34" cy="55" rx="8" ry="9" fill="#fff"/><ellipse cx="66" cy="55" rx="8" ry="9" fill="#fff"/><path d="M28 56q6 5 12 0M60 56q6 5 12 0" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round"/>';
    const X = '<svg class="x" viewBox="0 0 40 40" aria-hidden="true"><path d="M10 10 30 30M30 10 10 30" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>';
    const FISH_SVG = '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M6 20C14 6 34 4 46 14l12-8q3-1 2 3l-4 11 4 11q1 4-2 3l-12-8C34 36 14 34 6 20z" fill="#F2B544" stroke="#D18A1F" stroke-width="2.5" stroke-linejoin="round"/><circle cx="16" cy="18" r="2.8" fill="#5A3A1A"/><path d="M26 12q4 8 0 16" stroke="#D18A1F" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>';
    const HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="#F08AA4"/></svg>';

    const $ = (id) => document.getElementById(id);
    const els = {
        tabs: $('tabs'), prev: $('prev'), next: $('next'), level: $('level'),
        board: $('board'), pillFill: $('pill-fill'), pillText: $('pill-text'), fish: $('fish'),
        message: $('message'), clear: $('clear'), restart: $('restart'),
    };

    // --- persistence -----------------------------------------------------------

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            if (saved && saved.difficulty in E.DIFFICULTIES) {
                saved.progress = saved.progress || {};
                saved.games = saved.games || {};
                return saved;
            }
        } catch (_) { /* private mode or junk: start fresh */ }
        return {difficulty: 'easy', progress: {}, games: {}};
    }

    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* no storage, no memory */ }
    }

    const store = load();
    let board = null;
    let game = null; // {level, marks:[], found:[], misses:[], fish, over}

    function progress(d) {
        return store.progress[d] || (store.progress[d] = {level: 1, unlocked: 1});
    }

    function persistGame() {
        store.games[store.difficulty] = {
            level: game.level, board: board.cats.join(), marks: [...game.marks], found: [...game.found],
            misses: [...game.misses], fish: game.fish, over: game.over,
        };
        save();
    }

    // --- setup -----------------------------------------------------------------

    function open(difficulty, level) {
        store.difficulty = difficulty;
        const p = progress(difficulty);
        p.level = Math.max(1, Math.min(level, p.unlocked));
        board = E.generate(difficulty, p.level);
        // The saved game must be for this very board: a generator change moves levels.
        const saved = store.games[difficulty];
        game = saved && saved.level === p.level && saved.board === board.cats.join()
            ? {level: p.level, marks: new Set(saved.marks), found: new Set(saved.found), misses: new Set(saved.misses), fish: Number(saved.fish) || 0, over: saved.over || null}
            : fresh(p.level);
        // Only a move replaces the saved game, so peeking at another level keeps it.
        save();
        build();
        render();
        say(game.over ? game.over : 'start');
    }

    function fresh(level) {
        return {level, marks: new Set(), found: new Set(), misses: new Set(), fish: FISH, over: null};
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
        els.fish.innerHTML = FISH_SVG.repeat(FISH);
        document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.d === store.difficulty)));
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
            cell.classList.toggle('marked', game.marks.has(i) && !found);
            cell.classList.toggle('miss', game.misses.has(i));
            cell.classList.toggle('found', found);
            cell.classList.toggle('sleepy', sleepy);
            const hasCat = cell.querySelector('.cat');
            if ((found || sleepy) && !hasCat) cell.insertAdjacentHTML('beforeend', CAT.replace('EYES', found ? AWAKE : ASLEEP));
            if (!found && !sleepy && hasCat) hasCat.remove();
        });
        els.pillText.textContent = `${game.found.size}/${n}`;
        els.pillFill.style.width = `${(game.found.size / n) * 100}%`;
        [...els.fish.children].forEach((f, k) => f.classList.toggle('gone', k >= game.fish));
        const p = progress(store.difficulty);
        els.level.textContent = `Level ${game.level}`;
        els.prev.disabled = game.level <= 1;
        els.next.disabled = game.level >= p.unlocked;
        els.board.classList.toggle('won', game.over === 'won');
    }

    function say(kind) {
        const pool = LINES[kind];
        els.message.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = pool[Math.floor(Math.random() * pool.length)];
        els.message.appendChild(p);
        if (kind === 'won' || kind === 'lost') {
            const go = document.createElement('button');
            go.className = 'go';
            go.textContent = kind === 'won' ? 'Next level' : 'Try again';
            go.addEventListener('click', () => {
                if (kind === 'won') open(store.difficulty, game.level + 1);
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

    // --- moves -----------------------------------------------------------------

    const locked = (i) => game.over || game.found.has(i) || game.misses.has(i);

    function setMark(i, on) {
        if (locked(i) || game.marks.has(i) === on) return;
        if (on) game.marks.add(i); else game.marks.delete(i);
        els.board.children[i].classList.toggle('marked', on);
    }

    function reveal(i) {
        if (locked(i)) return;
        game.marks.delete(i);
        const cell = els.board.children[i];
        if (board.cats.includes(i)) {
            game.found.add(i);
            render();
            hearts(cell);
            if (game.found.size === board.size) win();
            else say('found');
        } else {
            game.misses.add(i);
            game.fish--;
            const lost = els.fish.children[game.fish];
            lost.classList.add('swim');
            lost.addEventListener('animationend', () => { lost.classList.remove('swim'); render(); }, {once: true});
            cell.classList.add('shake');
            cell.addEventListener('animationend', () => cell.classList.remove('shake'), {once: true});
            cell.classList.add('miss');
            if (game.fish <= 0) { game.over = 'lost'; setTimeout(render, 450); say('lost'); }
            else say('miss');
        }
        persistGame();
    }

    function win() {
        game.over = 'won';
        const p = progress(store.difficulty);
        p.unlocked = Math.max(p.unlocked, game.level + 1);
        render();
        say('won');
    }

    function restart() {
        game = fresh(game.level);
        persistGame();
        build();
        render();
        say('start');
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
        const now = performance.now();
        if (lastTap && lastTap.i === i && !lastTap.moved && now - lastTap.at < DOUBLE_TAP_MS) {
            setMark(i, lastTap.before);
            lastTap = null;
            drag = null;
            reveal(i);
            return;
        }
        const before = game.marks.has(i);
        drag = {mode: !before, last: i};
        lastTap = {i, at: now, before, moved: false};
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

    const endDrag = () => {
        if (drag) persistGame();
        drag = null;
    };
    els.board.addEventListener('pointerup', endDrag);
    els.board.addEventListener('pointercancel', endDrag);

    // Keyboard: space marks, enter looks.
    els.board.addEventListener('keydown', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell || game.over) return;
        const i = Number(cell.dataset.i);
        if (e.key === ' ') { e.preventDefault(); setMark(i, !game.marks.has(i)); persistGame(); }
        if (e.key === 'Enter') { e.preventDefault(); reveal(i); }
    });
    // Pointer handling owns taps; a synthesized click must not do anything twice.
    els.board.addEventListener('click', (e) => e.preventDefault());
    els.board.addEventListener('contextmenu', (e) => e.preventDefault());

    els.tabs.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-d]');
        if (b && b.dataset.d !== store.difficulty) open(b.dataset.d, progress(b.dataset.d).level);
    });
    els.prev.addEventListener('click', () => open(store.difficulty, game.level - 1));
    els.next.addEventListener('click', () => open(store.difficulty, game.level + 1));
    els.clear.addEventListener('click', () => {
        if (game.over) return;
        [...game.marks].forEach((i) => setMark(i, false));
        persistGame();
    });
    els.restart.addEventListener('click', restart);

    open(store.difficulty, progress(store.difficulty).level);
})();
