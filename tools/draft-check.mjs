// Draft Battle: battles are deterministic, the server counts picks the way the engine
// deals them, the troops form a ring (each beats some and falls to others, so no army
// wins them all), seats and cards stay in balance, and the bot drafts better than chance.
// Run with `npm run check:draft`.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../src/jvmMain/resources/static/draft/draft-engine.js');
const source = readFileSync(new URL('../src/jvmMain/resources/static/draft/draft-engine.js', import.meta.url), 'utf8');
const room = readFileSync(new URL('../src/jvmMain/kotlin/de/mw/draft/DraftRoom.kt', import.meta.url), 'utf8');

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
// Speed limits hold on a developer's machine; a busy build server only reports them.
const NO_TIMING = !!process.env.NO_TIMING;
const timed = (ok, what) => (NO_TIMING ? console.log(`info ${what} (not a limit here)`) : check(ok, what));

// 1. Both phones of a room must fight the very same battle: integers only.
const banned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').match(/Math\.(random|sin|cos|tan|atan2?|pow|exp|log\w*|hypot|cbrt)\b|Date\.now|performance\./g);
check(!banned, `engine uses no inexact or random maths${banned ? `: ${[...new Set(banned)].join(', ')}` : ''}`);

/**
 * A whole match: each seat's `policy(seat, round, pick, picks, results)` picks, rounds
 * are fought until a seat is out of hearts. Returns every round's battle too.
 */
function playMatch(seed, policies, onFight, rules) {
    const picks = [], results = [];
    for (let round = 0; round < E.maxRounds(rules); round++) {
        picks.push([[], []]);
        for (const seat of [0, 1]) {
            for (let k = 0; k < E.picksIn(round, rules); k++) picks[round][seat].push(policies[seat](seat, round, k, picks, results));
        }
        const cards = [0, 1].map((seat) => E.cardsOf(seed, 0, picks, seat, results));
        const t = performance.now();
        const res = E.fight(cards[0], cards[1], round, E.battleSeed(seed, 0, round));
        if (onFight) onFight(res, cards, round, performance.now() - t);
        results.push(res.winner);
        if (E.score(results, rules).over) break;
    }
    return {picks, results, ...E.score(results, rules)};
}
const randomPolicy = (r) => () => Math.floor(r() * E.OFFER);
const botPolicy = (seed) => (seat, round, k, picks, results) => E.botChoice(seed, 0, picks, round, seat, results);

let same = true;
for (let s = 1; s <= 20; s++) {
    const r = E.rng(s);
    const m = playMatch(s, [randomPolicy(r), randomPolicy(r)]);
    const cards = [0, 1].map((seat) => E.cardsOf(s, 0, m.picks, seat, m.results));
    const last = m.picks.length - 1;
    const a = E.fight(cards[0], cards[1], last, s), b = E.fight(cards[0], cards[1], last, s);
    if (JSON.stringify(a) !== JSON.stringify(b)) same = false;
}
check(same, 'a battle fought twice ends the same way');

