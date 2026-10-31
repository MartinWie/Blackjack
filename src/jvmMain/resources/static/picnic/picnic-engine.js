/**
 * Ant Picnic engine: no DOM. The page and `tools/picnic-check.mjs` load the same file.
 *
 * A board is a pixel-art food. Nests wait in lanes; tapping a lane's front nest sends
 * its ants to a free seat, and ants eat exposed pixels of their own colour (a pixel
 * touching the outside), which exposes the pixels behind it. Ants that cannot eat yet
 * keep their seat. Every seat full and nobody able to eat: stuck, the level is lost.
 *
 * A level is a seed. It is built from a real eating order: nests are cut from that
 * order and dealt into lanes without reordering, so following it is always possible
 * and every level can be won. Choosing a different order is the puzzle.
 */
(function (root) {
    'use strict';

    const P = root.PicnicPics || (typeof require !== 'undefined' ? require('./picnic-pics.js') : null);
    const N = P.N;

    // The same track as Hide & Meow: a hundred levels a difficulty, then Expert on.
    const BAND = 100;
    const LADDER = [['easy', BAND], ['medium', BAND], ['hard', BAND], ['expert', Infinity]];
    const ENDLESS_BASE = 1000000;
    // `run` is how many nests in a row of the eating order land in one lane. Longer
    // runs push buried colours to the front of the other lanes: that is the puzzle.
    // `early` is how often a nest arrives before its colour can be reached, so its
    // ants must wait on a seat; `run` is how many nests of the eating order land in
    // one lane in a row. Both, with the seat count, are what makes a level hard.
    const SPECS = {
        easy:   {lanes: 2, seats: 5, min: 6, max: 14, run: [2, 4], early: 0.12},
        medium: {lanes: 3, seats: 4, min: 5, max: 12, run: [2, 5], early: 0.3},
        hard:   {lanes: 3, seats: 4, min: 4, max: 10, run: [3, 6], early: 0.5},
        expert: {lanes: 4, seats: 3, min: 3, max: 9, run: [3, 7], early: 0.6},
    };

    function hashSeed(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // --- the board --------------------------------------------------------------

    const neighbours = (i) => {
        const x = i % N, y = Math.floor(i / N), out = [];
        if (x > 0) out.push(i - 1);
        if (x < N - 1) out.push(i + 1);
        if (y > 0) out.push(i - N);
        if (y < N - 1) out.push(i + N);
        return out;
    };
    const onEdge = (i) => i % N === 0 || i % N === N - 1 || i < N || i >= N * (N - 1);

    /** Empty cells reachable from outside the picture; a hole in a donut is not, yet. */
    function outsideOf(grid) {
        const out = new Uint8Array(N * N);
        const queue = [];
        for (let i = 0; i < N * N; i++) if (grid[i] < 0 && onEdge(i)) { out[i] = 1; queue.push(i); }
        while (queue.length) {
            const i = queue.pop();
            for (const j of neighbours(i)) if (!out[j] && grid[j] < 0) { out[j] = 1; queue.push(j); }
        }
        return out;
    }

    /** Ants climb up from the blanket: they reach a pixel only when nothing is below it. */
    function exposed(board, i) {
        if (board.grid[i] < 0) return false;
        if (i >= N * (N - 1)) return true;
        return !!board.outside[i + N];
    }

    /** Eats pixel i: it turns into outside, and so does any hole it opens onto. */
    function remove(board, i) {
        board.grid[i] = -1;
        board.left--;
        const queue = [i];
        board.outside[i] = 1;
        while (queue.length) {
            const k = queue.pop();
            for (const j of neighbours(k)) if (!board.outside[j] && board.grid[j] < 0) { board.outside[j] = 1; queue.push(j); }
        }
    }

    /**
     * Up to `count` ants of colour `c` eat, nearest the bottom first (that is where
     * they come from). With `dig` they ignore exposure. Returns the cells eaten in order.
     */
    function eat(board, c, count, dig = false) {
        const eaten = [];
        while (eaten.length < count) {
            let best = -1;
            for (let i = N * N - 1; i >= 0; i--) {
                if (board.grid[i] !== c || !(dig || exposed(board, i))) continue;
                if (best < 0 || Math.floor(i / N) > Math.floor(best / N)
                    || (Math.floor(i / N) === Math.floor(best / N) && Math.abs(i % N - 7.5) < Math.abs(best % N - 7.5))) best = i;
            }
            if (best < 0) break;
            remove(board, best);
            eaten.push(best);
        }
        return eaten;
    }

    const remaining = (board, c) => board.grid.reduce((n, v) => n + (v === c ? 1 : 0), 0);

    function cloneBoard(b) {
        return {grid: b.grid.slice(), outside: b.outside.slice(), left: b.left};
    }

    // --- levels ------------------------------------------------------------------

    function stage(level) {
        let start = 1;
        for (const [difficulty, count] of LADDER) {
            if (level < start + count) return {difficulty, index: level - start + 1};
            start += count;
        }
    }

    /** Builds a level from a picture and a seed: board, palette, lanes of nests, seats. */
    function build(difficulty, index, label) {
        const spec = SPECS[difficulty];
        const r = rng(hashSeed(`picnic:${difficulty}:${index}`));
        const pic = P.PICS[Math.floor(r() * P.PICS.length)];
        const mirror = r() < 0.5;
        const grid = pic.grid.map((_, i) => (mirror ? pic.grid[Math.floor(i / N) * N + (N - 1 - (i % N))] : pic.grid[i]));
        const board = {grid: grid.slice(), outside: outsideOf(grid), left: grid.filter((v) => v >= 0).length};
        // Within a band, nests shrink a little as the levels climb.
        const ramp = Math.min(1, (index - 1) / 60);
        const max = Math.max(spec.min, Math.round(spec.max - ramp * (spec.max - spec.min) * 0.5));
        // Early nests ramp in across the band too, so its first levels ease you in.
        const tuned = {...spec, early: spec.early * (0.4 + 0.6 * ramp)};
        const plan = eatingOrder(board, tuned, r, max) || simpleOrder(board, spec, r, max);
        // Deal the plan into lanes in runs, never reordering it: the plan stays playable.
        const lanes = Array.from({length: spec.lanes}, () => []);
        let lane = 0;
        for (let k = 0; k < plan.length;) {
            const run = spec.run[0] + Math.floor(r() * (spec.run[1] - spec.run[0] + 1));
            for (let j = 0; j < run && k < plan.length; j++, k++) lanes[lane].push({id: k + 1, ...plan[k]});
            lane = (lane + 1 + Math.floor(r() * (spec.lanes - 1))) % spec.lanes;
        }
        lanes.forEach((lane, k) => { if (!lane.length) lanes[k].push(...lanes.find((l) => l.length > 1).splice(-1)); });
        return {label, difficulty, picture: pic.name, palette: pic.palette, grid, lanes, seats: spec.seats, nests: plan.length};
    }

    /**
     * The order the level is built from, found by playing it: some nests are sent
     * before their colour is reachable and wait on a seat, but never so many that the
     * seats fill up. Null when no such order turns up in a few tries.
     */
    function eatingOrder(board0, spec, r, max) {
        const colours = [...new Set(board0.grid.filter((v) => v >= 0))];
        for (let attempt = 0; attempt < 40; attempt++) {
            let sim = {board: cloneBoard(board0), seats: new Array(spec.seats).fill(null), over: null};
            const out = [];
            for (let guard = 0; guard < 800 && sim.board.left > 0; guard++) {
                const claimed = (c) => sim.seats.reduce((n, g) => n + (g && g.colour === c ? g.left : 0), 0);
                const open = colours.filter((c) => remaining(sim.board, c) - claimed(c) > 0);
                const reachable = open.filter((c) => sim.board.grid.some((v, i) => v === c && exposed(sim.board, i)));
                const pool = (r() < spec.early || !reachable.length ? open : reachable).slice();
                for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
                let placed = false;
                for (const c of pool) {
                    const count = Math.max(1, Math.min(remaining(sim.board, c) - claimed(c), spec.min + Math.floor(r() * (max - spec.min + 1))));
                    const trial = {board: cloneBoard(sim.board), seats: sim.seats.map((g) => g && {...g}), over: null};
                    seatGroup(trial, {id: 0, colour: c, left: count, dig: false}, []);
                    // Keep a seat free: following the order must always be possible.
                    if (trial.over === 'lost' || trial.seats.filter(Boolean).length > spec.seats - 1) continue;
                    sim = trial;
                    out.push({colour: c, count});
                    placed = true;
                    break;
                }
                if (!placed) break;
            }
            if (sim.board.left === 0) return out;
        }
        return null;
    }

    /** The fallback order: every nest reachable the moment it arrives. */
    function simpleOrder(board, spec, r, max) {
        board = cloneBoard(board);
        const out = [];
        for (let guard = 0; board.left > 0 && guard < 500; guard++) {
            const colours = [...new Set(board.grid.filter((v, i) => v >= 0 && exposed(board, i)))];
            const c = colours[Math.floor(r() * colours.length)];
            const edible = eat(cloneBoard(board), c, Infinity).length;
            const count = Math.max(1, Math.min(spec.min + Math.floor(r() * (max - spec.min + 1)), edible));
            eat(board, c, count);
            out.push({colour: c, count});
        }
        return out;
    }

    function level(n) {
        const s = stage(n);
        return {...build(s.difficulty, s.index, n), level: n};
    }

    function endless(difficulty, n) {
        return {...build(difficulty, ENDLESS_BASE + n, n), level: n};
    }

    // --- play ----------------------------------------------------------------------

    function start(L) {
        return {
            L, board: {grid: L.grid.slice(), outside: outsideOf(L.grid), left: L.grid.filter((v) => v >= 0).length},
            lanes: L.lanes.map((lane) => lane.map((n) => ({...n}))),
            seats: new Array(L.seats).fill(null), over: null, dig: false, feast: false,
        };
    }

    /** Every seated group eats what it can, over and over, until nothing changes. */
    function settle(s, events) {
        let changed = true;
        while (changed) {
            changed = false;
            s.seats.forEach((g, k) => {
                if (!g) return;
                const cells = eat(s.board, g.colour, g.left, g.dig);
                g.dig = false;
                if (cells.length) { g.left -= cells.length; changed = true; events.push({t: 'eat', seat: k, colour: g.colour, cells}); }
                if (g.left <= 0 || remaining(s.board, g.colour) === 0) {
                    s.seats[k] = null;
                    events.push({t: 'leave', seat: k});
                    changed = true;
                }
            });
        }
        if (s.board.left === 0) { s.over = 'won'; events.push({t: 'won'}); return; }
        const anyEdible = s.seats.some((g) => g && g.left > 0 && s.board.grid.some((v, i) => v === g.colour && exposed(s.board, i)));
        if (!anyEdible && s.seats.every(Boolean)) { s.over = 'lost'; events.push({t: 'lost'}); }
    }

    /** Taps the front nest of a lane. Null when that is not possible right now. */
    function tap(s, lane) {
        if (s.over || !s.lanes[lane] || !s.lanes[lane].length) return null;
        const seat = s.seats.indexOf(null);
        if (seat < 0) return null;
        const nest = s.lanes[lane].shift();
        const g = {id: nest.id, colour: nest.colour, left: nest.count * (s.feast ? 2 : 1), dig: s.dig};
        s.feast = false;
        s.dig = false;
        const events = [{t: 'dispatch', lane, seat, nest}];
        seatGroup(s, g, events);
        return events;
    }

    /** Seats a group in the first free seat and lets everyone eat. */
    function seatGroup(s, g, events) {
        s.seats[s.seats.indexOf(null)] = g;
        settle(s, events);
    }

    // --- power-ups ---------------------------------------------------------------

    /** Extra seat: one more seat for this board (up to seven). */
    function addSeat(s) {
        if (s.over === 'won' || s.seats.length >= 7) return null;
        s.seats.push(null);
        if (s.over === 'lost') s.over = null;
        return [{t: 'seat', seat: s.seats.length - 1}];
    }

    /** Recall: the waiting group in a seat goes back to the front of the shortest lane. */
    function recall(s, seat) {
        const g = s.seats[seat];
        if (s.over === 'won' || !g) return null;
        s.seats[seat] = null;
        if (s.over === 'lost') s.over = null;
        let lane = 0;
        s.lanes.forEach((l, k) => { if (l.length < s.lanes[lane].length) lane = k; });
        s.lanes[lane].unshift({id: g.id, colour: g.colour, count: g.left});
        return [{t: 'recall', seat, lane}];
    }

    // Digger and Feast change the next nest tapped; the page sets s.dig / s.feast.

    // --- the bot (check tool) -----------------------------------------------------

    /** Plays the level following the plan order: proof that it can be won. */
    function playPlan(L) {
        const s = start(L);
        const order = L.lanes.flat().sort((a, b) => a.id - b.id);
        for (const nest of order) {
            const lane = s.lanes.findIndex((l) => l.length && l[0].id === nest.id);
            if (lane < 0 || !tap(s, lane)) return false;
            if (s.over) break;
        }
        return s.over === 'won';
    }

    root.PicnicEngine = {N, LADDER, BAND, stage, level, endless, start, tap, addSeat, recall, playPlan, exposed, remaining};
    if (typeof module !== 'undefined') module.exports = root.PicnicEngine;
})(typeof self !== 'undefined' ? self : globalThis);
