package de.mw.blackjack.models

/**
 * Table rules and pacing. Everything tunable lives here — nothing else in the code
 * spells out a bet size, a payout or a timeout.
 */
object Rules {
    /** Shoe size and when it is replaced (cut card at 75% penetration). */
    const val DECKS = 6
    const val RESHUFFLE_AT = 0.25

    /** Stand on all 17s, soft included. Flip to true for the H17 variant. */
    const val DEALER_HITS_SOFT_17 = false

    const val BLACKJACK_PAYS_NUMERATOR = 3
    const val BLACKJACK_PAYS_DENOMINATOR = 2

    const val MIN_BET = 5
    const val MAX_BET = 500
    val CHIPS = listOf(5, 25, 100, 500)

    /** Bankroll a fresh browser starts with, and the top-up when it is broke. */
    const val STARTING_CASH = 500
    const val REBUY = 200

    /** One split per hand, so at most two hands per seat. Split aces draw one card. */
    const val MAX_HANDS_PER_SEAT = 2

    const val MAX_SEATS = 5
}

/**
 * Pacing. Multiplayer needs deadlines — one player walking away must not freeze the
 * table. Solo has none: the tick loop only arms a deadline when a room has more than
 * one seated player (see [de.mw.blackjack.game.Room.armDeadline]).
 */
object Pace {
    const val BETTING_SECONDS = 20L
    const val ACTION_SECONDS = 20L

    /** One dealer card per tick, so the client can animate the draw. */
    const val DEALER_DRAW_MILLIS = 800L
    const val PAYOUT_MILLIS = 4500L

    /** Room tick resolution, and how long an empty room is kept before it is dropped. */
    const val TICK_MILLIS = 250L
    const val EMPTY_ROOM_TTL_SECONDS = 120L

    /**
     * How long a table may go untouched before it is reclaimed even though somebody
     * is still nominally sitting at it.
     *
     * Seats are only freed when their player *disconnects*, so a tab left open on a
     * forgotten table holds its seat — and its room — for the life of the process.
     * This is the backstop that keeps a month of those from filling the registry.
     */
    const val ROOM_IDLE_SECONDS = 3 * 60 * 60L

    /** A seat whose player has had no stream and no action this long is freed. */
    const val SEAT_IDLE_SECONDS = 90L

    /**
     * The same, for somebody playing alone: nobody is waiting on them, so the only
     * job here is to hand the table back eventually. Long enough that a locked phone
     * comes back to its own hand.
     */
    const val SOLO_IDLE_SECONDS = 600L
}
