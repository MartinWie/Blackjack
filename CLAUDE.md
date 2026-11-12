# Blackjack — project notes

Casino-style blackjack prototype. Quick rounds on a phone, solo or in a shared room.
The same server also hosts a launcher (`/`, `/games`), Marbles (`/marbles`, package
`de.mw.marbles`), Hide & Meow (`/meow`, `static/meow/`), Sweet Swap (`/sweets`,
`static/sweets/`), Ant Picnic (`/picnic`, `static/picnic/`), Draft Battle
(`/draft`, `static/draft/`, rooms in `de.mw.draft`) and Cell Survivor (`/cells`,
`static/cells/`). Read `README.md`
first; it covers the stack, the rules and the trade-offs. This file is what a change
needs to know.

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
  belong in the service worker's `SHELL` list in `static/sw.js`; its `VERSION` is
  replaced with the build id when served, so every deploy refreshes the cache. A new
  page that must work offline has to be precached there too —
  `/solo` is, which is what makes a plane work.
- Port is 8090 (huus 8080, feedbackr 8081).
- **`/` depends on the Host.** `blackjack.*` serves the lobby there, so a link back
  to the launcher goes to `/games`, never `/`.
- **Marbles keeps its own conventions** (HTMX, `style.css`, WebSockets, its own signed
  `user_session` cookie scoped to `/marbles`). Every URL it emits is prefixed with
  `MARBLES`; route definitions stay relative inside `route(MARBLES)`. Tailwind does not
  scan it. Games live in `GameManager`, swept by `RealtimeMaintenanceService`.
- **Hide & Meow and Sweet Swap are pure client.** A level is a seed; both engines must
  stay deterministic (no `Math.random`, no `Math.pow` in generation), or every level
  changes board. Changing a generator means running its check and accepting that
  existing levels move. Sweet Swap's budgets come from its bot: a rule change that
  makes the bot weaker or stronger moves every level's difficulty with it.
- `static/gift.js` is the one power-up drop animation; both games call `Gift.show`.
- **Draft Battle's battle must stay deterministic across browsers**: integers only in
  `draft-engine.js` (no `Math.random`, sin, cos, pow, hypot), or two phones in a room see
  different battles. The server never sees a card; `DraftRoom.OFFER` and `DraftRules`
  (hearts, picks per round, rounds, catch-up offers, the custom mode's limits) mirror the engine, and
  `check:draft` holds them equal. A match's rules travel in its state (`rules`), so code
  that counts picks or hearts takes them from there, never from the standard constants. A rules change
  moves `GOLDEN` in `tools/draft-check.mjs`; the troop ring check must keep passing.
- **No Draft card may be the obvious pick.** `tools/draft-cards.mjs` (part of
  `check:draft`) fights every card against every other card of its rarity on shared
  base armies; none may clearly beat more than two thirds of them. Card strength lives in
  the engine's `POWER` table; after a rules change run `node tools/draft-cards.mjs --tune`
  and keep what it writes. The Dockerfile runs these checks and `check:cells`, so a
  failing check stops the deploy.
- **Cell Survivor's chapters are seeds** (`chapter(n)`), and its difficulty curve is
  set by `check:cells`'s bot: a change to weapons or wave health moves every chapter.
- **Both canvas games are built for crowds.** No allocations in a frame's hot loops,
  batched paths, effects baked once (`bake`), and a resolution step-down on slow phones.
  Cell Survivor's fixed scale lets it pre-scale every sprite (`sized`); Draft's camera
  zooms, so its sprites stay small (192 px) and are scaled as drawn. In Cell Survivor
  shots find viruses through `Run.near`'s buckets and only crits raise hit events; a
  Draft `fight()` nobody watches raises none. Keep new effects inside those rules.
- Generated art lives in `static/draft/img` and `static/cells/img` (WebP) and is
  precached in `sw.js`; the large source PNGs are not in the repo.
  Draft troops and buildings are strips of poses (`<unit>-<team>-anim.webp`; troops have
  eleven: idle, steps, legs passing, wind-up, strike, follow-through, guard, flinch), built
  by `tools/draft-strips.cjs` from the source frames in `assets/sprites`: it anchors every
  pose on the feet and makes red by recolouring blue. The renderer holds each pose a few
  ticks, like drawn animation, rather than bending one picture.
- Hide & Meow's track and endless boards share `generate`; endless indices start at
  `ENDLESS_BASE` so the two never hand out the same board.

## Watch out for

- **Anything keyed by room code is a leak waiting to happen.** `RoomRegistry.rooms`,
  `RoomRegistry.published` and `RoomEvents.subscribers` are all cleaned in one place —
  the tail of `RoomRegistry.sweep`. A new map keyed the same way belongs there too.
  `RoomRegistry.reclaimable` is the single rule for when a table is handed back: empty
  past its TTL, **or** untouched for `Pace.ROOM_IDLE_SECONDS`. The second clause is
  what bounds a long run — a seat is freed only when its player disconnects, and a tab
  left open never does.
  Draft Battle's `DraftRooms.rooms` and `DraftEvents` follow the same rules in
  `DraftRooms.sweep`; each kind of room has its own `RoomStreams`, since codes of two
  kinds may collide.
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
npm run check:meow   # Hide & Meow boards: unique, solvable without guessing, seeded
npm run check:sweets # Sweet Swap levels: bot-calibrated budgets, won from the player seed
npm run check:picnic # Ant Picnic levels: each winnable by the order it was built from
npm run check:draft  # Draft Battle: deterministic battles, the ring, card against card, the bot
npm run check:cells  # Cell Survivor: seeded chapters and the difficulty curve
bash start.sh        # Tailwind, engine bundle, jar, run
```

`kotlin-js-store/yarn.lock` is checked in and verified on every build: after changing
a JS-side dependency, run `./gradlew kotlinUpgradeYarnLock` or the build fails with
"Lock file was changed".

The browser test task is disabled (`js { browser { testTask { enabled = false } } }`)
— it launches Chrome, which no build container has. `check:solo` covers the bundle.
