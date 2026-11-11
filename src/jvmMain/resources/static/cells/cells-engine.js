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
        const tier = 1.8 * (1 + 0.55 * (n - 1) + 0.05 * (n - 1) * (n - 1));
        const waves = [];
        const count = 12 + Math.min(8, Math.floor(n / 2));
        let t = 2;
        for (let k = 0; k < count; k++) {
            const p = k / (count - 1);
            const mid = k === Math.floor(count / 2);
            waves.push({
                at: t, size: mid ? 4 : Math.round(5 + p * 8 + r() * 3), big: mid ? 9 : 1,
                hp: 9 * tier * (1 + 20 * p * p), speed: (mid ? 26 : 36 + p * 14) * (1 + Math.min(0.3, n * 0.012)),
                look: mid ? 3 : Math.floor(r() * 3),
            });
            t += mid ? 9 : 7 - p * 2 + r() * 2;
        }
        const boss = {at: t + 6, size: 6, big: 5, hp: 9 * tier * 7, speed: 22, look: 4};
        return {n, cell, path, length: path.length * STEP, waves, boss, unlocks: UNLOCKS.filter(([, at]) => at <= n).map(([w]) => w)};
    }

    // --- weapons -----------------------------------------------------------------------------
    //
    // Every weapon has five levels. `stats(level)` gives what it does at that level;
    // `gains(id, level)` says what that level adds, read off the stats themselves.

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
    const MAX_LEVEL = 5, MAX_WEAPONS = 5;

    const BOOSTS = {
        might: {name: 'Might', text: '+15% damage'},
        haste: {name: 'Haste', text: 'Weapons 10% quicker'},
        crit: {name: 'Sharp Eye', text: '+8% chance of a double hit'},
        reach: {name: 'Reach', text: '+15% size and range'},
        mend: {name: 'Mend', text: 'The core heals 6'},
        learn: {name: 'Quick Study', text: '+20% DNA'},
    };

    // --- the run ------------------------------------------------------------------------------

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
        this.timers = {};
        this.chains = [];
        this.shots = [];
        this.zones = [];
        this.towers = [];
        this.orbs = [];
        this.events = [];
        this.level = 1;
        this.xp = 0;
        this.need = 5;
        this.pending = null;
        this.waveIndex = 0;
        this.live = [];
        this.killed = 0;
        this.total = this.ch.waves.reduce((s, w) => s + w.size, 0) + this.ch.boss.size;
        this.bossOut = false;
        this.charge = 0;
        this.over = null;
        this.nextId = 1;
        this.chests = [];
    }

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
            segs.push({id: this.nextId++, d, hp, max: hp, head, r: (w.big > 1 ? 22 : 13) + (head ? 4 : 0), x: p.x, y: p.y, px: p.x, py: p.y, cut: 0, slow: 0});
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

    Run.prototype.hurt = function (s, dmg, from) {
        if (s.hp <= 0) return;
        let hit = dmg * this.mods.dmg;
        const crit = this.r() < this.mods.crit;
        if (crit) hit *= 2;
        s.hp -= hit;
        this.events.push({t: 'hit', x: s.x, y: s.y, n: Math.round(hit), crit, from});
        if (s.hp <= 0) this.kill(s);
    };

    Run.prototype.kill = function (s) {
        s.hp = 0;
        this.killed++;
        this.charge = Math.min(1, this.charge + 0.012);
        const worth = s.head ? 3 : 1;
        this.orbs.push({x: s.x, y: s.y, v: worth * (s.r > 20 ? 4 : 1), t: 0});
        this.events.push({t: 'pop', x: s.x, y: s.y, r: s.r, head: s.head});
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

    Run.prototype.fire = function () {
        const c = this.cell, area = this.mods.area;
        for (const [w, l] of Object.entries(this.weapons)) {
            const s = WEAPONS[w].stats(l);
            if (w === 'pill' && this.ready(w, s.cd)) {
                const target = this.leading(640 * area);
                if (target) for (let k = 0; k < s.shots; k++) {
                    const spread = (k - (s.shots - 1) / 2) * 0.12;
                    const a = Math.atan2(target.y - c.y, target.x - c.x) + spread;
                    this.shots.push({kind: 'pill', x: c.x, y: c.y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, dmg: s.dmg, pierce: s.pierce, life: 1.4, hit: new Set(), a});
                }
            } else if (w === 'scalpel') {
                const R = s.radius * area;
                for (let k = 0; k < s.blades; k++) {
                    const a = this.t * s.spin + (k * Math.PI * 2) / s.blades;
                    const bx = c.x + Math.cos(a) * R, by = c.y + Math.sin(a) * R;
                    for (const seg of this.segments()) {
                        const dx = seg.x - bx, dy = seg.y - by, reach = seg.r + 16;
                        if (seg.hp <= 0 || dx * dx + dy * dy > reach * reach || seg.cut > this.t) continue;
                        seg.cut = this.t + 0.3;
                        this.hurt(seg, s.dmg, 'scalpel');
                    }
                }
            } else if (w === 'swab' && this.ready(w, s.cd)) {
                const lead = this.leading();
                if (lead) {
                    const p = this.at(lead.d + 70);
                    this.zones.push({kind: 'swab', x: p.x, y: p.y, r: s.radius * area, dps: s.dps, life: s.life, age: 0});
                }
            } else if (w === 'bubble' && this.ready(w, s.cd)) {
                for (let k = 0; k < s.count; k++) {
                    const a = this.r() * Math.PI * 2;
                    this.shots.push({kind: 'bubble', x: c.x, y: c.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, dmg: s.dmg, blast: s.blast * area, life: 4.5, hit: new Set()});
                }
            } else if (w === 'needles' && this.ready(w, s.cd)) {
                const target = this.nearest(c, 520 * area) || this.leading();
                if (target) {
                    const base = Math.atan2(target.y - c.y, target.x - c.x);
                    for (let k = 0; k < s.count; k++) {
                        const a = base + (k - (s.count - 1) / 2) * 0.16;
                        this.shots.push({kind: 'needle', x: c.x, y: c.y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, dmg: s.dmg, pierce: s.pierce, life: 0.9, hit: new Set(), a});
                    }
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
                let from = this.leading(560 * area);
                if (from) {
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
                let prey = null;
                for (const seg of this.segments()) {
                    if (seg.hp <= 0 || dist2(seg, c) > s.range * s.range * area * area) continue;
                    if (!prey || seg.hp / seg.max < prey.hp / prey.max) prey = seg;
                }
                if (prey) {
                    this.events.push({t: 'bite', x: prey.x, y: prey.y});
                    if (prey.hp / prey.max <= s.below && prey.r < 24) this.kill(prey);
                    else this.hurt(prey, s.dmg, 'maw');
                }
            }
        }
    };

    Run.prototype.move = function () {
        // Chains crawl in single file: a chain never runs into the tail of the one ahead
        // (a slow one holds up the rest), and a segment that lost the one ahead closes up.
        let limit = Infinity;
        for (const ch of this.chains) {
            ch.segs = ch.segs.filter((s) => s.hp > 0);
            if (!ch.segs.length) continue;
            // A segment that comes to lead is drawn with a face, but counts as what it is.
            ch.segs.forEach((s, k) => {
                s.px = s.x; s.py = s.y;
                const v = ch.speed * (s.slow > this.t ? 0.45 : 1);
                if (k === 0) s.d = Math.min(s.d + v * TICK, Math.max(s.d, limit));
                else {
                    const gap = ch.big > 1 ? 40 : 26;
                    const want = ch.segs[k - 1].d - gap;
                    s.d = Math.min(want, s.d + v * 2.2 * TICK);
                }
                const p = this.at(s.d);
                s.x = p.x; s.y = p.y;
                if (s.d >= this.ch.length) {
                    this.core -= s.head ? 3 : 1;
                    s.hp = 0;
                    this.killed++;
                    this.events.push({t: 'leak', x: s.x, y: s.y});
                }
            });
            const tail = ch.segs[ch.segs.length - 1];
            limit = tail.d - (tail.r + 18);
        }
        this.chains = this.chains.filter((ch) => ch.segs.some((s) => s.hp > 0));
        this.live = null;
        // Shots fly; pills and needles pierce a few, bubbles bounce off the dish.
        for (const sh of this.shots) {
            sh.x += sh.vx * TICK; sh.y += sh.vy * TICK; sh.life -= TICK;
            if (sh.kind === 'bubble') {
                if (sh.x < 20 || sh.x > W - 20) sh.vx *= -1;
                if (sh.y < 20 || sh.y > H - 20) sh.vy *= -1;
            }
            for (const seg of this.segments()) {
                if (sh.life <= 0 || seg.hp <= 0 || sh.hit.has(seg.id) || dist2(seg, sh) > (seg.r + 8) * (seg.r + 8)) continue;
                if (sh.kind === 'bubble') {
                    for (const o of this.segments()) if (o.hp > 0 && dist2(o, sh) <= sh.blast * sh.blast) this.hurt(o, sh.dmg, 'bubble');
                    this.events.push({t: 'burst', x: sh.x, y: sh.y, r: sh.blast});
                    sh.life = 0;
                    break;
                }
                sh.hit.add(seg.id);
                this.hurt(seg, sh.dmg, sh.kind);
                if (sh.hit.size > sh.pierce) { sh.life = 0; break; }
            }
        }
        this.shots = this.shots.filter((s) => s.life > 0 && s.x > -40 && s.x < W + 40 && s.y > -40 && s.y < H + 40);
        for (const z of this.zones) {
            z.age += TICK;
            for (const seg of this.segments()) if (seg.hp > 0 && dist2(seg, z) <= z.r * z.r) { this.hurt(seg, z.dps * TICK, 'swab'); seg.slow = this.t + 0.2; }
        }
        this.zones = this.zones.filter((z) => z.age < z.life);
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
        this.towers = this.towers.filter((t) => t.life > 0);
        // DNA drifts to the cell.
        for (const o of this.orbs) {
            o.t += TICK;
            const k = Math.min(1, o.t * 1.6);
            o.x += (this.cell.x - o.x) * 0.06 * (1 + k * 3);
            o.y += (this.cell.y - o.y) * 0.06 * (1 + k * 3);
            if (dist2(o, this.cell) < 400) { o.v && this.gain(o.v); o.v = 0; }
        }
        this.orbs = this.orbs.filter((o) => o.v > 0);
    };

    Run.prototype.gain = function (v) {
        this.xp += v * this.mods.xp;
        if (this.xp >= this.need && !this.pending) {
            this.xp -= this.need;
            this.need = Math.round(this.need * 1.24 + 1);
            this.level++;
            this.pending = this.offers();
        }
    };

    /** Three different picks: a weapon's next level, a new weapon, or a boost. */
    Run.prototype.offers = function () {
        const pool = [];
        for (const [w, l] of Object.entries(this.weapons)) if (l < MAX_LEVEL) pool.push({kind: 'up', id: w, level: l + 1, weight: 3});
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
        if (o.kind !== 'boost') this.weapons[o.id] = o.level;
        else if (o.id === 'might') this.mods.dmg *= 1.15;
        else if (o.id === 'haste') this.mods.cd *= 0.9;
        else if (o.id === 'crit') this.mods.crit += 0.08;
        else if (o.id === 'reach') this.mods.area *= 1.15;
        else if (o.id === 'mend') this.core = Math.min(this.coreMax, this.core + 6);
        else if (o.id === 'learn') this.mods.xp *= 1.2;
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

    const api = {W, H, TICK, STEP, WEAPONS, BOOSTS, UNLOCKS, MAX_LEVEL, MAX_WEAPONS, LAB, hashSeed, rng, chapter, gains, Run, coins, labCost};
    root.CellsEngine = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
