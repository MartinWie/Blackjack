// Draft Battle: the battle is deterministic, the server orders picks the same way the
// engine deals them, both seats and every card stay in balance, and the bot drafts
// better than chance. Run with `npm run check:draft`.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../src/jvmMain/resources/static/draft/draft-engine.js');
const source = readFileSync(new URL('../src/jvmMain/resources/static/draft/draft-engine.js', import.meta.url), 'utf8');
const room = readFileSync(new URL('../src/jvmMain/kotlin/de/mw/draft/DraftRoom.kt', import.meta.url), 'utf8');

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

// 1. Both phones of a room must fight the very same battle: integers only.
const banned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').match(/Math\.(random|sin|cos|tan|atan2?|pow|exp|log\w*|hypot|cbrt)\b|Date\.now|performance\./g);
check(!banned, `engine uses no inexact or random maths${banned ? `: ${[...new Set(banned)].join(', ')}` : ''}`);

const randomDraft = (seed, round) => {
    const cards = E.pool(seed, 0, round);
    const r = E.rng(seed * 7919 + round);
    const choices = Array.from({length: E.TURNS}, () => (r() < 0.5 ? 0 : 1));
    return {cards, choices, hands: E.hands(cards, round, choices)};
};

let same = true;
for (let s = 1; s <= 100; s++) {
    const {hands} = randomDraft(s, s % 3);
    const a = E.fight(hands[0], hands[1], s % 3, s), b = E.fight(hands[0], hands[1], s % 3, s);
    if (JSON.stringify(a) !== JSON.stringify(b)) same = false;
}
check(same, 'a battle fought twice ends the same way');

// A change to the rules changes these battles. That is allowed, but on purpose: set
// GOLDEN to the new digest. Phones on the old build are reloaded by the build check.
const GOLDEN = 'abf985e7';
let digest = 0x811c9dc5;
for (let s = 1; s <= 60; s++) {
    const {hands} = randomDraft(s * 13, s % 3);
    const res = E.fight(hands[0], hands[1], s % 3, E.battleSeed(s, 0, s % 3));
    for (const ch of `${res.winner}:${res.ticks}:${res.hp.join(',')};`) digest = Math.imul(digest ^ ch.charCodeAt(0), 0x01000193) >>> 0;
}
const got = digest.toString(16);
check(got === GOLDEN, `the battle rules are the ones on record (digest ${got}${got === GOLDEN ? '' : `, expected ${GOLDEN}: update GOLDEN if the change is meant`})`);

// 2. The server's turn order and sizes are the engine's.
check(/fun picker\(round: Int, turn: Int\) = \(turn \+ round\) % 2/.test(room), 'DraftRoom.picker is (turn + round) % 2, like the engine');
check(new RegExp(`const val TURNS = ${E.TURNS}\\b`).test(room), `DraftRoom.TURNS is ${E.TURNS}`);
check(new RegExp(`const val MAX_ROUNDS = ${E.MAX_ROUNDS}\\b`).test(room), `DraftRoom.MAX_ROUNDS is ${E.MAX_ROUNDS}`);

// 3. Balance over random drafts.
const N = 1500;
const wins = [0, 0, 0], card = {}, ticks = [];
let worst = 0, timeouts = 0;
for (let s = 1; s <= N; s++) {
    const round = s % 3;
    const {hands} = randomDraft(s, round);
    const t = Date.now();
    const res = E.fight(hands[0], hands[1], round, E.battleSeed(s, 0, round));
    worst = Math.max(worst, Date.now() - t);
    wins[res.winner + 1]++;
    ticks.push(res.ticks);
    if (res.ticks >= E.MAX_TICKS) timeouts++;
    hands.forEach((hand, seat) => {
        for (const id of new Set(hand)) {
            card[id] = card[id] || {n: 0, w: 0};
            card[id].n++;
            if (res.winner === seat) card[id].w++;
        }
    });
}
const share = wins[1] / (wins[1] + wins[2]);
check(share > 0.45 && share < 0.55, `seats are even: seat 0 wins ${(share * 100).toFixed(1)}% of decided rounds`);
check(timeouts / N < 0.02, `few battles run out of time: ${timeouts} of ${N}`);
ticks.sort((a, b) => a - b);
const seconds = (q) => (ticks[Math.floor(ticks.length * q)] * E.TICK_MS) / 1000;
check(seconds(0.5) > 5 && seconds(0.5) < 16, `a battle lasts ${seconds(0.5).toFixed(1)} s on screen (median), ${seconds(0.9).toFixed(1)} s at the 90th percentile`);
check(worst < 80, `the slowest battle simulates in ${worst} ms`);
const rates = Object.entries(card).map(([id, v]) => [id, Math.round((100 * v.w) / v.n)]).sort((a, b) => b[1] - a[1]);
const lop = rates.filter(([, r]) => r < 25 || r > 70);
check(!lop.length, `every card wins 25–70% of the hands holding it${lop.length ? `: ${lop.map((r) => r.join(' ')).join(', ')}` : ''}`);
console.log(`     ${rates.map(([id, r]) => `${id} ${r}`).join(' · ')}`);

// 4. The bot drafts better than chance.
let botWins = 0;
const B = 200;
for (let s = 1; s <= B; s++) {
    const round = s % 3, seed = s * 31, bot = s % 2;
    const cards = E.pool(seed, 0, round), fs = E.battleSeed(seed, 0, round), r = E.rng(s * 97);
    const choices = [];
    for (let t = 0; t < E.TURNS; t++) choices.push(E.picker(round, t) === bot ? E.bestChoice(cards, round, choices, bot, fs) : r() < 0.5 ? 0 : 1);
    const h = E.hands(cards, round, choices);
    if (E.fight(h[0], h[1], round, fs).winner === bot) botWins++;
}
check(botWins / B >= 0.65, `the bot beats random drafting in ${Math.round((100 * botWins) / B)}% of rounds`);

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nDraft Battle is fair and deterministic');
