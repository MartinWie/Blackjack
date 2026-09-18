# Blackjack — project notes

Casino-style blackjack prototype. Quick rounds on a phone, solo or in a shared room.
Read `README.md` first; it covers the stack, the rules and the trade-offs. This file
is what a change needs to know.

## Ground rules

- **No database.** Rooms live in `RoomRegistry` and die with the process; cash lives
  in the browser's `localStorage`. Do not add persistence without being asked.
- **One engine, two targets.** Every rule lives in `src/commonMain` (`game/Engine.kt`,
  `game/Room.kt`) and is compiled for the JVM and the browser. A shared table runs it
  on the server; `/solo` runs it in the page via `jsMain/SoloTable.kt`. Writing a rule
  in JavaScript — or letting `table.js` decide an outcome — is a bug: it would be a
  second set of rules to keep in agreement.
- **Solo is always local**, online or off. It creates no room on the server, which is
  both why it works on a plane and why an idle phone costs the server nothing.
- `static/vendor/engine.js` is the compiled bundle, produced by the `copyEngine` task
  and gitignored. Never edit it; `jvmProcessResources` depends on it, so the jar can
  never ship a stale one.
- **Numbers live in `models/Constants.kt`.** `Rules` (game) and `Pace` (clocks) are
  injected into the page as `window.BJ`; never hard-code a bet size or payout twice.
- **One lock per table.** Every mutation goes through `Room.change {}`, which bumps
  the version the sweep broadcasts on. State read outside the lock is a snapshot.
- **Offline matters.** No CDN, ever: anime.js and the engine are vendored. New assets
  belong in the service worker's `SHELL` list and want a `VERSION` bump in
  `static/sw.js`. A new page that must work offline has to be precached there too —
  `/solo` is, which is what makes a plane work.
- Port is 8090 (huus 8080, feedbackr 8081).

## Watch out for

- **Anything keyed by room code is a leak waiting to happen.** `RoomRegistry.rooms`,
  `RoomRegistry.published` and `RoomEvents.subscribers` are all cleaned in one place —
  the tail of `RoomRegistry.sweep`. A new map keyed the same way belongs there too.
  `RoomRegistry.reclaimable` is the single rule for when a table is handed back: empty
  past its TTL, **or** untouched for `Pace.ROOM_IDLE_SECONDS`. The second clause is
  what bounds a long run — a seat is freed only when its player disconnects, and a tab
  left open never does.
- `GET /metrics` reports rooms, streams, stream_rooms and heap. Over a long run all
  of them must come back down when people stop playing; if `stream_rooms` exceeds
  `rooms` for more than a sweep, streams are outliving their table.
- Timers are deliberately absent on a solo table (`Room.armDeadline`). A change that
  arms them unconditionally makes a pocketed phone lose hands.
- The bankroll reconciliation in `bank.js` is stake-based and idempotent per round.
  Changing what `stake` or `returned` mean means changing that ledger too. Its
  `bj.ledger.<code>` keys are pruned on entry (`Bank.pruneLedgers`) — a clean exit is
  not something a browser can be relied on for.

## Checks

```bash
./gradlew test       # engine + room state machine (JVM and common)
npm run check:solo   # the offline path: real bundle + real bank.js, 25 rounds in Node
bash start.sh        # Tailwind, engine bundle, jar, run
```

The browser test task is disabled (`js { browser { testTask { enabled = false } } }`)
— it launches Chrome, which no build container has. `check:solo` covers the bundle.
