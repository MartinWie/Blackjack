/**
 * Hide & Meow puzzle engine. Pure functions, no DOM: the page and
 * `tools/meow-check.mjs` load the same file.
 *
 * A level is a seed. The generator is deterministic, so level 12 on Hard is the same
 * board on every phone, and it only hands out boards with exactly one solution that
 * the logic solver below can reach without guessing.
 */
(function (root) {
    'use strict';

    // `grade` is the hardest deduction a board may need, `floor` the grade it must be
    // too hard for, so Hard never hands out an Easy board (see the solver's grades).
    const DIFFICULTIES = {
        easy:   {size: 6, label: 'Easy',   grade: 1, floor: 0},
        medium: {size: 7, label: 'Medium', grade: 2, floor: 1},
        hard:   {size: 8, label: 'Hard',   grade: 3, floor: 2},
        expert: {size: 9, label: 'Expert', grade: 4, floor: 2},
    };

    // After this many tries a board that is easier than asked is accepted, so a
    // seed can never hang the page.
    const STRICT_ATTEMPTS = 3000;
    const MAX_ATTEMPTS = 20000;

    function hashSeed(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffle(list, rng) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    /** One cat per row and column, never touching: `cols[row]` is the cat's column. */
    function placeCats(n, rng) {
        const cols = new Array(n);
        const used = new Array(n).fill(false);
        function place(r) {
            if (r === n) return true;
            for (const c of shuffle([...Array(n).keys()], rng)) {
                if (used[c] || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
                cols[r] = c; used[c] = true;
                if (place(r + 1)) return true;
                used[c] = false;
            }
            return false;
        }
        return place(0) ? cols : null;
    }

    /**
     * Grows one colour region around each cat until the board is covered. A region
     * stops growing at `cap` cells, so no colour swallows the board.
     */
    function growRegions(n, cols, rng, cap = Math.ceil(n * n * 0.26)) {
        const regions = new Array(n * n).fill(-1);
        const sizes = new Array(n).fill(1);
        const weights = [];
        for (let r = 0; r < n; r++) {
            regions[r * n + cols[r]] = r;
            // Uneven weights give a mix of big and small regions, which is what
            // makes a board both unique and interesting.
            const x = rng();
            // Plain multiplication: Math.pow may round differently per browser.
            weights.push(0.05 + x * x * x * x * 6);
        }
        let left = n * n - n;
        while (left > 0) {
            let pick = rng() * weights.reduce((a, b) => a + b, 0);
            let region = 0;
            while (pick > weights[region]) pick -= weights[region++];
            const frontier = [];
            for (let i = 0; i < n * n; i++) {
                if (regions[i] !== -1) continue;
                const r = Math.floor(i / n), c = i % n;
                if ((r > 0 && regions[i - n] === region) || (r < n - 1 && regions[i + n] === region) ||
                    (c > 0 && regions[i - 1] === region) || (c < n - 1 && regions[i + 1] === region)) frontier.push(i);
            }
            if (frontier.length === 0 || sizes[region] >= cap) {
                weights[region] = 0;
                if (weights.every((w) => w === 0)) break;
                continue;
            }
            regions[frontier[Math.floor(rng() * frontier.length)]] = region;
            sizes[region]++;
            left--;
        }
        return regions;
    }

    /** Number of solutions, stopping at `limit`. */
    function countSolutions(n, regions, limit = 2) {
        const colUsed = new Array(n).fill(false);
        const regionUsed = new Array(n).fill(false);
        let found = 0;
        function walk(r, prev) {
            if (r === n) { found++; return; }
            for (let c = 0; c < n && found < limit; c++) {
                const reg = regions[r * n + c];
                if (colUsed[c] || regionUsed[reg] || (prev >= 0 && Math.abs(prev - c) <= 1)) continue;
                colUsed[c] = regionUsed[reg] = true;
                walk(r + 1, c);
                colUsed[c] = regionUsed[reg] = false;
            }
        }
        walk(0, -1);
        return found;
    }

    // --- logic solver ----------------------------------------------------------
    //
    // Grades, each including the ones before it:
    //   1  singles (a row, column or colour with one spot left) and one colour
    //      confined to one row/column, or the reverse
    //   2  the same confinement for two or three colours/lines at once
    //   3  "if a cat sat here, some line or colour would have no spot left"
    //   4  the same, following the forced cats that hypothesis creates

    function units(n, regions) {
        const list = [];
        for (let r = 0; r < n; r++) list.push({kind: 'row', cells: [...Array(n).keys()].map((c) => r * n + c)});
        for (let c = 0; c < n; c++) list.push({kind: 'col', cells: [...Array(n).keys()].map((r) => r * n + c)});
        for (let g = 0; g < n; g++) list.push({kind: 'region', cells: regions.flatMap((x, i) => (x === g ? [i] : []))});
        return list;
    }

    function neighbours(n, i) {
        const r = Math.floor(i / n), c = i % n, out = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
        }
        return out;
    }

    function placeCat(state, n, regions, i) {
        const r = Math.floor(i / n), c = i % n, g = regions[i];
        state.cat[i] = true;
        for (let k = 0; k < n * n; k++) {
            if (k !== i && (Math.floor(k / n) === r || k % n === c || regions[k] === g)) state.cand[k] = false;
        }
        for (const k of neighbours(n, i)) state.cand[k] = false;
    }

    /** Places forced singles until none are left; false on a contradiction. */
    function propagate(state, n, regions, unitList) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const u of unitList) {
                if (u.cells.some((i) => state.cat[i])) continue;
                const open = u.cells.filter((i) => state.cand[i]);
                if (open.length === 0) return false;
                if (open.length === 1) { placeCat(state, n, regions, open[0]); state.cand[open[0]] = false; changed = true; }
            }
        }
        return true;
    }

    function combinations(items, k, start = 0, acc = [], out = []) {
        if (acc.length === k) { out.push(acc.slice()); return out; }
        for (let i = start; i < items.length; i++) { acc.push(items[i]); combinations(items, k, i + 1, acc, out); acc.pop(); }
        return out;
    }

    /**
     * k open units of one kind whose spots fit in k units of another clear the rest of
     * those. Returns the first such step that clears something, without applying it.
     */
    function confinementStep(state, unitList, maxK) {
        const open = unitList.filter((u) => !u.cells.some((i) => state.cat[i]));
        const kinds = ['row', 'col', 'region'];
        for (const from of kinds) for (const into of kinds) {
            if (from === into) continue;
            const sources = open.filter((u) => u.kind === from);
            const targets = open.filter((u) => u.kind === into);
            for (let k = 1; k <= maxK; k++) {
                for (const group of combinations(sources, k)) {
                    const spots = new Set(group.flatMap((u) => u.cells.filter((i) => state.cand[i])));
                    const hit = targets.filter((t) => t.cells.some((i) => spots.has(i)));
                    if (hit.length !== k) continue;
                    const cleared = hit.flatMap((t) => t.cells.filter((i) => state.cand[i] && !spots.has(i)));
                    if (cleared.length) return {cleared, from, into, k, group, hit};
                }
            }
        }
        return null;
    }

    function confinement(state, unitList, maxK) {
        const step = confinementStep(state, unitList, maxK);
        if (!step) return false;
        step.cleared.forEach((i) => { state.cand[i] = false; });
        return true;
    }

    /** The first spot where a cat would leave some line or colour empty, or -1. */
    function lookaheadStep(state, n, regions, unitList, deep) {
        for (let i = 0; i < n * n; i++) {
            if (!state.cand[i]) continue;
            const trial = {cand: state.cand.slice(), cat: state.cat.slice()};
            placeCat(trial, n, regions, i);
            trial.cand[i] = false;
            const dead = deep
                ? !propagate(trial, n, regions, unitList)
                : unitList.some((u) => !u.cells.some((k) => trial.cat[k]) && !u.cells.some((k) => trial.cand[k]));
            if (dead) return i;
        }
        return -1;
    }

    function lookahead(state, n, regions, unitList, deep) {
        const i = lookaheadStep(state, n, regions, unitList, deep);
        if (i < 0) return false;
        state.cand[i] = false;
        return true;
    }

    /** Solves by deduction alone at `grade`; true when every cat was found. */
    function solvable(n, regions, grade) {
        const unitList = units(n, regions);
        const state = {cand: new Array(n * n).fill(true), cat: new Array(n * n).fill(false)};
        for (;;) {
            if (!propagate(state, n, regions, unitList)) return false;
            if (state.cat.filter(Boolean).length === n) return true;
            if (confinement(state, unitList, grade >= 2 ? 3 : 1)) continue;
            if (grade >= 3 && lookahead(state, n, regions, unitList, false)) continue;
            if (grade >= 4 && lookahead(state, n, regions, unitList, true)) continue;
            return false;
        }
    }

    /** The board for one level: same difficulty and level, same board, everywhere. */
    function generate(difficulty, level) {
        const spec = DIFFICULTIES[difficulty];
        const n = spec.size;
        const rng = mulberry32(hashSeed(`meow:${difficulty}:${level}`));
        let fallback = null;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const cols = placeCats(n, rng);
            if (!cols) continue;
            const regions = growRegions(n, cols, rng);
            if (regions.includes(-1) || countSolutions(n, regions) !== 1) continue;
            if (!solvable(n, regions, spec.grade)) continue;
            const board = {difficulty, level, size: n, regions, cats: cols.map((c, r) => r * n + c)};
            if (spec.floor === 0 || !solvable(n, regions, spec.floor)) return board;
            if (!fallback) fallback = board;
            if (attempt >= STRICT_ATTEMPTS) return fallback;
        }
        return fallback;
    }

    // --- the level ladder --------------------------------------------------------
    //
    // The track: a hundred levels of each difficulty, then Expert for as long as anyone
    // plays. A finished band also opens an endless mode of its own (see endlessBoard).

    const BAND = 100;
    const LADDER = [['easy', BAND], ['medium', BAND], ['hard', BAND], ['expert', Infinity]];
    // Endless boards start far past any track index, so the two modes never share a board
    // (the track's Expert runs on from index 101).
    const ENDLESS_BASE = 1000000;

    function stage(level) {
        let start = 1;
        for (const [difficulty, count] of LADDER) {
            if (level < start + count) return {difficulty, index: level - start + 1, first: start};
            start += count;
        }
    }

    function boardFor(level) {
        const s = stage(level);
        return {...generate(s.difficulty, s.index), level, difficulty: s.difficulty};
    }

    /** Endless mode, board n of one difficulty. */
    function endlessBoard(difficulty, n) {
        return {...generate(difficulty, ENDLESS_BASE + n), level: n, difficulty};
    }

    /** The last track level of a difficulty's band (Infinity for Expert). */
    function bandEnd(difficulty) {
        let end = 0;
        for (const [d, count] of LADDER) { end += count; if (d === difficulty) return end; }
        return 0;
    }

    // --- hints -----------------------------------------------------------------

    const UNIT_NAME = {row: 'row', col: 'column', region: 'colour'};

    /**
     * The next thing the player can know for sure, with the reason, or null. Trusts
     * only what was revealed (found cats, empty looks), never the player's own Xs, and
     * skips deductions the player has already marked.
     */
    function hint(board, found, empties, marks) {
        const n = board.size, regions = board.regions, unitList = units(n, regions);
        const state = {cand: new Array(n * n).fill(true), cat: new Array(n * n).fill(false)};
        empties.forEach((i) => { state.cand[i] = false; });
        const fresh = (i) => !marks.has(i) && !found.has(i) && !empties.has(i);
        for (const f of found) {
            const fr = Math.floor(f / n), fc = f % n;
            const near = new Set(neighbours(n, f));
            for (let k = 0; k < n * n; k++) {
                if (k === f || !state.cand[k] || !fresh(k)) continue;
                const why = near.has(k) ? 'It touches a cat you found, and cats never touch.'
                    : Math.floor(k / n) === fr ? 'A cat you found already sits in this row.'
                    : k % n === fc ? 'A cat you found already sits in this column.'
                    : regions[k] === regions[f] ? 'A cat you found already has this colour.' : null;
                if (why) return {cell: k, cat: false, reason: why, focus: [f]};
            }
            placeCat(state, n, regions, f);
            state.cand[f] = false;
        }
        for (let guard = 0; guard < n * n * 4; guard++) {
            for (const u of unitList) {
                if (u.cells.some((i) => state.cat[i])) continue;
                const open = u.cells.filter((i) => state.cand[i]);
                if (open.length === 1) {
                    return {cell: open[0], cat: true, reason: `This is the only spot left for a cat in its ${UNIT_NAME[u.kind]}.`, focus: u.cells};
                }
            }
            const step = confinementStep(state, unitList, 3);
            if (step) {
                const target = step.cleared.find(fresh);
                if (target !== undefined) {
                    const what = step.k === 1
                        ? `Every spot left in one ${UNIT_NAME[step.from]} lies in the same ${UNIT_NAME[step.into]}, so its cat takes it and the rest of that ${UNIT_NAME[step.into]} stays empty.`
                        : `${step.k} ${UNIT_NAME[step.from]}s only have spots in the same ${step.k} ${UNIT_NAME[step.into]}s, so their cats fill those and nothing else there can hold one.`;
                    return {cell: target, cat: false, reason: what, focus: step.group.flatMap((u) => u.cells.filter((i) => state.cand[i]))};
                }
                step.cleared.forEach((i) => { state.cand[i] = false; });
                continue;
            }
            let i = lookaheadStep(state, n, regions, unitList, false);
            if (i < 0) i = lookaheadStep(state, n, regions, unitList, true);
            if (i >= 0) {
                if (fresh(i)) return {cell: i, cat: false, reason: 'A cat here would leave some row, column or colour with no spot at all.', focus: []};
                state.cand[i] = false;
                continue;
            }
            return null;
        }
        return null;
    }

    root.MeowEngine = {DIFFICULTIES, LADDER, BAND, generate, countSolutions, solvable, neighbours, stage, boardFor, endlessBoard, bandEnd, hint};
    if (typeof module !== 'undefined') module.exports = root.MeowEngine;
})(typeof self !== 'undefined' ? self : globalThis);
