/**
 * Cell Survivor rules: chapters, the agar channel, virus chains, weapons, level-ups.
 *
 * A chapter is a seed: its channel, where your cell stands and its waves come from
 * `chapter(n)`. A run steps at a fixed TICK, so a bot in Node (tools/cells-check.mjs)
 * plays the same game the page draws. Offers and placements use the run's own dice.
 */
(function (root) {
    'use strict';

    function hashSeed(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
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

    const W = 540, H = 960, TICK = 1 / 30;
    const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

    // --- chapters ------------------------------------------------------------------------

    /**
     * The channel the viruses crawl down: switchbacks from the top to the core at the
     * bottom, kept clear of the cell, sampled every STEP units.
     */
    const STEP = 4;
    function channel(r, cell) {
        const rows = 5 + Math.floor(r() * 2);
        const top = 70, bottom = H - 150;
        // Each row runs across the whole dish, so a row near the cell's height would run
        // straight through it: such a row moves to just above or below the cell.
        const ys = [];
        for (let k = 0; k < rows; k++) {
            let y = top + ((bottom - top) * k) / (rows - 1);
            if (Math.abs(y - cell.y) < 75) y = y <= cell.y || cell.y + 75 > bottom ? cell.y - 75 : cell.y + 75;
            if (!ys.length || y - ys[ys.length - 1] >= 80) ys.push(y);
        }
        const corners = [[60 + r() * (W - 120), -40]];
        let left = r() < 0.5;
        for (const y of ys) {
            corners.push([left ? 60 + r() * 40 : W - 100 + r() * 40, y]);
            corners.push([left ? W - 100 + r() * 40 : 60 + r() * 40, y]);
            left = !left;
        }
        corners.push([W / 2, H - 70]);
        // Rounded corners, then even samples.
        const pts = [];
        const R = 46;
        for (let k = 0; k < corners.length - 1; k++) {
            const [ax, ay] = corners[k], [bx, by] = corners[k + 1];
            const len = Math.hypot(bx - ax, by - ay);
            const cut = k + 1 < corners.length - 1 ? Math.min(R, len / 2) : 0;
            const n = Math.max(1, Math.round((len - cut) / STEP));
            const start = k === 0 ? 0 : Math.min(R, len / 2);
            for (let i = 0; i <= n; i++) {
                const t = (start + ((len - cut - start) * i) / n) / len;
                pts.push({x: ax + (bx - ax) * t, y: ay + (by - ay) * t});
            }
            if (cut && k + 2 < corners.length) {
                const [cx, cy] = corners[k + 2];
                const len2 = Math.hypot(cx - bx, cy - by), c2 = Math.min(R, len2 / 2);
                const p0 = pts[pts.length - 1], p2 = {x: bx + ((cx - bx) * c2) / len2, y: by + ((cy - by) * c2) / len2};
                for (let i = 1; i < 8; i++) {
                    const t = i / 8;
                    pts.push({x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * bx + t * t * p2.x, y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * by + t * t * p2.y});
                }
            }
        }
        // Resample to an even STEP.
        const even = [pts[0]];
        let carry = 0;
        for (let k = 1; k < pts.length; k++) {
            const a = pts[k - 1], b = pts[k];
            let seg = Math.hypot(b.x - a.x, b.y - a.y), at = 0;
            while (carry + seg - at >= STEP) {
                at += STEP - carry;
                carry = 0;
                even.push({x: a.x + ((b.x - a.x) * at) / seg, y: a.y + ((b.y - a.y) * at) / seg});
            }
            carry += seg - at;
        }
        return even;
    }

    /** Chapter n: its seed, where the cell stands, its channel and its waves. */
    function chapter(n) {
        const r = rng(hashSeed(`cells:chapter:${n}`));
        const centre = n % 2 === 0;
        const cell = centre ? {x: W / 2, y: H * 0.47, kind: 'centre'} : {x: W / 2, y: H - 175, kind: 'bottom'};
        const path = channel(r, cell);
        // Chapters ramp gently; within one the viruses toughen a lot, as your weapons do.
        const tier = 1.8 * (1 + 0.95 * (n - 1) + 0.09 * (n - 1) * (n - 1));
        const waves = [];
        const count = 14 + Math.min(10, Math.floor(n / 2));
        let t = 2;
        for (let k = 0; k < count; k++) {
            const p = k / (count - 1);
            const mid = k === Math.floor(count / 2);
            waves.push({
                at: t, size: mid ? 5 : Math.round(6 + p * 10 + r() * 4), big: mid ? 9 : 1,
                hp: 9 * tier * (1 + 75 * p * p), speed: (mid ? 26 : 38 + p * 18) * (1 + Math.min(0.3, n * 0.012)),
                look: mid ? 3 : Math.floor(r() * 3),
            });
            t += mid ? 9 : 6.5 - p * 2 + r() * 2;
        }
        const boss = {at: t + 6, size: 7, big: 5, hp: 9 * tier * 10, speed: 22, look: 4};
        return {n, cell, path, length: path.length * STEP, waves, boss, unlocks: UNLOCKS.filter(([, at]) => at <= n).map(([w]) => w)};
    }

    // --- weapons -----------------------------------------------------------------------------
    //
    // Every weapon has MAX_LEVEL levels. `stats(level)` gives what it does at that level;
    // `gains(id, level)` says what that level adds, read off the stats themselves. A weapon
    // at its top level evolves once its partner boost has been taken (EVOLVE).

    const WEAPONS = {
        pill: {name: 'Capsule', text: 'Fires pills at the virus closest to the core',
            stats: (l) => ({cd: 0.62 - 0.05 * l, dmg: 9 + 3 * l, shots: 1 + Math.floor(l / 2), pierce: l >= 4 ? 1 : 0}),},
        scalpel: {name: 'Spinning Scalpel', text: 'Blades circle your cell',
            stats: (l) => ({blades: 1 + Math.ceil(l / 2), radius: 78 + 10 * l, dmg: 9 + 4 * l, spin: 2.6 + 0.25 * l}),},
        swab: {name: 'Cotton Swab', text: 'Scrubs the path ahead of the leading virus',
            stats: (l) => ({cd: 3.2 - 0.25 * l, radius: 52 + 9 * l, dps: 18 + 7 * l, life: 2.2 + 0.25 * l}),},
        bubble: {name: 'Soap Bubble', text: 'Bouncing bubbles burst on viruses',
            stats: (l) => ({cd: 2.4 - 0.18 * l, count: 1 + Math.floor(l / 2), blast: 50 + 8 * l, dmg: 24 + 9 * l}),},
        needles: {name: 'Acupuncture', text: 'A fan of needles that pierce',
            stats: (l) => ({cd: 1.5 - 0.1 * l, count: 3 + l, dmg: 6 + 2 * l, pierce: 1 + Math.floor(l / 2)}),},
        tower: {name: 'Med Tower', text: 'Drops towers by the channel that fire lasers',
            stats: (l) => ({cd: 6.5 - 0.6 * l, max: 1 + Math.ceil(l / 2), dmg: 13 + 5 * l, rate: 0.75, range: 150 + 12 * l, life: 11 + l}),},
        shock: {name: 'Static Shock', text: 'Lightning that jumps from virus to virus',
            stats: (l) => ({cd: 2.4 - 0.15 * l, dmg: 16 + 6 * l, jumps: 2 + l}),},
        satellite: {name: 'Satellite', text: 'Orbiters that zap a share of a virus\' health',
            stats: (l) => ({count: 1 + Math.ceil(l / 2), share: 0.025 + 0.006 * l, flat: 3 + l, rate: 0.9, range: 230}),},
        maw: {name: 'Phage Maw', text: 'Bites weakened viruses clean in two',
            stats: (l) => ({cd: 1.9 - 0.15 * l, below: 0.16 + 0.03 * l, dmg: 20 + 8 * l, range: 330}),},
    };

    /** Each weapon's evolved form: the boost it needs, and what it changes. */
    const EVOLVE = {
        pill: {boost: 'twin', name: 'Megadose', text: 'More pills, and each bursts where it hits', apply: (s) => { s.shots += 2; s.dmg *= 1.5; s.blast = 46; }},
        scalpel: {boost: 'haste', name: 'Blade Storm', text: 'Twice the blades, cutting deeper', apply: (s) => { s.blades *= 2; s.dmg *= 1.5; }},
        swab: {boost: 'reach', name: 'Scrub Brush', text: 'Two huge swabs at a time', apply: (s) => { s.radius *= 1.4; s.dps *= 2; s.twice = true; }},
        bubble: {boost: 'chain', name: 'Foam Party', text: 'Bubbles split in three when they burst', apply: (s) => { s.count += 1; s.split = 3; }},
        needles: {boost: 'ricochet', name: 'Needle Rain', text: 'Twice the needles, piercing everything', apply: (s) => { s.count *= 2; s.pierce += 3; }},
        tower: {boost: 'might', name: 'Clinic', text: 'More towers, firing twice as fast', apply: (s) => { s.max += 3; s.rate /= 2; }},
        shock: {boost: 'crit', name: 'Thunderstorm', text: 'Longer chains that strike twice', apply: (s) => { s.jumps *= 2; s.dmg *= 1.5; s.twice = true; }},
        satellite: {boost: 'learn', name: 'Constellation', text: 'Twice the satellites, bigger bites', apply: (s) => { s.count *= 2; s.share *= 1.5; }},
        maw: {boost: 'mend', name: 'Devourer', text: 'Swallows three at once, hungrier still', apply: (s) => { s.below += 0.2; s.bites = 3; }},
    };

    const COUNTS = {shots: 'pill', blades: 'blade', count: '', max: 'tower', jumps: 'jump', pierce: 'pierce'};
    const BETTER = {dmg: 'harder', dps: 'harder', flat: 'harder', share: 'bigger bite', cd: 'faster', rate: 'faster', spin: 'faster',
        radius: 'bigger', blast: 'bigger bursts', range: 'longer reach', life: 'lasts longer', below: 'hungrier'};
    const LOWER_IS_BETTER = new Set(['cd', 'rate']);

    /** What level `level` of a weapon adds over the one before, in a few words. */
    function gains(id, level) {
        const was = WEAPONS[id].stats(level - 1), now = WEAPONS[id].stats(level);
        const out = [];
        for (const [k, noun] of Object.entries(COUNTS)) {
            if (!(k in now) || now[k] <= was[k]) continue;
            const n = now[k] - was[k];
            const what = noun || {bubble: 'bubble', needles: 'needle', satellite: 'satellite'}[id] || 'more';
            out.push(k === 'pierce' ? (was[k] ? 'pierce more' : 'pierce') : `+${n} ${what}${n > 1 ? 's' : ''}`);
        }
        const words = new Set();
        for (const [k, word] of Object.entries(BETTER)) {
            if (!(k in now)) continue;
            if (LOWER_IS_BETTER.has(k) ? now[k] < was[k] : now[k] > was[k]) words.add(word);
        }
        return out.concat([...words]).slice(0, 3).join(', ');
    }

    /** Weapons a chapter has to have been reached to be offered. */
    const UNLOCKS = [['pill', 1], ['scalpel', 1], ['swab', 1], ['bubble', 1], ['needles', 2], ['shock', 3], ['tower', 4], ['satellite', 6], ['maw', 8]];
    const MAX_LEVEL = 8, MAX_WEAPONS = 5;

    // Boosts stack without end; each also opens one weapon's evolution.
    const BOOSTS = {
        might: {name: 'Might', text: '+15% damage'},
        haste: {name: 'Haste', text: 'Weapons 10% quicker'},
        crit: {name: 'Sharp Eye', text: '+8% chance of a double hit'},
        reach: {name: 'Reach', text: '+15% size and range'},
        twin: {name: 'Twin Shot', text: 'One more pill and bubble, two more needles, per shot'},
        ricochet: {name: 'Ricochet', text: 'Pills and needles pierce one more'},
        chain: {name: 'Chain Reaction', text: 'Popped viruses burst and hurt their neighbours'},
        mend: {name: 'Mend', text: 'The core heals 6'},
        learn: {name: 'Quick Study', text: '+20% DNA'},
    };

    /** A weapon's stats at a level, evolved or not. */
    function statsOf(id, level, evolved) {
        const s = WEAPONS[id].stats(level);
        if (evolved) EVOLVE[id].apply(s);
        return s;
    }

    // --- the run ------------------------------------------------------------------------------

    // The dish in buckets, so a shot only looks at the viruses near it.
    const CELL = 48, GW = Math.ceil(W / CELL) + 2, GH = Math.ceil(H / CELL) + 2;
    const bucket = (x, y) => Math.max(0, Math.min(GH - 1, Math.floor(y / CELL) + 1)) * GW + Math.max(0, Math.min(GW - 1, Math.floor(x / CELL) + 1));
    const MAX_ORBS = 160;

    /**
     * One attempt at a chapter. `meta` is the lab: {attack, cooldown, crit, core} levels.
     * Step it at TICK; when `pending` holds offers, it waits for `choose`.
     */
    function Run(n, meta = {}, seed = 1) {
        this.ch = chapter(n);
        this.r = rng(hashSeed(`cells:run:${n}:${seed}`));
        this.t = 0;
        this.cell = {...this.ch.cell};
        this.coreMax = 20 + 2 * (meta.core || 0);
        this.core = this.coreMax;
        this.mods = {dmg: 1 + 0.06 * (meta.attack || 0), cd: Math.max(0.6, 1 - 0.03 * (meta.cooldown || 0)), crit: 0.03 * (meta.crit || 0), area: 1, xp: 1};
        this.weapons = {pill: 1};
        this.evolved = {};
        this.boosts = {};
        this.armed = [];   // [id, stats] per weapon, rebuilt when a pick changes one
        this.arm();
        this.timers = {};
        this.chains = [];
        this.shots = [];
        this.zones = [];
        this.towers = [];
        this.orbs = [];
        this.pops = [];    // chain-reaction bursts waiting for the next tick
        this.events = [];
        this.level = 1;
        this.xp = 0;
        this.need = 5;
        this.pending = null;
        this.waveIndex = 0;
        this.live = [];
        this.grid = Array.from({length: GW * GH}, () => []);
        this.found = [];
        this.blasted = [];
        this.killed = 0;
        this.total = this.ch.waves.reduce((s, w) => s + w.size, 0) + this.ch.boss.size;
        this.bossOut = false;
        this.charge = 0;
        this.over = null;
        this.nextId = 1;
        this.chests = [];
    }

    Run.prototype.arm = function () {
        this.armed = Object.entries(this.weapons).map(([id, l]) => [id, statsOf(id, l, this.evolved[id])]);
        this.armedAt = (this.armedAt || 0) + 1;   // tells a screen its weapon row is stale
    };

    /** A point d units along the channel, between its samples (no 4-unit jumps). */
    Run.prototype.at = function (d) {
        const p = this.ch.path, f = Math.max(0, Math.min(p.length - 1, d / STEP)), i = Math.floor(f);
        if (i >= p.length - 1) return p[p.length - 1];
        const t = f - i, a = p[i], b = p[i + 1];
        return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t};
    };

    Run.prototype.spawn = function (w, boss) {
        const segs = [];
        for (let k = 0; k < w.size; k++) {
            const head = k === 0;
            const hp = w.hp * w.big * (head ? 2.5 : 1);
            const d = -k * (w.big > 1 ? 40 : 26), p = this.at(d);
            segs.push({id: this.nextId++, d, hp, max: hp, head, look: w.look, r: (w.big > 1 ? 22 : 13) + (head ? 4 : 0), x: p.x, y: p.y, px: p.x, py: p.y, cut: 0, slow: 0});
        }
        this.chains.push({segs, speed: w.speed, look: w.look, boss: !!boss, big: w.big});
        if (w.big > 1 && !boss) this.events.push({t: 'midboss'});
        this.live = null;
    };

    /**
     * Segments in the dish, built once per phase of a step and shared by every weapon.
     * One killed this tick stays in it with hp 0, so callers skip hp <= 0.
     */
    Run.prototype.segments = function () {
        if (!this.live) {
            this.live = [];
            for (const c of this.chains) for (const s of c.segs) if (s.d >= 0 && s.hp > 0) this.live.push(s);
        }
        return this.live;
    };

    /** Files every segment in its bucket; call after the segments moved. */
    Run.prototype.index = function () {
        for (const b of this.grid) b.length = 0;
        for (const s of this.segments()) this.grid[bucket(s.x, s.y)].push(s);
    };

    /** Living segments within `r` of (x, y), into `out`. An area hits what it touches: a segment's own size counts. */
    Run.prototype.near = function (x, y, r, out = this.found) {
        out.length = 0;
        const reach = r + 26;
        const c0 = Math.max(0, Math.floor((x - reach) / CELL) + 1), c1 = Math.min(GW - 1, Math.floor((x + reach) / CELL) + 1);
        const r0 = Math.max(0, Math.floor((y - reach) / CELL) + 1), r1 = Math.min(GH - 1, Math.floor((y + reach) / CELL) + 1);
        for (let row = r0; row <= r1; row++) {
            for (let col = c0; col <= c1; col++) {
                for (const s of this.grid[row * GW + col]) {
                    if (s.hp <= 0) continue;
                    const dx = s.x - x, dy = s.y - y, rr = r + s.r;
                    if (dx * dx + dy * dy <= rr * rr) out.push(s);
                }
            }
        }
        return out;
    };

    Run.prototype.hurt = function (s, dmg, from) {
        if (s.hp <= 0) return;
        let hit = dmg * this.mods.dmg;
        const crit = this.r() < this.mods.crit;
        if (crit) hit *= 2;
        s.hp -= hit;
        // Only crits are worth a word on screen; a hit event per blow would flood a busy dish.
        if (crit && from !== 'swab') this.events.push({t: 'hit', x: s.x, y: s.y, n: Math.round(hit), crit, from});
        if (s.hp <= 0) this.kill(s);
    };

    Run.prototype.kill = function (s) {
        s.hp = 0;
        this.killed++;
        this.charge = Math.min(1, this.charge + 0.012);
        const worth = (s.head ? 3 : 1) * (s.r > 20 ? 4 : 1) * 2;
        // A crowded dish merges DNA into the drops already on their way.
        if (this.orbs.length < MAX_ORBS) this.orbs.push({x: s.x, y: s.y, v: worth, t: 0});
        else this.orbs[this.killed % MAX_ORBS].v += worth;
        this.events.push({t: 'pop', x: s.x, y: s.y, r: s.r, head: s.head, look: s.look});
        const chain = this.boosts.chain || 0;
        if (chain) this.pops.push({x: s.x, y: s.y, r: 44 + 8 * chain, dmg: s.max * 0.22 * chain / this.mods.dmg});
    };

    /** Targets, nearest the core first. */
    Run.prototype.leading = function (range = Infinity, from = this.cell) {
        let best = null;
        for (const s of this.segments()) {
            if (s.hp <= 0 || (range < Infinity && dist2(s, from) > range * range)) continue;
            if (!best || s.d > best.d) best = s;
        }
        return best;
    };

    Run.prototype.nearest = function (p, range, skip) {
        let best = null, bd = range * range;
        for (const s of this.segments()) {
            if (s.hp <= 0 || (skip && skip.has(s.id))) continue;
            const d = dist2(s, p);
            if (d < bd) { bd = d; best = s; }
        }
        return best;
    };

    Run.prototype.ready = function (key, cd) {
        this.timers[key] = (this.timers[key] || 0) - TICK;
        if (this.timers[key] > 0) return false;
        this.timers[key] = cd * this.mods.cd;
        return true;
    };

    Run.prototype.shot = function (kind, x, y, a, speed, props) {
        this.shots.push({kind, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, a, hit: [], ...props});
    };

    Run.prototype.fire = function () {
        const c = this.cell, area = this.mods.area, twin = this.boosts.twin || 0, rico = this.boosts.ricochet || 0;
        for (const [w, s] of this.armed) {
            if (w === 'pill' && this.ready(w, s.cd)) {
                const target = this.leading(640 * area);
                const n = s.shots + twin;
                if (target) for (let k = 0; k < n; k++) {
                    const a = Math.atan2(target.y - c.y, target.x - c.x) + (k - (n - 1) / 2) * 0.12;
                    this.shot('pill', c.x, c.y, a, 620, {dmg: s.dmg, pierce: s.pierce + rico, life: 1.4, blast: s.blast || 0});
                }
            } else if (w === 'scalpel') {
                const R = s.radius * area;
                for (let k = 0; k < s.blades; k++) {
                    const a = this.t * s.spin + (k * Math.PI * 2) / s.blades;
                    for (const seg of this.near(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R, 16)) {
                        if (seg.cut > this.t) continue;
                        seg.cut = this.t + 0.3;
                        this.hurt(seg, s.dmg, 'scalpel');
                    }
                }
            } else if (w === 'swab' && this.ready(w, s.cd)) {
                const lead = this.leading();
                if (lead) {
                    for (const ahead of s.twice ? [70, 210] : [70]) {
                        const p = this.at(lead.d + ahead);
                        this.zones.push({kind: 'swab', x: p.x, y: p.y, r: s.radius * area, dps: s.dps, life: s.life, age: 0});
                    }
                }
            } else if (w === 'bubble' && this.ready(w, s.cd)) {
                for (let k = 0; k < s.count + twin; k++) {
                    this.shot('bubble', c.x, c.y, this.r() * Math.PI * 2, 210, {dmg: s.dmg, blast: s.blast * area, life: 4.5, split: s.split || 0});
                }
            } else if (w === 'needles' && this.ready(w, s.cd)) {
                const target = this.nearest(c, 520 * area) || this.leading();
                if (target) {
                    const base = Math.atan2(target.y - c.y, target.x - c.x), n = s.count + 2 * twin;
                    for (let k = 0; k < n; k++) this.shot('needle', c.x, c.y, base + (k - (n - 1) / 2) * 0.16, 760, {dmg: s.dmg, pierce: s.pierce + rico, life: 0.9});
                }
            } else if (w === 'tower' && this.ready(w, s.cd)) {
                if (this.towers.length < s.max) {
                    // By the channel, a little off it, somewhere ahead of the viruses.
                    const lead = this.leading();
                    const d = Math.min(this.ch.length - 40, (lead ? lead.d : 0) + 120 + this.r() * 300);
                    const p = this.at(d), q = this.at(d + 8);
                    const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1, side = this.r() < 0.5 ? -1 : 1;
                    const x = Math.max(30, Math.min(W - 30, p.x + (side * nx * 44) / nl)), y = Math.max(30, Math.min(H - 30, p.y + (side * ny * 44) / nl));
                    this.towers.push({x, y, dmg: s.dmg, rate: s.rate, range: s.range * area, life: s.life, cool: 0});
                }
            } else if (w === 'shock' && this.ready(w, s.cd)) {
                for (let strike = 0; strike < (s.twice ? 2 : 1); strike++) {
                    let from = this.leading(560 * area);
                    if (!from) break;
                    const seen = new Set(), path = [{x: c.x, y: c.y}];
                    for (let k = 0; k <= s.jumps && from; k++) {
                        seen.add(from.id);
                        path.push({x: from.x, y: from.y});
                        this.hurt(from, s.dmg, 'shock');
                        from = this.nearest(from, 150 * area, seen);
                    }
                    this.events.push({t: 'shock', path});
                }
            } else if (w === 'satellite') {
                for (let k = 0; k < s.count; k++) {
                    const key = `sat${k}`;
                    if (!this.ready(key, s.rate)) continue;
                    const a = this.t * 1.6 + (k * Math.PI * 2) / s.count;
                    const p = {x: c.x + Math.cos(a) * 130, y: c.y + Math.sin(a) * 130};
                    const target = this.nearest(p, s.range * area);
                    if (target) {
                        this.events.push({t: 'zap', x0: p.x, y0: p.y, x1: target.x, y1: target.y});
                        this.hurt(target, s.flat + target.max * s.share, 'satellite');
                    }
                }
            } else if (w === 'maw' && this.ready(w, s.cd)) {
                const bitten = s.bites ? new Set() : null;
                for (let bite = 0; bite < (s.bites || 1); bite++) {
                    let prey = null;
                    for (const seg of this.segments()) {
                        if (seg.hp <= 0 || (bitten && bitten.has(seg.id)) || dist2(seg, c) > s.range * s.range * area * area) continue;
                        if (!prey || seg.hp / seg.max < prey.hp / prey.max) prey = seg;
                    }
                    if (!prey) break;
                    if (bitten) bitten.add(prey.id);
                    this.events.push({t: 'bite', x: prey.x, y: prey.y});
                    if (prey.hp / prey.max <= s.below && prey.r < 24) this.kill(prey);
                    else this.hurt(prey, s.dmg, 'maw');
                }
            }
        }
    };

    /** Keeps the items `keep` says yes to, in place: no new array per tick. */
    function prune(list, keep) {
        let n = 0;
        for (let i = 0; i < list.length; i++) if (keep(list[i])) list[n++] = list[i];
        list.length = n;
    }

    /** Area damage; its own scratch list, as it runs inside a loop over `found`. */
    Run.prototype.burst = function (x, y, r, dmg, from) {
        for (const o of this.near(x, y, r, this.blasted)) this.hurt(o, dmg, from);
    };

    Run.prototype.move = function () {
        // Chains crawl in single file: a chain never runs into the tail of the one ahead
        // (a slow one holds up the rest), and a segment that lost the one ahead closes up.
        let limit = Infinity;
        for (const ch of this.chains) {
            prune(ch.segs, (s) => s.hp > 0);
            if (!ch.segs.length) continue;
            // A segment that comes to lead is drawn with a face, but counts as what it is.
            for (let k = 0; k < ch.segs.length; k++) {
                const s = ch.segs[k];
                s.px = s.x; s.py = s.y;
                const v = ch.speed * (s.slow > this.t ? 0.45 : 1);
                if (k === 0) s.d = Math.min(s.d + v * TICK, Math.max(s.d, limit));
                else s.d = Math.min(ch.segs[k - 1].d - (ch.big > 1 ? 40 : 26), s.d + v * 2.2 * TICK);
                const p = this.at(s.d);
                s.x = p.x; s.y = p.y;
                if (s.d >= this.ch.length) {
                    this.core -= s.head ? 3 : 1;
                    s.hp = 0;
                    this.killed++;
                    this.events.push({t: 'leak', x: s.x, y: s.y});
                }
            }
            const tail = ch.segs[ch.segs.length - 1];
            limit = tail.d - (tail.r + 18);
        }
        prune(this.chains, (ch) => ch.segs.some((s) => s.hp > 0));
        this.live = null;
        this.index();
        // Chain reactions from the last tick go off now, so a crowd pops in a ripple.
        if (this.pops.length) {
            const pops = this.pops;
            this.pops = [];
            for (const p of pops) {
                this.events.push({t: 'chain', x: p.x, y: p.y, r: p.r});
                this.burst(p.x, p.y, p.r, p.dmg, 'chain');
            }
        }
        // Shots fly; pills and needles pierce a few, bubbles bounce off the dish.
        const spawned = [];
        for (const sh of this.shots) {
            sh.x += sh.vx * TICK; sh.y += sh.vy * TICK; sh.life -= TICK;
            if (sh.life <= 0) continue;
            if (sh.kind === 'bubble') {
                if (sh.x < 20 || sh.x > W - 20) sh.vx *= -1;
                if (sh.y < 20 || sh.y > H - 20) sh.vy *= -1;
            }
            for (const seg of this.near(sh.x, sh.y, 8)) {
                if (seg.hp <= 0 || sh.hit.includes(seg.id)) continue;
                if (sh.kind === 'bubble') {
                    this.burst(sh.x, sh.y, sh.blast, sh.dmg, 'bubble');
                    this.events.push({t: 'burst', x: sh.x, y: sh.y, r: sh.blast});
                    // Foam Party: a burst bubble leaves three small ones behind, once.
                    for (let k = 0; k < sh.split; k++) {
                        const a = this.r() * Math.PI * 2;
                        spawned.push({kind: 'bubble', x: sh.x, y: sh.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, a, hit: [seg.id], dmg: sh.dmg * 0.5, blast: sh.blast * 0.7, life: 2.2, split: 0, small: true});
                    }
                    sh.life = 0;
                    break;
                }
                sh.hit.push(seg.id);
                this.hurt(seg, sh.dmg, sh.kind);
                if (sh.blast) {
                    this.burst(sh.x, sh.y, sh.blast, sh.dmg * 0.5, sh.kind);
                    this.events.push({t: 'burst', x: sh.x, y: sh.y, r: sh.blast, pill: true});
                }
                if (sh.hit.length > sh.pierce) { sh.life = 0; break; }
            }
        }
        for (const b of spawned) this.shots.push(b);
        prune(this.shots, (s) => s.life > 0 && s.x > -40 && s.x < W + 40 && s.y > -40 && s.y < H + 40);
        for (const z of this.zones) {
            z.age += TICK;
            for (const seg of this.near(z.x, z.y, z.r - 13)) { this.hurt(seg, z.dps * TICK, 'swab'); seg.slow = this.t + 0.2; }
        }
        prune(this.zones, (z) => z.age < z.life);
        for (const tw of this.towers) {
            tw.life -= TICK;
            tw.cool -= TICK;
            if (tw.cool > 0 || tw.life <= 0) continue;
            const target = this.nearest(tw, tw.range);
            if (!target) continue;
            tw.cool = tw.rate;
            this.events.push({t: 'laser', x0: tw.x, y0: tw.y, x1: target.x, y1: target.y});
            this.hurt(target, tw.dmg, 'tower');
        }
        prune(this.towers, (t) => t.life > 0);
        // DNA drifts to the cell.
        for (const o of this.orbs) {
            o.t += TICK;
            const k = Math.min(1, o.t * 1.6);
            o.x += (this.cell.x - o.x) * 0.06 * (1 + k * 3);
            o.y += (this.cell.y - o.y) * 0.06 * (1 + k * 3);
            if (dist2(o, this.cell) < 400) { if (o.v) this.gain(o.v); o.v = 0; }
        }
        prune(this.orbs, (o) => o.v > 0);
    };

    Run.prototype.gain = function (v) {
        this.xp += v * this.mods.xp;
        if (this.xp >= this.need && !this.pending) {
            this.xp -= this.need;
            this.need = Math.round(this.need * 1.1 + 1);
            this.level++;
            this.pending = this.offers();
        }
    };

    /** Three different picks: an evolution, a weapon's next level, a new weapon, or a boost. */
    Run.prototype.offers = function () {
        const pool = [];
        for (const [w, l] of Object.entries(this.weapons)) {
            if (l < MAX_LEVEL) pool.push({kind: 'up', id: w, level: l + 1, weight: 3});
            else if (!this.evolved[w] && this.boosts[EVOLVE[w].boost]) pool.push({kind: 'evolve', id: w, level: l, weight: 8});
        }
        if (Object.keys(this.weapons).length < MAX_WEAPONS) {
            for (const w of this.ch.unlocks) if (!this.weapons[w]) pool.push({kind: 'new', id: w, level: 1, weight: 2});
        }
        for (const b of Object.keys(BOOSTS)) if (b !== 'mend' || this.core < this.coreMax) pool.push({kind: 'boost', id: b, weight: 1});
        const out = [];
        while (out.length < 3 && pool.length) {
            let x = this.r() * pool.reduce((s, o) => s + o.weight, 0), k = 0;
            for (; k < pool.length - 1; k++) { x -= pool[k].weight; if (x < 0) break; }
            out.push(pool.splice(k, 1)[0]);
        }
        return out;
    };

    Run.prototype.choose = function (i) {
        const o = this.pending && this.pending[i];
        if (!o) return;
        if (o.kind === 'evolve') this.evolved[o.id] = true;
        else if (o.kind !== 'boost') this.weapons[o.id] = o.level;
        else {
            this.boosts[o.id] = (this.boosts[o.id] || 0) + 1;
            if (o.id === 'might') this.mods.dmg *= 1.15;
            else if (o.id === 'haste') this.mods.cd *= 0.9;
            else if (o.id === 'crit') this.mods.crit += 0.08;
            else if (o.id === 'reach') this.mods.area *= 1.15;
            else if (o.id === 'mend') this.core = Math.min(this.coreMax, this.core + 6);
            else if (o.id === 'learn') this.mods.xp *= 1.2;
        }
        this.arm();
        this.pending = null;
        if (this.xp >= this.need) this.gain(0);
    };

    /** Antibody Burst: a share of every virus's health, more for small ones; it slows them too. */
    Run.prototype.ultimate = function () {
        if (this.charge < 1 || this.over || this.pending) return false;
        this.charge = 0;
        this.events.push({t: 'burst-all'});
        for (const s of this.segments()) {
            if (s.hp <= 0) continue;
            s.slow = this.t + 3;
            this.hurt(s, (s.r > 20 ? 0.12 : 0.35) * s.max / this.mods.dmg, 'ultimate');
        }
        return true;
    };

    /** Progress: share of the chapter's viruses dealt with. Chests at a quarter, half and all. */
    Run.prototype.progress = function () { return Math.min(1, this.killed / this.total); };

    Run.prototype.step = function () {
        if (this.over || this.pending) return;
        this.events = [];
        this.live = null;
        this.t += TICK;
        this.charge = Math.min(1, this.charge + TICK / 40);
        const ws = this.ch.waves;
        while (this.waveIndex < ws.length && ws[this.waveIndex].at <= this.t) this.spawn(ws[this.waveIndex++]);
        if (!this.bossOut && this.waveIndex >= ws.length && this.t >= this.ch.boss.at) {
            this.bossOut = true;
            this.spawn(this.ch.boss, true);
            this.events.push({t: 'boss'});
        }
        this.index();
        this.fire();
        this.move();
        for (const q of [0.25, 0.5]) {
            if (this.progress() >= q && !this.chests.includes(q)) { this.chests.push(q); this.events.push({t: 'chest', q}); }
        }
        if (this.core <= 0) { this.core = 0; this.over = 'lost'; }
        else if (this.bossOut && !this.chains.length) {
            // The last chest is for clearing the chapter, not for reaching its end some other way.
            this.over = 'won';
            this.chests.push(1);
            this.events.push({t: 'chest', q: 1});
        }
        // A level-up on the last tick would wait for a pick nobody will be asked for.
        if (this.over) this.pending = null;
    };

    /** Coins for a run: per chest reached, more for a win and deeper chapters. */
    function coins(n, chests, won) {
        const per = 20 + 6 * n;
        return chests.length * per + (won ? per * 2 : 0);
    }

    /** The lab's permanent upgrades; `labCost` says what a level costs. */
    const LAB = {
        attack: {name: 'Attack', text: '+6% damage', max: 30},
        cooldown: {name: 'Cooldown', text: 'Weapons 3% quicker', max: 13},
        crit: {name: 'Crit', text: '+3% chance of a double hit', max: 15},
        core: {name: 'Core', text: '+2 core health', max: 20},
    };
    const labCost = (level) => Math.round(60 * Math.pow(1.32, level));

    const api = {W, H, TICK, STEP, WEAPONS, EVOLVE, BOOSTS, UNLOCKS, MAX_LEVEL, MAX_WEAPONS, LAB, hashSeed, rng, chapter, gains, statsOf, Run, coins, labCost};
    root.CellsEngine = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