// A change to the rules changes these battles. That is allowed, but on purpose: set
// GOLDEN to the new digest. Phones on the old build are reloaded by the build check.
const GOLDEN = 'f694a0a6';
let digest = 0x811c9dc5;
for (let s = 1; s <= 24; s++) {
    const r = E.rng(s * 13);
    playMatch(s * 13, [randomPolicy(r), randomPolicy(r)], (res) => {
        for (const ch of `${res.winner}:${res.ticks}:${res.hp.join(',')};`) digest = Math.imul(digest ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    });
}
const got = digest.toString(16).padStart(8, '0');
check(got === GOLDEN, `the battle rules are the ones on record (digest ${got}${got === GOLDEN ? '' : `, expected ${GOLDEN}: update GOLDEN if the change is meant`})`);

// 2. The server counts the same picks per round, offers and rounds as the engine, for
// standard matches and custom ones.
const konst = (name) => Number((room.match(new RegExp(`const val ${name} = (\\d+)\\b`)) || [])[1]);
check(konst('OFFER') === E.OFFER, `DraftRoom.OFFER is ${E.OFFER}`);
check(konst('HEARTS') === E.HEARTS && konst('ROUNDS_PER_HEART') === E.ROUNDS_PER_HEART && E.maxRounds() === E.MAX_ROUNDS,
    `DraftRules has ${E.HEARTS} hearts and ${E.MAX_ROUNDS} rounds, like the engine`);
check(konst('FIRST_PICKS') === E.picksIn(0) && konst('PICKS') === E.picksIn(1) && E.picksIn(5) === E.picksIn(1),
    `DraftRules picks ${E.picksIn(0)} in the first round and ${E.picksIn(1)} after, like the engine`);
check(konst('MAX_HEARTS') === E.MAX_HEARTS && konst('MAX_PICKS') === E.MAX_PICKS, `custom rules stop at ${E.MAX_HEARTS} hearts and ${E.MAX_PICKS} picks on both`);
check(konst('ROUND_LIMIT') === E.ROUND_LIMIT, `no match runs past ${E.ROUND_LIMIT} rounds on either`);
check(/fun picksIn\(round: Int\) = if \(round == 0\) firstPicks else picks/.test(room) && /val maxRounds get\(\) = minOf\(ROUND_LIMIT, hearts \* ROUNDS_PER_HEART\)/.test(room),
    'DraftRules counts picks and rounds by the engine\'s rules');
const fit = E.customRules(0, 99), big = E.customRules(1e9, 4);
check(fit.hearts === 1 && fit.picks === E.MAX_PICKS && fit.firstPicks === fit.picks && big.hearts === E.MAX_HEARTS && E.picksIn(0, big) === 4,
    'custom rules are kept in bounds, one pick count for every round');

// 3. The ring: an army of one troop beats the next one round and loses to the one
// before, at the start of a match and deep into it; every troop has two it cannot beat.
const T = E.TROOP_CARD, C = E.CIRCLE;
function duel(a, b, round, seeds = 10) {
    let d = 0;
    for (let s = 1; s <= seeds; s++) {
        const A = [[T[a], T[a], T[a]]], B = [[T[b], T[b], T[b]]];
        while (A.length <= round) { A.push([T[a], T[a]]); B.push([T[b], T[b]]); }
        const res = E.fight(A, B, round, s * 101 + round);
        d += res.winner === 0 ? 1 : res.winner === 1 ? -1 : 0;
    }
    return d;
}
for (const round of [0, 4]) {
    const wrong = [], unbeaten = [];
    for (let i = 0; i < 6; i++) {
        const a = C[i], next = C[(i + 1) % 6];
        if (duel(a, next, round) < 6) wrong.push(`${a} over ${next}`);
        const losses = C.filter((b) => b !== a && duel(a, b, round) < 0).length;
        if (losses < 2) unbeaten.push(`${a} loses ${losses}`);
    }
    check(!wrong.length, `round ${round + 1}: each troop beats the next on the ring${wrong.length ? `; not ${wrong.join(', ')}` : ''}`);
    check(!unbeaten.length, `round ${round + 1}: every troop loses to at least two others${unbeaten.length ? `; ${unbeaten.join(', ')}` : ''}`);
}

// 4. Balance over random matches.
// Enough matches that luck of the offers (a seat drawing an epic offer) evens out.
const N = 320;
const wins = [0, 0, 0], card = {}, ticks = [], rounds = [];
let worst = 0, timeouts = 0, fights = 0;
for (let s = 1; s <= N; s++) {
    const r = E.rng(s * 7919);
    const m = playMatch(s, [randomPolicy(r), randomPolicy(r)], (res, cards, round, ms) => {
        fights++;
        worst = Math.max(worst, ms);
        wins[res.winner + 1]++;
        ticks.push(res.ticks);
        if (res.ticks >= E.MAX_TICKS) timeouts++;
        cards.forEach((byRound, seat) => {
            for (const id of new Set(byRound.flat())) {
                card[id] = card[id] || {n: 0, w: 0};
                card[id].n++;
                if (res.winner === seat) card[id].w++;
            }
        });
    });
    rounds.push(m.results.length);
}
const share = wins[1] / (wins[1] + wins[2]);
check(share > 0.44 && share < 0.56, `seats are even: seat 0 wins ${(share * 100).toFixed(1)}% of decided rounds`);
check(timeouts / fights < 0.03, `few battles run out of time: ${timeouts} of ${fights}`);
ticks.sort((a, b) => a - b);
const seconds = (q) => (ticks[Math.floor(ticks.length * q)] * E.TICK_MS) / 1000;
check(seconds(0.5) > 5 && seconds(0.5) < 22, `a battle lasts ${seconds(0.5).toFixed(1)} s on screen (median), ${seconds(0.9).toFixed(1)} s at the 90th percentile`);
timed(worst < 150, `the slowest battle simulates in ${worst.toFixed(0)} ms`);
rounds.sort((a, b) => a - b);
check(rounds[rounds.length >> 1] >= 4, `a match runs ${rounds[rounds.length >> 1]} rounds (median), ${rounds[rounds.length - 1]} at most`);
const rates = Object.entries(card).filter(([, v]) => v.n >= 20).map(([id, v]) => [id, Math.round((100 * v.w) / v.n)]).sort((a, b) => b[1] - a[1]);
// Card against card is `tools/draft-cards.mjs` (part of this check). Here, in whole random
// matches, every card only has to stay in a sane band.
const lop = rates.filter(([, r]) => r < 35 || r > 75);
check(!lop.length, `every card wins 35–75% of the battles of armies holding it${lop.length ? `: ${lop.map((r) => r.join(' ')).join(', ')}` : ''}`);
console.log(`     ${rates.map(([id, r]) => `${id} ${r}`).join(' · ')}`);

// 4b. Custom matches: they end on their own hearts, and a long one with big armies stays
// in numbers (no Infinity or NaN) and quick to fight.
for (const [hearts, picks] of [[1, 1], [6, 5]]) {
    const rules = E.customRules(hearts, picks);
    let ok = true;
    for (let s = 1; s <= 10; s++) {
        const r = E.rng(s * 4099);
        const m = playMatch(s, [randomPolicy(r), randomPolicy(r)], (res, cards, round) => {
            if (cards.some((byRound) => byRound[round].length !== picks)) ok = false;
        }, rules);
        const lost = m.results.filter((w) => w >= 0).length;
        if (!m.over || m.picks.length > E.maxRounds(rules) || (m.winner >= 0 && m.hearts[1 - m.winner] !== 0) || lost > 2 * hearts - 1) ok = false;
    }
    check(ok, `custom matches of ${hearts} heart${hearts > 1 ? 's' : ''} and ${picks} pick${picks > 1 ? 's' : ''} a round end on their hearts`);
}
{
    const rules = E.customRules(40, E.MAX_PICKS);
    let finite = true, slow = 0, n = 0;
    const r = E.rng(77);
    const m = playMatch(77, [randomPolicy(r), randomPolicy(r)], (res, cards, round, ms) => {
        n++;
        slow = Math.max(slow, ms);
        if (!res.hp.every(Number.isFinite)) finite = false;
        for (const byRound of cards) {
            const a = E.army(byRound);
            if (!E.TROOPS.every((t) => Number.isFinite(a.worth[t]) && a.placed[t] <= E.MAX_FIELD)) finite = false;
        }
    }, rules);
    check(finite, `a long custom match (${n} rounds of ${E.MAX_PICKS} picks) keeps every army and battle in numbers`);
    timed(slow < 250, `its slowest battle simulates in ${slow.toFixed(0)} ms`);
    if (!m.over) check(false, 'the long custom match ends');
}

// 5. The bot drafts better than chance, and the comeback offers keep matches alive.
let botWins = 0, botMs = 0, botPicks = 0;
const B = 40;
for (let s = 1; s <= B; s++) {
    const r = E.rng(s * 97), seat = s % 2;
    const bot = botPolicy(s * 31);
    const timed = (...args) => { const t = performance.now(); const c = bot(...args); botMs += performance.now() - t; botPicks++; return c; };
    const policies = seat === 0 ? [timed, randomPolicy(r)] : [randomPolicy(r), timed];
    if (playMatch(s * 31, policies).winner === seat) botWins++;
}
// Offers are choices between equals now, so thinking buys less than it did.
check(botWins / B >= 0.62, `the bot beats random drafting in ${Math.round((100 * botWins) / B)}% of matches`);
timed(botMs / botPicks < 120, `the bot thinks ${(botMs / botPicks).toFixed(0)} ms a pick`);

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nDraft Battle is fair and deterministic');
