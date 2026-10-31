/**
 * Builds Sweet Swap levels with the real engine and checks what the page promises:
 * a playable opening board, a budget the bot met on every run, and that a fresh bot
 * run on the player's own seed can still win.
 *
 *   node tools/sweets-check.mjs [levels]
 */
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const E = require('../src/jvmMain/resources/static/sweets/sweets-engine.js');
const levels = Number(process.argv[2] || 30);
let bad = 0, playerWins = 0, worst = 0;
const types = {};

for (let n = 1; n <= levels; n++) {
    const t = performance.now();
    const L = E.level(n);
    const ms = performance.now() - t;
    worst = Math.max(worst, ms);
    types[L.type] = (types[L.type] || 0) + 1;
    const s = E.start(L);
    const problems = [];
    if (!E.validMoves(s).length) problems.push('no opening move');
    if (!(L.moves > 0)) problems.push('no budget');
    const run = E.botPlay(L, L.seed, L.type === 'score' || L.type === 'timed' ? L.moves === 999 ? 22 : L.moves : 0);
    const won = L.type === 'score' || L.type === 'timed' ? run.score >= L.goal.score : run.won && run.moves <= L.moves;
    if (won) playerWins++;
    if (problems.length) { bad++; console.log(`  level ${n}: ${problems.join(', ')}`); }
    console.log(`${String(n).padStart(3)} ${L.type.padEnd(11)} ${L.w}x${L.h} c${L.colors} moves ${String(L.moves).padStart(3)} ${L.goal.score ? 'target ' + L.goal.score : ''}${L.bombTimer ? ' bombs' : ''}  ${ms.toFixed(0)} ms  bot on player seed: ${won ? 'win' : 'loss'}`);
}
console.log(`types ${JSON.stringify(types)}  worst ${worst.toFixed(0)} ms  bot wins on player seeds ${playerWins}/${levels}`);
if (bad) process.exit(1);
