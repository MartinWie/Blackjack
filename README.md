# Blackjack (and friends)

A casino-style blackjack prototype for quick rounds on the go. Play solo, or share a
four-character table code and let up to five people sit down together.

The same server hosts more games behind a launcher at `/`:

| Path | Game | Network |
|---|---|---|
| `/` | Launcher (`/games` everywhere) | offline |
| `/blackjack` | Blackjack lobby; `/solo` and `/t/{code}` as before | solo offline |
| `/meow` | Hide & Meow, a cat-finding logic puzzle | offline |
| `/sweets` | Sweet Swap, a match-3 with six level types | offline |
| `/picnic` | Ant Picnic, ants eating pixel-art food | offline |
| `/draft` | Draft Battle, a card draft and an auto-battle; solo or in a room | solo offline |
| `/marbles` | Marbles, realtime multiplayer odd/even (ported from `MarbleGame`) | online |

`/` follows the subdomain: `blackjack.*` opens the lobby, `meow.*`, `sweets.*`, `picnic.*` and
`draft.*` their game, `marbles.*` redirects to `/marbles`, anything else (`games.7mw.de`) gets the launcher.

Each game installs to the home screen as its own app: a browser installs one app per origin,
so every game has a subdomain and a manifest at `/manifest/{app}.webmanifest` (`Apps.kt`).
`static/install.js` is the offer, modelled on Huus: the launcher asks once, on a visit on a
later day; its Install button and each card's install link open the sheet on demand (a card
links to `<game>.7mw.de/#install`).

```bash
bash start.sh              # builds Tailwind + the JS engine + jar, runs on :8090
bash stop.sh
./gradlew test             # engine and room-state tests
npm run check:solo         # plays 25 offline rounds through the real bundle, in Node
npm run check:meow         # every difficulty's first 30 boards: unique, solvable, seeded
npm run check:sweets       # Sweet Swap levels: budgets the bot met, won from the player's seed
npm run check:picnic       # Ant Picnic levels: winnable by their own eating order, seeded
npm run check:draft        # Draft Battle: deterministic battles, fair seats and cards, a bot that drafts
```

Phone: `http://<your-mac-ip>:8090` on the same wifi — `start.sh` prints the address.

## Stack

Same conventions as [huus](../huus), minus everything a card game does not need:

