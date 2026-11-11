/**
 * Draft Battle page. The rules are in `draft-engine.js`, the drawings in `draft-art.js`.
 *
 * Picks come from a "table": the solo game against a bot, played here and offline, or
 * a live room on the server. Both hand the screen the same state the server sends
 * (`DraftState`: seed, match, picks per round, ready flags), and the screen catches up
 * with whatever changed: picks fly to the hands, a finished round is fought, a new
 * round or match is dealt. Two phones in a room derive the same battles from it.
 *
 * Progress is one localStorage key: trophies, the name, and a solo match in progress.
 */
(function () {
    'use strict';

    const E = window.DraftEngine, A = window.DraftArt;
    const STORE_KEY = 'draft.v1';
    const RANKS = [['Bronze', 0], ['Silver', 300], ['Gold', 700], ['Diamond', 1200], ['Master', 1800]];
    // How often a bot of each rank picks without thinking.
    const SLIP = [0.5, 0.35, 0.2, 0.08, 0];
    const BOTS = ['Sir Goose', 'Captain Crumb', 'Baroness Bun', 'Old Gruff', 'Lady Pickle', 'Duke Waffle', 'General Puff', 'Mad Marge', 'Count Dumpling', 'Sergeant Sprout'];
    const NAMES = ['Brave Otter', 'Swift Fox', 'Bold Badger', 'Clever Crow', 'Merry Moose', 'Lucky Lynx', 'Stout Stoat', 'Daring Duck'];
    const KIND = {add: 'Troops', mul: 'Multiplier', buff: 'Boost', def: 'Defense', weapon: 'Weapon'};
    const WIN = 30, LOSS = 20;

    const $ = (id) => document.getElementById(id);
    const els = {
        rank: $('rank'), rankName: $('rank-name'), trophies: $('trophies'), roomTag: $('room-tag'),
        home: $('home'), lobby: $('lobby'), match: $('match'),
        heroArt: $('hero-art'), playBot: $('play-bot'), botLine: $('bot-line'),
        myName: $('my-name'), createRoom: $('create-room'), joinForm: $('join-form'), joinCode: $('join-code'), roomNote: $('room-note'),
        roomCode: $('room-code'), lobbyNote: $('lobby-note'), shareRoom: $('share-room'), leaveLobby: $('leave-lobby'),
        themName: $('them-name'), themWins: $('them-wins'), themHand: $('them-hand'), themArmy: $('them-army'), themAvatar: $('them-avatar'),
        youName: $('you-name'), youWins: $('you-wins'), youHand: $('you-hand'), youArmy: $('you-army'), youAvatar: $('you-avatar'),
        stage: $('stage'), draft: $('draft'), pool: $('pool'), offer: $('offer'), prompt: $('prompt'),
        field: $('field'), banner: $('banner'), panel: $('panel'),
        homeBtn: $('home-btn'), fastBtn: $('fast-btn'), helpBtn: $('help-btn'),
        fly: $('fly'), sheet: $('sheet'), sheetBody: $('sheet-body'), sheetClose: $('sheet-close'),
    };

    // --- store ------------------------------------------------------------------------

    function load() {
        const fresh = {trophies: 0, wins: 0, losses: 0, name: NAMES[Math.floor(Math.random() * NAMES.length)], fast: false, solo: null};
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            if (saved && typeof saved === 'object') return {...fresh, ...saved};
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

    // --- cards ------------------------------------------------------------------------

    function cardValue(id, round) {
        const c = E.CARDS[id];
        if (c.kind === 'add') return `+${Math.max(1, Math.floor((c.n * E.scale(round)) / 100))}`;
        if (c.kind === 'mul') return c.unit ? '×2' : '×1.4';
        return '';
    }

    function cardEl(id, round, tag = 'button') {
        const c = E.CARDS[id];
        const el = document.createElement(tag);
        el.className = `card k-${c.kind}`;
        const val = cardValue(id, round);
        el.innerHTML = `${val ? `<span class="val">${val}</span>` : ''}<span class="art">${A.cardArt(id, E.CARDS)}</span>`
            + `<span class="kind">${KIND[c.kind]}</span><span class="name">${c.name}</span><span class="text">${c.text || ''}</span>`;
        el.setAttribute('aria-label', `${KIND[c.kind]}: ${val} ${c.name}. ${c.text || ''}`);
        return el;
    }

    function miniEl(id, round) {
        const c = E.CARDS[id];
        const el = document.createElement('span');
        el.className = `mini k-${c.kind}`;
        const val = cardValue(id, round);
        el.innerHTML = A.cardArt(id, E.CARDS) + (val ? `<b>${val}</b>` : '');
        el.title = `${val} ${c.name}`;
        return el;
    }

    // Users who ask for less motion get the moves without the flights.
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The build this page came with; a room on another build fights other battles.
    const BUILD = (new URL(document.querySelector('script[src*="draft-engine.js"]').src).searchParams.get('v')) || '';

    // --- tables ------------------------------------------------------------------------
    //
    // A table owns the state and accepts moves; the screen listens with `onState`.

    let table = null;
    let onState = () => {};

    const newSolo = () => ({
        code: '', you: 0, seed: 1 + Math.floor(Math.random() * 2147483000), match: 0,
        seats: [{name: store.name, connected: true}, {name: BOTS[Math.floor(Math.random() * BOTS.length)], connected: true}],
        picks: [[]], ready: [false, false], rematch: [false, false], turnLeftMs: null, recorded: false,
    });

    /** Against a bot, here and offline. The match is saved after every move. */
    function soloTable() {
        if (!store.solo) store.solo = newSolo();
        let thinking = null;
        const t = {
            kind: 'solo',
            emit() { save(); onState(JSON.parse(JSON.stringify(store.solo))); t.bot(); },
            pick(choice, round, turn) {
                const s = store.solo;
                if (round !== s.picks.length - 1 || turn !== s.picks[round].length || E.picker(round, turn) !== 0) return;
                s.picks[round].push(choice);
                t.emit();
            },
            next() { store.solo.picks.push([]); t.emit(); },
            rematch() { store.solo = newSolo(); t.emit(); },
            leave() { clearTimeout(thinking); thinking = null; },
            /** The bot takes its turn after a short think; a slip is a pick without one. */
            bot() {
                const s = store.solo, round = s.picks.length - 1, turn = s.picks[round].length;
                if (thinking || turn >= E.TURNS || E.picker(round, turn) !== 1) return;
                thinking = setTimeout(() => {
                    thinking = null;
                    if (table !== t || store.solo !== s) return;
                    const cards = E.pool(s.seed, s.match, round);
                    const careless = Math.random() < SLIP[rankOf(store.trophies)];
                    const choice = careless ? (Math.random() < 0.5 ? 0 : 1) : E.bestChoice(cards, round, s.picks[round], 1, E.battleSeed(s.seed, s.match, round));
                    s.picks[round].push(choice);
                    t.emit();
                }, 1100 + Math.random() * 700);
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
            pick(choice, round, turn) { return api(`/rooms/${code}/pick`, {round, turn, choice}); },
            next() { return api(`/rooms/${code}/next`, {round: last.picks.length - 1}); },
            rematch() { return api(`/rooms/${code}/rematch`, {match: last.match}); },
            /** A tap left in the room mid-match; true if it went. */
            get underway() { return !!last && last.picks.some((p) => p.length) && !scoreOf(last, true).over; },
            leave() {
                if (stream) stream.close();
                fetch(`/api/draft/rooms/${code}/leave`, {method: 'POST'}).catch(() => {});
            },
        };
        return t;
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
        els.botLine.textContent = store.solo && !store.solo.recorded ? `Resume against ${store.solo.seats[1].name}` : `Against a ${RANKS[r][0]} rival · best of three`;
        els.playBot.querySelector('span').textContent = store.solo && !store.solo.recorded ? 'Resume' : 'Play';
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

    const me = (s) => s.you;
    const them = (s) => 1 - s.you;
    const results = new Map();

    /** The winner (seat, or -1) of a round whose draft is complete. */
    function resultOf(s, round) {
        const key = `${s.seed}:${s.match}:${round}`;
        if (!results.has(key)) {
            const h = E.hands(E.pool(s.seed, s.match, round), round, s.picks[round]);
            results.set(key, E.fight(h[0], h[1], round, E.battleSeed(s.seed, s.match, round)).winner);
            if (results.size > 40) results.delete(results.keys().next().value);
        }
        return results.get(key);
    }

    /** Rounds fought so far: every round before the current one, and it too once watched. */
    function scoreOf(s, watched) {
        const rounds = [];
        for (let r = 0; r < s.picks.length; r++) {
            if (s.picks[r].length < E.TURNS || (r === s.picks.length - 1 && !watched)) break;
            rounds.push(resultOf(s, r));
        }
        return E.score(rounds);
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
        const rival = s.seats[them(s)];
        if (tb.kind === 'room' && !rival && !s.picks.some((p) => p.length)) {
            showLobby(s);
            return;
        }
        if (els.match.hidden) showScreen('match');
        if (tb.kind === 'room') els.roomTag.querySelector('b').textContent = s.code;
        const round = s.picks.length - 1, choices = s.picks[round];
        const fresh = !view || view.seed !== s.seed || view.match !== s.match;
        if (fresh || view.round !== round) {
            view = {seed: s.seed, match: s.match, round, turns: 0, watched: false, offer: null};
            renderPlayers(s);
            await dealRound(s, round, fresh);
            if (gone()) return;
        }
        renderPlayers(s);
        while (view.turns < choices.length) {
            await playPick(s, round, view.turns);
            if (gone()) return;
            view.turns++;
        }
        renderTurn(s);
        if (choices.length === E.TURNS && !view.watched) {
            await fight(s, round);
            if (gone() || view.seed !== s.seed || view.match !== s.match || view.round !== round) return;
            view.watched = true;
        }
        if (view.watched) showPanel(s, round);
    }

    function showLobby(s) {
        showScreen('lobby');
        els.roomCode.textContent = s.code;
        els.roomTag.querySelector('b').textContent = s.code;
        els.lobbyNote.textContent = 'Waiting for your friend to join…';
    }

    function renderPlayers(s) {
        const mine = s.seats[me(s)], rival = s.seats[them(s)];
        els.youName.textContent = mine ? mine.name : 'You';
        els.themName.innerHTML = '';
        els.themName.append(rival ? rival.name : 'Rival');
        if (table.kind === 'room' && (!rival || rival.left || !rival.connected)) {
            const off = document.createElement('span');
            off.className = 'off';
            off.textContent = !rival || rival.left ? 'left' : 'away';
            els.themName.append(off);
        }
        const {wins} = scoreOf(s, view && view.watched);
        renderWins(els.youWins, wins[me(s)]);
        renderWins(els.themWins, wins[them(s)]);
    }

    function renderWins(el, n) {
        const had = el.querySelectorAll('i.on').length;
        el.innerHTML = '';
        for (let k = 0; k < E.WINS; k++) {
            const i = document.createElement('i');
            if (k < n) i.className = 'on';
            if (k < had) i.style.animation = 'none';
            el.append(i);
        }
    }

    /** A new round: an empty pool flips in card by card, hands start from scratch. */
    async function dealRound(s, round, fresh) {
        battleToken++;
        els.field.hidden = true;
        els.draft.hidden = false;
        els.panel.hidden = true;
        els.match.classList.remove('battling');
        const cards = E.pool(s.seed, s.match, round);
        els.youHand.innerHTML = '';
        els.themHand.innerHTML = '';
        renderArmies(s, round, [[], []]);
        els.pool.innerHTML = '';
        for (let t = 0; t < E.TURNS; t++) {
            const pair = document.createElement('div');
            pair.className = 'pair';
            pair.append(miniEl(cards[2 * t], round), miniEl(cards[2 * t + 1], round));
            els.pool.append(pair);
        }
        els.offer.innerHTML = '';
        if ((!fresh || s.picks[round].length === 0) && !calm()) {
            banner(round === 0 ? 'Round 1' : `Round ${round + 1}`);
            [...els.pool.querySelectorAll('.mini')].forEach((m, k) => m.animate([{opacity: 0, transform: 'rotateY(90deg) scale(.7)'}, {opacity: 1, transform: 'none'}], {duration: 320, delay: k * 55, easing: 'cubic-bezier(.3, 1.4, .5, 1)', fill: 'backwards'}));
            await sleep(700);
        }
    }

    function renderArmies(s, round, hands) {
        for (const [seat, el] of [[me(s), els.youArmy], [them(s), els.themArmy]]) {
            const a = E.army(hands[seat], round);
            const team = seat === me(s) ? 'blue' : 'red';
            const parts = E.TROOPS.filter((t) => a.count[t]).map((t) => `<span>${A.figure(t, team)}${a.count[t]}</span>`);
            for (const b of ['wall', 'tower', 'catapult']) if (a[b]) parts.push(`<span>${A.figure(b, team)}${a[b] > 1 ? a[b] : ''}</span>`);
            const extras = [['Rage', a.atk > 100], ['Armor', a.hp > 100], ['Haste', a.haste], ['Fire', a.fire], ['Shields', a.shield], ['Medics', a.heal], ['Fireball', a.fireball], ['Lightning', a.lightning]];
            for (const [name, on] of extras) if (on) parts.push(`<span>${name}</span>`);
            el.innerHTML = parts.join('');
        }
    }

    /**
     * Highlights the pair on offer and says whose pick it is. The cards are only built
     * anew when the turn changes, so a state that only moves a connection flag does not
     * re-arm cards already tapped.
     */
    function renderTurn(s) {
        const round = s.picks.length - 1, turn = s.picks[round].length;
        const cards = E.pool(s.seed, s.match, round);
        [...els.pool.children].forEach((p, t) => p.classList.toggle('now', t === turn));
        clearInterval(clockTimer);
        if (turn >= E.TURNS) { els.offer.innerHTML = ''; view.offer = null; els.prompt.textContent = ''; return; }
        const mine = E.picker(round, turn) === me(s);
        const rival = s.seats[them(s)];
        const key = `${s.seed}:${s.match}:${round}:${turn}`;
        if (view.offer !== key) {
            view.offer = key;
            els.offer.innerHTML = '';
            for (const c of [0, 1]) {
                const card = cardEl(cards[2 * turn + c], round);
                Object.assign(card.dataset, {choice: c, round, turn});
                // Not disabled: the rival's cards stay readable by keyboard and screen reader.
                card.classList.toggle('locked', !mine);
                card.setAttribute('aria-disabled', String(!mine));
                if (!calm()) card.animate([{opacity: 0, transform: 'translateY(16px) scale(.92)'}, {opacity: 1, transform: 'none'}], {duration: 260, delay: c * 70, easing: 'cubic-bezier(.3, 1.3, .5, 1)', fill: 'backwards'});
                els.offer.append(card);
            }
            els.offer.classList.toggle('mine', mine);
        }
        const name = rival ? rival.name : 'Your rival';
        say(mine ? 'Keep one. The other goes to your rival.'
            : rival && rival.left ? `${name} left. The clock picks for them.`
                : `${name} is choosing…`);
        if (s.turnLeftMs != null) startClock(s.turnLeftMs - (performance.now() - s.at), s.turnMs);
    }

    let clockTimer = null;
    function startClock(ms, total) {
        const until = performance.now() + ms;
        const clock = document.createElement('span');
        clock.className = 'clock';
        clock.setAttribute('aria-hidden', 'true');
        els.prompt.prepend(clock);
        const tick = () => {
            const left = Math.max(0, until - performance.now());
            clock.style.setProperty('--left', `${(left / total) * 100}%`);
            if (!left) clearInterval(clockTimer);
        };
        tick();
        clockTimer = setInterval(tick, 200);
    }

    function say(text) { els.prompt.textContent = text; }

    /** Turn `t`'s pair leaves the table: the kept card to the picker, the other across. */
    async function playPick(s, round, t) {
        const cards = E.pool(s.seed, s.match, round);
        const choice = s.picks[round][t];
        const picker = E.picker(round, t);
        const hands = E.hands(cards, round, s.picks[round].slice(0, t + 1));
        const handOf = (seat) => (seat === me(s) ? els.youHand : els.themHand);
        const kept = cards[2 * t + choice], given = cards[2 * t + 1 - choice];
        const pair = els.pool.children[t];
        const shown = els.offer.children.length === 2 && els.pool.children[t].classList.contains('now') ? [...els.offer.children] : null;
        const targets = [[kept, picker], [given, 1 - picker]].map(([id, seat]) => {
            const m = miniEl(id, round);
            m.style.visibility = 'hidden';
            handOf(seat).append(m);
            return m;
        });
        if (shown && !document.hidden && !calm()) {
            const from = [shown[choice], shown[1 - choice]];
            await Promise.all(from.map((card, k) => flyTo(card, targets[k], k * 110)));
        }
        targets.forEach((m) => {
            m.style.visibility = '';
            m.animate([{transform: 'scale(.4)'}, {transform: 'scale(1.15)', offset: .6}, {transform: 'none'}], {duration: 300, easing: 'ease-out'});
        });
        pair.classList.add('done');
        pair.classList.remove('now');
        pair.children[choice].classList.add(picker === me(s) ? 'mine' : 'theirs');
        pair.children[1 - choice].classList.add(picker === me(s) ? 'theirs' : 'mine');
        renderArmies(s, round, hands);
        els.offer.innerHTML = '';
        view.offer = null;
    }

    /** A copy of `card` flies to where `mini` sits and shrinks into it. */
    async function flyTo(card, mini, delay) {
        const a = card.getBoundingClientRect(), b = mini.getBoundingClientRect();
        const ghost = card.cloneNode(true);
        Object.assign(ghost.style, {left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`});
        els.fly.append(ghost);
        card.style.visibility = 'hidden';
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        const k = b.width / a.width;
        await ghost.animate([
            {transform: 'none'},
            {transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 20}px) scale(${0.85 + k * 0.15}) rotate(${dx > 0 ? 6 : -6}deg)`, offset: .4},
            {transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0.6},
        ], {duration: 480, delay, easing: 'cubic-bezier(.45, 0, .3, 1)', fill: 'forwards'}).finished;
        ghost.remove();
    }

    function banner(text, kind = '') {
        els.banner.textContent = text;
        els.banner.className = `banner ${kind}`;
        void els.banner.offsetWidth;
        els.banner.classList.add('show');
    }

    // --- the battle --------------------------------------------------------------------

    const sprites = {};
    function spritesFor(team) {
        if (sprites[team]) return sprites[team];
        const set = {};
        for (const type of Object.keys(E.UNITS)) {
            const img = new Image();
            // A large intrinsic size, so the camera can zoom in without blurring them.
            img.src = `data:image/svg+xml,${encodeURIComponent(A.figure(type, team).replace('<svg ', '<svg width="160" height="160" '))}`;
            set[type] = img;
        }
        sprites[team] = set;
        return set;
    }

    async function fight(s, round) {
        const token = ++battleToken;
        const cards = E.pool(s.seed, s.match, round);
        const h = E.hands(cards, round, s.picks[round]);
        const b = new E.Battle(h[0], h[1], round, E.battleSeed(s.seed, s.match, round));
        const flip = me(s) === 1;
        const teams = flip ? ['red', 'blue'] : ['blue', 'red'];
        const sets = teams.map(spritesFor);
        await Promise.all(sets.flatMap((set) => Object.values(set).map((img) => img.decode().catch(() => {}))));
        if (token !== battleToken) return;

        els.draft.hidden = true;
        els.field.hidden = false;
        els.match.classList.add('battling');
        const ctx = els.field.getContext('2d');
        const fit = () => {
            const r = els.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
            els.field.width = Math.round(r.width * dpr);
            els.field.height = Math.round(r.height * dpr);
            return {w: els.field.width, h: els.field.height, ground: groundCanvas()};
        };
        let geo = fit();
        const onResize = () => { geo = fit(); };
        window.addEventListener('resize', onResize);
        banner('Battle!');

        const fx = [];
        const lastHit = new Map();
        const at = (x, y) => (flip ? [E.W - x, E.H - y] : [x, y]);
        const cam = {x: 0, y: 0, w: E.W, h: E.H};
        // A beat to see both armies before they move, and one after the last blow.
        let acc = -700, last = performance.now(), endedAt = null;
        await new Promise((done) => {
            const frame = (now) => {
                if (token !== battleToken) { done(); return; }
                try { tick(now); } catch (e) { console.error(e); done(); return; }
                if (endedAt !== null && now - endedAt > 900) { done(); return; }
                requestAnimationFrame(frame);
            };
            const tick = (now) => {
                acc += Math.min(100, now - last) * (store.fast ? 2 : 1);
                last = now;
                while (acc >= E.TICK_MS && !b.done) {
                    b.step();
                    acc -= E.TICK_MS;
                    for (const ev of b.events) collect(ev, b, fx, lastHit);
                }
                if (b.done && endedAt === null) endedAt = now;
                follow(cam, b, at, geo.w / geo.h);
                draw(ctx, geo, cam, b, b.done ? 1 : Math.max(0, Math.min(1, acc / E.TICK_MS)), sets, fx, lastHit, at);
            };
            requestAnimationFrame(frame);
        });
        window.removeEventListener('resize', onResize);
        if (token !== battleToken) return;
        const mine = me(s);
        const won = b.winner === mine, lost = b.winner === 1 - mine;
        banner(won ? 'Round won!' : lost ? 'Round lost' : 'Draw', won ? 'win' : lost ? 'lose' : '');
        await sleep(900);
    }

    /** Turns battle events into effects drawn for a few frames. */
    function collect(ev, b, fx, lastHit) {
        if (ev.t === 'hit') { lastHit.set(ev.id, b.tick); if (fx.length < 120 && Math.random() < 0.35) fx.push({t: 'puff', x: ev.x, y: ev.y, born: b.tick, life: 5}); }
        else if (ev.t === 'fireball') fx.push({t: 'fireball', x: ev.x, y: ev.y, r: ev.r, born: b.tick, life: 18});
        else if (ev.t === 'bolt') fx.push({t: 'bolt', x: ev.x, y: ev.y, born: b.tick, life: 9, seed: Math.random()});
        else if (ev.t === 'boom') fx.push({t: 'boom', x: ev.x, y: ev.y, r: ev.r, born: b.tick, life: 12});
        else if (ev.t === 'revive') { const u = b.units[ev.id]; fx.push({t: 'revive', x: u.x, y: u.y, born: b.tick, life: 16}); }
    }

    /**
     * The camera keeps the fight in view: it eases towards the troops still standing,
     * zoomed in at most so far, never further out than the whole field.
     */
    function follow(cam, b, at, aspect) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        // Troops make the fight; towers and catapults far behind would keep it zoomed out.
        const troops = b.units.some((u) => u.alive && !u.fixed);
        for (const u of b.units) {
            if (!u.alive || (troops && u.fixed)) continue;
            const [x, y] = at(u.x, u.y);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        if (x0 === Infinity) return;
        const pad = 110;
        let w = Math.max(x1 - x0 + 2 * pad, E.W / 2.2), h = Math.max(y1 - y0 + 2 * pad, E.H / 2.2);
        if (w / h < aspect) w = h * aspect; else h = w / aspect;
        const fitW = Math.max(E.W, E.H * aspect);
        if (w > fitW) { w = fitW; h = w / aspect; }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const tx = w >= E.W ? (E.W - w) / 2 : Math.max(0, Math.min(E.W - w, cx - w / 2));
        const ty = h >= E.H ? (E.H - h) / 2 : Math.max(0, Math.min(E.H - h, cy - h / 2));
        const ease = cam.ready ? 0.06 : 1;
        cam.x += (tx - cam.x) * ease; cam.y += (ty - cam.y) * ease;
        cam.w += (w - cam.w) * ease; cam.h = cam.w / aspect;
        cam.ready = true;
    }

    let ground = null;
    const MARGIN = 260;
    /** The battlefield in field units, with a margin of grass for the camera: painted once. */
    function groundCanvas() {
        if (ground) return ground;
        const s = 1.5, w = (E.W + 2 * MARGIN) * s, h = (E.H + 2 * MARGIN) * s;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.scale(s, s);
        g.translate(MARGIN, MARGIN);
        const grass = g.createLinearGradient(0, -MARGIN, 0, E.H + MARGIN);
        grass.addColorStop(0, '#93C26A'); grass.addColorStop(1, '#7FB357');
        g.fillStyle = grass;
        g.fillRect(-MARGIN, -MARGIN, E.W + 2 * MARGIN, E.H + 2 * MARGIN);
        g.fillStyle = 'rgba(255,255,255,.06)';
        for (let y = -MARGIN; y < E.H + MARGIN; y += 88) g.fillRect(-MARGIN, y, E.W + 2 * MARGIN, 44);
        const mid = g.createLinearGradient(0, E.H / 2 - 110, 0, E.H / 2 + 110);
        mid.addColorStop(0, 'rgba(196, 160, 100, 0)'); mid.addColorStop(.5, 'rgba(196, 160, 100, .35)'); mid.addColorStop(1, 'rgba(196, 160, 100, 0)');
        g.fillStyle = mid;
        g.fillRect(-MARGIN, E.H / 2 - 110, E.W + 2 * MARGIN, 220);
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let n = 0; n < 160; n++) {
            g.fillStyle = ['rgba(255,255,255,.55)', 'rgba(255, 214, 90, .6)', 'rgba(255, 150, 190, .5)', 'rgba(70, 120, 45, .22)'][n % 4];
            g.beginPath();
            g.arc(-MARGIN + rnd() * (E.W + 2 * MARGIN), -MARGIN + rnd() * (E.H + 2 * MARGIN), n % 4 === 3 ? 7 : 3, 0, Math.PI * 2);
            g.fill();
        }
        ground = c;
        return c;
    }

    function draw(ctx, geo, cam, b, alpha, sets, fx, lastHit, at) {
        const k = geo.w / cam.w;
        ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
        ctx.drawImage(geo.ground, -MARGIN, -MARGIN, E.W + 2 * MARGIN, E.H + 2 * MARGIN);
        const pos = (u) => at(u.px + (u.x - u.px) * alpha, u.py + (u.y - u.py) * alpha);
        const list = b.units.filter((u) => u.alive || b.tick - u.died < 14)
            .map((u) => ({u, p: pos(u)}))
            .sort((p, q) => p.p[1] - q.p[1]);
        for (const {u, p: [x, y]} of list) {
            const img = sets[u.side][u.type];
            const size = u.r * (u.fixed ? 2.8 : 3.4);
            const hit = b.tick - (lastHit.get(u.id) ?? -99);
            const jx = u.alive && hit < 3 ? (hit % 2 ? 2 : -2) : 0;
            if (!u.alive) {
                const fade = (b.tick - u.died + alpha) / 14;
                ctx.globalAlpha = Math.max(0, 1 - fade);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate((u.id % 2 ? 1 : -1) * fade * 1.2);
                ctx.drawImage(img, -size / 2, -size * 0.75, size, size);
                ctx.restore();
                ctx.globalAlpha = 1;
                continue;
            }
            ctx.drawImage(img, x - size / 2 + jx, y - size * 0.75, size, size);
            if (u.hp < u.maxHp && !u.wall) {
                const w = Math.max(18, u.r * 2);
                ctx.fillStyle = 'rgba(40,25,10,.35)';
                ctx.fillRect(x - w / 2, y - size * 0.8 - 6, w, 4);
                ctx.fillStyle = teamColour(sets, u.side);
                ctx.fillRect(x - w / 2, y - size * 0.8 - 6, (w * u.hp) / u.maxHp, 4);
            }
        }
        // Arrows and boulders.
        for (const sh of b.shots) {
            const [x, y] = at(sh.px + (sh.x - sh.px) * alpha, sh.py + (sh.y - sh.py) * alpha);
            if (sh.kind === 'arrow') {
                const [x0, y0] = at(sh.px, sh.py), [x1, y1] = at(sh.x, sh.y);
                const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
                ctx.strokeStyle = '#5B4636';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x - (dx / d) * 16, y - (dy / d) * 16);
                ctx.lineTo(x, y);
                ctx.stroke();
            } else {
                const lift = Math.sin(Math.min(1, Math.hypot(sh.x - sh.tx, sh.y - sh.ty) / 400) * Math.PI) * 60;
                ctx.fillStyle = 'rgba(40,25,10,.25)';
                ctx.beginPath(); ctx.ellipse(x, y, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#8D8579';
                ctx.strokeStyle = '#3B2C22';
                ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(x, y - lift, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            }
        }
        // Effects.
        for (let n = fx.length - 1; n >= 0; n--) {
            const f = fx[n];
            const age = (b.tick - f.born + alpha) / f.life;
            if (age >= 1) { fx.splice(n, 1); continue; }
            const [x, y] = at(f.x, f.y);
            if (f.t === 'puff') {
                ctx.fillStyle = `rgba(255, 246, 225, ${0.7 * (1 - age)})`;
                ctx.beginPath(); ctx.arc(x, y - 10, 6 + age * 10, 0, Math.PI * 2); ctx.fill();
            } else if (f.t === 'fireball' || f.t === 'boom') {
                const fire = f.t === 'fireball';
                ctx.fillStyle = fire ? `rgba(255, 130, 50, ${0.45 * (1 - age)})` : `rgba(150, 120, 90, ${0.4 * (1 - age)})`;
                ctx.beginPath(); ctx.arc(x, y, f.r * (0.3 + age * 0.8), 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = fire ? `rgba(255, 210, 94, ${1 - age})` : `rgba(90, 70, 50, ${0.7 * (1 - age)})`;
                ctx.lineWidth = fire ? 8 : 5;
                ctx.beginPath(); ctx.arc(x, y, f.r * (0.4 + age * 0.9), 0, Math.PI * 2); ctx.stroke();
            } else if (f.t === 'bolt') {
                ctx.strokeStyle = `rgba(255, 224, 110, ${1 - age})`;
                ctx.lineWidth = 6;
                ctx.lineJoin = 'round';
                ctx.beginPath();
                let px = x + 30, py = y - 400;
                ctx.moveTo(px, py);
                for (let k2 = 1; k2 <= 6; k2++) {
                    px = x + (k2 === 6 ? 0 : Math.sin(f.seed * 9 + k2 * 2.3) * 26);
                    py = y - 400 + (400 * k2) / 6;
                    ctx.lineTo(px, py);
                }
                ctx.stroke();
            } else if (f.t === 'revive') {
                ctx.fillStyle = `rgba(93, 187, 99, ${1 - age})`;
                const yy = y - 30 - age * 30;
                ctx.fillRect(x - 3, yy - 9, 6, 18);
                ctx.fillRect(x - 9, yy - 3, 18, 6);
            }
        }
    }

    function teamColour(sets, side) {
        return sets[side] === sprites.blue ? A.TEAMS.blue.main : A.TEAMS.red.main;
    }

    // --- after a round ------------------------------------------------------------------

    function showPanel(s, round) {
        const {wins, over, winner} = scoreOf(s, true);
        const mine = me(s), rival = s.seats[them(s)];
        const rw = resultOf(s, round);
        const p = els.panel;
        const wasShown = !p.hidden && p.dataset.key === `${s.seed}:${s.match}:${round}`;
        p.dataset.key = `${s.seed}:${s.match}:${round}`;
        p.innerHTML = '';
        const h = document.createElement('h2');
        const sub = document.createElement('p');
        if (over) {
            h.textContent = winner === mine ? 'Victory!' : winner === -1 ? 'A draw' : 'Defeat';
            h.className = winner === mine ? 'win' : winner === -1 ? '' : 'lose';
            sub.textContent = `${wins[mine]} – ${wins[1 - mine]} against ${rival ? rival.name : 'your rival'}`;
        } else {
            h.textContent = rw === mine ? 'Round won!' : rw === -1 ? 'Round drawn' : 'Round lost';
            h.className = rw === mine ? 'win' : rw === -1 ? '' : 'lose';
            sub.textContent = `${wins[mine]} – ${wins[1 - mine]}. First to ${E.WINS} wins.`;
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
            const name = rival ? rival.name : 'your rival';
            const b = btn(over ? 'Rematch' : 'Next round', 'mid-btn', async () => {
                b.disabled = true;
                try { await (over ? table.rematch() : table.next()); } catch (e) { sub.textContent = e.message; b.disabled = false; }
            });
            b.disabled = flags[mine] || !rival || rival.left;
            if (!rival || rival.left) sub.textContent += ` ${rival ? rival.name : 'Your rival'} left the room.`;
            else if (flags[mine] && !flags[1 - mine]) sub.textContent += ` Waiting for ${name}…`;
            else if (flags[1 - mine]) sub.textContent += ` ${rival.name} is ready.`;
            btn('Leave', 'text-btn', leaveTable);
        }
        p.append(row);
        p.hidden = false;
        if (wasShown) p.style.animation = 'none';
        else p.style.animation = '';
        renderWins(els.youWins, wins[mine]);
        renderWins(els.themWins, wins[1 - mine]);
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
        const legend = (ids) => ids.map((id) => `<div>${miniEl(id, 0).outerHTML}<p><b>${cardValue(id, 0)} ${E.CARDS[id].name}</b> ${E.CARDS[id].text || ''}</p></div>`).join('');
        openSheet(`<h2>How to play</h2>
            <p>Each round lays out ten cards in pairs. On your turn take one card of the pair; the other goes to your rival. Turns alternate.</p>
            <p>Then both armies march and fight on their own. Last troops standing win the round; first to two rounds wins the match.</p>
            <p>Doubling cards are strong with their troop, so think twice before handing one across.</p>
            <h3>Troops</h3><div class="legend">${legend(E.KINDS.add)}</div>
            <h3>Multipliers</h3><div class="legend">${legend(E.KINDS.mul)}</div>
            <h3>Boosts</h3><div class="legend">${legend(E.KINDS.buff)}</div>
            <h3>Defense</h3><div class="legend">${legend(E.KINDS.def)}</div>
            <h3>Weapons</h3><div class="legend">${legend(E.KINDS.weapon)}</div>
            <h3>Ranks</h3><p>Win against the camp's rivals for +${WIN} trophies, lose for −${LOSS}. ${RANKS.map(([n, t]) => `${n} ${t}`).join(' · ')}. Better ranks meet sharper rivals.</p>`);
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
        els.offer.querySelectorAll('.card').forEach((c) => { c.classList.add('locked'); c.setAttribute('aria-disabled', 'true'); });
        const {choice, round, turn} = card.dataset;
        try {
            await table.pick(Number(choice), Number(round), Number(turn));
        } catch (err) {
            say(err.message);
            els.offer.querySelectorAll('.card').forEach((c) => { c.classList.remove('locked'); c.setAttribute('aria-disabled', 'false'); });
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

    els.heroArt.innerHTML = `<span class="l">${A.figure('knight', 'blue')}</span><span class="l">${A.figure('archer', 'blue')}</span><span class="vs">VS</span>`
        + `<span class="r">${A.figure('giant', 'red')}</span><span class="r">${A.figure('goblin', 'red')}</span>`;
    els.youAvatar.innerHTML = A.figure('sword', 'blue');
    els.themAvatar.innerHTML = A.figure('sword', 'red');
    els.fastBtn.classList.toggle('on', store.fast);
    els.fastBtn.setAttribute('aria-pressed', String(store.fast));
    renderHome();
    showScreen('home');
    const invited = new URLSearchParams(location.search).get('room');
    if (invited && navigator.onLine) joinRoom(invited);
    else if (invited) note('Rooms need a connection. Play works offline.');
})();
