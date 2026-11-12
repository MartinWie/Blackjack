/**
 * Draft Battle page. The rules are in `draft-engine.js`; the bot thinks in a worker
 * (`draft-bot.js`).
 *
 * Picks come from a "table": the solo game against a bot, played here and offline, or
 * a live room on the server. Both hand the screen the same state the server sends
 * (`DraftState`: seed, match, picks per round and seat, ready flags; the rival's picks
 * of a round still being drafted show as -1), and the screen catches up with whatever
 * changed: a pick flies to the army, a round both have drafted is fought, a new round or
 * match is dealt. Two phones in a room derive the same battles from it.
 *
 * Progress is one localStorage key: trophies, the name, and a solo match in progress.
 */
(function () {
    'use strict';

    const E = window.DraftEngine;
    const STORE_KEY = 'draft.v1';
    const RANKS = [['Bronze', 0], ['Silver', 300], ['Gold', 700], ['Diamond', 1200], ['Master', 1800]];
    // How often a bot of each rank picks without thinking; from Diamond on it also gets rarer cards.
    const SLIP = [0.45, 0.28, 0.14, 0.05, 0];
    const RICH_FROM = 3;
    const BOTS = ['Sir Goose', 'Captain Crumb', 'Baroness Bun', 'Old Gruff', 'Lady Pickle', 'Duke Waffle', 'General Puff', 'Mad Marge', 'Count Dumpling', 'Sergeant Sprout'];
    const NAMES = ['Brave Otter', 'Swift Fox', 'Bold Badger', 'Clever Crow', 'Merry Moose', 'Lucky Lynx', 'Stout Stoat', 'Daring Duck'];
    const KIND = {troop: 'Troops', mul: 'Multiplier', buff: 'Boost', def: 'Building', spell: 'Spell'};
    const RARITY = ['', 'Rare', 'Epic'];
    const PLURAL = {spear: 'Spearmen', knight: 'Knights', archer: 'Archers', goblin: 'Goblins', mage: 'Mages', giant: 'Giants',
        dragon: 'Dragons', tower: 'Towers', catapult: 'Catapults', wall: 'Walls'};
    const WIN = 30, LOSS = 20;

    const $ = (id) => document.getElementById(id);
    const els = {
        rank: $('rank'), rankName: $('rank-name'), trophies: $('trophies'), roomTag: $('room-tag'),
        home: $('home'), lobby: $('lobby'), match: $('match'),
        heroArt: $('hero-art'), playBot: $('play-bot'), botLine: $('bot-line'),
        myName: $('my-name'), createRoom: $('create-room'), joinForm: $('join-form'), joinCode: $('join-code'), roomNote: $('room-note'),
        roomCode: $('room-code'), lobbyNote: $('lobby-note'), shareRoom: $('share-room'), leaveLobby: $('leave-lobby'),
        themName: $('them-name'), themStatus: $('them-status'), themHearts: $('them-hearts'), themArmy: $('them-army'), themAvatar: $('them-avatar'),
        youName: $('you-name'), youStatus: $('you-status'), youHearts: $('you-hearts'), youArmy: $('you-army'), youAvatar: $('you-avatar'),
        stage: $('stage'), draft: $('draft'), roundName: $('round-name'), pickLine: $('pick-line'), comeback: $('comeback'),
        offer: $('offer'), prompt: $('prompt'), field: $('field'), banner: $('banner'), panel: $('panel'),
        homeBtn: $('home-btn'), fastBtn: $('fast-btn'), helpBtn: $('help-btn'),
        fly: $('fly'), sheet: $('sheet'), sheetBody: $('sheet-body'), sheetClose: $('sheet-close'),
    };

    // --- store ------------------------------------------------------------------------

    function load() {
        const fresh = {trophies: 0, wins: 0, losses: 0, name: NAMES[Math.floor(Math.random() * NAMES.length)], fast: false, solo: null};
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            if (saved && typeof saved === 'object') {
                const out = {...fresh, ...saved};
                // A match saved under the old rules (one list of picks per round) cannot be replayed.
                if (out.solo && !(Array.isArray(out.solo.picks) && Array.isArray(out.solo.picks[0]) && Array.isArray(out.solo.picks[0][0]))) out.solo = null;
                return out;
            }
        } catch (_) { /* private mode or junk */ }
        return fresh;
    }
    const store = load();
    const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* no storage */ } };
    save();   // keeps the name drawn on a first visit, so a rival sees the same one next time
    const rankOf = (t) => RANKS.reduce((k, [, at], i) => (t >= at ? i : k), 0);

    function renderRank() {
        els.rankName.textContent = RANKS[rankOf(store.trophies)][0];
        els.trophies.textContent = store.trophies;
    }

    // --- art and cards ------------------------------------------------------------------

    // The build this page came with; a room on another build fights other battles.
    const BUILD = (new URL(document.querySelector('script[src*="draft-engine.js"]').src).searchParams.get('v')) || '';
    const IMG = (name) => `/static/draft/img/${name}.webp${BUILD ? `?v=${BUILD}` : ''}`;

    function artOf(id, team = 'blue') {
        const c = E.CARDS[id];
        if (c.unit) return IMG(`${c.unit}-${team}`);
        if (id === 'tower' || id === 'catapult') return IMG(`${id}-${team}`);
        return IMG(id);
    }

    const names = (types) => types.map((t) => PLURAL[t]).join(' and ');

    function cardText(id) {
        const c = E.CARDS[id];
        if (c.text) return c.text;
        if (c.kind === 'mul') return `${c.f === 300 ? 'Triples' : 'Doubles'} your ${PLURAL[c.unit]}`;
        const prey = E.preyOf(c.unit), foes = E.foesOf(c.unit).filter((t) => t !== 'wall');
        return `Beats ${names(prey)}. Fears ${names(foes)}.`;
    }

    function cardValue(id, round) {
        const c = E.CARDS[id];
        if (c.kind === 'troop') return `+${Math.max(1, Math.floor((c.n * E.growth(round)) / 100))}`;
        if (c.kind === 'mul') return `×${c.f / 100}`;
        return '';
    }

    function cardEl(id, round, tag = 'button') {
        const c = E.CARDS[id];
        const el = document.createElement(tag);
        el.className = `card k-${c.kind} r${c.rarity}`;
        const val = cardValue(id, round), text = cardText(id), rare = RARITY[c.rarity];
        el.innerHTML = `${val ? `<span class="val">${val}</span>` : ''}<span class="art"><img src="${artOf(id)}" alt="" draggable="false"></span>`
            + `<span class="kind">${rare ? `${rare} ` : ''}${KIND[c.kind]}</span><span class="name">${c.name}</span><span class="text">${text}</span>`;
        el.setAttribute('aria-label', `${rare ? `${rare} ` : ''}${KIND[c.kind]}: ${val ? `${val} ` : ''}${c.name}. ${text}`);
        return el;
    }

    // Users who ask for less motion get the moves without the flights.
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- the bot ------------------------------------------------------------------------
    //
    // A pick tries a dozen battles; in a worker that never stalls the page. Without one
    // (an old browser, a blocked script) it thinks here.

    let worker = null, asked = 0;
    const waiting = new Map();
    function think(args) {
        if (worker === null) {
            try {
                worker = new Worker(`/static/draft/draft-bot.js${BUILD ? `?v=${BUILD}` : ''}`);
                worker.onmessage = (e) => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); if (w) w.done(e.data.choice); };
                worker.onerror = () => {
                    worker = false;
                    for (const w of waiting.values()) w.done(E.botChoice(...w.args));
                    waiting.clear();
                };
            } catch (_) { worker = false; }
        }
        if (!worker) return Promise.resolve(E.botChoice(...args));
        return new Promise((done) => {
            const id = ++asked;
            waiting.set(id, {done, args});
            worker.postMessage({id, args});
        });
    }

    // --- tables ------------------------------------------------------------------------
    //
    // A table owns the state and accepts moves; the screen listens with `onState`.

    let table = null;
    let onState = () => {};

    const newSolo = () => ({
        code: '', you: 0, seed: 1 + Math.floor(Math.random() * 2147483000), match: 0,
        seats: [{name: store.name, connected: true}, {name: BOTS[Math.floor(Math.random() * BOTS.length)], connected: true}],
        picks: [[[], []]], ready: [false, false], rematch: [false, false], turnLeftMs: null, recorded: false,
        boost: [false, rankOf(store.trophies) >= RICH_FROM],
    });

    /** The bot's picks of a round it has not finished drafting stay hidden, as in a room. */
    function masked(s) {
        const copy = JSON.parse(JSON.stringify(s));
        const round = copy.picks.length - 1;
        if (!sealed(copy, round)) copy.picks[round][1] = copy.picks[round][1].map(() => -1);
        return copy;
    }

    /** Against a bot, here and offline. The match is saved after every move. */
    function soloTable() {
        if (!store.solo) store.solo = newSolo();
        let thinking = false;
        const t = {
            kind: 'solo',
            emit() { save(); onState(masked(store.solo)); t.bot(); },
            pick(choice, round, pick) {
                const s = store.solo;
                if (round !== s.picks.length - 1 || pick !== s.picks[round][0].length || pick >= E.picksIn(round)) return;
                s.picks[round][0].push(choice);
                t.emit();
            },
            next() { store.solo.picks.push([[], []]); t.emit(); },
            rematch() { store.solo = newSolo(); t.emit(); },
            leave() { thinking = false; },
            /** The bot drafts alongside the player, one pick after a short think. */
            async bot() {
                const s = store.solo, round = s.picks.length - 1, mine = s.picks[round][1], made = mine.length;
                if (thinking || made >= E.picksIn(round) || s.recorded) return;
                thinking = true;
                const started = performance.now();
                const careless = Math.random() < SLIP[rankOf(store.trophies)];
                const choice = careless ? Math.floor(Math.random() * E.OFFER)
                    : await think([s.seed, s.match, s.picks, round, 1, resultsOf(s, round), !!s.boost[1]]);
                await sleep(Math.max(0, 900 + Math.random() * 1100 - (performance.now() - started)));
                if (!thinking) return;
                thinking = false;
                if (table !== t || store.solo !== s || s.picks.length - 1 !== round || mine.length !== made) return;
                mine.push(choice);
                t.emit();
            },
        };
        return t;
    }

    async function api(path, body) {
        const r = await fetch(`/api/draft${path}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body || {})});
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(data.error || 'something went wrong'), {status: r.status});
        return data;
    }

    /**
     * A live room: moves go to the server, states come back on its stream. A stream
     * that closes for good (a deploy, a reclaimed room, the page back from the cache)
     * is mended by joining again, which also says whether the room still exists.
     */
    function roomTable(code, first) {
        let stream = null, last = first;
        const t = {
            kind: 'room', code,
            open() {
                if (stream) stream.close();
                stream = new EventSource(`/api/draft/rooms/${code}/events`);
                stream.addEventListener('state', (e) => {
                    if (table !== t) return;
                    last = JSON.parse(e.data);
                    onState(last);
                });
                stream.onerror = () => {
                    if (table !== t) return;
                    if (!navigator.onLine) say('Connection lost. Waiting for it to come back…');
                    else if (stream.readyState === EventSource.CLOSED) t.mend();
                };
            },
            async mend() {
                try {
                    last = await api(`/rooms/${code}/join`);
                    if (table !== t) return;
                    onState(last);
                    t.open();
                } catch (e) {
                    if (table !== t) return;
                    if (e.status === 404) { goHome(); note('That room has closed.', true); }
                    else setTimeout(() => { if (table === t) t.mend(); }, 3000);
                }
            },
            pick(choice, round, pick) { return api(`/rooms/${code}/pick`, {round, pick, choice}); },
            next() { return api(`/rooms/${code}/next`, {round: last.picks.length - 1}); },
            rematch() { return api(`/rooms/${code}/rematch`, {match: last.match}); },
            /** Home from here would leave a match under way. */
            get underway() { return !!last && started(last) && !scoreOf(last, true).over; },
            leave() {
                if (stream) stream.close();
                fetch(`/api/draft/rooms/${code}/leave`, {method: 'POST'}).catch(() => {});
            },
        };
        return t;
    }

    // --- the match, as the engine sees it ---------------------------------------------------

    const me = (s) => s.you;
    const them = (s) => 1 - s.you;
    const boostOf = (s, seat) => !!(s.boost && s.boost[seat]);
    const started = (s) => s.picks.some((r) => r.some((p) => p.length));

    /** Both seats made every pick of `round`, and both are shown. */
    function sealed(s, round) {
        const p = s.picks[round];
        return !!p && p.every((choices) => choices.length >= E.picksIn(round) && choices.every((c) => c >= 0));
    }

    /** What each seat holds for the battle of `round` (the rival's hidden picks left out). */
    const handsAt = (s, round, results) => [0, 1].map((seat) => E.cardsOf(s.seed, s.match, s.picks.slice(0, round + 1), seat, results, boostOf(s, seat)));

    const won = new Map();
    /** Winners of the first `upTo` rounds; each needs the ones before it (a lost round enriches offers). */
    function resultsOf(s, upTo) {
        const key = `${s.seed}:${s.match}`;
        let list = won.get(key) || [];
        for (let r = list.length; r < upTo && sealed(s, r); r++) {
            const h = handsAt(s, r, list);
            list = list.concat(E.fight(h[0], h[1], r, E.battleSeed(s.seed, s.match, r)).winner);
        }
        won.delete(key);
        won.set(key, list);
        if (won.size > 6) won.delete(won.keys().next().value);
        return list.slice(0, upTo);
    }

    /** Hearts so far: every round before the current one, and it too once watched. */
    function scoreOf(s, watched) {
        const round = s.picks.length - 1;
        return E.score(resultsOf(s, watched && sealed(s, round) ? round + 1 : round));
    }

    // --- screens ------------------------------------------------------------------------

    function showScreen(name) {
        for (const s of ['home', 'lobby', 'match']) els[s].hidden = s !== name;
        els.fastBtn.hidden = name !== 'match';
        els.roomTag.hidden = !(table && table.kind === 'room' && name !== 'home');
        els.rank.hidden = !els.roomTag.hidden;
    }

    function goHome() {
        if (table) table.leave();
        table = null;
        onState = () => {};
        view = null;
        latest = null;
        battleToken++;
        clearClock();
        if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname);
        renderHome();
        showScreen('home');
    }

    /** Home from a room in the middle of a match asks first: leaving hands the clock your picks. */
    function leaveTable() {
        if (table && table.kind === 'room' && table.underway
            && !confirm('Leave the room? Your picks will be made for you until you come back with the same link.')) return;
        goHome();
    }

    function renderHome() {
        renderRank();
        const r = rankOf(store.trophies);
        const resume = store.solo && !store.solo.recorded;
        els.botLine.textContent = resume ? `Resume against ${store.solo.seats[1].name}` : `Against a ${RANKS[r][0]} rival · three hearts each`;
        els.playBot.querySelector('span').textContent = resume ? 'Resume' : 'Play';
        els.myName.textContent = store.name;
        const online = navigator.onLine;
        els.createRoom.disabled = !online || joining;
        els.joinForm.querySelector('button').disabled = !online || joining;
        if (!online) note('Rooms need a connection. Play works offline.');
        else if (els.roomNote.dataset.offline) note('');
        els.roomNote.dataset.offline = online ? '' : '1';
    }

    function note(text, bad = false) {
        els.roomNote.textContent = text;
        els.roomNote.classList.toggle('bad', bad);
    }

    function startSolo() {
        if (store.solo && store.solo.recorded) store.solo = null;
        table = soloTable();
        begin();
        showScreen('match');
        table.emit();
    }

    async function setServerName() {
        await fetch('/api/name', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: store.name})}).catch(() => {});
    }

    const CODE = /^[A-HJ-NP-Z2-9]{4}$/;
    let joining = false;

    async function joinRoom(code) {
        code = code.trim().toUpperCase();
        if (!CODE.test(code)) { note('A room code has four letters or digits.', true); return; }
        if (joining) return;
        joining = true;
        renderHome();
        note('Joining…');
        try {
            await setServerName();
            const state = await api(`/rooms/${code}/join`);
            table = roomTable(code, state);
            begin();
            showScreen('lobby');
            onState(state);
            table.open();
            history.replaceState(null, '', `${location.pathname}?room=${code}`);
            note('');
        } catch (e) {
            note(e.status === 404 ? 'No room with that code.' : e.message, true);
            if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname);
        } finally {
            joining = false;
            renderHome();
        }
    }

    async function createRoom() {
        if (joining) return;
        joining = true;
        renderHome();
        note('Opening a room…');
        let code = null;
        try {
            code = (await api('/rooms')).code;
        } catch (e) { note(e.message, true); }
        joining = false;
        if (code) await joinRoom(code);
        else renderHome();
    }

    function shareLink() {
        return `${location.origin}${location.pathname}?room=${table.code}`;
    }

    // --- the match screen ----------------------------------------------------------------
    //
    // `view` is what the screen shows; each state moves it forward a step at a time,
    // animating every step, so a state that jumps ahead (a reload, a slow phone) still
    // plays out in order.

    let view = null;
    let latest = null, pumping = false;
    let battleToken = 0;

    function begin() {
        view = null;
        latest = null;
        onState = (s) => { latest = {...s, at: performance.now()}; if (!pumping) pump(); };
    }

    async function pump() {
        pumping = true;
        while (latest) {
            const s = latest;
            latest = null;
            try { await step(s); } catch (e) { console.error(e); }
        }
        pumping = false;
    }

    /** A room on another build would fight other battles: load the new one (once). */
    function outdated(s) {
        if (!s.build || !BUILD || s.build === BUILD) return false;
        let tried = null;
        try { tried = sessionStorage.getItem('draft.reload'); } catch (_) { /* no storage */ }
        if (tried === s.build) { say('A new version is out. Close and reopen the game to play this room.'); return true; }
        try { sessionStorage.setItem('draft.reload', s.build); } catch (_) { /* no storage */ }
        location.reload();
        return true;
    }

    async function step(s) {
        const tb = table;
        // Every await below may come back to a screen that has moved on.
        const gone = () => table !== tb || !view;
        if (!tb) return;
        if (s.you < 0) { goHome(); note('You are no longer in that room.', true); return; }
        if (tb.kind === 'room' && outdated(s)) return;
        if (tb.kind === 'room' && !s.seats[them(s)] && !started(s)) {
            showLobby(s);
            return;
        }
        if (els.match.hidden) showScreen('match');
        if (tb.kind === 'room') els.roomTag.querySelector('b').textContent = s.code;
        const round = s.picks.length - 1;
        const fresh = !view || view.seed !== s.seed || view.match !== s.match;
        if (fresh || view.round !== round) {
            // A reload shows the picks already made without flying them in again.
            view = {seed: s.seed, match: s.match, round, shown: fresh ? s.picks[round][me(s)].length : 0, offer: null, watched: false};
            await dealRound(s, round, fresh);
            if (gone()) return;
        }
        while (view.shown < s.picks[round][me(s)].length) {
            await playPick(s, round, view.shown);
            if (gone()) return;
            view.shown++;
        }
        renderSides(s);
        if (!sealed(s, round)) { renderOffer(s); return; }
        clearClock();
        els.offer.innerHTML = '';
        view.offer = null;
        if (!view.watched) {
            await fight(s, round);
            if (gone() || view.seed !== s.seed || view.match !== s.match || view.round !== round) return;
            view.watched = true;
            renderSides(s);
        }
        showPanel(s, round);
    }

    function showLobby(s) {
        showScreen('lobby');
        els.roomCode.textContent = s.code;
        els.roomTag.querySelector('b').textContent = s.code;
        els.lobbyNote.textContent = 'Waiting for your friend to join…';
    }

    /** Names, hearts, how far each side is with its picks, and both armies. */
    function renderSides(s) {
        const round = s.picks.length - 1, rival = s.seats[them(s)], mine = s.seats[me(s)];
        els.youName.textContent = mine ? mine.name : 'You';
        els.themName.textContent = rival ? rival.name : 'Rival';
        const {hearts} = scoreOf(s, view && view.watched);
        renderHearts(els.youHearts, hearts[me(s)]);
        renderHearts(els.themHearts, hearts[them(s)]);
        const need = E.picksIn(round), drafting = !sealed(s, round);
        const minePicked = s.picks[round][me(s)].length, theirsPicked = s.picks[round][them(s)].length;
        els.youStatus.textContent = !drafting ? '' : minePicked >= need ? 'Army ready' : `Picking ${minePicked + 1} of ${need}`;
        els.themStatus.textContent = table.kind === 'room' && (!rival || rival.left) ? 'Left the room'
            : table.kind === 'room' && !rival.connected ? 'Away'
                : !drafting ? '' : theirsPicked >= need ? 'Army ready' : `Picked ${theirsPicked} of ${need}`;
        els.themStatus.classList.toggle('ready', drafting && theirsPicked >= need);
        els.youStatus.classList.toggle('ready', drafting && minePicked >= need);
        const hands = handsAt(s, round, resultsOf(s, round));
        renderArmy(els.youArmy, hands[me(s)], 'blue', 0);
        renderArmy(els.themArmy, hands[them(s)], 'red', s.picks[round][them(s)].filter((c) => c < 0).length);
    }

    function renderHearts(el, n) {
        const had = Number(el.dataset.n ?? E.HEARTS);
        el.dataset.n = n;
        el.setAttribute('aria-label', `${n} of ${E.HEARTS} hearts`);
        el.innerHTML = '';
        for (let k = 0; k < E.HEARTS; k++) {
            const i = document.createElement('i');
            if (k >= n) i.className = k < had ? 'lost breaking' : 'lost';
            el.append(i);
        }
    }

    /** An army as chips: each troop with its count (a star when veterans stand in), then the rest. */
    function renderArmy(el, cards, team, hidden) {
        const a = E.army(cards);
        const chip = (img, n, title, star = false) => `<span class="chip" title="${title}"><img src="${img}" alt="">${n !== '' ? `<b>${n}</b>` : ''}${star ? '<i>★</i>' : ''}</span>`;
        const parts = [];
        for (const t of E.TROOPS) if (a.count[t]) parts.push(chip(IMG(`${t}-${team}`), a.count[t], `${a.count[t]} ${PLURAL[t]}`, a.placed[t] < a.count[t]));
        for (const b of ['tower', 'catapult']) if (a[b]) parts.push(chip(IMG(`${b}-${team}`), a[b] > 1 ? a[b] : '', `${a[b]} ${a[b] > 1 ? PLURAL[b] : E.UNITS[b].name}`));
        if (a.wall) parts.push(chip(IMG('wall'), a.wall > 1 ? a.wall : '', `${a.wall} ${a.wall > 1 ? 'Walls' : 'Wall'}`));
        const extras = {};
        for (const id of cards.flat()) if (E.CARDS[id].kind === 'buff' || E.CARDS[id].kind === 'spell') extras[id] = (extras[id] || 0) + 1;
        for (const [id, n] of Object.entries(extras)) parts.push(chip(IMG(id), n > 1 ? `×${n}` : '', `${E.CARDS[id].name}${n > 1 ? ` ×${n}` : ''}`));
        if (hidden) parts.push(`<span class="chip secret" title="${hidden} hidden"><b>?</b>${hidden > 1 ? `<em>×${hidden}</em>` : ''}</span>`);
        if (!parts.length) parts.push('<span class="empty">No troops yet</span>');
        const html = parts.join('');
        if (el.dataset.html === html) return;
        el.dataset.html = html;
        el.innerHTML = html;
    }

    /** A new round: the offers of its first pick, and a banner. */
    async function dealRound(s, round, fresh) {
        battleToken++;
        els.field.hidden = true;
        els.draft.hidden = false;
        els.panel.hidden = true;
        els.match.classList.remove('battling');
        els.offer.innerHTML = '';
        els.roundName.textContent = `Round ${round + 1}`;
        els.comeback.hidden = !E.lostLast(resultsOf(s, round), round, me(s));
        renderSides(s);
        if ((!fresh || s.picks[round][me(s)].length === 0) && !calm()) {
            banner(`Round ${round + 1}`);
            await sleep(650);
        }
    }

    /** The cards of your next pick, or word on your rival once your army is ready. */
    function renderOffer(s) {
        const round = s.picks.length - 1, k = s.picks[round][me(s)].length, need = E.picksIn(round);
        const rival = s.seats[them(s)], name = rival ? rival.name : 'Your rival';
        clearClock();
        if (k >= need) {
            els.offer.innerHTML = '';
            view.offer = null;
            els.pickLine.textContent = 'Army ready';
            say(rival && rival.left ? `${name} left. The clock picks for them.` : `Waiting for ${name}…`);
            return;
        }
        els.pickLine.textContent = `Pick ${k + 1} of ${need}`;
        const key = `${s.seed}:${s.match}:${round}:${k}`;
        // Built anew only when the pick changes, so a state that only moves a flag does
        // not re-arm cards already tapped.
        if (view.offer !== key) {
            view.offer = key;
            const cards = E.offer(s.seed, s.match, round, me(s), k, E.lostLast(resultsOf(s, round), round, me(s)));
            els.offer.innerHTML = '';
            cards.forEach((id, c) => {
                const card = cardEl(id, round);
                Object.assign(card.dataset, {choice: c, round, pick: k});
                if (!calm()) card.animate([{opacity: 0, transform: 'translateY(18px) scale(.9)'}, {opacity: 1, transform: 'none'}], {duration: 280, delay: c * 70, easing: 'cubic-bezier(.3, 1.3, .5, 1)', fill: 'backwards'});
                els.offer.append(card);
            });
        }
        say(round === 0 ? `Pick ${need} cards for your army.` : `Your army stays. Add ${need} more cards.`);
        if (s.turnLeftMs != null) startClock(s.turnLeftMs - (performance.now() - s.at), s.turnMs);
    }

    let clockTimer = null;
    function clearClock() {
        clearInterval(clockTimer);
        clockTimer = null;
        const old = els.draft.querySelector('.clock');
        if (old) old.remove();
    }
    function startClock(ms, total) {
        const until = performance.now() + ms;
        const clock = document.createElement('span');
        clock.className = 'clock';
        clock.setAttribute('aria-hidden', 'true');
        els.pickLine.after(clock);
        const tick = () => {
            const left = Math.max(0, until - performance.now());
            clock.style.setProperty('--left', `${(left / total) * 100}%`);
            clock.classList.toggle('late', left < 5000);
            if (!left) clearInterval(clockTimer);
        };
        tick();
        clockTimer = setInterval(tick, 200);
    }

    function say(text) { els.prompt.textContent = text; }

    /** Your pick `k` of the round leaves the table for your army. */
    async function playPick(s, round, k) {
        const choice = s.picks[round][me(s)][k];
        const shown = view.offer === `${s.seed}:${s.match}:${round}:${k}` ? els.offer.children[choice] : null;
        if (shown && !document.hidden && !calm()) {
            [...els.offer.children].forEach((c, i) => {
                if (i !== choice) c.animate([{opacity: 1}, {opacity: 0, transform: 'scale(.85)'}], {duration: 220, fill: 'forwards'});
            });
            await flyTo(shown, els.youArmy);
        }
        els.offer.innerHTML = '';
        view.offer = null;
        renderSides(s);
        if (!calm()) els.youArmy.animate([{transform: 'scale(1)'}, {transform: 'scale(1.06)', offset: .4}, {transform: 'none'}], {duration: 320, easing: 'ease-out'});
    }

    /** A copy of `card` flies to the middle of `target` and shrinks into it. */
    async function flyTo(card, target) {
        const a = card.getBoundingClientRect(), b = target.getBoundingClientRect();
        const ghost = card.cloneNode(true);
        ghost.style.animation = 'none';
        Object.assign(ghost.style, {left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`});
        els.fly.append(ghost);
        card.style.visibility = 'hidden';
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        await ghost.animate([
            {transform: 'none'},
            {transform: `translate(${dx * 0.2}px, ${dy * 0.2 - 24}px) scale(1.06) rotate(${dx > 0 ? 4 : -4}deg)`, offset: .3},
            {transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: 0.2},
        ], {duration: 520, easing: 'cubic-bezier(.45, 0, .3, 1)', fill: 'forwards'}).finished;
        ghost.remove();
    }

    function banner(text, kind = '') {
        els.banner.textContent = text;
        els.banner.className = `banner ${kind}`;
        void els.banner.offsetWidth;
        els.banner.classList.add('show');
    }

    // --- the battle --------------------------------------------------------------------

    const TYPES = ['spear', 'knight', 'archer', 'goblin', 'mage', 'giant', 'dragon', 'tower', 'catapult'];
    const TEAM_COLOUR = {blue: '#3E7BEA', red: '#E5484D'};
    const art = {};

    /** A sprite, and a white copy of it for the flash of a hit (made once it has loaded). */
    function sprite(name) {
        if (art[name]) return art[name];
        const img = new Image();
        img.decoding = 'async';
        img.src = IMG(name);
        const s = {img, white: null, ok: false};
        art[name] = s;
        return s;
    }

    async function loadArt() {
        const names = ['wall', 'ground', ...TYPES.flatMap((t) => [`${t}-blue`, `${t}-red`])];
        await Promise.all(names.map(async (n) => {
            const s = sprite(n);
            if (s.ok) return;
            try { await s.img.decode(); s.ok = true; } catch (_) { return; }
            if (n === 'ground') return;
            const c = document.createElement('canvas');
            c.width = s.img.naturalWidth; c.height = s.img.naturalHeight;
            const g = c.getContext('2d');
            g.drawImage(s.img, 0, 0);
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = '#fff';
            g.fillRect(0, 0, c.width, c.height);
            s.white = c;
        }));
    }

    async function fight(s, round) {
        const token = ++battleToken;
        const h = handsAt(s, round, resultsOf(s, round));
        const b = new E.Battle(h[0], h[1], round, E.battleSeed(s.seed, s.match, round));
        const flip = me(s) === 1;
        const teams = flip ? ['red', 'blue'] : ['blue', 'red'];
        await loadArt();
        if (token !== battleToken) return;

        els.draft.hidden = true;
        els.field.hidden = false;
        els.match.classList.add('battling');
        const ctx = els.field.getContext('2d');
        const fit = () => {
            const r = els.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1) * quality;
            els.field.width = Math.round(r.width * dpr);
            els.field.height = Math.round(r.height * dpr);
            return {w: els.field.width, h: els.field.height, dpr};
        };
        let geo = fit();
        const onResize = () => { geo = fit(); };
        window.addEventListener('resize', onResize);
        banner('Battle!');

        const scene = {b, teams, flip, fx: [], decals: [], hits: new Map(), swings: new Map(), trails: new WeakMap(), shake: 0, flash: 0, order: []};
        const cam = {x: 0, y: 0, w: E.W, h: E.H};
        // A beat to see both armies before they move, and one after the last blow.
        let acc = -800, last = performance.now(), endedAt = null;
        await new Promise((done) => {
            const frame = (now) => {
                if (token !== battleToken) { done(); return; }
                try { tick(now); } catch (e) { console.error(e); done(); return; }
                if (endedAt !== null && now - endedAt > 1000) { done(); return; }
                requestAnimationFrame(frame);
            };
            let slow = 0;
            const tick = (now) => {
                // Two seconds of long frames: draw fewer pixels.
                slow = now - last > 24 ? slow + 1 : Math.max(0, slow - 2);
                if (slow > 120 && quality > 0.55) { quality = Math.max(0.55, quality - 0.15); slow = 0; geo = fit(); }
                const dt = Math.min(100, now - last) * (store.fast ? 2 : 1);
                acc += dt;
                last = now;
                while (acc >= E.TICK_MS && !b.done) {
                    b.step();
                    acc -= E.TICK_MS;
                    for (const ev of b.events) collect(ev, scene);
                }
                if (b.done && endedAt === null) endedAt = now;
                scene.shake *= Math.pow(0.86, dt / 16);
                scene.flash *= Math.pow(0.8, dt / 16);
                follow(cam, b, flip, geo.w / geo.h);
                draw(ctx, geo, cam, scene, b.done ? 1 : Math.max(0, Math.min(1, acc / E.TICK_MS)), now);
            };
            requestAnimationFrame(frame);
        });
        window.removeEventListener('resize', onResize);
        if (token !== battleToken) return;
        const mine = me(s);
        const win = b.winner === mine, lost = b.winner === 1 - mine;
        banner(win ? 'Round won!' : lost ? 'Round lost' : 'Draw', win ? 'win' : lost ? 'lose' : '');
        await sleep(900);
    }

    const rand = (a, b) => a + Math.random() * (b - a);

    /** Sparks, smoke and embers: each flies from (x, y) and fades over `life` ticks. */
    function burst(scene, x, y, n, opt) {
        if (scene.fx.length > 420) return;
        for (let k = 0; k < n; k++) {
            const ang = rand(0, Math.PI * 2), sp = rand(opt.speed * 0.4, opt.speed);
            scene.fx.push({t: 'p', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.7 - (opt.rise || 0), g: opt.g || 0,
                born: scene.b.tick, life: rand(opt.life * 0.6, opt.life), size: rand(opt.size * 0.6, opt.size), colour: opt.colours[k % opt.colours.length], glow: !!opt.glow});
        }
    }

    const FIRE = ['#FFE07A', '#FFB13B', '#FF7A2F', '#E84A1F'];
    const SMOKE = ['rgba(90,80,70,.55)', 'rgba(130,120,110,.5)'];

    /** Turns battle events into effects drawn for a few frames. */
    function collect(ev, scene) {
        const b = scene.b, fx = scene.fx, tick = b.tick;
        const ring = (x, y, r, colour, life, width = 6) => fx.push({t: 'ring', x, y, r, colour, born: tick, life, width});
        const scorch = (x, y, r) => { scene.decals.push({x, y, r, born: tick}); if (scene.decals.length > 40) scene.decals.shift(); };
        switch (ev.t) {
            case 'hit':
                scene.hits.set(ev.id, tick);
                if (ev.strong) burst(scene, ev.x, ev.y - 12, 5, {speed: 4, life: 9, size: 4, colours: ['#FFE07A', '#fff'], glow: true});
                else if (Math.random() < 0.3) burst(scene, ev.x, ev.y - 12, 2, {speed: 3, life: 6, size: 3, colours: ['#fff']});
                break;
            case 'swing': scene.swings.set(ev.id, {tick, target: ev.target}); break;
            case 'die': {
                const u = b.units[ev.id];
                burst(scene, u.x, u.y - u.r, 6, {speed: 2.2, life: 14, size: u.r * 0.55, colours: ['rgba(255,255,255,.85)', 'rgba(220,214,200,.8)'], rise: 0.6});
                break;
            }
            case 'revive': {
                const u = b.units[ev.id];
                fx.push({t: 'revive', x: u.x, y: u.y, born: tick, life: 22});
                burst(scene, u.x, u.y - u.r, 8, {speed: 1.5, life: 18, size: 3, colours: ['#9BF0A0', '#fff'], rise: 1.4, glow: true});
                break;
            }
            case 'fireball':
                fx.push({t: 'fall', kind: 'fireball', x: ev.x, y: ev.y, born: tick - 1, life: 1});
                ring(ev.x, ev.y, ev.r, 'rgba(255, 190, 80, X)', 18, 10);
                fx.push({t: 'glow', x: ev.x, y: ev.y, r: ev.r * 1.1, colour: '255, 140, 50', born: tick, life: 16});
                burst(scene, ev.x, ev.y, 26, {speed: 9, life: 22, size: 9, colours: FIRE, glow: true, rise: 0.8});
                burst(scene, ev.x, ev.y, 10, {speed: 4, life: 34, size: 16, colours: SMOKE, rise: 1});
                scorch(ev.x, ev.y, ev.r * 0.8);
                scene.shake = Math.min(14, scene.shake + 9);
                scene.flash = Math.max(scene.flash, 0.35);
                break;
            case 'bolt':
                fx.push({t: 'bolt', x: ev.x, y: ev.y, born: tick, life: 9, seed: Math.random()});
                burst(scene, ev.x, ev.y, 7, {speed: 5, life: 10, size: 4, colours: ['#FFF6B0', '#9FD8FF'], glow: true});
                scorch(ev.x, ev.y, 18);
                scene.shake = Math.min(14, scene.shake + 2);
                scene.flash = Math.max(scene.flash, 0.28);
                break;
            case 'meteor':
                fx.push({t: 'streak', x: ev.x, y: ev.y, born: tick, life: 8});
                ring(ev.x, ev.y, ev.r, 'rgba(255, 150, 60, X)', 14, 8);
                fx.push({t: 'glow', x: ev.x, y: ev.y, r: ev.r, colour: '255, 120, 40', born: tick, life: 12});
                burst(scene, ev.x, ev.y, 14, {speed: 7, life: 18, size: 7, colours: FIRE, glow: true, rise: 0.6});
                burst(scene, ev.x, ev.y, 8, {speed: 5, life: 16, size: 5, colours: ['#6B5A4A', '#8D8579'], g: 0.5, rise: 2.5});
                scorch(ev.x, ev.y, ev.r * 0.7);
                scene.shake = Math.min(14, scene.shake + 5);
                break;
            case 'frost':
                scene.frost = {born: tick, life: Math.max(10, ev.until - tick)};
                scene.flash = Math.max(scene.flash, 0.2);
                break;
            case 'blast':
                ring(ev.x, ev.y, ev.r, 'rgba(255, 120, 60, X)', 12, 6);
                fx.push({t: 'glow', x: ev.x, y: ev.y, r: ev.r, colour: '255, 110, 40', born: tick, life: 9});
                burst(scene, ev.x, ev.y, 9, {speed: 5, life: 14, size: 6, colours: FIRE, glow: true});
                burst(scene, ev.x, ev.y, 4, {speed: 2, life: 24, size: 11, colours: SMOKE, rise: 0.8});
                scene.shake = Math.min(14, scene.shake + 1.5);
                break;
            case 'burn':
                fx.push({t: 'glow', x: ev.x, y: ev.y, r: ev.r, colour: '255, 130, 40', born: tick, life: 10});
                burst(scene, ev.x, ev.y, 10, {speed: 4, life: 14, size: 7, colours: FIRE, glow: true, rise: 1});
                break;
            case 'boom':
                ring(ev.x, ev.y, ev.r * 0.8, 'rgba(120, 95, 70, X)', 12, 7);
                burst(scene, ev.x, ev.y, 10, {speed: 5, life: 16, size: 6, colours: ['#8D8579', '#6B5A4A', '#B9A88F'], g: 0.6, rise: 3});
                burst(scene, ev.x, ev.y, 5, {speed: 2, life: 22, size: 12, colours: ['rgba(190,170,140,.5)'], rise: 0.5});
                scorch(ev.x, ev.y, ev.r * 0.4);
                scene.shake = Math.min(14, scene.shake + 2);
                break;
        }
    }

    /**
     * The camera keeps the fight in view: it eases towards the troops still standing,
     * zoomed in at most so far, never further out than the whole field.
     */
    function follow(cam, b, flip, aspect) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        // Troops make the fight; towers and catapults far behind would keep it zoomed out.
        const troops = b.units.some((u) => u.alive && !u.fixed);
        for (const u of b.units) {
            if (!u.alive || (troops && u.fixed)) continue;
            const x = flip ? E.W - u.x : u.x, y = flip ? E.H - u.y : u.y;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x0 === Infinity) return;
        const pad = 120;
        let w = Math.max(x1 - x0 + 2 * pad, E.W / 2.2), h = Math.max(y1 - y0 + 2 * pad, E.H / 2.2);
        if (w / h < aspect) w = h * aspect; else h = w / aspect;
        // A tall screen crops the flanks a little rather than show the whole field small.
        const fitW = Math.max(E.W * 0.8, E.H * aspect);
        if (w > fitW) { w = fitW; h = w / aspect; }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const tx = w >= E.W ? (E.W - w) / 2 : Math.max(0, Math.min(E.W - w, cx - w / 2));
        const ty = h >= E.H ? (E.H - h) / 2 : Math.max(0, Math.min(E.H - h, cy - h / 2));
        const ease = cam.ready ? 0.06 : 1;
        cam.x += (tx - cam.x) * ease; cam.y += (ty - cam.y) * ease;
        cam.w += (w - cam.w) * ease; cam.h = cam.w / aspect;
        cam.ready = true;
    }

    const MARGIN = 260;
    // Canvas resolution as a share of the device's; lowered a step when frames run long.
    let quality = 1;

    /** Painted once, drawn many times: soft glows per colour, scorch, orbs, flames, the star. */
    const baked = new Map();
    function bake(key, size, paint) {
        let c = baked.get(key);
        if (c) return c;
        c = document.createElement('canvas');
        c.width = c.height = size;
        paint(c.getContext('2d'), size);
        baked.set(key, c);
        return c;
    }
    const radial = (key, stops) => bake(key, 64, (g, n) => {
        const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        for (const [at, colour] of stops) grad.addColorStop(at, colour);
        g.fillStyle = grad;
        g.fillRect(0, 0, n, n);
    });
    const dot = (colour) => radial(`dot:${colour}`, [[0, colour], [0.5, colour], [1, 'rgba(0,0,0,0)']]);
    const SCORCH = () => radial('scorch', [[0, 'rgba(40, 28, 18, .5)'], [1, 'rgba(40, 28, 18, 0)']]);
    const STAR = () => bake('star', 40, (g) => {
        g.font = '900 30px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 4;
        g.strokeStyle = '#7A4B10';
        g.fillStyle = '#FFD45A';
        g.strokeText('★', 20, 21);
        g.fillText('★', 20, 21);
    });
    const SHOT = {
        orb: () => radial('orb', [[0, '#F4E6FF'], [0.35, '#B57BFF'], [1, 'rgba(140, 80, 255, 0)']]),
        flame: () => radial('flame', [[0, '#FFF3C2'], [0.35, '#FF9A3D'], [1, 'rgba(255, 90, 30, 0)']]),
        rock: () => bake('rock', 32, (g) => {
            const grad = g.createRadialGradient(12, 12, 2, 16, 16, 14);
            grad.addColorStop(0, '#C9C1B4'); grad.addColorStop(1, '#6E665B');
            g.fillStyle = grad;
            g.strokeStyle = '#3B2C22';
            g.lineWidth = 2.5;
            g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill(); g.stroke();
        }),
    };

    let plain = null;
    /** Painted grass for when the battlefield picture is missing. */
    function plainGround() {
        if (plain) return plain;
        const c = document.createElement('canvas');
        c.width = 310; c.height = 370;
        const g = c.getContext('2d');
        const grass = g.createLinearGradient(0, 0, 0, c.height);
        grass.addColorStop(0, '#93C26A'); grass.addColorStop(1, '#7FB357');
        g.fillStyle = grass;
        g.fillRect(0, 0, c.width, c.height);
        plain = c;
        return c;
    }

    function draw(ctx, geo, cam, scene, alpha, now) {
        const {b, teams, flip} = scene;
        const k = geo.w / cam.w;
        const sx = scene.shake > 0.3 ? rand(-scene.shake, scene.shake) : 0, sy = scene.shake > 0.3 ? rand(-scene.shake, scene.shake) : 0;
        ctx.setTransform(k, 0, 0, k, (-cam.x + sx) * k, (-cam.y + sy) * k);
        const ground = art.ground && art.ground.ok ? art.ground.img : plainGround();
        ctx.drawImage(ground, -MARGIN, -MARGIN, E.W + 2 * MARGIN, E.H + 2 * MARGIN);
        const t = b.tick + alpha;

        // Scorch marks on the grass.
        const scorch = SCORCH();
        for (const d of scene.decals) {
            const fade = Math.max(0, 1 - (t - d.born) / 400);
            if (!fade) continue;
            ctx.globalAlpha = fade;
            ctx.drawImage(scorch, (flip ? E.W - d.x : d.x) - d.r, (flip ? E.H - d.y : d.y) - d.r * 0.7, d.r * 2, d.r * 1.4);
        }
        ctx.globalAlpha = 1;

        // Where each unit stands this frame, kept on the unit: no arrays per frame.
        const order = scene.order;
        order.length = 0;
        for (const u of b.units) {
            if (!u.alive && b.tick - u.died >= 16) continue;
            const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
            u.sx = flip ? E.W - x : x;
            u.sy = flip ? E.H - y : y;
            order.push(u);
        }
        order.sort((p, q) => p.sy - q.sy || p.id - q.id);

        // Shadows in one fill, team rings in one stroke per team.
        ctx.fillStyle = 'rgba(30, 40, 20, .26)';
        ctx.beginPath();
        for (const u of order) {
            if (!u.alive) continue;
            const rx = u.r * (u.fly ? 0.9 : 1.1), cy = u.sy + u.r * 0.3;
            ctx.moveTo(u.sx + rx, cy);
            ctx.ellipse(u.sx, cy, rx, u.r * 0.42, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 0.85;
        for (const side of [0, 1]) {
            ctx.strokeStyle = TEAM_COLOUR[teams[side]];
            ctx.beginPath();
            for (const u of order) {
                if (!u.alive || u.wall || u.side !== side) continue;
                const cy = u.sy + u.r * 0.3;
                ctx.moveTo(u.sx + u.r * 1.05, cy);
                ctx.ellipse(u.sx, cy, u.r * 1.05, u.r * 0.42, 0, 0, Math.PI * 2);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const star = STAR();
        for (const u of order) {
            const s = art[u.wall ? 'wall' : `${u.type}-${teams[u.side]}`];
            if (!s || !s.ok) continue;
            const x = u.sx, y = u.sy;
            const size = u.r * (u.wall ? 2.5 : u.fixed ? 3.3 : u.fly ? 4.2 : 3.7);
            let ox = 0, oy = 0, face = 1;
            if (!u.fixed && u.alive) {
                const target = u.target >= 0 ? b.units[u.target] : null;
                const dxt = target ? (flip ? u.x - target.x : target.x - u.x) : (flip ? u.px - u.x : u.x - u.px);
                face = dxt < 0 ? -1 : 1;
                if (u.x !== u.px || u.y !== u.py) oy -= Math.abs(Math.sin(t * 0.55 + u.id)) * u.r * 0.32;
                const sw = scene.swings.get(u.id);
                if (sw && t - sw.tick < 6 && target) {
                    const tx = flip ? E.W - target.x : target.x, ty = flip ? E.H - target.y : target.y;
                    const d = Math.hypot(tx - x, ty - y) || 1, push = Math.sin(((t - sw.tick) / 6) * Math.PI) * u.r * 0.6;
                    ox += ((tx - x) / d) * push; oy += ((ty - y) / d) * push;
                }
            }
            if (u.fly) oy -= 30 + Math.sin(t * 0.12 + u.id) * 5;
            const dx = x + ox, dy = y + oy - size * 0.48;
            if (!u.alive) {
                const fade = (b.tick - u.died + alpha) / 16, sc = 1 - fade * 0.3, rot = (u.id % 2 ? 1 : -1) * fade * 1.4;
                const cs = Math.cos(rot) * k * sc, sn = Math.sin(rot) * k * sc;
                ctx.globalAlpha = Math.max(0, 1 - fade);
                ctx.setTransform(cs * face, sn * face, -sn, cs, (dx - cam.x + sx) * k, (dy + size * 0.2 - cam.y + sy) * k);
                ctx.drawImage(s.img, -size / 2, -size * 0.7, size, size);
                ctx.setTransform(k, 0, 0, k, (-cam.x + sx) * k, (-cam.y + sy) * k);
                ctx.globalAlpha = 1;
                continue;
            }
            // Mirrored by the transform, not save and restore.
            if (face < 0) ctx.setTransform(-k, 0, 0, k, (dx - cam.x + sx) * k, (dy - cam.y + sy) * k);
            else ctx.setTransform(k, 0, 0, k, (dx - cam.x + sx) * k, (dy - cam.y + sy) * k);
            ctx.drawImage(s.img, -size / 2, -size / 2, size, size);
            const hit = b.tick - (scene.hits.get(u.id) ?? -99);
            if (hit < 3 && s.white) {
                ctx.globalAlpha = 0.6 * (1 - hit / 3);
                ctx.drawImage(s.white, -size / 2, -size / 2, size, size);
                ctx.globalAlpha = 1;
            }
            if (u.frozen > b.tick) {
                ctx.globalAlpha = 0.55;
                ctx.fillStyle = '#BFE6FF';
                ctx.fillRect(-size * 0.42, -size * 0.45, size * 0.84, size * 0.9);
                ctx.globalAlpha = 1;
            }
            ctx.setTransform(k, 0, 0, k, (-cam.x + sx) * k, (-cam.y + sy) * k);
            const army = b.armies[u.side];
            const veteran = !u.fixed && army.placed[u.type] < army.count[u.type];
            if (veteran) ctx.drawImage(star, dx - u.r * 0.6, dy - size * 0.5 - u.r * 1.1, u.r * 1.2, u.r * 1.2);
            if (u.hp < u.maxHp && !u.wall) {
                const w = Math.max(20, u.r * 2.1), top = dy - size * 0.5 - (veteran ? 14 : 6);
                ctx.fillStyle = 'rgba(30,20,10,.45)';
                ctx.fillRect(x - w / 2 - 1, top - 1, w + 2, 6);
                ctx.fillStyle = TEAM_COLOUR[teams[u.side]];
                ctx.fillRect(x - w / 2, top, (w * Math.max(0, u.hp)) / u.maxHp, 4);
            }
        }

        drawShots(ctx, scene, alpha);
        drawEffects(ctx, scene, t);

        // In screen space: a soft vignette, and the flash of a big spell.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (!geo.vignette) {
            const v = ctx.createRadialGradient(geo.w / 2, geo.h / 2, Math.min(geo.w, geo.h) * 0.35, geo.w / 2, geo.h / 2, Math.max(geo.w, geo.h) * 0.75);
            v.addColorStop(0, 'rgba(20, 30, 10, 0)');
            v.addColorStop(1, 'rgba(20, 30, 10, .35)');
            geo.vignette = v;
        }
        ctx.fillStyle = geo.vignette;
        ctx.fillRect(0, 0, geo.w, geo.h);
        if (scene.frost) {
            const age = (t - scene.frost.born) / scene.frost.life;
            if (age < 1) {
                ctx.fillStyle = `rgba(160, 215, 255, ${0.18 * (1 - age)})`;
                ctx.fillRect(0, 0, geo.w, geo.h);
            } else scene.frost = null;
        }
        if (scene.flash > 0.02) {
            ctx.fillStyle = `rgba(255, 250, 230, ${scene.flash})`;
            ctx.fillRect(0, 0, geo.w, geo.h);
        }
    }

    /** Arrows in one stroke, magic orbs, dragon fire and boulders as baked sprites with trails. */
    function drawShots(ctx, scene, alpha) {
        const {b, flip} = scene;
        const X = (x) => (flip ? E.W - x : x), Y = (y) => (flip ? E.H - y : y);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#6B4F33';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (const sh of b.shots) {
            if (sh.kind !== 'arrow') continue;
            const x = X(sh.px + (sh.x - sh.px) * alpha), y = Y(sh.py + (sh.y - sh.py) * alpha);
            const dx = X(sh.x) - X(sh.px), dy = Y(sh.y) - Y(sh.py), d = Math.hypot(dx, dy) || 1;
            ctx.moveTo(x - (dx / d) * 16, y - (dy / d) * 16);
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (const sh of b.shots) {
            if (sh.kind === 'arrow') continue;
            const x = X(sh.px + (sh.x - sh.px) * alpha), y = Y(sh.py + (sh.y - sh.py) * alpha);
            if (sh.kind === 'rock') {
                const lift = Math.sin(Math.min(1, Math.hypot(sh.x - sh.tx, sh.y - sh.ty) / 400) * Math.PI) * 70;
                ctx.fillStyle = 'rgba(30,20,10,.25)';
                ctx.beginPath(); ctx.ellipse(x, y, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.drawImage(SHOT.rock(), x - 13, y - lift - 13, 26, 26);
                continue;
            }
            let trail = scene.trails.get(sh);
            if (!trail) { trail = []; scene.trails.set(sh, trail); }
            if (!trail.length || trail[trail.length - 1].tick !== b.tick) {
                trail.push({x, y, tick: b.tick});
                if (trail.length > 6) trail.shift();
            }
            const sprite = SHOT[sh.kind]();
            ctx.globalCompositeOperation = 'lighter';
            trail.forEach((p, i) => {
                const r = 4 + i * 1.6;
                ctx.globalAlpha = 0.15 + i * 0.08;
                ctx.drawImage(sprite, p.x - r, p.y - 14 - r, r * 2, r * 2);
            });
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(sprite, x - 16, y - 30, 32, 32);
        }
    }

    function drawEffects(ctx, scene, t) {
        const {fx, flip} = scene;
        for (let n = fx.length - 1; n >= 0; n--) {
            const f = fx[n];
            const age = (t - f.born) / f.life;
            if (age >= 1) { fx[n] = fx[fx.length - 1]; fx.pop(); continue; }
            if (age < 0) continue;
            const x = flip ? E.W - f.x : f.x, y = flip ? E.H - f.y : f.y;
            if (f.t === 'p') {
                const a = t - f.born, r = f.size * (1 - age * 0.4);
                ctx.globalAlpha = 1 - age;
                if (f.glow) ctx.globalCompositeOperation = 'lighter';
                ctx.drawImage(dot(f.colour), x + f.vx * a - r, y + f.vy * a + (f.g * a * a) / 2 - r, r * 2, r * 2);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            } else if (f.t === 'ring') {
                ctx.strokeStyle = f.colour.replace('X', String(1 - age));
                ctx.lineWidth = f.width * (1 - age * 0.6);
                const r = f.r * (0.3 + age * 0.9);
                ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
            } else if (f.t === 'glow') {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.7 * (1 - age);
                ctx.drawImage(dot(`rgb(${f.colour})`), x - f.r, y - f.r, f.r * 2, f.r * 2);
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';
            } else if (f.t === 'bolt') {
                ctx.lineJoin = 'round';
                for (const [w, c] of [[12, `rgba(140, 200, 255, ${0.35 * (1 - age)})`], [5, `rgba(255, 250, 200, ${1 - age})`]]) {
                    ctx.strokeStyle = c;
                    ctx.lineWidth = w;
                    ctx.beginPath();
                    ctx.moveTo(x + 40, y - 460);
                    for (let k2 = 1; k2 <= 7; k2++) ctx.lineTo(x + (k2 === 7 ? 0 : Math.sin(f.seed * 9 + k2 * 2.3) * 28), y - 460 + (460 * k2) / 7);
                    ctx.stroke();
                }
            } else if (f.t === 'streak') {
                const len = 260 * (1 - age);
                ctx.strokeStyle = `rgba(255, 140, 50, ${0.85 * (1 - age)})`;
                ctx.lineWidth = 14 * (1 - age * 0.5);
                ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(x + len * 0.6, y - len); ctx.lineTo(x, y); ctx.stroke();
            } else if (f.t === 'revive') {
                ctx.fillStyle = `rgba(93, 200, 110, ${1 - age})`;
                const yy = y - 34 - age * 34;
                ctx.fillRect(x - 3.5, yy - 10, 7, 20);
                ctx.fillRect(x - 10, yy - 3.5, 20, 7);
            }
        }
    }

    // --- after a round ------------------------------------------------------------------

    function showPanel(s, round) {
        const {hearts, over, winner} = scoreOf(s, true);
        const mine = me(s), rival = s.seats[them(s)], name = rival ? rival.name : 'your rival';
        const rw = resultsOf(s, round + 1)[round];
        const p = els.panel;
        const key = `${s.seed}:${s.match}:${round}`;
        const wasShown = !p.hidden && p.dataset.key === key;
        p.dataset.key = key;
        p.innerHTML = '';
        const h = document.createElement('h2');
        const sub = document.createElement('p');
        if (over) {
            h.textContent = winner === mine ? 'Victory!' : winner === -1 ? 'A draw' : 'Defeat';
            h.className = winner === mine ? 'win' : winner === -1 ? '' : 'lose';
            sub.textContent = winner === mine ? `${name} is out of hearts.` : winner === -1 ? `Both armies stood after ${E.MAX_ROUNDS} rounds.` : `Out of hearts against ${name}.`;
        } else {
            h.textContent = rw === mine ? 'Round won!' : rw === -1 ? 'Round drawn' : 'Round lost';
            h.className = rw === mine ? 'win' : rw === -1 ? '' : 'lose';
            sub.textContent = rw === mine ? `${name} loses a heart and gets rarer cards next round.`
                : rw === -1 ? 'Nobody loses a heart.' : `You lose a heart. Rarer cards for you next round.`;
        }
        p.append(h, sub);
        if (over && table.kind === 'solo') p.append(...trophyLines(winner === mine ? 1 : winner === -1 ? 0 : -1));
        const row = document.createElement('div');
        row.className = 'row';
        const btn = (text, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = text; b.addEventListener('click', fn); row.append(b); return b; };
        if (table.kind === 'solo') {
            if (over) { btn('Play again', 'mid-btn', () => table.rematch()); btn('Home', 'text-btn', goHome); }
            else btn('Next round', 'mid-btn', () => table.next());
        } else {
            const flags = over ? s.rematch : s.ready;
            const b = btn(over ? 'Rematch' : 'Next round', 'mid-btn', async () => {
                b.disabled = true;
                try { await (over ? table.rematch() : table.next()); } catch (e) { sub.textContent = e.message; b.disabled = false; }
            });
            // A rival who left counts as ready for the next round (the clock drafts for them), not for a rematch.
            b.disabled = flags[mine] || !rival || (over && rival.left);
            if (!rival || rival.left) sub.textContent += ` ${rival ? rival.name : 'Your rival'} left the room.${over ? '' : ' The clock picks for them.'}`;
            else if (flags[mine] && !flags[1 - mine]) sub.textContent += ` Waiting for ${name}…`;
            else if (flags[1 - mine]) sub.textContent += ` ${rival.name} is ready.`;
            btn('Leave', 'text-btn', leaveTable);
        }
        p.append(row);
        p.hidden = false;
        p.style.animation = wasShown ? 'none' : '';
        renderHearts(els.youHearts, hearts[mine]);
        renderHearts(els.themHearts, hearts[1 - mine]);
    }

    /** Solo only: trophies won or lost, counted once per match. */
    function trophyLines(outcome) {
        const solo = store.solo;
        if (!solo.recorded) {
            solo.recorded = true;
            solo.delta = outcome > 0 ? WIN : outcome < 0 ? -Math.min(LOSS, store.trophies) : 0;
            solo.from = store.trophies;
            store.trophies += solo.delta;
            if (outcome > 0) store.wins++;
            if (outcome < 0) store.losses++;
            save();
            renderRank();
        }
        const d = document.createElement('div');
        d.className = `delta ${solo.delta > 0 ? 'up' : solo.delta < 0 ? 'down' : ''}`;
        d.textContent = `${solo.delta > 0 ? '+' : ''}${solo.delta} trophies`;
        const r = rankOf(store.trophies), next = RANKS[r + 1];
        const track = document.createElement('div');
        track.className = 'bar-track';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        const share = (t) => (next ? Math.max(0, Math.min(1, (t - RANKS[r][1]) / (next[1] - RANKS[r][1]))) : 1);
        fill.style.width = `${share(solo.from) * 100}%`;
        track.append(fill);
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${share(store.trophies) * 100}%`; }));
        const line = document.createElement('p');
        line.textContent = next ? `${RANKS[r][0]} · ${next[1] - store.trophies} to ${next[0]}` : 'Master. The camp bows.';
        return [d, track, line];
    }

    // --- rules -------------------------------------------------------------------------

    function showRules() {
        const byKind = (kind) => Object.keys(E.CARDS).filter((id) => E.CARDS[id].kind === kind && !(kind === 'mul' && E.CARDS[id].f === 300));
        const legend = (ids) => ids.map((id) => {
            const c = E.CARDS[id], val = cardValue(id, 0);
            return `<div><span class="chip big r${c.rarity}"><img src="${artOf(id)}" alt=""></span><p><b>${val ? `${val} ` : ''}${c.name}</b>${RARITY[c.rarity] ? ` <small>${RARITY[c.rarity]}</small>` : ''} ${cardText(id)}</p></div>`;
        }).join('');
        const ring = E.CIRCLE.concat(E.CIRCLE[0]).map((t) => `<img src="${IMG(`${t}-blue`)}" alt="${PLURAL[t]}" title="${PLURAL[t]}">`).join('<span>›</span>');
        openSheet(`<h2>How to play</h2>
            <p>Every round you add cards to your army: three in the first round, two in each round after. Each pick offers three cards. Your rival drafts at the same time from offers of their own and sees your army only when the battle starts.</p>
            <p>Your army stays. Round three fights with every card picked in rounds one to three, and troop cards bring more troops the later they are picked.</p>
            <p>Then the armies march and fight on their own. Lose a battle and you lose a heart; a draw costs nobody a heart. Out of three hearts, out of the match. The loser of a round gets rarer cards in the next one.</p>
            <h3>Who beats whom</h3>
            <div class="ring">${ring}</div>
            <p>Each troop hits the next one on the ring twice as hard and takes little from it; two steps on it still has the edge. So every army has an answer. The Dragon burns Knights and falls to Archers; Towers stop Goblins and Giants knock them down.</p>
            <h3>Troops</h3><div class="legend">${legend(byKind('troop'))}</div>
            <h3>Multipliers</h3><p>Every troop has a double (Rare) and a triple (Epic). They work on everything you hold, also troops picked later.</p><div class="legend">${legend(byKind('mul'))}</div>
            <h3>Boosts</h3><div class="legend">${legend(byKind('buff'))}</div>
            <h3>Spells</h3><div class="legend">${legend(byKind('spell'))}</div>
            <h3>Buildings</h3><div class="legend">${legend(byKind('def'))}</div>
            <h3>Ranks</h3><p>Win against the camp's rivals for +${WIN} trophies, lose for −${LOSS}. ${RANKS.map(([n, t]) => `${n} ${t}`).join(' · ')}. Better ranks meet sharper rivals, and from ${RANKS[RICH_FROM][0]} on they draft from rarer cards.</p>`);
    }

    function openSheet(html) {
        els.sheetBody.innerHTML = html;
        els.sheet.classList.remove('closing');
        els.sheet.hidden = false;
        els.sheetClose.focus();
    }

    function closeSheet() {
        if (els.sheet.hidden || els.sheet.classList.contains('closing')) return;
        els.sheet.classList.add('closing');
        setTimeout(() => { els.sheet.hidden = true; els.sheet.classList.remove('closing'); }, 280);
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // --- input --------------------------------------------------------------------------

    els.offer.addEventListener('click', async (e) => {
        const card = e.target.closest('.card');
        if (!card || card.classList.contains('locked') || !table) return;
        const all = els.offer.querySelectorAll('.card');
        all.forEach((c) => { c.classList.add('locked'); c.setAttribute('aria-disabled', 'true'); });
        card.classList.add('chosen');
        const {choice, round, pick} = card.dataset;
        try {
            await table.pick(Number(choice), Number(round), Number(pick));
        } catch (err) {
            say(err.message);
            card.classList.remove('chosen');
            all.forEach((c) => { c.classList.remove('locked'); c.setAttribute('aria-disabled', 'false'); });
        }
    });
    els.playBot.addEventListener('click', startSolo);
    els.createRoom.addEventListener('click', createRoom);
    els.joinForm.addEventListener('submit', (e) => { e.preventDefault(); joinRoom(els.joinCode.value); });
    els.joinCode.addEventListener('input', () => { els.joinCode.value = els.joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    els.myName.addEventListener('click', () => {
        const name = (prompt('Your name', store.name) || '').trim().slice(0, 18);
        if (!name) return;
        store.name = name;
        if (store.solo && !store.solo.recorded) store.solo.seats[0].name = name;
        save();
        renderHome();
    });
    els.shareRoom.addEventListener('click', async () => {
        const url = shareLink();
        if (navigator.share && matchMedia('(pointer: coarse)').matches) {
            try { await navigator.share({title: 'Draft Battle', text: `Join my Draft Battle room ${table.code}`, url}); return; } catch (_) { /* closed */ }
        }
        try { await navigator.clipboard.writeText(url); els.lobbyNote.textContent = 'Link copied. Send it to your friend.'; } catch (_) { els.lobbyNote.textContent = url; }
    });
    els.leaveLobby.addEventListener('click', goHome);
    els.homeBtn.addEventListener('click', leaveTable);
    els.fastBtn.addEventListener('click', () => {
        store.fast = !store.fast;
        save();
        els.fastBtn.classList.toggle('on', store.fast);
        els.fastBtn.setAttribute('aria-pressed', String(store.fast));
    });
    els.helpBtn.addEventListener('click', showRules);
    els.sheetClose.addEventListener('click', closeSheet);
    els.sheet.addEventListener('click', (e) => { if (e.target === els.sheet) closeSheet(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    // Back from the page cache (an app switch, a locked screen): its stream is dead.
    window.addEventListener('pageshow', (e) => { if (e.persisted && table && table.kind === 'room') table.mend(); });
    window.addEventListener('online', () => { if (!els.home.hidden) renderHome(); });
    window.addEventListener('offline', () => { if (!els.home.hidden) renderHome(); });

    // --- start ----------------------------------------------------------------------------

    const pic = (name, cls) => `<span class="${cls}"><img src="${IMG(name)}" alt=""></span>`;
    els.heroArt.innerHTML = pic('knight-blue', 'l') + pic('archer-blue', 'l') + '<span class="vs">VS</span>' + pic('giant-red', 'r') + pic('goblin-red', 'r');
    els.youAvatar.innerHTML = `<img src="${IMG('knight-blue')}" alt="">`;
    els.themAvatar.innerHTML = `<img src="${IMG('knight-red')}" alt="">`;
    els.fastBtn.classList.toggle('on', store.fast);
    els.fastBtn.setAttribute('aria-pressed', String(store.fast));
    renderHome();
    showScreen('home');
    const invited = new URLSearchParams(location.search).get('room');
    if (invited && navigator.onLine) joinRoom(invited);
    else if (invited) note('Rooms need a connection. Play works offline.');
})();
