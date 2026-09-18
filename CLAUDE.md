# Blackjack — project notes

Casino-style blackjack prototype. Quick rounds on a phone, solo or in a shared room.
Read `README.md` first; it covers the stack, the rules and the trade-offs. This file
is what a change needs to know.

## Ground rules

- **No database.** Rooms live in `RoomRegistry` and die with the process; cash lives
  in the browser's `localStorage`. Do not add persistence without being asked.
- **The server owns the game.** All rules live in `game/Engine.kt` and `game/Room.kt`.
  The client renders state and nothing else — if JavaScript ever decides an outcome,
  that is a bug.
- **Numbers live in `models/Constants.kt`.** `Rules` (game) and `Pace` (clocks) are
  injected into the page as `window.BJ`; never hard-code a bet size or payout twice.
- **One lock per table.** Every mutation goes through `Room.change {}`, which bumps
  the version the sweep broadcasts on. State read outside the lock is a snapshot.
- **Offline matters.** No CDN, ever: anime.js is vendored. New assets belong in the
  service worker's `SHELL` list and want a `VERSION` bump in `static/sw.js`.
- Port is 8090 (huus 8080, feedbackr 8081).

## Watch out for

- `RoomRegistry.published` and `RoomEvents` subscriber sets are maps keyed by room
  code — anything added alongside them must be cleaned up in the same sweep, or the
  process leaks one entry per table ever created.
- Timers are deliberately absent on a solo table (`Room.armDeadline`). A change that
  arms them unconditionally makes a pocketed phone lose hands.
- The bankroll reconciliation in `bank.js` is stake-based and idempotent per round.
  Changing what `stake` or `returned` mean means changing that ledger too.

## Checks

```bash
./gradlew test    # engine + room state machine
bash start.sh     # Tailwind, jar, run — start.sh rebuilds when src/ is newer
```
