// Cell Survivor: chapters are seeded and playable (the channel stays clear of the
// cell and inside the dish), and a bot that picks sensibly finds the difficulty curve
// the game promises: early chapters a stroll, later ones needing the lab, careless picks
// punished. Run with `npm run check:cells`.
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../src/jvmMain/resources/static/cells/cells-engine.js');

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

// 1. Chapters: the same seed, the same channel; a channel the cell does not stand in.
let same = true, clear = Infinity, inside = true;
for (let n = 1; n <= 40; n++) {
    const a = E.chapter(n), b = E.chapter(n);
    if (JSON.stringify(a.path) !== JSON.stringify(b.path) || JSON.stringify(a.waves) !== JSON.stringify(b.waves)) same = false;
    for (const p of a.path) {
        clear = Math.min(clear, Math.hypot(p.x - a.cell.x, p.y - a.cell.y));
        if (p.x < 20 || p.x > E.W - 20 || p.y > E.H) inside = false;
    }
}
check(same, 'a chapter is the same every time it is built');
check(clear > 40, `the channel keeps clear of the cell (closest ${clear.toFixed(0)} units)`);
check(inside, 'the channel stays inside the dish');

// Every level of every weapon changes something, and its card says what.
const empty = [];
for (const w of Object.keys(E.WEAPONS)) for (let l = 2; l <= E.MAX_LEVEL; l++) if (!E.gains(w, l)) empty.push(`${w} ${l}`);
check(!empty.length, `every weapon level adds something its card can name${empty.length ? `: ${empty.join(', ')}` : ''}`);

// 2. Playing: a bot that levels the weapons it has and fires the burst near the core.
// It gathers weapons first, then levels them: the style that does best.
const PRIORITY = ['scalpel', 'swab', 'bubble', 'shock', 'satellite', 'needles', 'maw', 'tower', 'pill'];
function pick(run, smart, r) {
    const o = run.pending;
    if (!smart) return Math.floor(r() * o.length);
    const score = (x) => (x.kind === 'new' ? 120 - PRIORITY.indexOf(x.id) * 3
        : x.kind === 'up' ? 100 + x.level * 5
            : {might: 60, haste: 55, crit: 45, reach: 40, mend: run.core < run.coreMax * 0.5 ? 130 : 10, learn: 30}[x.id]);
    let best = 0;
    o.forEach((x, i) => { if (score(x) > score(o[best])) best = i; });
    return best;
}
let steps = 0, ms = 0, worst = 0;
function play(n, lab, seed, smart = true) {
    const run = new E.Run(n, lab, seed), r = E.rng(seed * 977);
    const t0 = Date.now();
    while (!run.over && run.t < 900) {
        if (run.pending) run.choose(pick(run, smart, r));
        const t = performance.now();
        run.step();
        worst = Math.max(worst, performance.now() - t);
        steps++;
        if (run.charge >= 1) { const lead = run.leading(); if (lead && lead.d > run.ch.length * 0.65) run.ultimate(); }
    }
    ms += Date.now() - t0;
    return run.over === 'won';
}
const labAt = (n) => { const L = Math.floor(n / 2); return {attack: L, cooldown: L, crit: L, core: L}; };
const wins = (n, lab, smart, seeds = [1, 2, 3, 4]) => seeds.filter((s) => play(n, lab, s, smart)).length;

const early = [1, 2, 3].map((n) => wins(n, {}, true));
check(early.every((w) => w === 4), `chapters 1–3 are won without the lab (${early.join(', ')} of 4)`);
const late = wins(12, {}, true);
check(late <= 2, `chapter 12 without the lab is mostly lost (${late} of 4 won)`);
const helped = wins(12, labAt(12), true);
check(helped >= 2, `chapter 12 with the lab a player can afford by then is mostly won (${helped} of 4)`);
const seeds = [1, 2, 3, 4, 5, 6];
const careful = [6, 8, 10, 12].reduce((s, n) => s + wins(n, labAt(n), true, seeds), 0);
const careless = [6, 8, 10, 12].reduce((s, n) => s + wins(n, labAt(n), false, seeds), 0);
check(careful > careless + 2, `sensible picks beat careless ones in chapters 6–12 (${careful} against ${careless} of 24)`);
check(worst < 8, `the slowest step takes ${worst.toFixed(1)} ms (${((ms * 1000) / steps).toFixed(0)} µs on average)`);

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nCell Survivor chapters are fair');
