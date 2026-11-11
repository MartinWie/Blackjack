/**
 * Draft Battle rules: cards, the shared pool, the draft, armies and the battle.
 *
 * Both players of a live room run this same file on the same picks, so a battle must
 * come out identical on every phone: the simulation uses integers only (Math.sqrt of
 * an integer, floored, is exact everywhere; sin, cos, pow and Math.random are not
 * allowed in here). The server never sees a card; it only orders the picks.
 */
(function (root) {
    'use strict';

    // --- dice --------------------------------------------------------------------

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

    const pct = (v, p) => Math.floor((v * p) / 100);
    const isqrt = (n) => Math.floor(Math.sqrt(n));

    // --- units ---------------------------------------------------------------------
    //
    // Distances are field units (the field is W x H), time is ticks of TICK_MS.

    const W = 720, H = 960, TICK_MS = 30, MAX_TICKS = 1800;

    const UNITS = {
        goblin: {name: 'Goblin', hp: 50, atk: 10, range: 14, speed: 9, cd: 10, r: 9},
        sword: {name: 'Swordsman', hp: 110, atk: 16, range: 16, speed: 6, cd: 14, r: 11},
        archer: {name: 'Archer', hp: 60, atk: 16, range: 300, speed: 5, cd: 20, r: 10, shot: 'arrow'},
        knight: {name: 'Knight', hp: 300, atk: 25, range: 18, speed: 5, cd: 18, r: 14},
        giant: {name: 'Giant', hp: 1200, atk: 55, range: 22, speed: 3, cd: 30, r: 24, splash: 46},
        tower: {name: 'Tower', hp: 1200, atk: 28, range: 340, speed: 0, cd: 12, r: 22, shot: 'arrow', fixed: true},
        catapult: {name: 'Catapult', hp: 420, atk: 50, range: 760, speed: 0, cd: 48, r: 18, shot: 'rock', splash: 80, fixed: true},
        wall: {name: 'Wall', hp: 1300, atk: 0, range: 0, speed: 0, cd: 0, r: 26, fixed: true, wall: true},
    };
    const TROOPS = ['knight', 'giant', 'sword', 'goblin', 'archer'];   // front to back
    const MAX_TROOPS = 160;

    // --- cards ---------------------------------------------------------------------

    const CARDS = {
        goblins: {kind: 'add', unit: 'goblin', n: 10, name: 'Goblins'},
        swords: {kind: 'add', unit: 'sword', n: 6, name: 'Swordsmen'},
        archers: {kind: 'add', unit: 'archer', n: 5, name: 'Archers'},
        knights: {kind: 'add', unit: 'knight', n: 3, name: 'Knights'},
        giant: {kind: 'add', unit: 'giant', n: 1, name: 'Giant'},
        x2goblins: {kind: 'mul', unit: 'goblin', name: 'Goblins'},
        x2swords: {kind: 'mul', unit: 'sword', name: 'Swordsmen'},
        x2archers: {kind: 'mul', unit: 'archer', name: 'Archers'},
        x2knights: {kind: 'mul', unit: 'knight', name: 'Knights'},
        rally: {kind: 'mul', unit: null, name: 'Rally', text: '+40% of every troop'},
        rage: {kind: 'buff', name: 'Rage', text: '+60% attack'},
        armor: {kind: 'buff', name: 'Armor', text: '+50% health'},
        haste: {kind: 'buff', name: 'Haste', text: 'Faster feet, quicker blows'},
        fire: {kind: 'buff', name: 'Fire Arrows', text: '+2 archers; archers and towers hit twice as hard'},
        wall: {kind: 'def', name: 'Wall', text: 'Five stone blocks in front'},
        shields: {kind: 'def', name: 'Shields', text: '30% less damage taken'},
        medics: {kind: 'def', name: 'Medics', text: 'Every other fallen troop gets back up'},
        tower: {kind: 'def', name: 'Tower', text: 'An archer tower'},
        catapult: {kind: 'weapon', name: 'Catapult', text: 'Hurls boulders from the back'},
        fireball: {kind: 'weapon', name: 'Fireball', text: 'Burns the enemy crowd at the start'},
        lightning: {kind: 'weapon', name: 'Lightning', text: 'Strikes the six toughest foes'},
    };
    const KINDS = {
        add: ['goblins', 'swords', 'archers', 'knights', 'giant'],
        mul: ['x2goblins', 'x2swords', 'x2archers', 'x2knights', 'rally'],
        buff: ['rage', 'armor', 'haste', 'fire'],
        def: ['wall', 'shields', 'medics', 'tower'],
        weapon: ['catapult', 'fireball', 'lightning'],
    };

    // --- the draft -------------------------------------------------------------------
    //
    // A match is best of three rounds (up to five when rounds are drawn). Each round
    // reveals a pool of POOL cards; on turn t the picker sees the pair pool[2t],
    // pool[2t+1], keeps one and the other goes to the opponent. Who picks alternates,
    // and the round decides who starts. The server holds the same rule
    // (DraftRoom.picker); keep the two in step.

    const POOL = 10, TURNS = POOL / 2, WINS = 2, MAX_ROUNDS = 5;
    const picker = (round, turn) => (turn + round) % 2;

    /** Ten cards, at least three of them troops, no card more than twice. */
    function pool(seed, match, round) {
        const r = rng(hashSeed(`draft:pool:${seed}:${match}:${round}`));
        const weights = [['add', 34], ['mul', 20], ['buff', 16], ['def', 16], ['weapon', 14]];
        const out = [];
        const count = {};
        while (out.length < POOL) {
            let kind;
            if (out.length < 3) kind = 'add';
            else {
                let x = r() * 100;
                for (const [k, w] of weights) { x -= w; if (x < 0) { kind = k; break; } }
                kind = kind || 'add';
            }
            const ids = KINDS[kind];
            const id = ids[Math.floor(r() * ids.length)];
            if ((count[id] || 0) >= 2) continue;
            count[id] = (count[id] || 0) + 1;
            out.push(id);
        }
        // Shuffle, so the three troops are not always the first pairs.
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    /** Each seat's cards after the choices made so far (0 or 1 per turn). */
    function hands(cards, round, choices) {
        const out = [[], []];
        choices.forEach((c, t) => {
            const p = picker(round, t);
            out[p].push(cards[2 * t + c]);
            out[1 - p].push(cards[2 * t + 1 - c]);
        });
        return out;
    }

    /** Wins per seat over a match's rounds; `over` once someone has two (or five are played). */
    function score(results) {
        const wins = [0, 0];
        results.forEach((w) => { if (w >= 0) wins[w]++; });
        const over = wins[0] >= WINS || wins[1] >= WINS || results.length >= MAX_ROUNDS;
        const winner = !over ? null : wins[0] === wins[1] ? -1 : wins[0] > wins[1] ? 0 : 1;
        return {wins, over, winner};
    }

    // --- armies ------------------------------------------------------------------------

    /** Troop cards and fixed spells grow a quarter each round (percent). */
    const scale = (round) => 100 + 25 * round;

    /** What a hand of cards adds up to. Troops first, then every multiplier, in pick order. */
    function army(cards, round) {
        const grow = scale(round);
        const a = {
            count: {goblin: 0, sword: pct(4, grow), archer: 0, knight: 0, giant: 0},
            tower: 0, catapult: 0, wall: 0,
            atk: 100, hp: 100, haste: 0, fire: 0, shield: 0, heal: 0, fallen: 0, fireball: 0, lightning: 0, scale: grow,
        };
        for (const id of cards) {
            const c = CARDS[id];
            if (c.kind === 'add') a.count[c.unit] += Math.max(1, pct(c.n, grow));
            else if (id === 'tower' || id === 'catapult' || id === 'wall') a[id]++;
            else if (id === 'rage') a.atk += 60;
            else if (id === 'armor') a.hp += 50;
            else if (id === 'haste') a.haste++;
            else if (id === 'fire') { a.fire++; a.count.archer += 2; }
            else if (id === 'shields') a.shield++;
            else if (id === 'medics') a.heal++;
            else if (id === 'fireball') a.fireball++;
            else if (id === 'lightning') a.lightning++;
        }
        for (const id of cards) {
            const c = CARDS[id];
            if (c.kind !== 'mul') continue;
            // Doubles the troop, and brings at least two along when there are none yet.
            if (c.unit) a.count[c.unit] = Math.max(a.count[c.unit] * 2, a.count[c.unit] + 2);
            else for (const t of TROOPS) a.count[t] = pct(a.count[t], 140);
        }
        // A field holds so many: the biggest group gives way first.
        let total = TROOPS.reduce((n, t) => n + a.count[t], 0);
        while (total > MAX_TROOPS) {
            const big = TROOPS.reduce((m, t) => (a.count[t] > a.count[m] ? t : m), TROOPS[0]);
            a.count[big]--;
            total--;
        }
        return a;
    }

    // --- battle ----------------------------------------------------------------------
    //
    // Seat 0 lines up at the bottom, seat 1 at the top (a screen for seat 1 turns the
    // field round). Every unit walks to its nearest enemy and fights; archers, towers and
    // catapults shoot. The round goes to the side with troops left, or after MAX_TICKS
    // to the side with more health left.

    function Battle(handA, handB, round, seed) {
        const r = rng(hashSeed(`draft:battle:${seed}`));
        this.tick = 0;
        this.units = [];
        this.shots = [];
        this.events = [];
        this.armies = [army(handA, round), army(handB, round)];
        this.done = false;
        this.winner = null;
        this.armies.forEach((a, side) => this.deploy(a, side, r));
    }

    Battle.prototype.add = function (type, side, x, y) {
        const base = UNITS[type], a = this.armies[side];
        const troop = !base.fixed;
        const hp = pct(base.hp, troop || type !== 'wall' ? a.hp : 100);
        let atk = pct(base.atk, a.atk);
        if (base.shot === 'arrow' && a.fire) atk *= 1 + a.fire;
        const u = {
            id: this.units.length, side, type, x, y, px: x, py: y,
            hp, maxHp: hp, atk,
            range: base.range, r: base.r, splash: base.splash || 0, shot: base.shot || null,
            fixed: !!base.fixed, wall: !!base.wall,
            speed: troop ? pct(base.speed, 100 + 40 * Math.min(a.haste, 2)) : 0,
            cd: Math.max(4, pct(base.cd, 100 - 35 * Math.min(a.haste, 2))), cdLeft: 0,
            guard: 100 - 30 * Math.min(a.shield, 2),
            target: -1, alive: true, died: -1, revived: false,
        };
        this.units.push(u);
        return u;
    };

    /** Troops in rows from the front, walls ahead of them, towers and catapults behind. */
    Battle.prototype.deploy = function (a, side, r) {
        const flip = (x, y) => (side === 0 ? [x, y] : [W - x, H - y]);
        const front = 600, gap = 34, perRow = 18;
        const order = [];
        for (const t of TROOPS) for (let k = 0; k < a.count[t]; k++) order.push(t);
        let row = 0;
        for (let k = 0; k < order.length; k += perRow, row++) {
            const line = order.slice(k, k + perRow);
            const x0 = W / 2 - ((line.length - 1) * gap) / 2;
            line.forEach((t, n) => {
                const jx = Math.floor(r() * 9) - 4, jy = Math.floor(r() * 9) - 4;
                const [x, y] = flip(Math.round(x0 + n * gap) + jx, front + row * gap + jy);
                this.add(t, side, x, y);
            });
        }
        for (let k = 0; k < a.wall * 5; k++) {
            const [x, y] = flip(120 + (k % 5) * 120, 552 - Math.floor(k / 5) * 54);
            this.add('wall', side, x, y);
        }
        const towerX = [W / 2, 180, W - 180, 90, W - 90];
        for (let k = 0; k < a.tower; k++) { const [x, y] = flip(towerX[k % 5], 850); this.add('tower', side, x, y); }
        const catX = [W / 2, 240, W - 240, 120, W - 120];
        for (let k = 0; k < a.catapult; k++) { const [x, y] = flip(catX[k % 5], 900); this.add('catapult', side, x, y); }
    };

    const d2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

    Battle.prototype.hurt = function (u, dmg, from) {
        if (!u.alive) return;
        const hit = Math.max(1, pct(dmg, u.guard));
        u.hp -= hit;
        this.events.push({t: 'hit', id: u.id, side: u.side, x: u.x, y: u.y, from});
        if (u.hp > 0) return;
        // Medics: every other troop to fall (with two cards, two in three) gets back up
        // once, at 60% health. Counted, not rolled, so both phones agree.
        const a = this.armies[u.side];
        if (a.heal && !u.fixed && !u.revived && (a.heal > 1 ? ++a.fallen % 3 !== 0 : ++a.fallen % 2 === 0)) {
            u.revived = true;
            u.hp = Math.max(1, pct(u.maxHp, 60));
            this.events.push({t: 'revive', id: u.id});
            return;
        }
        u.hp = 0; u.alive = false; u.died = this.tick;
        this.events.push({t: 'die', id: u.id});
    };

    /** Nearest living enemy; shooters look past walls while anything else is left. */
    Battle.prototype.nearest = function (u) {
        let best = -1, bestD = Infinity, wallBest = -1, wallD = Infinity;
        for (const e of this.units) {
            if (!e.alive || e.side === u.side) continue;
            const d = d2(u, e);
            if (e.wall) { if (d < wallD) { wallD = d; wallBest = e.id; } continue; }
            if (d < bestD) { bestD = d; best = e.id; }
        }
        if (best < 0) return wallBest;
        // Walking troops meet the wall first when it stands nearer.
        if (!u.shot && wallBest >= 0 && wallD < bestD) return wallBest;
        return best;
    };

    Battle.prototype.specials = function () {
        this.armies.forEach((a, side) => {
            const foes = this.units.filter((e) => e.alive && e.side !== side && !e.fixed);
            if (a.fireball && this.tick === 24 && foes.length) {
                const cx = Math.floor(foes.reduce((s, e) => s + e.x, 0) / foes.length);
                const cy = Math.floor(foes.reduce((s, e) => s + e.y, 0) / foes.length);
                this.events.push({t: 'fireball', side, x: cx, y: cy, r: 130});
                for (const e of foes) if (d2(e, {x: cx, y: cy}) <= 130 * 130) this.hurt(e, pct(120 * a.fireball, a.scale), side);
            }
            if (a.lightning && this.tick === 36 && foes.length) {
                const tough = foes.slice().sort((p, q) => q.hp - p.hp || p.id - q.id).slice(0, 6 * a.lightning);
                for (const e of tough) {
                    this.events.push({t: 'bolt', side, x: e.x, y: e.y});
                    this.hurt(e, pct(260, a.scale), side);
                }
            }
        });
    };

    Battle.prototype.act = function (u) {
        if (u.cdLeft > 0) u.cdLeft--;
        if (!u.alive || u.atk === 0) return;
        if (u.target < 0 || !this.units[u.target].alive || this.tick % 8 === u.id % 8) u.target = this.nearest(u);
        if (u.target < 0) return;
        const t = this.units[u.target];
        const dx = t.x - u.x, dy = t.y - u.y, dist2 = dx * dx + dy * dy;
        const reach = u.range + u.r + t.r;
        if (dist2 <= reach * reach) {
            if (u.cdLeft > 0) return;
            u.cdLeft = u.cd;
            if (u.shot) {
                this.shots.push({kind: u.shot, side: u.side, from: u.id, target: t.id, x: u.x, y: u.y, px: u.x, py: u.y, tx: t.x, ty: t.y,
                    speed: u.shot === 'rock' ? 15 : 26, dmg: u.atk, splash: u.splash, done: false});
            } else {
                this.events.push({t: 'swing', id: u.id});
                this.hurt(t, u.atk, u.side);
                if (u.splash) {
                    for (const e of this.units) {
                        if (e.alive && e.side !== u.side && e.id !== t.id && d2(e, t) <= u.splash * u.splash) this.hurt(e, pct(u.atk, 50), u.side);
                    }
                }
            }
        } else if (!u.fixed) {
            // Never a step that rounds to nothing, or two units stand one short of reach forever.
            const d = isqrt(dist2);
            const step = Math.max(1, Math.min(u.speed, d - reach + 1));
            let mx = Math.trunc((dx * step) / d), my = Math.trunc((dy * step) / d);
            if (!mx && !my) { if (Math.abs(dx) >= Math.abs(dy)) mx = Math.sign(dx); else my = Math.sign(dy); }
            u.x += mx;
            u.y += my;
        }
    };

    Battle.prototype.fly = function () {
        for (const s of this.shots) {
            if (s.done) continue;
            s.px = s.x; s.py = s.y;
            // Arrows follow their target; boulders fly to where it stood.
            const t = this.units[s.target];
            if (s.kind === 'arrow' && t.alive) { s.tx = t.x; s.ty = t.y; }
            const dx = s.tx - s.x, dy = s.ty - s.y, d = isqrt(dx * dx + dy * dy);
            if (d <= s.speed) {
                s.x = s.tx; s.y = s.ty; s.done = true;
                if (s.kind === 'rock') {
                    this.events.push({t: 'boom', side: s.side, x: s.x, y: s.y, r: s.splash});
                    for (const e of this.units) if (e.alive && e.side !== s.side && d2(e, s) <= s.splash * s.splash) this.hurt(e, s.dmg, s.side);
                } else if (t.alive) this.hurt(t, s.dmg, s.side);
            } else {
                s.x += Math.trunc((dx * s.speed) / d);
                s.y += Math.trunc((dy * s.speed) / d);
            }
        }
        this.shots = this.shots.filter((s) => !s.done);
    };

    /** Units that overlap push apart; fixed ones stand their ground. */
    Battle.prototype.separate = function () {
        const cell = 56, cols = Math.ceil(W / cell) + 2, grid = new Map();
        const key = (x, y) => (Math.floor(y / cell) + 1) * cols + Math.floor(x / cell) + 1;
        for (const u of this.units) {
            if (!u.alive) continue;
            const k = key(u.x, u.y);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(u);
        }
        for (const u of this.units) {
            if (!u.alive) continue;
            const base = key(u.x, u.y);
            for (const off of [0, 1, cols - 1, cols, cols + 1]) {
                const list = grid.get(base + off);
                if (!list) continue;
                for (const v of list) {
                    if (v.id <= u.id && off === 0) continue;
                    if (v === u || !v.alive || (u.fixed && v.fixed)) continue;
                    const dx = v.x - u.x, dy = v.y - u.y, need = u.r + v.r - 2;
                    const dist2 = dx * dx + dy * dy;
                    if (dist2 >= need * need) continue;
                    const d = isqrt(dist2);
                    const push = need - d;
                    const [ux, uy] = d > 0 ? [Math.trunc((dx * push) / d), Math.trunc((dy * push) / d)] : [(u.id & 1) ? push : -push, 0];
                    if (u.fixed) { v.x += ux; v.y += uy; }
                    else if (v.fixed) { u.x -= ux; u.y -= uy; }
                    else {
                        v.x += Math.trunc(ux / 2); v.y += Math.trunc(uy / 2);
                        u.x -= ux - Math.trunc(ux / 2); u.y -= uy - Math.trunc(uy / 2);
                    }
                }
            }
        }
        for (const u of this.units) {
            u.x = Math.max(u.r, Math.min(W - u.r, u.x));
            u.y = Math.max(u.r, Math.min(H - u.r, u.y));
        }
    };

    /** Health, units and troops left per side, walls not counted (a wall alone cannot win). */
    Battle.prototype.left = function () {
        const hp = [0, 0], standing = [0, 0], troops = [0, 0];
        for (const u of this.units) {
            if (!u.alive || u.wall) continue;
            hp[u.side] += u.hp;
            standing[u.side]++;
            if (!u.fixed) troops[u.side]++;
        }
        return {hp, standing, troops};
    };

    Battle.prototype.step = function () {
        if (this.done) return;
        this.tick++;
        this.events = [];
        for (const u of this.units) { u.px = u.x; u.py = u.y; }
        this.specials();
        // Alternate who acts first each tick, so neither side always lands the first blow.
        const n = this.units.length;
        for (let k = 0; k < n; k++) this.act(this.units[this.tick % 2 ? k : n - 1 - k]);
        this.fly();
        this.separate();
        const {hp, standing, troops} = this.left();
        // Towers and catapults that cannot reach each other settle nothing: health decides.
        if (!standing[0] || !standing[1] || (!troops[0] && !troops[1]) || this.tick >= MAX_TICKS) {
            this.done = true;
            this.winner = !standing[0] && !standing[1] ? -1 : !standing[1] ? 0 : !standing[0] ? 1 : hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1;
        }
    };

    /** Plays a battle to the end, unseen. */
    function fight(handA, handB, round, seed) {
        const b = new Battle(handA, handB, round, seed);
        while (!b.done) b.step();
        const {hp} = b.left();
        return {winner: b.winner, ticks: b.tick, hp};
    }

    const battleSeed = (seed, match, round) => hashSeed(`draft:fight:${seed}:${match}:${round}`);

    // --- the bot ------------------------------------------------------------------------

    /**
     * The choice (0 or 1) that leaves `seat` better off if the battle were fought on
     * the hands as they would stand: each option is tried in a quick battle.
     */
    function bestChoice(cards, round, choices, seat, seed) {
        const t = choices.length;
        let best = 0, bestScore = -Infinity;
        for (const c of [0, 1]) {
            const h = hands(cards, round, choices.concat(c));
            // Fill the rest of the draft as if every later choice were the first card.
            const rest = hands(cards, round, choices.concat(c, new Array(TURNS - t - 1).fill(0)));
            let score = 0;
            for (const pair of [h, rest]) {
                const res = fight(pair[0], pair[1], round, seed);
                const mine = res.hp[seat], theirs = res.hp[1 - seat];
                score += (res.winner === seat ? 100000 : res.winner === 1 - seat ? -100000 : 0) + mine - theirs;
            }
            if (score > bestScore) { bestScore = score; best = c; }
        }
        return best;
    }

    const api = {W, H, TICK_MS, MAX_TICKS, POOL, TURNS, WINS, MAX_ROUNDS, UNITS, CARDS, KINDS, TROOPS,
        hashSeed, rng, picker, pool, hands, score, scale, army, Battle, fight, battleSeed, bestChoice};
    root.DraftEngine = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