| | |
|---|---|
| Rules | Kotlin Multiplatform — one engine, compiled for the JVM **and** the browser |
| Server | Kotlin 2.1 · Ktor 2.3 (Netty) · kotlinx.html · kotlinx.serialization |
| Client | Tailwind + DaisyUI · vanilla JS · [anime.js](https://animejs.com/) 4.5 |
| Transport | SSE (`/api/rooms/{code}/events`), JSON actions over `fetch` |
| State | In-memory rooms. No database, no jOOQ, no Flyway |
| Money | `localStorage` in the browser |

## Rules

Six-deck shoe reshuffled at 75% penetration, dealer stands on all 17s (soft
included), blackjack pays 3:2, double on any two cards, one split per hand, split
aces draw one card each. No insurance and no surrender. Everything tunable lives in
`models/Constants.kt` — `Rules` for the game, `Pace` for the clocks — and is injected
into the page as `window.BJ`, so the client never carries its own copy of a number.

## How a round runs

`Room` is a state machine behind one mutex: `BETTING → PLAYER_TURN → DEALER_TURN →
PAYOUT → BETTING`. `RoomRegistry` sweeps every live room on a 250 ms loop, advances
whatever deadline is due, and broadcasts the new state to that room's subscribers
only when its version changed.

**Clocks only exist when they need to.** A table with one player has no deadline at
all — a phone in a pocket never loses a hand. The moment a second player sits down,
the betting and action timers arm themselves, an expired action counts as a stand,
and a seat that has been disconnected for 90 s is freed so nobody else waits on it.
Empty rooms are dropped two minutes later.

## The money

There is no wallet on the server. The browser holds the cash in `localStorage`, and
the server only ever hears a bet size, so **a modified client can give itself chips**
— fine for a prototype with no stakes, not fine the day this means anything.

The payout a round produced stays on the seat past the payout phase, so a client
that missed those four seconds — a reconnect, a locked screen — still finds its
winnings on the next frame it sees. Reconciliation is stake-based, in `bank.js`: every state carries what the seat has on
the felt (`stake`) and, once settled, what came back (`returned`). A per-table ledger
remembers how much of the round has already been charged, so a reload mid-hand cannot
charge twice. Broke players get a top-up rather than a dead end. Known limitation: two tabs of the
same table both apply the same frame to one bankroll, so a bet can be charged twice —
`localStorage` has no transaction, and a prototype does not need one.

## Offline

**Solo play never touches the network.** `/solo` runs a `Room` — the same one the
server runs — compiled to JavaScript by Kotlin Multiplatform, so a plane, a basement
or a dead cell works exactly like a good connection. Nothing about it creates a room
on the server.

That is the whole reason the rules are multiplatform: a second engine written in
JavaScript would be a second set of rules to keep right, and the two would disagree
the first time one changed. `src/commonMain` is the only place a rule exists;
`SoloTable.kt` is a thin facade over it, and `table.js` renders the same state
whichever side produced it.

anime.js is vendored (no CDN) and the compiled engine is a build artifact, both under
`static/vendor/`. The service worker precaches the shell — `/`, `/solo`, stylesheet,
scripts, both bundles — and a failed navigation falls back to that page's cached copy
before it falls back to `/offline`. Static assets are fetched network-first and cached
under their path alone, so a deploy is live on the next load and the cache holds one
copy of each file rather than one per build.

Shared tables still need the server, and the lobby says so when the browser is
offline rather than failing on tap. Marbles is online only: its pages bypass the
service worker and land on `/offline` without a network, and the launcher dims its
card.

## Hide & Meow

Find one cat per colour, one per row and column, no two touching (corners included).
Tap or drag to mark a spot with an X, double tap to look under it; a wrong look costs
one of three fish.

A level is a seed: `meow-engine.js` derives the board from `difficulty:level`, so a
level is the same board on every phone and the server holds nothing. The generator
only accepts a board that has **exactly one solution** and that its logic solver can
finish **without guessing**. The solver's techniques are graded, and each difficulty
names the hardest grade a board may need and the grade it must be too hard for:

| | Size | May need | Must beat |
|---|---|---|---|
| Easy (levels 1–100) | 6×6 | singles, one colour confined to a line | — |
| Medium (101–200) | 7×7 | confinement of 2–3 colours/lines at once | grade 1 |
| Hard (201–300) | 8×8 | "a cat here would empty a line" | grade 2 |
| Expert (301 on) | 9×9 | the same, following forced cats | grade 2 |

There is no difficulty picker: the track (`LADDER` in the engine) steps up a
difficulty every hundred levels. Finishing a band unlocks that difficulty's endless
mode in the level selector — its own boards, seeded far past any track index — and the
player can switch between it and the track at any time.
The page keeps to the board: levels, restart and rules on round buttons, and Next level
or Try again fading in over the board once the win or loss animation is done. Seven cat breeds (`meow-cats.js`)
blink and twitch on staggered CSS clocks. A find picks one of five entrances (hearts,
jump, spin, peek, meow) and ripples the cells around it; a win bounces the cats in a
wave under one of three parties (confetti, fireworks, balloons); an unlock bursts a
padlock open. Every particle removes itself when its animation ends.

Power-ups — Catnip (reveal a cat), Yarn ball (mark what found cats rule out), Golden
fish (+1 life, up to five), Bell (next look is free) — start at one each; after every
finished game there is a 1-in-7 roll for a random one, shown by `static/gift.js`, which
Sweet Swap shares.

Region growth is skewed (a few big colours, some small) because even regions almost
never give a unique board, and capped at 26% of the board so no colour swallows it.
After 3000 tries a board that is merely solvable is accepted, so no seed can hang the
page. Progress is the level reached, one board in progress and the power-up pouch.

## Ant Picnic

Twenty-one pixel-art foods on a 26×26 mat. The art is generated (`assets/picnic/*.png`)
and turned into boards by `tools/picnic-pixelize.py`, which finds the pixel grid, keeps
white inside a picture as food, and merges each picture down to a few colours; it
writes `picnic-pics.js`, which is not edited by hand.

Nests wait in lanes; tapping a lane's front nest fills a jar with that many ants of its
colour. An ant can take any block open to the outside on some side. The plate shows
the picture plus a ring of open space (a window onto the 26x26 grid), and an ant is
about a cell long, so it walks one-cell gaps without touching a block. A jar's ants
set off in single file, round the picture and in through open space; one whose way
is still blocked by pixels earlier ants will take queues two cells short and goes on
once they are lifted (routes only ever wait on earlier pixels, so nothing waits in a
circle). At its block the ant turns to face it and the pixel is swapped, in one frame,
for the same block in its jaws; it carries it out and down the hole. A Digger's ants
pop up under their blocks instead. Ants whose colour is still buried wait in their
jar; every jar full of ants that cannot reach anything and lunch is over. While every
slot still shows a jar, taps wait.

A level is a seed. `eatingOrder` plays the board while it builds it, sending some nests
before their colour can be reached, never so many that every slot fills; nests are
dealt to the shortest lane in runs without reordering, so following that order always
wins (`npm run check:picnic`). Same track as Hide & Meow (100 levels a difficulty, an
endless mode after each band), the same gift drops, and four power-ups: Extra seat,
Digger, Recall, Feast. Progress keeps the board in progress as its list of actions,
with a fingerprint of the board so a changed level starts fresh.

Colour-blind mode (in Rules) puts a symbol per colour (●▲■◆★♥✚◎) on the picture, the
nests and the jars; without it they stay plain. On Hard and Expert the nests behind the
front row stay "?" until they reach it.

## Sweet Swap

A match-3: four in a row makes a striped candy, an L or T a wrapped one, five a colour
bomb, and every pair of specials has its own combo. Six level types — score, jelly
(single and double), ingredient drop, orders, clear the blockers, timed — over frosting
with up to three layers, spreading chocolate, licorice locks, countdown candy bombs and
odd-shaped boards, and four boosters (hammer, free switch, +5 moves, colour bomb) that drop
on the same 1-in-7 roll and gift animation as Hide & Meow's power-ups.

A level is a seed (`sweets-engine.js`, `level(n)`). The engine builds the board and the
goal, then a greedy bot plays it three times — the first run from the player's own
seed — to prove each level can be won and to set move budgets (twice what it needed at
first, narrowing as levels climb). Score targets come from a casual bot that taps any
match at random: they start below what it scores and climb past it. A design the bot cannot finish is
redesigned; after six tries the level falls back to a plain score level. Moves return
events with board snapshots, and the page animates snapshot to snapshot.

There is no map: the game opens on the last level played, and Levels lists every
unlocked level with its stars in a sheet, like the other games.

## Draft Battle

Each round lays out ten cards in five pairs. Whoever's turn it is keeps one card of the
pair and the other goes to the rival; turns alternate and the round decides who starts.
Cards are troops (goblins, swordsmen, archers, knights, a giant), multipliers (×2 of a
troop, which bring at least two when there are none; Rally for +40% of everything),
boosts, defenses (wall, shields, medics who get every other fallen troop back up, a
tower) and weapons (catapult, fireball, lightning). Then the two armies fight on their
own; first to two rounds wins the match (up to five when rounds are drawn).

`draft-engine.js` holds every rule and the battle, a fixed-tick simulation in integers
only (`Math.sqrt` of an integer, floored, is exact in every browser; sin, pow and
`Math.random` are not). That is what lets a live room work without the server knowing a
single card: both phones run the same battle on the same seed and picks.
`de.mw.draft.DraftRoom` only orders the draft: whose turn, which card of the pair was
kept, a 20 s clock that keeps the first card for an absent player, and both players
being ready for the next round or a rematch. A player who leaves mid-match keeps their
seat (the clock picks for them, and the link brings them back to their own hand); a
phone on another build than the server's reloads, since it would fight other battles.
Rooms live in `DraftRooms` with their own
stream instance (`DraftEvents`), swept and handed back like the blackjack tables.

Solo plays against a bot that tries each card of the pair in a quick battle; lower ranks
(Bronze to Master, by trophies) slip into random picks more often. A solo match in
progress is saved and resumes. `npm run check:draft` keeps the battle deterministic, the
server's turn rule equal to the engine's, both seats and every card in balance, and the
bot ahead of random drafting.

## Deploying

```bash
bash deploy.sh          # build, swap, wait for /health — safe to re-run
bash deploy.sh --logs   # …and follow the log
```

First run writes `.env` with a freshly generated session key, builds the image
stamped with the current git sha, brings the container up and refuses to call it a
success if the new one never answers `/health` — or if it came up on the public dev
key, which is the one failure here that otherwise looks exactly like a working
deployment. `docker compose down` stops it.

Or by hand:

```bash
docker build -t blackjack --build-arg BUILD_ID=$(git rev-parse --short HEAD) .
docker run -p 8090:8090 -e "SECRET_BJ_SESSION-KEY=$(openssl rand -hex 16)" blackjack
```

Three stages: Tailwind in node, the jar in Gradle, and a runtime of a JRE and one jar
(~350 MB). Nothing needs a database, so there is nothing to migrate and no compose
file.

Two things a deployment has to get right:

- **`SECRET_BJ_SESSION-KEY` (or `BJ_SESSION_KEY`).** Unset means the public dev key, and the log says so —
  `docker logs … | grep "dev default"` must come back empty.
- **One replica.** Rooms and their SSE subscribers live in this process's memory. A
  second replica is a second set of tables that cannot see the first, and a player
  joining a code that lives on the other node just gets a 404. Sticky sessions do not
  fix it; a shared room registry would, and that is the seam to replace (`RoomRegistry`).

The asset query string (`?v=`) and the service worker's cache name come from
`BuildInfo.id`: `BJ_BUILD_ID` when set to a real value, otherwise a checksum of the
running jar, so it changes with every build and stays put across restarts. (Dokploy
passes no build args; a fixed id kept phones on old scripts.)

Behind a TLS proxy, SSE must not be buffered — `proxy_buffering off` for `/api/` on
nginx, or the table updates in bursts.

## Running for a long time

Nothing here grows without a bound, and `GET /metrics` is how that is checked:

```
rooms 3          tables in the registry
streams 4        open SSE connections
stream_rooms 3   rooms those streams belong to — must not exceed `rooms`
marbles_games 1  live marbles games
heap_mb 41
```

Footprint: about 67 MB idle in a 512 MB container, 110 MB with 25 tables and 50 open
streams. The image sets `MaxRAMPercentage=70`, SerialGC, an unpooled Netty allocator
(the pooled one reserves per-core arenas it never returns) and ceilings on metaspace
and direct memory, so a leak in either surfaces as an error rather than as the kernel
killing the container. The 52 distinct cards are allocated once for the process — a
shoe is 312 references and a reshuffle allocates nothing.

A table is handed back when it is empty past its TTL (2 min) **or** untouched for
three hours — the second rule is the one that matters, because a seat is only freed
when its player disconnects and a forgotten open tab never does. Streams left over
from a dropped room are closed by the same sweep. In the browser, per-table ledgers in
`localStorage` are pruned after a day rather than trusting a clean exit.

## Layout

```
commonMain/   the game, and nothing else — compiled for both targets
  models/       Cards, rules, the serializable views the client receives
  game/         Engine.kt (pure blackjack), Room.kt (the state machine)
jvmMain/      the server
  game/         RoomRegistry.kt — shared tables and the sweep that drives them
  realtime/     Per-room SSE fan-out
  plugins/      Ktor routing and the cookie that is the only identity here
  frontend/     kotlinx.html page shells — the table is rendered client-side
  resources/static/   bank.js (money), lobby.js, table.js (felt + animation), sw.js
  kotlin/de/mw/marbles/   Marbles: game state, HTMX pages, WebSocket fan-out
  resources/static/marbles/  its own stylesheet and scripts
  resources/static/meow/     Hide & Meow: meow-engine.js (rules, levels), meow-cats.js, meow.js
  resources/static/sweets/   Sweet Swap: sweets-engine.js (rules, levels, bot), sweets.js
  resources/static/picnic/   Ant Picnic: picnic-pics.js, picnic-engine.js, picnic.js
  resources/static/gift.js   the power-up gift the offline games share
jsMain/       SoloTable.kt — the browser's handle on a Room; becomes vendor/engine.js
tools/        solo-session.mjs — plays the offline path headlessly in Node
              meow-check.mjs — generates and verifies Hide & Meow boards
              sweets-check.mjs — builds Sweet Swap levels and replays them with the bot
```

`static/vendor/engine.js` and `static/output.css` are generated by the build. Neither
is committed and neither should be edited.
