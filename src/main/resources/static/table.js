/**
 * The table. The server owns the game; this file owns the felt.
 *
 * Every SSE frame is a whole table state. Rendering is keyed — by card key and hand
 * id — so a re-render leaves untouched cards alone and only the genuinely new ones
 * get animated in. That is the entire trick behind the deal animation.
 */
(function () {
    const {animate, createTimeline, stagger} = window.anime;

    const root = document.querySelector('[data-code]');
    const code = root.dataset.code;
    const $ = (id) => document.getElementById(id);

    const els = {
        cash: $('cash'), dealer: $('dealer-cards'), dealerScore: $('dealer-score'),
        seats: $('seats'), phase: $('phase'), clock: $('clock'), banner: $('banner'),
        chips: $('chips'), betActions: $('bet-actions'), playActions: $('play-actions'),
        deal: $('deal'), clear: $('clear'), error: $('error'), share: $('share'),
    };

    let state = null;
    let deadlineAt = null;
    let lastSettle = 0;
    let lastMessage = null;
    const seenCards = new Set();

    // ---- helpers -----------------------------------------------------------

    function paintCash(flash) {
        els.cash.textContent = '$' + window.Bank.cash;
        if (flash) animate(els.cash, {scale: [1, 1.3, 1], duration: 500, ease: 'out(3)'});
    }

    function showError(message) {
        els.error.textContent = message;
        clearTimeout(showError.timer);
        showError.timer = setTimeout(() => (els.error.textContent = ''), 2500);
    }

    async function post(path, body) {
        const res = await fetch('/api/rooms/' + code + path, {
            method: 'POST',
            headers: body ? {'Content-Type': 'application/json'} : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const payload = await res.json().catch(() => ({error: 'that did not work'}));
            showError(payload.error);
            return null;
        }
        return res.json().catch(() => null);
    }

    // ---- cards -------------------------------------------------------------

    function cardNode(card) {
        const node = document.createElement('div');
        node.className = 'card' + (card.red ? ' card-red' : '') + (card.hidden ? ' card-back' : '');
        node.dataset.key = card.key;
        node.dataset.hidden = card.hidden ? '1' : '0';
        if (!card.hidden) fillCard(node, card);
        return node;
    }

    function fillCard(node, card) {
        node.innerHTML =
            '<span class="card-corner">' + card.rank + card.suit + '</span>' +
            '<span class="card-pip">' + card.suit + '</span>' +
            '<span class="card-corner self-end rotate-180">' + card.rank + card.suit + '</span>';
    }

    /** Deals into [container], animating only the cards it has not shown before. */
    function renderCards(container, cards) {
        const keys = new Set(cards.map((c) => c.key));
        Array.from(container.children).forEach((child) => {
            if (!keys.has(child.dataset.key)) child.remove();
        });

        cards.forEach((card, index) => {
            let node = container.querySelector('[data-key="' + CSS.escape(card.key) + '"]');
            if (!node) {
                node = cardNode(card);
                container.appendChild(node);
                if (!seenCards.has(card.key)) {
                    seenCards.add(card.key);
                    // Off the shoe: up and to the right of the table, spinning down.
                    animate(node, {
                        translateX: [180, 0], translateY: [-220, 0], rotate: [25, 0],
                        opacity: [0, 1], duration: 420, delay: index * 60, ease: 'out(3)',
                    });
                }
                return;
            }
            if (node.dataset.hidden === '1' && !card.hidden) flip(node, card);
        });
    }

    /** The hole card turning over: half a rotation each side of the swap. */
    function flip(node, card) {
        node.dataset.hidden = '0';
        createTimeline()
            .add(node, {rotateY: [0, 90], duration: 170, ease: 'in(2)'})
            .call(() => {
                node.classList.remove('card-back');
                if (card.red) node.classList.add('card-red');
                fillCard(node, card);
            })
            .add(node, {rotateY: [-90, 0], duration: 200, ease: 'out(3)'});
    }

    // ---- seats -------------------------------------------------------------

    function seatNode(seat) {
        const node = document.createElement('div');
        node.className = 'seat';
        node.dataset.seat = String(seat.index);
        node.innerHTML =
            '<div data-hands class="flex items-end gap-2"></div>' +
            '<div data-bet class="badge-bet hidden"></div>' +
            '<div data-name class="max-w-[7rem] truncate text-xs text-chalk/70"></div>';
        els.seats.appendChild(node);
        animate(node, {opacity: [0, 1], translateY: [16, 0], duration: 320, ease: 'out(3)'});
        return node;
    }

    function handNode(container, hand) {
        let node = container.querySelector('[data-hand="' + CSS.escape(hand.id) + '"]');
        if (!node) {
            node = document.createElement('div');
            node.dataset.hand = hand.id;
            node.className = 'flex flex-col items-center gap-1';
            node.innerHTML =
                '<div data-outcome class="h-4 text-[11px] font-bold uppercase tracking-wide"></div>' +
                '<div data-cards class="flex"></div>' +
                '<div data-value class="hand-value"></div>';
            container.appendChild(node);
        }
        return node;
    }

    function renderSeat(seat) {
        let node = els.seats.querySelector('[data-seat="' + seat.index + '"]') || seatNode(seat);
        node.className = 'seat' + (seat.you ? ' seat-you' : '') +
            (seat.hands.some((h) => h.active) ? ' seat-turn' : '') +
            (seat.connected ? '' : ' opacity-50');

        const nameEl = node.querySelector('[data-name]');
        nameEl.textContent = (seat.you ? 'You' : seat.name || '') + (seat.betLocked && !seat.hands.length ? ' ✓' : '');

        const betEl = node.querySelector('[data-bet]');
        const wager = seat.pendingBet || seat.hands.reduce((sum, h) => sum + h.bet, 0);
        betEl.classList.toggle('hidden', wager === 0);
        if (wager !== 0 && betEl.textContent !== '$' + wager) {
            betEl.textContent = '$' + wager;
            animate(betEl, {scale: [0.6, 1], duration: 300, ease: 'out(4)'});
        }

        const hands = node.querySelector('[data-hands]');
        const ids = new Set(seat.hands.map((h) => h.id));
        Array.from(hands.children).forEach((child) => {
            if (!ids.has(child.dataset.hand)) child.remove();
        });

        seat.hands.forEach((hand) => {
            const handEl = handNode(hands, hand);
            handEl.classList.toggle('opacity-60', !hand.active && state.phase === 'PLAYER_TURN' && seat.you);
            renderCards(handEl.querySelector('[data-cards]'), hand.cards);
            const valueEl = handEl.querySelector('[data-value]');
            valueEl.textContent = hand.value + (hand.soft && hand.value <= 21 ? ' soft' : '') + (hand.doubled ? ' ×2' : '');
            valueEl.classList.toggle('bg-chip-red/80', hand.value > 21);
            const outcomeEl = handEl.querySelector('[data-outcome]');
            const label = outcomeLabel(hand.outcome);
            if (label && outcomeEl.textContent !== label) {
                outcomeEl.textContent = label;
                outcomeEl.className = 'h-4 text-[11px] font-bold uppercase tracking-wide ' + outcomeColor(hand.outcome);
                animate(outcomeEl, {opacity: [0, 1], translateY: [6, 0], duration: 300});
            } else if (!label) {
                outcomeEl.textContent = '';
            }
        });
    }

    function outcomeLabel(outcome) {
        return {BLACKJACK: 'blackjack', WIN: 'win', LOSE: 'lose', PUSH: 'push', BUST: 'bust'}[outcome] || '';
    }

    function outcomeColor(outcome) {
        return outcome === 'WIN' || outcome === 'BLACKJACK' ? 'text-gold'
            : outcome === 'PUSH' ? 'text-chalk/70' : 'text-chip-red';
    }

    // ---- controls ----------------------------------------------------------

    function renderControls() {
        const seat = state.seats.find((s) => s.you);
        const betting = state.phase === 'BETTING';
        const yourTurn = state.actions.length > 0;
        const cash = window.Bank.cash;

        els.chips.classList.toggle('hidden', !betting);
        els.betActions.classList.toggle('hidden', !betting);
        els.playActions.classList.toggle('hidden', !yourTurn);
        els.playActions.classList.toggle('flex', yourTurn);

        if (betting && seat) {
            const broke = cash < window.BJ.minBet && seat.pendingBet === 0;
            els.chips.querySelectorAll('[data-chip]').forEach((btn) => {
                const chip = Number(btn.dataset.chip);
                btn.disabled = seat.betLocked || chip > cash;
                btn.classList.toggle('opacity-30', btn.disabled);
            });
            els.deal.disabled = seat.betLocked || (!broke && seat.pendingBet < window.BJ.minBet);
            els.deal.classList.toggle('opacity-40', els.deal.disabled);
            els.deal.textContent = broke ? 'Top up $' + window.BJ.rebuy
                : seat.betLocked ? 'Waiting…' : 'Deal';
            els.deal.dataset.mode = broke ? 'rebuy' : 'deal';
        }

        if (yourTurn) {
            const hand = seat.hands.find((h) => h.active);
            els.playActions.querySelectorAll('[data-action]').forEach((btn) => {
                const action = btn.dataset.action;
                const allowed = state.actions.includes(action) &&
                    (action !== 'DOUBLE' && action !== 'SPLIT' || cash >= (hand ? hand.bet : 0));
                btn.classList.toggle('hidden', !allowed);
            });
        }

        els.phase.textContent = phaseLabel(seat);
    }

    function phaseLabel(seat) {
        switch (state.phase) {
            case 'BETTING':
                return seat && seat.betLocked ? 'Waiting for the table' : 'Place your bet';
            case 'PLAYER_TURN':
                return state.actions.length ? 'Your move' : 'Other players…';
            case 'DEALER_TURN':
                return 'Dealer draws';
            case 'PAYOUT':
                return 'Paying out';
            default:
                return '';
        }
    }

    // ---- render ------------------------------------------------------------

    function render(next) {
        state = next;
        const {won} = window.Bank.apply(code, state);

        const dealerCards = state.dealer.cards;
        renderCards(els.dealer, dealerCards);
        els.dealerScore.textContent = state.dealer.value > 0 ? state.dealer.value : '';

        const occupied = state.seats.filter((s) => s.name !== null);
        const shown = new Set(occupied.map((s) => String(s.index)));
        Array.from(els.seats.children).forEach((child) => {
            if (!shown.has(child.dataset.seat)) child.remove();
        });
        occupied.forEach(renderSeat);

        renderControls();
        paintCash(won > 0);
        pruneSeenCards();

        deadlineAt = state.deadlineIn === null ? null : Date.now() + state.deadlineIn;

        let settled = false;
        if (state.settleId && state.settleId !== lastSettle) {
            lastSettle = state.settleId;
            settled = true;
            const seat = state.seats.find((s) => s.you);
            const staked = seat ? seat.hands.reduce((sum, h) => sum + h.bet, 0) : 0;
            const net = (seat ? seat.returned : 0) - staked;
            if (seat && seat.hands.length) banner(net > 0 ? '+$' + net : net < 0 ? '-$' + Math.abs(net) : 'Push');
        }
        // `message` stays set for the rest of the round, so only announce it once —
        // and never over the top of the player's own result.
        if (state.message && state.message !== lastMessage) {
            lastMessage = state.message;
            if (!settled) banner(state.message, true);
        } else if (!state.message) {
            lastMessage = null;
        }
    }

    /** The set exists to know what has been animated; last round's keys never will
     *  be again, and left alone it grows for as long as the tab is open. */
    function pruneSeenCards() {
        const live = new Set(state.dealer.cards.map((c) => c.key));
        state.seats.forEach((seat) => seat.hands.forEach((hand) => hand.cards.forEach((c) => live.add(c.key))));
        seenCards.forEach((key) => {
            if (!live.has(key)) seenCards.delete(key);
        });
    }

    let bannerTimer = null;

    function banner(text, quiet) {
        els.banner.textContent = text;
        els.banner.classList.toggle('text-chalk', !!quiet);
        els.banner.classList.toggle('text-gold', !quiet);
        clearTimeout(bannerTimer);
        animate(els.banner, {opacity: [0, 1], scale: [0.7, 1], duration: 340, ease: 'out(4)'});
        bannerTimer = setTimeout(() => animate(els.banner, {opacity: 0, duration: 300}), 1800);
    }

    // ---- clock -------------------------------------------------------------

    setInterval(() => {
        if (!deadlineAt) {
            els.clock.textContent = '';
            return;
        }
        const left = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
        els.clock.textContent = left > 0 ? left + 's' : '';
    }, 250);

    // ---- wiring ------------------------------------------------------------

    els.chips.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-chip]');
        if (!btn || btn.disabled) return;
        animate(btn, {scale: [1, 0.9, 1], duration: 220});
        post('/bet', {amount: Number(btn.dataset.chip)});
    });

    els.clear.addEventListener('click', () => post('/bet/clear'));

    els.deal.addEventListener('click', () => {
        if (els.deal.dataset.mode === 'rebuy') {
            window.Bank.rebuyIfBroke();
            paintCash(true);
            renderControls();
            return;
        }
        post('/deal');
    });

    els.playActions.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        post('/action', {action: btn.dataset.action});
    });

    els.share.addEventListener('click', async () => {
        const url = location.origin + '/t/' + code;
        if (navigator.share) {
            try {
                await navigator.share({title: 'Blackjack', text: 'Table ' + code, url});
                return;
            } catch (e) {
                /* dismissed — fall through to the clipboard */
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            banner('Link copied');
        } catch (e) {
            banner(url, true);
        }
    });

    // `pagehide` also fires when the page goes into the back/forward cache — an app
    // switch or a screen lock. Leaving the table there would free the seat and wipe
    // the hand of somebody who only pocketed their phone.
    window.addEventListener('pagehide', (event) => {
        if (event.persisted) return;
        navigator.sendBeacon('/api/rooms/' + code + '/leave');
        window.Bank.forget(code);
    });

    window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return;
        post('/join').then((result) => (result === null ? (location.href = '/') : connect()));
    });

    // ---- stream ------------------------------------------------------------

    let stream = null;

    function connect() {
        if (stream) stream.close();
        stream = new EventSource('/api/rooms/' + code + '/events');
        stream.addEventListener('state', (event) => render(JSON.parse(event.data)));
        stream.addEventListener('error', () => {
            // EventSource retries on its own; a table that has been dropped answers
            // 404 and lands the player back in the lobby.
            fetch('/api/rooms/' + code + '/state').then((res) => {
                if (res.status === 404) location.href = '/';
            });
        });
    }

    post('/join').then((result) => {
        if (result === null) {
            location.href = '/';
            return;
        }
        connect();
    });

    paintCash(false);
    animate(els.seats, {opacity: [0, 1], duration: 400});
})();
