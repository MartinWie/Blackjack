# Blackjack

A casino-style blackjack prototype for quick rounds on the go. Play solo, or share a
four-character table code and let up to five people sit down together.

```bash
bash start.sh        # builds Tailwind + jar, runs on :8090
bash stop.sh
./gradlew test       # engine and room-state tests
```

Phone: `http://<your-mac-ip>:8090` on the same wifi — `start.sh` prints the address.

## Stack

Same conventions as [huus](../huus), minus everything a card game does not need:

| | |
|---|---|
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

anime.js is vendored at `static/vendor/anime.umd.min.js` — no CDN, so animations work
on a plane, in a basement, and on a locked-down network. A service worker caches the
shell (stylesheet, scripts, anime.js) and serves `/offline` when a navigation fails.

Static assets are fetched network-first and cached under their path alone, so a
deploy is live on the next load and the cache holds one copy of each file rather than
one per build.

**Dealing still needs the server**: the engine is server-authoritative and there is no
second copy of the rules in JavaScript. A cold start is instant offline; a hand is
not. Giving solo play a client-side engine would mean two implementations of the same
rules, which is the trade this prototype declined.

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

- **`SECRET_BJ_SESSION-KEY`.** Unset means the public dev key, and the log says so —
  `docker logs … | grep "dev default"` must come back empty.
- **One replica.** Rooms and their SSE subscribers live in this process's memory. A
  second replica is a second set of tables that cannot see the first, and a player
  joining a code that lives on the other node just gets a 404. Sticky sessions do not
  fix it; a shared room registry would, and that is the seam to replace (`RoomRegistry`).

`BUILD_ID` fixes the asset query string at image build time. Left to its default the
app derives it from the clock, so every restart would rename every asset URL and every
client would re-download the app for nothing.

Behind a TLS proxy, SSE must not be buffered — `proxy_buffering off` for `/api/` on
nginx, or the table updates in bursts.

## Running for a long time

Nothing here grows without a bound, and `GET /metrics` is how that is checked:

```
rooms 3          tables in the registry
streams 4        open SSE connections
stream_rooms 3   rooms those streams belong to — must not exceed `rooms`
heap_mb 41
```

A table is handed back when it is empty past its TTL (2 min) **or** untouched for
three hours — the second rule is the one that matters, because a seat is only freed
when its player disconnects and a forgotten open tab never does. Streams left over
from a dropped room are closed by the same sweep. In the browser, per-table ledgers in
`localStorage` are pruned after a day rather than trusting a clean exit.

## Layout

```
models/       Cards, rules, the serializable views the client receives
game/         Engine.kt (pure blackjack), Room.kt (state machine), RoomRegistry.kt
realtime/     Per-room SSE fan-out
plugins/      Ktor routing and the cookie that is the only identity here
frontend/     kotlinx.html page shells — the table is rendered client-side
static/       bank.js (money), lobby.js, table.js (felt + animation), sw.js
```
