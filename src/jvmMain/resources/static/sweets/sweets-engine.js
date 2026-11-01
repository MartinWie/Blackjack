/**
 * Sweet Swap engine: a match-3 with no DOM. The page and `tools/sweets-check.mjs` load
 * the same file.
 *
 * A level is a seed. `level(n)` builds its board and goal, then lets a greedy bot play
 * it a few times and sets the move budget from what the bot needed, so every level a
 * player is handed has been won at least that many times already.
 *
 * Moves return a list of events, each carrying a snapshot of the board after that
 * step, so the page only has to animate from one snapshot to the next.
 */
(function (root) {
    'use strict';

    const BONUS_MAX = 12;
    // Run 0 plays the player's own seed, so the opening they see has been won from.
    const BOT_RUNS = 3;
    const BOT_CAP = 70;
    const TYPES = ['score', 'jelly', 'orders', 'ingredients', 'blockers', 'timed'];

    // --- random ----------------------------------------------------------------

    function hashSeed(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    /** Stateful so a game can be cloned mid-play (the bot needs that). */
    class Rng {
        constructor(seed) { this.s = seed >>> 0; }
        next() {
            let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        int(n) { return Math.floor(this.next() * n); }
        pick(list) { return list[this.int(list.length)]; }
    }

    // --- board helpers ----------------------------------------------------------

    const isCandy = (t) => !!t && t.kind === 'candy';
    const isPlain = (t) => isCandy(t) && !t.special;

    function matchColor(cell) {
        if (!cell || cell.hole || !isCandy(cell.tile) || cell.tile.special === 'bomb') return -1;
        return cell.tile.color;
    }

    const swappable = (cell) => !!cell && !cell.hole && !!cell.tile && !cell.lock && !cell.blocker;
    const isEmpty = (cell) => !cell.hole && !cell.blocker && !cell.tile;

    function newTile(s, color, special = null) {
        return {id: s.nextId++, kind: 'candy', color, special, timer: 0};
    }

    function neighbours4(s, i) {
        const x = i % s.w, y = Math.floor(i / s.w), out = [];
        if (x > 0) out.push(i - 1);
        if (x < s.w - 1) out.push(i + 1);
        if (y > 0) out.push(i - s.w);
        if (y < s.h - 1) out.push(i + s.w);
        return out.filter((j) => !s.cells[j].hole);
    }

    function hasMatchAt(s, i) {
        const c = matchColor(s.cells[i]);
        if (c < 0) return false;
        const x = i % s.w, y = Math.floor(i / s.w);
        let run = 1;
        for (let k = x - 1; k >= 0 && matchColor(s.cells[y * s.w + k]) === c; k--) run++;
        for (let k = x + 1; k < s.w && matchColor(s.cells[y * s.w + k]) === c; k++) run++;
        if (run >= 3) return true;
        run = 1;
        for (let k = y - 1; k >= 0 && matchColor(s.cells[k * s.w + x]) === c; k--) run++;
        for (let k = y + 1; k < s.h && matchColor(s.cells[k * s.w + x]) === c; k++) run++;
        return run >= 3;
    }

    function isCombo(a, b) {
        if (!isCandy(a) || !isCandy(b)) return false;
        return a.special === 'bomb' || b.special === 'bomb' || (!!a.special && !!b.special);
    }

    function validMoves(s) {
        const out = [];
        for (let i = 0; i < s.cells.length; i++) {
            if (!swappable(s.cells[i])) continue;
            const x = i % s.w;
            for (const j of [x < s.w - 1 ? i + 1 : -1, i + s.w < s.cells.length ? i + s.w : -1]) {
                if (j < 0 || !swappable(s.cells[j])) continue;
                const a = s.cells[i], b = s.cells[j];
                if (isCombo(a.tile, b.tile)) { out.push([i, j]); continue; }
                [a.tile, b.tile] = [b.tile, a.tile];
                if (hasMatchAt(s, i) || hasMatchAt(s, j)) out.push([i, j]);
                [a.tile, b.tile] = [b.tile, a.tile];
            }
        }
        return out;
    }

    // --- snapshots for the page -------------------------------------------------

    function snapshot(s) {
        return {
            cells: s.cells.map((c) => (c.hole ? null : {
                jelly: c.jelly, lock: c.lock, exit: c.exit,
                blocker: c.blocker ? {type: c.blocker.type, hp: c.blocker.hp} : null,
                tile: c.tile ? {...c.tile} : null,
            })),
            score: s.score, moves: s.moves, sugar: s.sugar, progress: JSON.parse(JSON.stringify(s.progress)),
        };
    }

    function emit(s, ctx, event) {
        if (!ctx.events) return;
        event.snap = snapshot(s);
        ctx.events.push(event);
    }

    // --- clearing ---------------------------------------------------------------

    function findGroups(s) {
        const runs = [];
        for (let y = 0; y < s.h; y++) {
            let x = 0;
            while (x < s.w) {
                const c = matchColor(s.cells[y * s.w + x]);
                let e = x + 1;
                while (c >= 0 && e < s.w && matchColor(s.cells[y * s.w + e]) === c) e++;
                if (c >= 0 && e - x >= 3) runs.push({dir: 'h', color: c, cells: [...Array(e - x).keys()].map((k) => y * s.w + x + k)});
                x = e;
            }
        }
        for (let x = 0; x < s.w; x++) {
            let y = 0;
            while (y < s.h) {
                const c = matchColor(s.cells[y * s.w + x]);
                let e = y + 1;
                while (c >= 0 && e < s.h && matchColor(s.cells[e * s.w + x]) === c) e++;
                if (c >= 0 && e - y >= 3) runs.push({dir: 'v', color: c, cells: [...Array(e - y).keys()].map((k) => (y + k) * s.w + x)});
                y = e;
            }
        }
        // Runs that share a cell are one group: that is what makes an L or a T.
        const groups = [];
        for (const run of runs) {
            const touching = groups.filter((g) => run.cells.some((i) => g.cells.has(i)));
            const merged = {color: run.color, cells: new Set(run.cells), runs: [run]};
            for (const g of touching) {
                g.cells.forEach((i) => merged.cells.add(i));
                merged.runs.push(...g.runs);
                groups.splice(groups.indexOf(g), 1);
            }
            groups.push(merged);
        }
        return groups;
    }

    function specialFor(group, swapDir) {
        const longest = Math.max(...group.runs.map((r) => r.cells.length));
        const dirs = new Set(group.runs.map((r) => r.dir));
        if (longest >= 5) return 'bomb';
        if (dirs.size === 2) return 'wrap';
        if (longest === 4) {
            const dir = swapDir || group.runs.find((r) => r.cells.length === 4).dir;
            return dir === 'h' ? 'v' : 'h';
        }
        return null;
    }

    function specialSpot(group, swapCells) {
        const own = swapCells.filter((i) => group.cells.has(i));
        if (own.length) return own[own.length - 1];
        if (group.runs.length > 1) {
            const counts = new Map();
            for (const r of group.runs) for (const i of r.cells) counts.set(i, (counts.get(i) || 0) + 1);
            for (const [i, n] of counts) if (n > 1) return i;
        }
        const run = group.runs[0].cells;
        return run[Math.floor(run.length / 2)];
    }

    function area(s, cx, cy, r) {
        const out = [];
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
            if (x >= 0 && y >= 0 && x < s.w && y < s.h && !s.cells[y * s.w + x].hole) out.push(y * s.w + x);
        }
        return out;
    }

    const row = (s, y) => [...Array(s.w).keys()].map((x) => y * s.w + x).filter((i) => !s.cells[i].hole);
    const col = (s, x) => [...Array(s.h).keys()].map((y) => y * s.w + x).filter((i) => !s.cells[i].hole);

    function commonestColour(s) {
        const counts = new Array(s.colors).fill(0);
        for (const c of s.cells) if (isPlain(c.tile)) counts[c.tile.color]++;
        let best = 0;
        for (let k = 1; k < counts.length; k++) if (counts[k] > counts[best]) best = k;
        return best;
    }

    /** Fires every special a hit lands on, and whatever those hit in turn. */
    function expand(s, hits, fired, fx) {
        const queue = [...hits];
        while (queue.length) {
            const i = queue.shift();
            const cell = s.cells[i];
            const t = cell.tile;
            if (!isCandy(t) || !t.special || fired.has(t.id) || cell.lock) continue;
            fired.add(t.id);
            const x = i % s.w, y = Math.floor(i / s.w);
            let targets;
            if (t.special === 'h') { targets = row(s, y); fx.push({kind: 'line', dir: 'h', i}); }
            else if (t.special === 'v') { targets = col(s, x); fx.push({kind: 'line', dir: 'v', i}); }
            else if (t.special === 'wrap') { targets = area(s, x, y, 1); fx.push({kind: 'blast', i, r: 1}); }
            else {
                const colour = commonestColour(s);
                targets = s.cells.flatMap((c, k) => (isCandy(c.tile) && c.tile.color === colour ? [k] : []));
                fx.push({kind: 'bomb', i, targets});
            }
            for (const k of targets) if (!hits.has(k)) { hits.add(k); queue.push(k); }
        }
    }

    function damageBlocker(s, i, ctx) {
        const cell = s.cells[i];
        if (!cell.blocker) return;
        if (cell.blocker.type === 'frosting') {
            cell.blocker.hp--;
            s.score += 40;
            s.progress.frosting++;
            if (cell.blocker.hp <= 0) cell.blocker = null;
        } else {
            cell.blocker = null;
            s.score += 60;
            s.progress.chocolate++;
            ctx.chocolateHit = true;
        }
    }

    /** Applies one round of hits: tiles go, jelly and blockers take damage. */
    function apply(s, hits, matched, creations, ctx, fx) {
        let candies = 0;
        for (const i of hits) {
            const cell = s.cells[i];
            if (cell.hole) continue;
            if (cell.blocker) { damageBlocker(s, i, ctx); continue; }
            if (cell.lock) { cell.lock = 0; s.score += 40; s.progress.locks++; }
            else if (isCandy(cell.tile)) {
                if (cell.tile.color >= 0) s.progress.colors[cell.tile.color]++;
                cell.tile = null;
                candies++;
            }
            if (cell.jelly > 0) { cell.jelly--; s.score += 100; s.progress.jelly++; }
        }
        // A match also chips at the blockers next to it; a blast only at the ones it hits.
        const chipped = new Set();
        for (const i of matched) for (const j of neighbours4(s, i)) {
            if (s.cells[j].blocker && !chipped.has(j) && !hits.has(j)) { chipped.add(j); damageBlocker(s, j, ctx); }
        }
        for (const c of creations) {
            s.cells[c.i].tile = c.tile;
            s.cells[c.i].lock = 0;
            s.score += c.tile.special === 'bomb' ? 200 : c.tile.special === 'wrap' ? 120 : 60;
            s.progress[c.tile.special === 'bomb' ? 'bomb' : c.tile.special === 'wrap' ? 'wrap' : 'stripe']++;
        }
        s.score += candies * 20 * ctx.cascade;
        ctx.candies += candies;
        emit(s, ctx, {t: 'clear', hits: [...hits], created: creations.map((c) => c.i), fx, cascade: ctx.cascade});
    }

    /** One round of matches; false when the board has none. */
    function resolveMatches(s, ctx) {
        const groups = findGroups(s);
        if (!groups.length) return false;
        const hits = new Set(), matched = new Set(), creations = [], fx = [];
        for (const g of groups) {
            g.cells.forEach((i) => { hits.add(i); matched.add(i); });
            const special = specialFor(g, ctx.cascade === 1 ? ctx.swapDir : null);
            if (special) {
                const tile = newTile(s, special === 'bomb' ? -1 : g.color, special);
                if (special === 'bomb') tile.color = -1;
                creations.push({i: specialSpot(g, ctx.cascade === 1 ? ctx.swapCells : []), tile});
            }
        }
        expand(s, hits, new Set(), fx);
        apply(s, hits, matched, creations, ctx, fx);
        return true;
    }

    // --- gravity ----------------------------------------------------------------

    function spawnTile(s) {
        const L = s.level;
        if (L.type === 'ingredients') {
            const onBoard = s.cells.filter((c) => c.tile && c.tile.kind === 'ingredient').length;
            if (onBoard < 2 && onBoard + s.progress.ingredients < L.goal.ingredients && s.rng.next() < 0.1) {
                return {id: s.nextId++, kind: 'ingredient', color: -1, special: null, timer: 0, look: s.rng.int(2)};
            }
        }
        const tile = newTile(s, s.rng.int(s.colors));
        if (L.bombTimer) {
            const ticking = s.cells.filter((c) => c.tile && c.tile.timer > 0).length;
            if (ticking < 2 && s.rng.next() < 0.035) tile.timer = L.bombTimer;
        }
        return tile;
    }

    /** Lets everything fall, sliding diagonally past blockers, and refills from the top. */
    function gravity(s, ctx) {
        const from = new Map(), spawned = [];
        const spawnDepth = new Array(s.w).fill(0);
        let moved = true;
        while (moved) {
            moved = false;
            for (let y = s.h - 1; y >= 0; y--) for (let x = 0; x < s.w; x++) {
                const i = y * s.w + x;
                if (!isEmpty(s.cells[i])) continue;
                let yy = y - 1;
                while (yy >= 0 && s.cells[yy * s.w + x].hole) yy--;
                if (yy < 0) {
                    const tile = spawnTile(s);
                    s.cells[i].tile = tile;
                    spawned.push({id: tile.id, x, depth: ++spawnDepth[x]});
                    moved = true;
                    continue;
                }
                const above = s.cells[yy * s.w + x];
                if (isEmpty(above)) continue;
                if (above.tile && !above.lock) {
                    if (!from.has(above.tile.id)) from.set(above.tile.id, yy * s.w + x);
                    s.cells[i].tile = above.tile;
                    above.tile = null;
                    moved = true;
                    continue;
                }
                // Blocked straight above: take a neighbour's tile that has nowhere to fall.
                for (const dx of [-1, 1]) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= s.w || y === 0) continue;
                    const j = (y - 1) * s.w + nx;
                    const src = s.cells[j], under = s.cells[y * s.w + nx];
                    if (src.hole || !src.tile || src.lock || src.blocker) continue;
                    if (!under.hole && isEmpty(under)) continue;
                    if (!from.has(src.tile.id)) from.set(src.tile.id, j);
                    s.cells[i].tile = src.tile;
                    src.tile = null;
                    moved = true;
                    break;
                }
            }
        }
        if (from.size || spawned.length) emit(s, ctx, {t: 'fall', from: [...from], spawned});
    }

    function collectIngredients(s, ctx) {
        const got = [];
        s.cells.forEach((c, i) => {
            if (c.exit && c.tile && c.tile.kind === 'ingredient') { got.push(i); c.tile = null; }
        });
        if (!got.length) return false;
        s.progress.ingredients += got.length;
        s.score += 1000 * got.length;
        emit(s, ctx, {t: 'collect', cells: got});
        return true;
    }

    function settle(s, ctx) {
        for (let guard = 0; guard < 60; guard++) {
            gravity(s, ctx);
            if (collectIngredients(s, ctx)) continue;
            ctx.cascade++;
            if (!resolveMatches(s, ctx)) return;
        }
    }

    // --- end of move ------------------------------------------------------------

    function spreadChocolate(s, ctx) {
        if (ctx.chocolateHit) return;
        const options = [];
        s.cells.forEach((c, i) => {
            if (!c.blocker || c.blocker.type !== 'chocolate') return;
            for (const j of neighbours4(s, i)) {
                const n = s.cells[j];
                if (isPlain(n.tile) && !n.lock && !n.tile.timer) options.push(j);
            }
        });
        if (!options.length) return;
        const j = s.rng.pick(options);
        s.cells[j].tile = null;
        s.cells[j].blocker = {type: 'chocolate', hp: 1};
        emit(s, ctx, {t: 'spread', i: j});
    }

    function tickBombs(s, ctx) {
        let any = false, boom = false;
        for (const c of s.cells) {
            if (c.tile && c.tile.timer > 0) { c.tile.timer--; any = true; if (c.tile.timer === 0) boom = true; }
        }
        if (any) emit(s, ctx, {t: 'tick'});
        return boom;
    }


    /**
     * Reshuffles a board with no move left. If no arrangement works, the board goes
     * back exactly as it was and the game ends: a changed board the page never heard
     * about would leave the two out of step.
     */
    function shuffleIfStuck(s, ctx) {
        if (validMoves(s).length) return;
        const spots = s.cells.flatMap((c, i) => (swappable(c) && isCandy(c.tile) ? [i] : []));
        const original = spots.map((i) => ({...s.cells[i].tile}));
        for (let tries = 0; tries < 60; tries++) {
            const tiles = spots.map((i) => s.cells[i].tile);
            for (let k = tiles.length - 1; k > 0; k--) { const j = s.rng.int(k + 1); [tiles[k], tiles[j]] = [tiles[j], tiles[k]]; }
            spots.forEach((i, k) => { s.cells[i].tile = tiles[k]; });
            if (tries > 30) spots.forEach((i) => { if (isPlain(s.cells[i].tile)) s.cells[i].tile.color = s.rng.int(s.colors); });
            if (spots.some((i) => hasMatchAt(s, i))) continue;
            if (validMoves(s).length) { emit(s, ctx, {t: 'shuffle'}); return; }
        }
        spots.forEach((i, k) => { s.cells[i].tile = original[k]; });
        s.over = 'lost';
        s.reason = 'stuck';
    }

    function remainingBlockers(s) {
        return s.cells.reduce((n, c) => n + (c.blocker ? (c.blocker.type === 'frosting' ? c.blocker.hp : 1) : 0), 0);
    }

    function goalMet(s) {
        const g = s.level.goal;
        switch (s.level.type) {
            case 'score':
            case 'timed': return s.score >= g.score;
            case 'jelly': return s.cells.every((c) => c.hole || c.jelly === 0);
            case 'ingredients': return s.progress.ingredients >= g.ingredients;
            case 'blockers': return remainingBlockers(s) === 0;
            case 'orders': return g.orders.every((o) => orderDone(s, o) >= o.need);
        }
        return false;
    }

    function orderDone(s, o) {
        return o.kind === 'color' ? s.progress.colors[o.color] : s.progress[o.kind];
    }

    function finishMove(s, ctx) {
        spreadChocolate(s, ctx);
        const boom = tickBombs(s, ctx);
        if (goalMet(s)) { s.over = 'won'; return; }
        if (boom) { s.over = 'lost'; s.reason = 'bomb'; return; }
        if (s.level.type !== 'timed' && s.moves <= 0) { s.over = 'lost'; s.reason = 'moves'; return; }
        shuffleIfStuck(s, ctx);
    }

    // --- moves ------------------------------------------------------------------

    function context(quiet) {
        return {events: quiet ? null : [], cascade: 1, candies: 0, chocolateHit: false, swapCells: [], swapDir: null};
    }

    /** The two-special (or colour bomb) swaps: their effect depends on both. */
    function comboHits(s, a, b, fx, fired) {
        const ta = s.cells[a].tile, tb = s.cells[b].tile;
        const x = b % s.w, y = Math.floor(b / s.w);
        const hits = new Set([a, b]);
        const kinds = [ta.special, tb.special];
        const has = (k) => kinds.includes(k);
        const stripe = (k) => k === 'h' || k === 'v';
        if (ta.special === 'bomb' && tb.special === 'bomb') {
            s.cells.forEach((c, i) => { if (!c.hole) hits.add(i); });
            fired.add(ta.id); fired.add(tb.id);
            fx.push({kind: 'bomb', i: b, targets: [...hits]});
            return hits;
        }
        if (has('bomb')) {
            const bomb = ta.special === 'bomb' ? ta : tb;
            const other = bomb === ta ? tb : ta;
            fired.add(bomb.id);
            const targets = [];
            s.cells.forEach((c, i) => {
                if (!isCandy(c.tile) || c.tile.color !== other.color || c.tile === other) return;
                if (other.special && !c.tile.special) c.tile.special = other.special === 'wrap' ? 'wrap' : (s.rng.next() < 0.5 ? 'h' : 'v');
                targets.push(i);
                hits.add(i);
            });
            fx.push({kind: 'bomb', i: bomb === ta ? a : b, targets});
            return hits;
        }
        fired.add(ta.id); fired.add(tb.id);
        if (stripe(kinds[0]) && stripe(kinds[1])) {
            row(s, y).concat(col(s, x)).forEach((i) => hits.add(i));
            fx.push({kind: 'line', dir: 'h', i: b}, {kind: 'line', dir: 'v', i: b});
        } else if (has('wrap') && (stripe(kinds[0]) || stripe(kinds[1]))) {
            for (let d = -1; d <= 1; d++) {
                if (y + d >= 0 && y + d < s.h) row(s, y + d).forEach((i) => hits.add(i));
                if (x + d >= 0 && x + d < s.w) col(s, x + d).forEach((i) => hits.add(i));
            }
            fx.push({kind: 'line', dir: 'h', i: b, wide: true}, {kind: 'line', dir: 'v', i: b, wide: true});
        } else {
            area(s, x, y, 2).forEach((i) => hits.add(i));
            fx.push({kind: 'blast', i: b, r: 2});
        }
        return hits;
    }

    /**
     * Swaps two neighbouring tiles. Returns null for a swap that is not allowed at all,
     * {ok: false} for one that makes nothing (and swaps back), else {ok: true, events}.
     */
    function swap(s, a, b, quiet) {
        return exchange(s, a, b, quiet, false);
    }

    /** The one swap path; `free` is the Switch booster: no match needed, no move spent. */
    function exchange(s, a, b, quiet, free) {
        if (s.over) return null;
        const adjacent = (Math.abs(a - b) === 1 && Math.floor(a / s.w) === Math.floor(b / s.w)) || Math.abs(a - b) === s.w;
        if (!adjacent || !swappable(s.cells[a]) || !swappable(s.cells[b])) return null;
        const ctx = context(quiet);
        const A = s.cells[a], B = s.cells[b];
        const combo = isCombo(A.tile, B.tile);
        [A.tile, B.tile] = [B.tile, A.tile];
        emit(s, ctx, {t: 'swap', a, b});
        if (!free && !combo && !hasMatchAt(s, a) && !hasMatchAt(s, b)) {
            [A.tile, B.tile] = [B.tile, A.tile];
            emit(s, ctx, {t: 'swap', a, b, back: true});
            return {ok: false, events: ctx.events};
        }
        if (!free) { s.moves--; s.movesUsed++; }
        ctx.swapCells = [a, b];
        ctx.swapDir = a % s.w === b % s.w ? 'v' : 'h';
        if (combo) {
            const fx = [], fired = new Set();
            const hits = comboHits(s, a, b, fx, fired);
            expand(s, hits, fired, fx);
            apply(s, hits, new Set(), [], ctx, fx);
        } else {
            resolveMatches(s, ctx);
        }
        // Always settle: even a matchless free switch can park a cherry on an exit.
        settle(s, ctx);
        if (free) {
            if (goalMet(s)) s.over = 'won';
            else shuffleIfStuck(s, ctx);
        } else {
            finishMove(s, ctx);
        }
        return {ok: true, events: ctx.events};
    }

    // --- boosters --------------------------------------------------------------
    //
    // None of them costs a move. The page owns how many the player has.

    /** Lollipop hammer: smashes one cell. */
    function smash(s, i, quiet) {
        if (s.over || s.cells[i].hole) return null;
        const cell = s.cells[i];
        if (!cell.tile && !cell.blocker) return null;
        if (cell.tile && cell.tile.kind === 'ingredient') return null;
        const ctx = context(quiet);
        const fx = [{kind: 'smash', i}];
        const hits = new Set([i]);
        expand(s, hits, new Set(), fx);
        apply(s, hits, new Set(), [], ctx, fx);
        settle(s, ctx);
        if (goalMet(s)) s.over = 'won';
        else shuffleIfStuck(s, ctx);
        return {ok: true, events: ctx.events};
    }

    /** Free switch: swaps two neighbours even when that makes no match. */
    function freeSwitch(s, a, b, quiet) {
        return exchange(s, a, b, quiet, true);
    }

    /** +5 moves (or +15 seconds on a timed level, which the page adds). */
    function extraMoves(s) {
        if (s.over || s.level.type === 'timed') return null;
        s.moves += 5;
        const ctx = context(false);
        emit(s, ctx, {t: 'tick'});
        return {ok: true, events: ctx.events};
    }

    /** Colour bomb: turns a random plain candy into a colour bomb. */
    function plantBomb(s) {
        if (s.over) return null;
        const plain = s.cells.flatMap((c, i) => (isPlain(c.tile) && !c.lock && !c.tile.timer ? [i] : []));
        if (!plain.length) return null;
        const i = s.rng.pick(plain);
        s.cells[i].tile.special = 'bomb';
        s.cells[i].tile.color = -1;
        const ctx = context(false);
        emit(s, ctx, {t: 'sugar', i});
        return {ok: true, events: ctx.events};
    }

    /** The clock ran out on a timed level. */
    function timeUp(s) {
        if (!s.over) { s.over = goalMet(s) ? 'won' : 'lost'; s.reason = 'time'; }
    }

    /** Sugar Crush: leftover moves turn into striped candies, then everything fires. */
    function bonus(s) {
        const ctx = context(false);
        const turns = s.level.type === 'timed' ? 0 : Math.min(s.moves, BONUS_MAX);
        for (let k = 0; k < turns; k++) {
            const plain = s.cells.flatMap((c, i) => (isPlain(c.tile) && !c.lock ? [i] : []));
            if (!plain.length) break;
            const i = s.rng.pick(plain);
            s.cells[i].tile.special = s.rng.next() < 0.5 ? 'h' : 'v';
            s.moves--;
            s.score += 300;
            emit(s, ctx, {t: 'sugar', i, bonus: true});
        }
        for (let round = 0; round < 12; round++) {
            const specials = s.cells.flatMap((c, i) => (isCandy(c.tile) && c.tile.special && !c.lock ? [i] : []));
            if (!specials.length) break;
            ctx.cascade = 1;
            const fx = [], hits = new Set(specials);
            expand(s, hits, new Set(), fx);
            apply(s, hits, new Set(), [], ctx, fx);
            settle(s, ctx);
        }
        return ctx.events;
    }

    // --- level design -----------------------------------------------------------

    const SHAPES = {
        full: () => true,
        diamond: (x, y, w, h) => Math.abs(x - (w - 1) / 2) + Math.abs(y - (h - 1) / 2) <= (w + h) / 2 - 2,
        corners: (x, y, w, h) => !((x === 0 || x === w - 1) && (y === 0 || y === h - 1)),
        islands: (x, y, w, h) => !((x === 2 || x === w - 3) && (y === 2 || y === h - 3)),
        split: (x, y, w, h) => !(x === Math.floor(w / 2) && y >= 3 && y <= h - 4),
        hourglass: (x, y, w, h) => {
            const mid = (h - 1) / 2, cut = Math.max(0, 2 - Math.abs(y - mid));
            return x >= cut && x < w - cut;
        },
        ring: (x, y, w, h) => !(Math.abs(x - (w - 1) / 2) <= 0.5 + (w % 2 ? 0.5 : 0) && Math.abs(y - (h - 1) / 2) <= 1),
    };

    /** The board and goal for level n, before the bot sets its budget. */
    function design(n, variant) {
        const rng = new Rng(hashSeed(`sweets:${n}:${variant}`));
        const d = Math.min(1, (n - 1) / 40);
        const type = n <= 6 ? TYPES[n - 1] : TYPES[(n - 1 + Math.floor(n / 6)) % TYPES.length];
        const size = n < 4 ? 7 : n < 10 ? 8 : 9;
        const colors = n < 4 ? 4 : n < 16 ? 5 : 6;
        const shapeNames = n < 4 ? ['full'] : Object.keys(SHAPES);
        const shape = SHAPES[rng.pick(shapeNames)];
        const L = {n, type, w: size, h: size, colors, d, seed: hashSeed(`sweets:${n}:${variant}:play`), cells: [], goal: {}};
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            L.cells.push({hole: !shape(x, y, size, size), jelly: 0, lock: 0, blocker: null, exit: false});
        }
        const open = () => L.cells.flatMap((c, i) => (c.hole || c.blocker ? [] : [i]));
        const place = (count, fn) => {
            const spots = open();
            for (let k = 0; k < count && spots.length; k++) fn(spots.splice(rng.int(spots.length), 1)[0]);
        };

        if (type === 'jelly') {
            const pattern = rng.int(3);
            L.cells.forEach((c, i) => {
                if (c.hole) return;
                const x = i % size, y = Math.floor(i / size);
                const inside = pattern === 0 ? true : pattern === 1 ? y >= size - 3 - Math.floor(d * 3) : Math.abs(x - (size - 1) / 2) + Math.abs(y - (size - 1) / 2) <= 2 + d * 3;
                if (inside) c.jelly = d > 0.25 && rng.next() < d * 0.7 ? 2 : 1;
            });
        }
        const wantsBlockers = type === 'blockers' || (n >= 8 && rng.next() < 0.35 + d * 0.4);
        if (wantsBlockers) {
            const chocolate = type === 'blockers' ? n % 2 === 0 && n >= 10 : n >= 18 && rng.next() < 0.25;
            const frost = type === 'blockers' ? 8 + Math.floor(d * 12) : 3 + Math.floor(d * 6);
            const band = 2 + rng.int(size - 4);
            const spots = open().filter((i) => Math.abs(Math.floor(i / size) - band) <= 1);
            for (let k = 0; k < frost && spots.length; k++) {
                const i = spots.splice(rng.int(spots.length), 1)[0];
                L.cells[i].blocker = {type: 'frosting', hp: 1 + rng.int(1 + Math.min(2, Math.floor(d * 3)))};
            }
            if (chocolate) place(2 + Math.floor(d * 3), (i) => { L.cells[i].blocker = {type: 'chocolate', hp: 1}; });
        }
        if (n >= 10) place(2 + Math.floor(d * 6), (i) => { L.cells[i].lock = 1; });
        if (n >= 14 && (type === 'score' || type === 'orders') && rng.next() < 0.5) L.bombTimer = 15 - Math.floor(d * 4);

        if (type === 'ingredients') {
            L.goal.ingredients = 2 + Math.floor(d * 2) + (n > 25 ? 1 : 0);
            for (let x = 0; x < size; x++) {
                for (let y = size - 1; y >= 0; y--) {
                    const c = L.cells[y * size + x];
                    if (!c.hole) { c.exit = true; break; }
                }
            }
        }
        if (type === 'orders') {
            const orders = [];
            const used = new Set();
            const pickColour = () => { let c; do { c = rng.int(colors); } while (used.has(c)); used.add(c); return c; };
            orders.push({kind: 'color', color: pickColour(), need: 15 + Math.floor(d * 20)});
            if (rng.next() < 0.6) orders.push({kind: 'color', color: pickColour(), need: 12 + Math.floor(d * 18)});
            orders.push(rng.pick([{kind: 'stripe', need: 2 + Math.floor(d * 3)}, {kind: 'wrap', need: 1 + Math.floor(d * 2)}, ...(n >= 12 ? [{kind: 'bomb', need: 1}] : [])]));
            const frost = L.cells.reduce((k, c) => k + (c.blocker && c.blocker.type === 'frosting' ? c.blocker.hp : 0), 0);
            if (frost >= 4) orders.push({kind: 'frosting', need: Math.ceil(frost * 0.7)});
            L.goal.orders = orders;
        }
        return L;
    }

    // --- game state -------------------------------------------------------------

    function start(L, seed = L.seed) {
        const s = {
            level: L, w: L.w, h: L.h, colors: L.colors, rng: new Rng(seed), nextId: 1,
            cells: L.cells.map((c) => ({...c, blocker: c.blocker ? {...c.blocker} : null, tile: null})),
            score: 0, moves: L.moves || BOT_CAP, movesUsed: 0, sugar: 0, over: null, reason: null,
            progress: {colors: new Array(L.colors).fill(0), stripe: 0, wrap: 0, bomb: 0, frosting: 0, chocolate: 0, locks: 0, jelly: 0, ingredients: 0},
        };
        for (let attempt = 0; attempt < 50; attempt++) {
            // Filled in reading order from empty, so only the two cells left and the two
            // above can rule a colour out: never all of them.
            s.cells.forEach((c) => { c.tile = null; });
            s.cells.forEach((c, i) => {
                if (c.hole || c.blocker) return;
                do { c.tile = newTile(s, s.rng.int(s.colors)); } while (hasMatchAt(s, i));
            });
            if (validMoves(s).length >= 3) break;
        }
        if (L.type === 'ingredients') {
            const top = s.cells.findIndex((c, i) => !c.hole && !c.blocker && !c.lock && i >= Math.floor(s.w / 2));
            if (top >= 0) s.cells[top].tile = {id: s.nextId++, kind: 'ingredient', color: -1, special: null, timer: 0, look: 0};
        }
        return s;
    }

    function clone(s) {
        return {
            ...s, rng: new Rng(s.rng.s),
            cells: s.cells.map((c) => ({...c, blocker: c.blocker ? {...c.blocker} : null, tile: c.tile ? {...c.tile} : null})),
            progress: {...s.progress, colors: s.progress.colors.slice()},
        };
    }

    // --- the bot that sets every budget ------------------------------------------

    function progressValue(s) {
        const L = s.level;
        switch (L.type) {
            case 'jelly': return -s.cells.reduce((n, c) => n + (c.hole ? 0 : c.jelly), 0) * 400;
            case 'blockers': return -remainingBlockers(s) * 400;
            case 'ingredients': {
                let v = s.progress.ingredients * 3000;
                s.cells.forEach((c, i) => { if (c.tile && c.tile.kind === 'ingredient') v += Math.floor(i / s.w) * 150; });
                return v;
            }
            case 'orders': return L.goal.orders.reduce((v, o) => v + Math.min(orderDone(s, o), o.need) * (o.kind === 'color' ? 60 : 500), 0);
        }
        return 0;
    }

    function botMove(s, rng) {
        const moves = validMoves(s);
        let best = null, bestValue = -Infinity;
        const base = progressValue(s);
        for (const [a, b] of moves) {
            const c = clone(s);
            swap(c, a, b, true);
            let v = progressValue(c) - base + (c.score - s.score) * 0.2;
            if (c.over === 'won') v += 1e7;
            if (c.over === 'lost' && c.reason === 'bomb') v -= 1e7;
            v *= 0.85 + rng.next() * 0.3;
            if (v > bestValue) { bestValue = v; best = [a, b]; }
        }
        return best;
    }

    /**
     * Plays a level once; returns moves used (or null) and the score reached. The
     * greedy bot proves a level can be won; the casual one, which taps any match it
     * sees, is how targets are set, since nobody plays like the greedy one.
     */
    function botPlay(L, seed, fixedMoves, casual = false) {
        const s = start({...L, moves: fixedMoves || BOT_CAP}, seed);
        const rng = new Rng(seed ^ 0x9E3779B9);
        while (!s.over) {
            if (fixedMoves && s.movesUsed >= fixedMoves) break;
            const m = casual ? rng.pick(validMoves(s)) : botMove(s, rng);
            if (!m) break;
            swap(s, m[0], m[1], true);
        }
        return {won: s.over === 'won', moves: s.movesUsed, score: s.score};
    }

    const cache = new Map();

    /** Level n, ready to play: board, goal, move budget and star scores. */
    function level(n) {
        if (cache.has(n)) return cache.get(n);
        let L = null;
        for (let variant = 0; variant < 6 && !L; variant++) {
            const candidate = design(n, variant);
            const d = candidate.d;
            if (candidate.type === 'score' || candidate.type === 'timed') {
                const turns = candidate.type === 'timed' ? 22 : 18 + Math.floor(d * 10);
                const runs = [...Array(BOT_RUNS).keys()].map((r) => botPlay(candidate, candidate.seed + 101 * r, turns));
                if (runs.some((r) => !r.won && r.moves < turns && candidate.bombTimer)) continue;
                const low = Math.min(...runs.map((r) => r.score));
                const casual = [...Array(BOT_RUNS).keys()].map((r) => botPlay(candidate, candidate.seed + 77 * r, turns, true).score).sort((a, b) => a - b);
                // The target sits below what a casual tapper scores at first and climbs
                // past it as levels go on; stars two and three ask for real play.
                candidate.goal.score = Math.max(500, Math.round((casual[1] * (0.7 + d * 0.45)) / 100) * 100);
                if (candidate.type === 'timed') { candidate.time = 60 + Math.floor(d * 30); candidate.moves = 999; }
                else candidate.moves = turns;
                // Stars two and three are a step up from the target, not the bot's best, so
                // the first star sits about halfway along the bar.
                const two = Math.max(candidate.goal.score + 500, Math.round((candidate.goal.score * 1.4) / 100) * 100);
                candidate.stars = [candidate.goal.score, two, Math.max(two + 500, Math.round((candidate.goal.score * 1.9) / 100) * 100)];
            } else {
                const runs = [...Array(BOT_RUNS).keys()].map((r) => botPlay(candidate, candidate.seed + 101 * r));
                if (runs.some((r) => !r.won)) continue;
                const most = Math.max(...runs.map((r) => r.moves));
                const avg = runs.reduce((a, r) => a + r.score, 0) / runs.length;
                // Generous early: twice what the greedy bot needed, narrowing as levels climb.
                candidate.moves = Math.max(12, Math.min(60, Math.ceil(most * (2.1 - d * 0.7)) + 3));
                // Goal levels: any score finishing the goal is one star; two and three ask a little more.
                candidate.stars = [1, Math.round((avg * 0.6) / 100) * 100, Math.round((avg * 0.9) / 100) * 100];
            }
            L = candidate;
        }
        if (!L) {
            // Nothing the bot could finish: a plain score level is always winnable.
            L = design(n, 0);
            Object.assign(L, {type: 'score', bombTimer: 0, goal: {score: 2000}, moves: 25, stars: [2000, 5000, 9000]});
            L.cells.forEach((c) => { c.blocker = null; c.lock = 0; c.jelly = 0; c.exit = false; });
        }
        if (cache.size > 8) cache.delete(cache.keys().next().value);
        cache.set(n, L);
        return L;
    }

    root.SweetsEngine = {level, design, start, swap, smash, freeSwitch, extraMoves, plantBomb, bonus, timeUp, validMoves, snapshot, botPlay, goalMet, orderDone, remainingBlockers};
    if (typeof module !== 'undefined') module.exports = root.SweetsEngine;
})(typeof self !== 'undefined' ? self : globalThis);
