// Draft Battle, card against card. Two armies share a base drawn from real offers; one
// adds card X, the other card Y, and they fight from both seats so neither seat helps.
// X beats Y when its army clearly wins more of those battles (by a quarter of them; a
// closer result is a draw between the two cards). An offer is three cards of one
// rarity, so that is the choice a player faces: no card may beat more than two thirds of
// the other cards of its rarity, or it is the obvious pick. Part of `npm run check:draft`,
// which the release build runs; a card that fails here does not ship.
//
// `node tools/draft-cards.mjs --tune` moves each card's power (POWER in the engine)
// towards the middle of its rarity, a few rounds, and writes the table back. The common
// troops are held at 100% on average, so armies keep their size and the rest moves.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../src/jvmMain/resources/static/draft/draft-engine.js');

const LIMIT = 2 / 3;
const BASES = Number(process.env.BASES || 24);
const MARGIN = Math.ceil(BASES * 2 * 0.25);
const ENGINE = new URL('../src/jvmMain/resources/static/draft/draft-engine.js', import.meta.url);
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

/**
 * Base armies, per round: the picks a player might have made up to round `round`, the
 * last pick of that round left open for the card under test. Varied rounds, so a card
 * that only shines early or late is measured both ways.
 */
const bases = [];
for (let k = 0; k < BASES; k++) {
    const round = 1 + (k % 4), r = E.rng(E.hashSeed(`cards:base:${k}`)), seed = 1000 + k;
    const byRound = [];
    for (let rd = 0; rd <= round; rd++) {
        const picks = [];
        const n = E.picksIn(rd) - (rd === round ? 1 : 0);
        for (let p = 0; p < n; p++) {
            const o = E.offer(seed, 0, rd, 0, p, 0);
            picks.push(o[Math.floor(r() * o.length)]);
        }
        byRound.push(picks);
    }
    bases.push({round, byRound, seed: E.hashSeed(`cards:fight:${k}`)});
}
const withCard = (base, id) => base.byRound.map((ids, rd) => (rd === base.round ? ids.concat(id) : ids));

/** X's army wins minus Y's, over every base and both seats. */
function duel(x, y) {
    let d = 0;
    for (const base of bases) {
        const a = withCard(base, x), b = withCard(base, y);
        const one = E.fight(a, b, base.round, base.seed), two = E.fight(b, a, base.round, base.seed);
        d += (one.winner === 0) - (one.winner === 1) + (two.winner === 1) - (two.winner === 0);
    }
    return d;
}

const NAMES = ['common', 'rare', 'epic'];
const tiers = [0, 1, 2].map((tier) => Object.keys(E.CARDS).filter((id) => E.CARDS[id].rarity === tier));

/** Every pairing of a rarity: who each card clearly beats, and how it does on average (-1 to 1). */
function measure() {
    return tiers.map((ids) => {
        const beats = Object.fromEntries(ids.map((id) => [id, []])), net = Object.fromEntries(ids.map((id) => [id, 0]));
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const d = duel(ids[i], ids[j]);
                net[ids[i]] += d; net[ids[j]] -= d;
                if (d >= MARGIN) beats[ids[i]].push(ids[j]);
                else if (d <= -MARGIN) beats[ids[j]].push(ids[i]);
            }
        }
        for (const id of ids) net[id] /= 2 * BASES * (ids.length - 1);
        return {ids, beats, net};
    });
}

const t0 = Date.now();
if (process.argv.includes('--tune')) {
    // Each round pulls a card's power by how far it sits from the middle of its rarity.
    const rounds = Number(process.env.ROUNDS || 6);
    for (let k = 0; k < rounds; k++) {
        const tiersNow = measure();
        const worst = tiersNow.map(({ids, beats}) => Math.max(...ids.map((id) => beats[id].length)) / (ids.length - 1));
        console.log(`round ${k + 1}: most beaten share per rarity ${worst.map((w) => w.toFixed(2)).join(' / ')}`);
        for (const {ids, net} of tiersNow) {
            for (const id of ids) E.POWER[id] = Math.round((E.POWER[id] || 100) * (1 - 0.45 * net[id]));
        }
        // Armies keep their size: the common troops average 100% and stay near it, so the
        // troop ring holds (a giant past 100% stops losing to goblins). Strong walls stall battles into timeouts; bombs past 200% chain wildly.
        const troops = tiers[0].filter((id) => E.CARDS[id].kind === 'troop');
        const mean = troops.reduce((sum, id) => sum + E.POWER[id], 0) / troops.length;
        for (const id of Object.keys(E.CARDS)) {
            const p = troops.includes(id) ? (E.POWER[id] * 100) / mean : E.POWER[id] || 100;
            const [lo, hi] = id === 'giant' ? [90, 100] : troops.includes(id) ? [90, 110] : id === 'wall' ? [35, 150] : id === 'bomb' ? [35, 200] : [35, 300];
            E.POWER[id] = Math.round(Math.max(lo, Math.min(hi, p)));
        }
    }
    const lines = Object.keys(E.POWER).sort().filter((id) => E.POWER[id] !== 100).map((id) => `        ${id}: ${E.POWER[id]},`);
    const src = readFileSync(ENGINE, 'utf8').replace(/\/\/ POWER:BEGIN[\s\S]*?\/\/ POWER:END/,
        `// POWER:BEGIN\n    const POWER = {\n${lines.join('\n')}\n    };\n    // POWER:END`);
    writeFileSync(ENGINE, src);
    console.log(`wrote ${lines.length} card powers to draft-engine.js in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    process.exit(0);
}

const report = [];
measure().forEach(({ids, beats}, tier) => {
    const others = ids.length - 1;
    const over = ids.filter((id) => beats[id].length > LIMIT * others);
    check(!over.length, `no ${NAMES[tier]} card clearly beats more than two thirds of the other ${others} ${NAMES[tier]} cards${over.length ? `: ${over.map((id) => `${id} beats ${beats[id].length}`).join(', ')}` : ''}`);
    report.push(`     ${NAMES[tier]}: ${ids.slice().sort((p, q) => beats[q].length - beats[p].length).map((id) => `${id} ${beats[id].length}`).join(' · ')}`);
});
console.log(report.join('\n'));
console.log(`     ${BASES} base armies, both seats, a clear win is ${MARGIN} of ${2 * BASES}; ${((Date.now() - t0) / 1000).toFixed(0)} s`);

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nNo Draft Battle card is the obvious pick');
