package de.mw.blackjack.models

import kotlinx.serialization.Serializable

/**
 * What the browser receives. One whole table state per change — the client diffs
 * against the previous snapshot by card [CardView.key] to decide what to animate,
 * so nothing here is a delta.
 */
@Serializable
data class CardView(
    /** Unique per dealt card, not per rank — two kings must not animate as one. */
    val key: String,
    val rank: String,
    val suit: String,
    val red: Boolean,
    val hidden: Boolean = false,
)

@Serializable
data class HandView(
    val id: String,
    val cards: List<CardView>,
    val value: Int,
    val soft: Boolean,
    val bet: Int,
    val doubled: Boolean,
    val active: Boolean,
    val outcome: String? = null,
    val returned: Int? = null,
)

@Serializable
data class SeatView(
    val index: Int,
    val name: String? = null,
    val you: Boolean = false,
    val connected: Boolean = true,
    val pendingBet: Int = 0,
    val betLocked: Boolean = false,
    val stake: Int = 0,
    val returned: Int = 0,
    val hands: List<HandView> = emptyList(),
)

@Serializable
data class DealerView(
    val cards: List<CardView>,
    val value: Int,
    val soft: Boolean,
    val blackjack: Boolean = false,
)

@Serializable
data class TableState(
    val code: String,
    val solo: Boolean,
    val phase: String,
    val roundId: Int,
    /** Equals [roundId] while payouts are on the table, 0 otherwise. */
    val settleId: Int,
    /** Milliseconds left on the current phase, or null when nothing is on a clock. */
    val deadlineIn: Long? = null,
    val dealer: DealerView,
    val seats: List<SeatView>,
    val yourSeat: Int? = null,
    val actions: List<String> = emptyList(),
    val shoePct: Int = 100,
    val message: String? = null,
    val version: Long = 0,
)
