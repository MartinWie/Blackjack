/**
 * Draft Battle rules: cards, offers, armies and the battle.
 *
 * A match is fought over rounds. Each round both players privately keep one card of
 * every offer of three (three picks in the first round, two after), and everything
 * kept so far marches out: armies stack from round to round. A lost round costs a
 * heart; the last player with hearts wins.
 *
 * Both players of a live room run this same file on the same picks, so a battle must
 * come out identical on every phone: the simulation uses integers only (Math.sqrt of
 * an integer, floored, is exact everywhere; sin, cos, pow and Math.random are not
 * allowed in here). The server never sees a card; it only collects the choices.
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

    // --- the match -----------------------------------------------------------------
    //
    // DraftRoom and DraftRules on the server mirror OFFER, the rules and their limits;
    // check:draft holds the two in step.

    const W = 720, H = 960, TICK_MS = 30, MAX_TICKS = 2000;
    const HEARTS = 3, ROUNDS_PER_HEART = 5, MAX_ROUNDS = HEARTS * ROUNDS_PER_HEART, OFFER = 3;
    /** No match runs longer, however many hearts: it bounds a room's history and a reload's replay. */
    const ROUND_LIMIT = 1000;
    /**
     * A match's rules. The hidden custom mode sets hearts, one pick count for every round,
     * and whether offers lean against the leader (`balance`, see standing).
     */
    const STANDARD = {hearts: HEARTS, firstPicks: 3, picks: 2, balance: true};
    const MAX_HEARTS = 99999, MAX_PICKS = 10;
    function customRules(hearts, picks, balance = true) {
        const fit = (v, hi) => Math.max(1, Math.min(hi, Math.floor(Number(v)) || 1));
        const p = fit(picks, MAX_PICKS);
        return {hearts: fit(hearts, MAX_HEARTS), firstPicks: p, picks: p, balance: balance !== false};
    }
    const picksIn = (round, rules) => (round === 0 ? (rules || STANDARD).firstPicks : (rules || STANDARD).picks);
    /** Rounds before the hearts left decide: enough for every heart and a run of drawn rounds. */
    const maxRounds = (rules) => Math.min(ROUND_LIMIT, (rules || STANDARD).hearts * ROUNDS_PER_HEART);

    // --- units ---------------------------------------------------------------------
    //
    // Distances are field units (the field is W x H), time is ticks of TICK_MS.

    const UNITS = {
        spear: {name: 'Spearman', hp: 106, atk: 15, range: 24, speed: 6, cd: 14, r: 11},
        knight: {name: 'Knight', hp: 264, atk: 28, range: 16, speed: 9, cd: 18, r: 14},
        archer: {name: 'Archer', hp: 62, atk: 16, range: 300, speed: 5, cd: 19, r: 10, shot: 'arrow'},
        goblin: {name: 'Goblin', hp: 50, atk: 9, range: 12, speed: 11, cd: 9, r: 9},
        mage: {name: 'Mage', hp: 95, atk: 32, range: 240, speed: 5, cd: 22, r: 11, shot: 'orb'},
        giant: {name: 'Giant', hp: 987, atk: 46, range: 22, speed: 3, cd: 30, r: 24, splash: 34, cleave: 35},
        dragon: {name: 'Dragon', hp: 860, atk: 38, range: 150, speed: 6, cd: 22, r: 22, shot: 'flame', splash: 58, fly: true},
        tower: {name: 'Tower', hp: 1200, atk: 30, range: 360, speed: 0, cd: 10, r: 22, shot: 'arrow', fixed: true},
        catapult: {name: 'Catapult', hp: 560, atk: 52, range: 760, speed: 0, cd: 46, r: 18, shot: 'rock', splash: 80, fixed: true},
        wall: {name: 'Wall', hp: 2800, atk: 0, range: 0, speed: 0, cd: 0, r: 26, fixed: true, wall: true},
    };
    const TYPES = Object.keys(UNITS);
    /** Troops by the row they march in, front to back. */
    const TROOPS = ['giant', 'knight', 'spear', 'goblin', 'dragon', 'mage', 'archer'];
    /** Troops placed per side; a bigger army fields veterans instead (see army). */
    const MAX_FIELD = 120;

    // Troops stand on a circle, each strong against the next and weak against the one
    // before: spear > knight > archer > goblin > mage > giant > spear. Two steps on they
    // still have the edge, two steps back the worse of it, and across the circle it is
    // even, so every troop wins two match-ups, loses two and has one fair fight.
    // The dragon and the buildings hang off the circle with a prey and a foe of their own.
    const CIRCLE = ['spear', 'knight', 'archer', 'goblin', 'mage', 'giant'];
    const RING = [100, 200, 125, 100, 80, 60];   // by steps ahead on the circle
    const STRONG = 200, WEAK = 60;
    const PREY = {
        spear: ['knight'], knight: ['archer', 'catapult'], archer: ['goblin', 'dragon'], goblin: ['mage'],
        mage: ['giant'], giant: ['spear', 'tower'], dragon: ['knight'], tower: ['goblin'], catapult: ['spear'], wall: [],
    };
    /** Damage percent from an attacker of type a to a target of type d, flat by type index. */
    const ADV = new Int16Array(TYPES.length * TYPES.length);
    TYPES.forEach((a, i) => TYPES.forEach((d, j) => {
        const ca = CIRCLE.indexOf(a), cd = CIRCLE.indexOf(d);
        ADV[i * TYPES.length + j] = ca >= 0 && cd >= 0 ? RING[(cd - ca + 6) % 6]
            : PREY[a].includes(d) ? STRONG : PREY[d].includes(a) ? WEAK : 100;
    }));
    const advantage = (a, d) => ADV[TYPES.indexOf(a) * TYPES.length + TYPES.indexOf(d)];
    /** The kinds `t` is strong against, and the ones strong against it. */
    const preyOf = (t) => PREY[t];
    const foesOf = (t) => TYPES.filter((a) => PREY[a].includes(t));

    // --- cards ---------------------------------------------------------------------
    //
    // rarity 0 common, 1 rare, 2 epic. A troop card brings more the later it is kept.

    const CARDS = {
        spears: {kind: 'troop', unit: 'spear', n: 6, rarity: 0, name: 'Spearmen'},
        knights: {kind: 'troop', unit: 'knight', n: 3, rarity: 0, name: 'Knights'},
        archers: {kind: 'troop', unit: 'archer', n: 5, rarity: 0, name: 'Archers'},
        goblins: {kind: 'troop', unit: 'goblin', n: 10, rarity: 0, name: 'Goblins'},
        mages: {kind: 'troop', unit: 'mage', n: 4, rarity: 0, name: 'Mages'},
        giant: {kind: 'troop', unit: 'giant', n: 1, rarity: 0, name: 'Giant'},
        dragon: {kind: 'troop', unit: 'dragon', n: 1, rarity: 2, name: 'Dragon'},
        rally: {kind: 'mul', unit: null, f: 150, rarity: 1, name: 'Rally', text: '+50% of every troop'},
        arms: {kind: 'mul', unit: null, f: 180, rarity: 2, name: 'Call to Arms', text: '+80% of every troop'},
        rage: {kind: 'buff', rarity: 0, name: 'Rage', text: '+70% attack'},
        armor: {kind: 'buff', rarity: 0, name: 'Armor', text: '+60% health'},
        shields: {kind: 'buff', rarity: 0, name: 'Shields', text: '35% less damage taken'},
        haste: {kind: 'buff', rarity: 1, name: 'Haste', text: 'Faster feet, quicker blows'},
        vampire: {kind: 'buff', rarity: 1, name: 'Vampire', text: '+55% attack, and blows heal their damage'},
        bomb: {kind: 'buff', rarity: 1, name: 'Bomb Belts', text: 'Fallen troops explode'},
        medics: {kind: 'buff', rarity: 1, name: 'Medics', text: 'Fallen troops get back up once'},
        berserk: {kind: 'buff', rarity: 2, name: 'Berserk', text: 'Triple attack, 15% less health'},
        wall: {kind: 'def', rarity: 0, name: 'Wall', text: 'Five stone blocks in front'},
        tower: {kind: 'def', rarity: 0, name: 'Tower', text: 'An archer tower'},
        catapult: {kind: 'def', rarity: 1, name: 'Catapult', text: 'Hurls boulders from the back'},
        fireball: {kind: 'spell', rarity: 1, name: 'Fireball', text: 'Burns the enemy crowd'},
        lightning: {kind: 'spell', rarity: 1, name: 'Lightning', text: 'Strikes the toughest foes'},
        poison: {kind: 'spell', rarity: 1, name: 'Poison Cloud', text: 'A toxic cloud eats at the enemy crowd'},
        quake: {kind: 'spell', rarity: 1, name: 'Earthquake', text: 'Shakes enemy buildings and walls apart and rattles their troops'},
        cry: {kind: 'spell', rarity: 1, name: 'Battle Cry', text: 'Your troops charge faster and strike harder and quicker'},
        meteor: {kind: 'spell', rarity: 2, name: 'Meteor Shower', text: 'Rocks rain on the enemy all battle'},
        vortex: {kind: 'spell', rarity: 2, name: 'Vortex', text: 'Drags the enemy crowd together and bursts, three times'},
    };
    const TROOP_CARD = {};
    for (const [id, c] of Object.entries(CARDS)) if (c.kind === 'troop') TROOP_CARD[c.unit] = id;
    // A double and a triple of every troop on the circle.
    for (const t of ['spear', 'knight', 'archer', 'goblin', 'mage', 'giant']) {
        const name = CARDS[TROOP_CARD[t]].name;
        CARDS[`x2${t}`] = {kind: 'mul', unit: t, f: t === 'knight' ? 240 : 200, rarity: 1, name};
        // Triples are worth the same pick: a touch less for the troops that snowball, more for archers.
        CARDS[`x3${t}`] = {kind: 'mul', unit: t, f: {knight: 230, mage: 230, archer: 420, spear: 350, goblin: 350}[t] || 300, rarity: 2, name};
    }
    // How strong each card is, in percent of what its rule says: troops bring that share of
    // soldiers, multipliers that share of their extra, boosts that share of their effect,
    // spells that share of their damage or time, buildings that share of health and attack. `node tools/draft-cards.mjs --tune`
    // sets these so no card is the obvious pick of its rarity; keep its output.
    // POWER:BEGIN
    const POWER = {
        archers: 110,
        armor: 142,
        arms: 63,
        berserk: 168,
        bomb: 200,
        catapult: 51,
        dragon: 74,
        fireball: 94,
        goblins: 110,
        haste: 105,
        knights: 104,
        lightning: 93,
        mages: 90,
        medics: 35,
        meteor: 113,
        poison: 80,
        quake: 144,
        rage: 163,
        rally: 53,
        shields: 110,
        spears: 90,
        tower: 86,
        vampire: 50,
        vortex: 119,
        wall: 150,
        x2archer: 82,
        x2giant: 67,
        x2goblin: 91,
        x2knight: 49,
        x2mage: 45,
        x2spear: 58,
        x3archer: 50,
        x3giant: 94,
        x3goblin: 79,
        x3knight: 114,
        x3mage: 76,
        x3spear: 56,
    };
    // POWER:END
    const pw = (id) => POWER[id] || 100;
    /** What a multiplier really multiplies by, in percent. */
    const factor = (id) => 100 + pct(CARDS[id].f - 100, pw(id));
    /** Soldiers a troop card brings when kept in `round`. */
    const brings = (id, round) => Math.max(1, Math.floor(pct(CARDS[id].n * growth(round), pw(id)) / 100));
    // Card texts say what the tuned cards really do.
    for (const id of ['rally', 'arms']) CARDS[id].text = `+${factor(id) - 100}% of every troop`;
    CARDS.rage.text = `+${pct(70, pw('rage'))}% attack`;
    CARDS.armor.text = `+${pct(60, pw('armor'))}% health`;
    CARDS.shields.text = `${pct(35, pw('shields'))}% less damage taken`;
    CARDS.vampire.text = `+${pct(55, pw('vampire'))}% attack, and blows heal ${pw('vampire')}% of their damage`;
    CARDS.berserk.text = `+${pct(200, pw('berserk'))}% attack, 15% less health`;
    CARDS.medics.text = `Fallen troops get back up once, at ${Math.min(100, 35 + pct(pw('medics'), 25))}% health`;
    const BY_RARITY = [0, 1, 2].map((k) => Object.keys(CARDS).filter((id) => CARDS[id].rarity === k));
    const OPENERS = BY_RARITY[0].filter((id) => CARDS[id].kind === 'troop');

    // --- offers ---------------------------------------------------------------------

    /**
     * Odds of a common, rare and epic offer by standing, from far behind (-3) to far ahead (3):
     * whoever is behind is dealt rarer cards, whoever leads plainer ones.
     */
    const ODDS = [[20, 45, 35], [30, 44, 26], [42, 40, 18], [58, 32, 10], [68, 26, 6], [76, 21, 3], [84, 15, 1]];

    /**
     * How `seat` stands before `round`, -3 to 3: the hearts it is up or down (in steps of a
     * third of the match's hearts) and one more step for the round just fought. `boost`
     * (a bot's handicap) counts two steps further behind. A custom match may turn it off.
     */
    function standing(results, round, seat, rules, boost = false) {
        if (rules && rules.balance === false) return boost ? -2 : 0;
        let lead = 0, last = 0;
        for (let r = 0; r < round && r < results.length; r++) {
            last = results[r] === seat ? 1 : results[r] === 1 - seat ? -1 : 0;
            lead += last;
        }
        if (round > results.length) last = 0;
        const step = Math.max(1, Math.floor((rules || STANDARD).hearts / 3));
        return Math.max(-3, Math.min(3, Math.trunc(lead / step) + last - (boost ? 2 : 0)));
    }

    /**
     * The three cards `seat` is offered for pick `pick` of `round`, at standing `edge` (see
     * standing). All three are of one rarity, so a pick is a choice between equals and never
     * an epic among commons. The first offer of a match is all troops.
     */
    function offer(seed, match, round, seat, pick, edge = 0) {
        const r = rng(hashSeed(`draft:offer:${seed}:${match}:${round}:${seat}:${pick}`));
        const odds = ODDS[3 + Math.max(-3, Math.min(3, edge))];
        let x = r() * 100, k = 0;
        while (k < 2 && x >= odds[k]) { x -= odds[k]; k++; }
        const ids = round === 0 && pick === 0 ? OPENERS : BY_RARITY[k];
        const out = [];
        for (let guard = 0; out.length < OFFER && guard < 200; guard++) {
            const id = ids[Math.floor(r() * ids.length)];
            if (!out.includes(id)) out.push(id);
        }
        return out;
    }

    /**
     * The cards `seat` kept, per round, from `picks` (per round, per seat, the choices
     * 0..OFFER-1; -1 for a choice not revealed yet, skipped). `results` holds the winner
     * of each round fought so far, which sets each round's standing.
     */
    function cardsOf(seed, match, picks, seat, results, boost = false, rules) {
        return picks.map((both, round) => {
            const edge = standing(results, round, seat, rules, boost);
            return (both[seat] || []).filter((c) => c >= 0).map((c, k) => offer(seed, match, round, seat, k, edge)[c]);
        });
    }

    /** Hearts per seat after the rounds fought; `over` once someone has none (or every round is played). */
    function score(results, rules) {
        const all = (rules || STANDARD).hearts, hearts = [all, all];
        results.forEach((w) => { if (w >= 0) hearts[1 - w]--; });
        const over = hearts[0] <= 0 || hearts[1] <= 0 || results.length >= maxRounds(rules);
        const winner = !over ? null : hearts[0] === hearts[1] ? -1 : hearts[0] > hearts[1] ? 0 : 1;
        return {hearts, over, winner};
    }

    // --- armies ------------------------------------------------------------------------

    /** How many a troop card brings when kept in `round` (percent of its n). */
    const growth = (round) => 100 + 35 * round;
    /** Spells hit harder each round, as the armies they hit grow. */
    const spellScale = (round) => 100 + 30 * round;
    const MAX_BUILDINGS = 5, MAX_WALLS = 2;
    /** A troop's worth stops here (hundredths), so a long custom match never overflows. */
    const MAX_WORTH = 1e12;

    /**
     * What a seat's cards (per round kept) add up to. Troops are counted in hundredths
     * (a lone giant kept late is a stronger giant), then every multiplier applies, so a
     * double kept in round 1 doubles the troops of round 5 too. An army too big for the
     * field sends veterans: fewer troops, each as strong as the ones it stands for
     * (health and attack both grow by the share, which keeps the fight even).
     */
    function army(byRound) {
        const a = {worth: {}, count: {}, placed: {}, vet: {}, tower: 0, catapult: 0, wall: 0, fort: 100,
            atk: 100, hp: 100, haste: 0, guard: 100, vamp: 0, bomb: 0, heal: 0, berserk: 0,
            fireball: 0, lightning: 0, poison: 0, quake: 0, cry: 0, meteor: 0, vortex: 0};
        for (const t of TROOPS) a.worth[t] = 0;
        const muls = [];
        byRound.forEach((ids, round) => {
            for (const id of ids) {
                const c = CARDS[id];
                if (c.kind === 'troop') a.worth[c.unit] += pct(c.n * growth(round), pw(id));
                else if (c.kind === 'mul') muls.push(id);
                else if (c.kind === 'def' || c.kind === 'spell') a[id]++;
                else if (id === 'rage') a.atk += pct(70, pw(id));
                else if (id === 'armor') a.hp += pct(60, pw(id));
                else if (id === 'shields') a.guard = Math.max(25, pct(a.guard, 100 - pct(35, pw(id))));
                else if (id === 'haste') a.haste += pw(id);
                else if (id === 'vampire') { a.vamp += pw(id); a.atk += pct(55, pw(id)); }
                else if (id === 'bomb') a.bomb += pw(id);
                else if (id === 'medics') a.heal += pw(id);
                else if (id === 'berserk') { a.atk += pct(200, pw(id)); a.berserk++; }
            }
        });
        for (const id of muls) {
            const c = CARDS[id], f = factor(id);
            if (!c.unit) { for (const t of TROOPS) a.worth[t] = pct(a.worth[t], f); continue; }
            // A multiplier on a troop not yet in the army multiplies a card's worth.
            a.worth[c.unit] = pct(a.worth[c.unit] || CARDS[TROOP_CARD[c.unit]].n * 100, f);
        }
        // Even an overflow to Infinity lands on the cap.
        for (const t of TROOPS) a.worth[t] = Math.min(MAX_WORTH, a.worth[t]);
        for (let k = 0; k < a.berserk; k++) a.hp = Math.max(20, pct(a.hp, 85));
        const total = TROOPS.reduce((n, t) => n + a.worth[t], 0);
        for (const t of TROOPS) {
            const w = a.worth[t];
            a.count[t] = w ? Math.max(1, Math.floor(w / 100)) : 0;
            a.placed[t] = !w ? 0 : total > MAX_FIELD * 100 ? Math.max(1, Math.floor((w * MAX_FIELD) / total)) : a.count[t];
            a.vet[t] = w ? Math.floor(w / a.placed[t]) : 100;
        }
        // Buildings past the cap reinforce the ones standing.
        let extra = 0;
        for (const [b, cap] of [['tower', MAX_BUILDINGS], ['catapult', MAX_BUILDINGS], ['wall', MAX_WALLS]]) {
            if (a[b] > cap) { extra += a[b] - cap; a[b] = cap; }
        }
        a.fort = 100 + 40 * extra;
        return a;
    }

    // --- battle ----------------------------------------------------------------------
    //
    // Seat 0 lines up at the bottom, seat 1 at the top (a screen for seat 1 turns the
    // field round). Every unit goes for the nearest enemy, the ones it beats first, and
    // fights; archers, mages, dragons, towers and catapults shoot. The round goes to the
    // side with troops left, or after MAX_TICKS to the side with more health left.

    function Battle(cardsA, cardsB, round, seed, limit = MAX_TICKS) {
        this.r = rng(hashSeed(`draft:battle:${seed}`));
        this.tick = 0;
        this.limit = limit;
        this.units = [];
        this.shots = [];
        this.events = [];
        this.blasts = [];
        this.meteors = [0, 0];
        this.clouds = [];
        this.whirls = [];
        this.cry = [0, 0];   // per side, the tick its battle cry ends
        this.scale = spellScale(round);
        this.armies = [army(cardsA), army(cardsB)];
        this.done = false;
        this.winner = null;
        this.armies.forEach((a, side) => this.deploy(a, side));
    }

    Battle.prototype.add = function (type, side, x, y) {
        const base = UNITS[type], a = this.armies[side];
        const troop = !base.fixed;
        // Buildings grow with the round, like the armies they face.
        const grow = troop ? a.vet[type] : pct(pct(a.fort, this.scale), pw(type));
        const hp = pct(pct(base.hp, troop ? a.hp : 100), grow);
        const vet = troop && grow > 100;
        const u = {
            id: this.units.length, side, type, k: TYPES.indexOf(type), x, y, px: x, py: y,
            hp, maxHp: hp, atk: pct(pct(base.atk, a.atk), grow),
            range: base.range, r: base.r + (vet ? Math.min(8, Math.floor((grow - 100) / 60)) : 0),
            splash: base.splash || 0, cleave: base.cleave || 50, shot: base.shot || null,
            fixed: !!base.fixed, wall: !!base.wall, fly: !!base.fly, vet,
            speed: troop ? pct(base.speed, 100 + pct(Math.min(a.haste, 300), 50)) : 0,
            cd: Math.max(4, pct(base.cd, 100 - pct(Math.min(a.haste, 300), 22) - pct(Math.min(a.haste, 100), 13))), cdLeft: 0,
            guard: a.guard, vamp: troop ? a.vamp : 0,
            target: -1, alive: true, died: -1, revived: false,
        };
        this.units.push(u);
        return u;
    };

    /** Troops in rows from the front, walls ahead of them, towers and catapults behind. */
    Battle.prototype.deploy = function (a, side) {
        const r = this.r;
        const flip = (x, y) => (side === 0 ? [x, y] : [W - x, H - y]);
        const front = 600, gap = 34, perRow = 18;
        const order = [];
        for (const t of TROOPS) for (let k = 0; k < a.placed[t]; k++) order.push(t);
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
            const [x, y] = flip(120 + (k % 5) * 120, 556 - Math.floor(k / 5) * 40);
            this.add('wall', side, x, y);
        }
        const towerX = [W / 2, 180, W - 180, 90, W - 90];
        for (let k = 0; k < a.tower; k++) { const [x, y] = flip(towerX[k], 860); this.add('tower', side, x, y); }
        const catX = [W / 2, 250, W - 250, 130, W - 130];
        for (let k = 0; k < a.catapult; k++) { const [x, y] = flip(catX[k], 912); this.add('catapult', side, x, y); }
    };

    const d2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

    /** Damage `dmg` to `u`; from a unit `src` it counts the circle, and a vampire drinks. */
    Battle.prototype.hurt = function (u, dmg, src) {
        if (!u.alive) return;
        let d = dmg, strong = false;
        if (src) {
            const adv = ADV[src.k * TYPES.length + u.k];
            d = pct(d, adv);
            strong = adv >= STRONG;
        }
        const hit = Math.max(1, pct(d, u.guard));
        u.hp -= hit;
        if (!this.quiet) this.events.push({t: 'hit', id: u.id, side: u.side, x: u.x, y: u.y, strong});
        if (src && src.vamp && src.alive) src.hp = Math.min(src.maxHp, src.hp + pct(hit, src.vamp));
        if (u.hp > 0) return;
        // Medics: a fallen troop gets back up once, with more health per card.
        const a = this.armies[u.side];
        if (a.heal && !u.fixed && !u.revived) {
            u.revived = true;
            u.hp = Math.max(1, pct(u.maxHp, Math.min(100, 35 + pct(a.heal, 25))));
            this.events.push({t: 'revive', id: u.id});
            return;
        }
        u.hp = 0; u.alive = false; u.died = this.tick;
        this.events.push({t: 'die', id: u.id});
        if (a.bomb && !u.fixed) this.blasts.push(u);
    };

    /** Bomb belts go off after the blows of a tick; a blast that fells a bomber sets it off too. */
    Battle.prototype.blast = function () {
        for (let i = 0; i < this.blasts.length; i++) {
            const u = this.blasts[i], a = this.armies[u.side];
            const reach = 40 + u.r, dmg = pct(u.maxHp, Math.min(60, 14 + pct(a.bomb, 10))) + pct(pct(20, this.scale), Math.min(a.bomb, 300));
            if (!this.quiet) this.events.push({t: 'blast', side: u.side, x: u.x, y: u.y, r: reach});
            for (const e of this.units) if (e.alive && e.side !== u.side && !e.wall && d2(e, u) <= reach * reach) this.hurt(e, dmg, null);
        }
        this.blasts.length = 0;
    };

    /**
     * Nearest living enemy, the kinds it beats counted at a third of their distance.
     * Shooters look past walls while anything else is left; walkers meet a nearer wall first.
     */
    Battle.prototype.nearest = function (u) {
        let best = -1, bestD = Infinity, wallBest = -1, wallD = Infinity;
        const row = u.k * TYPES.length;
        for (const e of this.units) {
            if (!e.alive || e.side === u.side) continue;
            let d = d2(u, e);
            if (e.wall) { if (d < wallD) { wallD = d; wallBest = e.id; } continue; }
            if (ADV[row + e.k] >= STRONG) d = Math.floor(d / 3);
            if (d < bestD) { bestD = d; best = e.id; }
        }
        if (best < 0) return wallBest;
        if (!u.shot && wallBest >= 0 && wallD < d2(u, this.units[best])) return wallBest;
        return best;
    };

    Battle.prototype.foes = function (side, buildings) {
        return this.units.filter((e) => e.alive && e.side !== side && !e.wall && (buildings || !e.fixed));
    };

    /** The middle of `side`'s enemy troops, or null when none stand. */
    Battle.prototype.crowd = function (side) {
        let n = 0, x = 0, y = 0;
        for (const e of this.units) if (e.alive && e.side !== side && !e.fixed) { n++; x += e.x; y += e.y; }
        return n ? {x: Math.floor(x / n), y: Math.floor(y / n)} : null;
    };

    /**
     * Spells, each on its tick as the armies close: a fireball, an earthquake, a battle cry,
     * a poison cloud that lingers, a vortex that pulls and bursts, lightning, and a meteor
     * every 12 ticks. None of them holds the battle up.
     */
    Battle.prototype.specials = function () {
        const t = this.tick;
        this.armies.forEach((a, side) => {
            if (a.quake && t === 20) {
                // Buildings and walls lose a share of their health; troops take a lighter blow.
                const share = Math.min(80, pct(28 * a.quake, pw('quake')));
                if (!this.quiet) this.events.push({t: 'quake', side});
                for (const e of this.units) {
                    if (!e.alive || e.side === side) continue;
                    this.hurt(e, e.fixed ? pct(e.maxHp, share) : pct(pct(30 * a.quake, this.scale) + pct(e.maxHp, 5 * a.quake), pw('quake')), null);
                }
            }
            if (a.fireball && t === 24) {
                const c = this.crowd(side);
                if (c) {
                    const foes = this.foes(side, false), cx = c.x, cy = c.y;
                    const rad = 110 + 25 * a.fireball;
                    if (!this.quiet) this.events.push({t: 'fireball', side, x: cx, y: cy, r: rad});
                    for (const e of foes) if (d2(e, {x: cx, y: cy}) <= rad * rad) this.hurt(e, pct(pct(115 * a.fireball, this.scale) + pct(e.maxHp, 10 * a.fireball), pw('fireball')), null);
                }
            }
            if (a.lightning && t === 36) {
                const tough = this.foes(side, true).sort((p, q) => q.hp - p.hp || p.id - q.id).slice(0, 6 * a.lightning);
                for (const e of tough) {
                    if (!this.quiet) this.events.push({t: 'bolt', side, x: e.x, y: e.y});
                    this.hurt(e, pct(pct(240, this.scale) + pct(e.maxHp, 22), pw('lightning')), null);
                }
            }
            if (a.cry && t === 26) {
                this.cry[side] = t + pct(120 + 40 * a.cry, pw('cry'));
                if (!this.quiet) this.events.push({t: 'cry', side, until: this.cry[side]});
            }
            if (a.poison && t === 30) {
                const c = this.crowd(side);
                if (c) {
                    const cloud = {side, x: c.x, y: c.y, r: 100 + 15 * a.poison, at: t, until: t + 150, n: a.poison};
                    this.clouds.push(cloud);
                    if (!this.quiet) this.events.push({t: 'poison', side, x: cloud.x, y: cloud.y, r: cloud.r, until: cloud.until});
                }
            }
            if (a.vortex && t >= 32 && t <= 272 && (t - 32) % 120 === 0) {
                const c = this.crowd(side);
                if (c) {
                    const whirl = {side, x: c.x, y: c.y, r: 150 + 20 * a.vortex, until: t + 50, n: a.vortex};
                    this.whirls.push(whirl);
                    if (!this.quiet) this.events.push({t: 'vortex', side, x: whirl.x, y: whirl.y, r: whirl.r, until: whirl.until});
                }
            }
            if (a.meteor && t >= 40 && t % 12 === 4 && this.meteors[side] < 5 * a.meteor) {
                const foes = this.foes(side, false);
                if (foes.length) {
                    this.meteors[side]++;
                    const e = foes[Math.floor(this.r() * foes.length)];
                    const rad = 72;
                    if (!this.quiet) this.events.push({t: 'meteor', side, x: e.x, y: e.y, r: rad});
                    for (const f of foes) if (d2(f, e) <= rad * rad) this.hurt(f, pct(pct(90, this.scale) + pct(f.maxHp, 10), pw('meteor')), null);
                }
            }
        });
        // A cloud bites the enemy troops inside it every 10 ticks.
        for (const c of this.clouds) {
            if (t > c.until || t === c.at || (t - c.at) % 10) continue;
            const r2 = c.r * c.r;
            for (const e of this.units) {
                if (!e.alive || e.side === c.side || e.fixed || d2(e, c) > r2) continue;
                this.hurt(e, pct(pct(26 * c.n, this.scale) + pct(e.maxHp, 4 * c.n), pw('poison')), null);
            }
        }
        // A vortex drags enemy troops towards its eye, then bursts on whoever it gathered.
        // Done ones stay in the list (at most three a side), so nothing is spliced mid-battle.
        for (const v of this.whirls) {
            if (t > v.until) continue;
            const r2 = v.r * v.r;
            if (t === v.until && !this.quiet) this.events.push({t: 'burst', side: v.side, x: v.x, y: v.y, r: pct(v.r, 60)});
            for (const e of this.units) {
                if (!e.alive || e.side === v.side || e.fixed) continue;
                const dx = v.x - e.x, dy = v.y - e.y, dd = dx * dx + dy * dy;
                if (dd > r2) continue;
                if (t < v.until) {
                    const d = isqrt(dd);
                    if (d > 6) { e.x += Math.trunc((dx * 5) / d); e.y += Math.trunc((dy * 5) / d); }
                } else if (dd * 100 <= r2 * 36) {
                    this.hurt(e, pct(pct(160 * v.n, this.scale) + pct(e.maxHp, 20 * v.n), pw('vortex')), null);
                }
            }
        }
    };

    Battle.prototype.act = function (u) {
        if (!u.alive || u.atk === 0) return;
        // A battle cry: troops strike sooner and march half again as fast.
        const cry = !u.fixed && this.cry[u.side] > this.tick;
        if (u.cdLeft > 0) u.cdLeft--;
        if (u.target < 0 || !this.units[u.target].alive || this.tick % 8 === u.id % 8) u.target = this.nearest(u);
        if (u.target < 0) return;
        const t = this.units[u.target];
        const dx = t.x - u.x, dy = t.y - u.y, dist2 = dx * dx + dy * dy;
        const reach = u.range + u.r + t.r;
        if (dist2 <= reach * reach) {
            if (u.cdLeft > 0) return;
            u.cdLeft = cry ? Math.max(3, pct(u.cd, 60)) : u.cd;
            const atk = cry ? pct(u.atk, 140) : u.atk;
            if (u.shot) {
                const speed = u.shot === 'rock' ? 15 : u.shot === 'flame' ? 20 : u.shot === 'orb' ? 22 : 26;
                this.shots.push({kind: u.shot, side: u.side, from: u.id, target: t.id, x: u.x, y: u.y, px: u.x, py: u.y, tx: t.x, ty: t.y,
                    speed, dmg: atk, splash: u.splash, done: false});
                if (!this.quiet) this.events.push({t: 'shoot', id: u.id});
            } else {
                if (!this.quiet) this.events.push({t: 'swing', id: u.id, target: t.id});
                this.hurt(t, atk, u);
                if (u.splash) {
                    for (const e of this.units) {
                        if (e.alive && e.side !== u.side && e.id !== t.id && d2(e, t) <= u.splash * u.splash) this.hurt(e, pct(atk, u.cleave), u);
                    }
                }
            }
        } else if (!u.fixed) {
            // Never a step that rounds to nothing, or two units stand one short of reach forever.
            const d = isqrt(dist2);
            const step = Math.max(1, Math.min(cry ? pct(u.speed, 150) : u.speed, d - reach + 1));
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
            // Arrows and orbs follow their target; boulders and flames land where it stood.
            const t = this.units[s.target], src = this.units[s.from];
            const homing = s.kind === 'arrow' || s.kind === 'orb';
            if (homing && t.alive) { s.tx = t.x; s.ty = t.y; }
            const dx = s.tx - s.x, dy = s.ty - s.y, d = isqrt(dx * dx + dy * dy);
            if (d <= s.speed) {
                s.x = s.tx; s.y = s.ty; s.done = true;
                if (s.splash) {
                    this.events.push({t: s.kind === 'rock' ? 'boom' : 'burn', side: s.side, x: s.x, y: s.y, r: s.splash});
                    for (const e of this.units) if (e.alive && e.side !== s.side && d2(e, s) <= s.splash * s.splash) this.hurt(e, s.dmg, src);
                } else if (t.alive) this.hurt(t, s.dmg, src);
            } else {
                s.x += Math.trunc((dx * s.speed) / d);
                s.y += Math.trunc((dy * s.speed) / d);
            }
        }
        let n = 0;
        for (const s of this.shots) if (!s.done) this.shots[n++] = s;
        this.shots.length = n;
    };

    /** Units that overlap push apart; fixed ones stand their ground, flyers pass over. */
    const CELL = 56, COLS = Math.ceil(W / CELL) + 2, NEAR = [0, 1, COLS - 1, COLS, COLS + 1];
    const cellOf = (x, y) => (Math.floor(y / CELL) + 1) * COLS + Math.floor(x / CELL) + 1;

    Battle.prototype.separate = function () {
        // One grid per battle, emptied each tick; a key off the grid gets a list of its own.
        const grid = this.grid || (this.grid = new Map());
        for (const list of grid.values()) list.length = 0;
        for (const u of this.units) {
            if (!u.alive) continue;
            const k = cellOf(u.x, u.y);
            let list = grid.get(k);
            if (!list) grid.set(k, list = []);
            list.push(u);
        }
        for (const u of this.units) {
            if (!u.alive) continue;
            const base = cellOf(u.x, u.y);
            for (const off of NEAR) {
                const list = grid.get(base + off);
                if (!list || !list.length) continue;
                for (const v of list) {
                    if (v.id <= u.id && off === 0) continue;
                    if (v === u || !v.alive || (u.fixed && v.fixed) || u.fly !== v.fly) continue;
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
        this.events.length = 0;
        for (const u of this.units) { u.px = u.x; u.py = u.y; }
        this.specials();
        // Alternate who acts first each tick, so neither side always lands the first blow.
        const n = this.units.length;
        for (let k = 0; k < n; k++) this.act(this.units[this.tick % 2 ? k : n - 1 - k]);
        this.fly();
        this.blast();
        this.separate();
        const {hp, standing, troops} = this.left();
        // Towers and catapults that cannot reach each other settle nothing: health decides.
        if (!standing[0] || !standing[1] || (!troops[0] && !troops[1]) || this.tick >= this.limit) {
            this.done = true;
            this.winner = !standing[0] && !standing[1] ? -1 : !standing[1] ? 0 : !standing[0] ? 1 : hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1;
        }
    };

    /** Plays a battle to the end, unseen. */
    function fight(cardsA, cardsB, round, seed, limit) {
        const b = new Battle(cardsA, cardsB, round, seed, limit);
        b.quiet = true;   // nobody watches: no events for every blow
        while (!b.done) b.step();
        const {hp} = b.left();
        return {winner: b.winner, ticks: b.tick, hp};
    }

    const battleSeed = (seed, match, round) => hashSeed(`draft:fight:${seed}:${match}:${round}`);

    // --- the bot ------------------------------------------------------------------------

    /**
     * The choice (0..OFFER-1) for `seat`'s next pick of `round`. Each card on offer is
     * added to its army and tried in quick battles against the rival's army as it may
     * stand: what it has shown so far plus as many picks of this round as the bot has
     * made, each way it might take its offers (the offers are public, the choices are not).
     */
    function botChoice(seed, match, picks, round, seat, results, boost = false, rules) {
        const mine = cardsOf(seed, match, picks.slice(0, round + 1), seat, results, boost, rules);
        while (mine.length <= round) mine.push([]);
        const shown = cardsOf(seed, match, picks.slice(0, round), 1 - seat, results, false, rules);
        const k = mine[round].length;
        const options = offer(seed, match, round, seat, k, standing(results, round, seat, rules, boost));
        const rival = standing(results, round, 1 - seat, rules);
        const theirs = Array.from({length: k + 1}, (_, n) => offer(seed, match, round, 1 - seat, n, rival));
        const rivals = [0, 1, 2].map((j) => shown.concat([theirs.map((o) => o[j])]));
        let best = 0, bestScore = -Infinity;
        options.forEach((id, c) => {
            const hand = mine.map((ids, n) => (n === round ? ids.concat(id) : ids));
            let total = 0;
            rivals.forEach((rival, n) => {
                const res = seat === 0 ? fight(hand, rival, round, seed + n, 700) : fight(rival, hand, round, seed + n, 700);
                const mineHp = res.hp[seat], other = res.hp[1 - seat];
                total += (res.winner === seat ? 1000 : res.winner === 1 - seat ? -1000 : 0)
                    + Math.floor((1000 * (mineHp - other)) / Math.max(1, mineHp + other));
            });
            if (total > bestScore) { bestScore = total; best = c; }
        });
        return best;
    }

    const api = {W, H, TICK_MS, MAX_TICKS, HEARTS, ROUNDS_PER_HEART, MAX_ROUNDS, ROUND_LIMIT, OFFER, MAX_FIELD, UNITS, TYPES, TROOPS, CIRCLE, STRONG, WEAK,
        STANDARD, MAX_HEARTS, MAX_PICKS, customRules, maxRounds,
        CARDS, TROOP_CARD, POWER, pw, factor, brings, hashSeed, rng, picksIn, offer, standing, cardsOf, score, growth, army, advantage, preyOf, foesOf,
        Battle, fight, battleSeed, botChoice};
    root.DraftEngine = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
