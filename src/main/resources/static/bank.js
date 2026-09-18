/**
 * The bankroll. There is no database and no server-side wallet: cash lives in this
 * browser, and the server only ever hears a bet size.
 *
 * Reconciliation is stake-based. Every table state carries what the seat currently
 * has on the felt (`stake`) and, once the round is settled, what came back
 * (`returned`). The ledger remembers how much of this round's stake has already been
 * taken out of the bankroll, so a reload mid-round cannot charge for it twice.
 */
(function () {
    const CASH_KEY = 'bj.cash';

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* private mode — the session still plays, it just forgets. */
        }
    }

    const Bank = {
        get cash() {
            const value = read(CASH_KEY, null);
            if (typeof value !== 'number' || !isFinite(value) || value < 0) {
                write(CASH_KEY, window.BJ.startingCash);
                return window.BJ.startingCash;
            }
            return value;
        },

        set cash(value) {
            write(CASH_KEY, Math.max(0, Math.round(value)));
        },

        reset() {
            this.cash = window.BJ.startingCash;
            return this.cash;
        },

        /** Broke players get a top-up rather than a dead end. */
        rebuyIfBroke() {
            if (this.cash < window.BJ.minBet) {
                this.cash = this.cash + window.BJ.rebuy;
                return true;
            }
            return false;
        },

        ledgerKey(code) {
            return 'bj.ledger.' + code;
        },

        /**
         * One ledger is written per table played. `forget` clears the current one on a
         * clean exit, but a crashed tab, a killed browser or a phone that never came
         * back leaves it behind — so over months this is one dead key per table ever
         * visited. Anything older than a day cannot belong to a live round.
         */
        pruneLedgers(keep) {
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            try {
                Object.keys(localStorage)
                    .filter((key) => key.startsWith('bj.ledger.') && key !== this.ledgerKey(keep))
                    .forEach((key) => {
                        const ledger = read(key, null);
                        if (!ledger || typeof ledger.at !== 'number' || ledger.at < cutoff) {
                            localStorage.removeItem(key);
                        }
                    });
            } catch (e) {
                /* private mode, or storage disabled — nothing to prune either way. */
            }
        },

        /**
         * Folds one table state into the bankroll. Returns what changed, so the table
         * can animate a win without re-deriving it.
         */
        apply(code, state) {
            const seat = (state.seats || []).find((s) => s.you);
            const key = this.ledgerKey(code);
            const ledger = read(key, {round: 0, charged: 0, settled: 0, at: Date.now()});
            ledger.at = Date.now();
            let staked = 0;
            let won = 0;

            if (!seat) {
                write(key, ledger);
                return {staked, won};
            }

            if (ledger.round !== state.roundId) {
                ledger.round = state.roundId;
                ledger.charged = 0;
            }

            if (seat.stake > ledger.charged) {
                staked = seat.stake - ledger.charged;
                this.cash = this.cash - staked;
                ledger.charged = seat.stake;
            } else if (seat.stake < ledger.charged) {
                // Only happens while betting is open — a cleared bet comes back.
                this.cash = this.cash + (ledger.charged - seat.stake);
                ledger.charged = seat.stake;
            }

            if (state.settleId && state.settleId !== ledger.settled) {
                ledger.settled = state.settleId;
                won = seat.returned || 0;
                if (won > 0) this.cash = this.cash + won;
            }

            write(key, ledger);
            return {staked, won};
        },

        /** Dropped when leaving a table, so old codes cannot pile up in storage. */
        forget(code) {
            try {
                localStorage.removeItem(this.ledgerKey(code));
            } catch (e) {
                /* ignore */
            }
        },
    };

    window.Bank = Bank;
})();
