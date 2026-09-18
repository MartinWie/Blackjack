/**
 * Plays a solo session the way the browser does — the compiled engine plus the real
 * `bank.js` — with no browser and no server.
 *
 * This is the only automated cover for the offline path: it catches the engine bundle
 * failing to export, a rule that behaves differently in JS, and the bankroll drifting
 * from what the table actually staked and paid.
 *
 *   node tools/solo-session.mjs
 */
import {createRequire} from 'module';
import {readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, '..', 'src', 'jvmMain', 'resources', 'static');
const require = createRequire(import.meta.url);

// --- the shims bank.js needs -------------------------------------------------
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
};
globalThis.localStorage = new Proxy(globalThis.localStorage, {
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true}),
});
globalThis.window = {BJ: {minBet: 5, maxBet: 500, chips: [5, 25, 100, 500], startingCash: 500, rebuy: 200}};

new Function(readFileSync(join(staticDir, 'bank.js'), 'utf8'))();
const Bank = globalThis.window.Bank;

const engine = require(join(staticDir, 'vendor', 'engine.js')).de.mw.blackjack;

// --- the session --------------------------------------------------------------
const table = new engine.SoloTable('Ada');
const call = async (p) => JSON.parse(await p);

let failures = 0;
const check = (what, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
};

const apply = (state) => Bank.apply('SOLO', state);

let answer = await call(table.join());
apply(answer.body);
check('starting cash', Bank.cash, 500);

const ROUNDS = 25;
let staked = 0;
let returned = 0;

for (let round = 0; round < ROUNDS; round++) {
    const before = Bank.cash;
    answer = await call(table.bet(25));
    apply(answer.body);
    check(`round ${round + 1}: bet leaves the bankroll`, Bank.cash, before - 25);

    answer = await call(table.deal());
    apply(answer.body);

    // Flat strategy, and take every double the table offers so both stake paths run.
    while (answer.body.phase === 'PLAYER_TURN' && answer.body.actions.length) {
        const hand = answer.body.seats[0].hands.find((h) => h.active);
        const wants = answer.body.actions.includes('DOUBLE') && (hand.value === 10 || hand.value === 11)
            ? 'DOUBLE'
            : hand.value < 17 ? 'HIT' : 'STAND';
        answer = await call(table.act(wants));
        apply(answer.body);
    }

    for (let i = 0; i < 40 && answer.body.phase !== 'PAYOUT'; i++) {
        await table.tick(Date.now() + 10000);
        answer = await call(table.state());
        apply(answer.body);
    }
    check(`round ${round + 1}: settled`, answer.body.phase, 'PAYOUT');

    const seat = answer.body.seats[0];
    staked += seat.hands.reduce((sum, h) => sum + h.bet, 0);
    returned += seat.returned;

    // Back to betting for the next round.
    for (let i = 0; i < 40 && answer.body.phase !== 'BETTING'; i++) {
        await table.tick(Date.now() + 60000);
        answer = await call(table.state());
        apply(answer.body);
    }
}

check('bankroll matches what was staked and paid', Bank.cash, 500 - staked + returned);
console.log(`\n${ROUNDS} rounds: staked ${staked}, returned ${returned}, cash ${Bank.cash}`);
process.exit(failures ? 1 : 0);
