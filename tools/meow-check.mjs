/**
 * Generates the first levels of every Hide & Meow difficulty with the real engine and
 * checks the promise the page makes: one solution, reachable by deduction, and the
 * same board for the same seed.
 *
 *   node tools/meow-check.mjs [levels]
 */
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const E = require('../src/jvmMain/resources/static/meow/meow-engine.js');
const levels = Number(process.argv[2] || 30);
let failed = 0;

for (const [key, spec] of Object.entries(E.DIFFICULTIES)) {
    let worst = 0, total = 0, exact = 0;
    for (let level = 1; level <= levels; level++) {
        const t = performance.now();
        const b = E.generate(key, level);
        const ms = performance.now() - t;
        worst = Math.max(worst, ms); total += ms;
        const problems = [];
        if (!b) problems.push('no board');
        else {
            if (E.countSolutions(b.size, b.regions, 2) !== 1) problems.push('not unique');
            if (!E.solvable(b.size, b.regions, spec.grade)) problems.push('needs a guess');
            if (JSON.stringify(E.generate(key, level)) !== JSON.stringify(b)) problems.push('not deterministic');
            if (spec.floor === 0 || !E.solvable(b.size, b.regions, spec.floor)) exact++;
            for (let r = 0; r < b.size; r++) {
                const c = b.cats[r] % b.size;
                const next = b.cats[r + 1] % b.size;
                if (r + 1 < b.size && Math.abs(c - next) <= 1) problems.push('cats touch');
            }
        }
        if (problems.length) { failed++; console.log(`  ${key} ${level}: ${problems.join(', ')}`); }
    }
    console.log(`${spec.label.padEnd(7)} ${spec.size}x${spec.size}  avg ${(total / levels).toFixed(0)} ms  worst ${worst.toFixed(0)} ms  hard enough ${exact}/${levels}`);
}
if (failed) { console.log(`${failed} bad boards`); process.exit(1); }
console.log('all boards unique and solvable');
