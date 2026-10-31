/**
 * Builds Ant Picnic levels with the real engine and checks what the page promises:
 * every level can be won (by following the order it was built from), and the same
 * level number is the same board everywhere.
 *
 *   node tools/picnic-check.mjs [levels per difficulty]
 */
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const E = require('../src/jvmMain/resources/static/picnic/picnic-engine.js');
const count = Number(process.argv[2] || 40);
let bad = 0;

for (const [difficulty] of E.LADDER) {
    let worst = 0, nests = 0, pics = new Set();
    for (let k = 1; k <= count; k++) {
        const n = E.LADDER.findIndex(([d]) => d === difficulty) * E.BAND + k;
        const t = performance.now();
        const L = E.level(n);
        worst = Math.max(worst, performance.now() - t);
        nests += L.nests;
        pics.add(L.picture);
        const problems = [];
        if (!E.playPlan(L)) problems.push('cannot be won');
        if (JSON.stringify(E.level(n)) !== JSON.stringify(L)) problems.push('not deterministic');
        if (L.lanes.some((l) => !l.length)) problems.push('empty lane');
        const e = E.endless(difficulty, k);
        if (!E.playPlan(e)) problems.push('endless cannot be won');
        if (problems.length) { bad++; console.log(`  ${difficulty} ${n}: ${problems.join(', ')}`); }
    }
    console.log(`${difficulty.padEnd(7)} avg ${(nests / count).toFixed(1)} nests  ${pics.size} pictures  worst ${worst.toFixed(0)} ms`);
}
if (bad) { console.log(`${bad} bad levels`); process.exit(1); }
console.log('every level can be won');
