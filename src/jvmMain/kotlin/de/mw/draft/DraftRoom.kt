package de.mw.draft

import de.mw.blackjack.BuildInfo
import kotlinx.serialization.Serializable
import kotlin.random.Random

/**
 * One live Draft Battle between two seats. The server only orders the draft: whose
 * turn it is, which of the pair was kept, when both are ready for the next round. The
 * cards, the pools and the battles live in `static/draft/draft-engine.js`, which both
 * phones run on the same seed and picks, so they see the same battle.
 *
 * Every method locks the room; the sweep in [DraftRooms] broadcasts when [version] moves.
 */
class DraftRoom(val code: String, createdAt: Long, private val random: Random = Random.Default) {

    /** `left`: gone mid-match. The seat stays theirs and the clock picks for them. */
    private class Seat(val playerId: String, var name: String, var connected: Boolean = false, var left: Boolean = false)

    private val seats = arrayOfNulls<Seat>(2)
    private var seed = random.nextInt(1, Int.MAX_VALUE)
    private var match = 0
    private val picks = mutableListOf(mutableListOf<Int>())
    private val ready = BooleanArray(2)
    private val rematch = BooleanArray(2)
    /** When the current pick became due; null while no pick is awaited. */
    private var turnSince: Long? = null

    var version = 0L
        private set
    var broadcastVersion = -1L
    var lastActivity = createdAt
        private set
    /** Since when nobody sits here; a room nobody joins is empty from the start. */
    var emptySince: Long? = createdAt
        private set

    private val round get() = picks.size - 1
    private val bothSeated get() = seats.all { it != null }
    private val matchStarted get() = picks.any { it.isNotEmpty() }
    private val nobodyHere get() = seats.all { it == null || it.left }

    private fun seatOf(playerId: String) = seats.indexOfFirst { it?.playerId == playerId }

    private fun touch(now: Long) {
        version++
        lastActivity = now
    }

    /** Arms the pick clock when a pick is due and both players are there to make it. */
    private fun arm(now: Long) {
        turnSince = if (bothSeated && picks.last().size < TURNS) now else null
    }

    @Synchronized
    fun join(playerId: String, name: String, now: Long): Int? {
        // A returning player gets their own seat back, with the clock where it was.
        val mine = seatOf(playerId)
        if (mine >= 0) {
            seats[mine]!!.name = name
            seats[mine]!!.left = false
            emptySince = null
            touch(now)
            return mine
        }
        val free = seats.indexOfFirst { it == null }
        if (free < 0) return null
        seats[free] = Seat(playerId, name)
        emptySince = null
        if (turnSince == null) arm(now)
        touch(now)
        return free
    }

    /**
     * Before the first pick the seat is simply freed. Once a match is under way it stays
     * the player's, so they can come back to their own hand, and the clock keeps picking
     * for them so the other player can finish.
     */
    @Synchronized
    fun leave(playerId: String, now: Long) {
        val seat = seatOf(playerId)
        if (seat < 0) return
        if (matchStarted) {
            seats[seat]!!.left = true
            seats[seat]!!.connected = false
        } else {
            seats[seat] = null
            turnSince = null
        }
        ready[seat] = false
        rematch[seat] = false
        if (nobodyHere) emptySince = now
        touch(now)
    }

    @Synchronized
    fun setConnected(playerId: String, connected: Boolean) {
        val seat = seatOf(playerId)
        if (seat < 0 || seats[seat]!!.connected == connected) return
        seats[seat]!!.connected = connected
        version++
    }

    /** Keeps card `choice` (0 or 1) of the pair on offer; null when that was allowed. */
    @Synchronized
    fun pick(playerId: String, round: Int, turn: Int, choice: Int, now: Long): String? {
        val seat = seatOf(playerId)
        if (seat < 0) return "you are not in this room"
        if (!bothSeated) return "waiting for an opponent"
        if (round != this.round || turn != picks.last().size || turn >= TURNS) return "that pick is over"
        if (picker(round, turn) != seat) return "it is not your turn"
        if (choice !in 0..1) return "pick one of the two cards"
        picks.last().add(choice)
        arm(now)
        touch(now)
        return null
    }

    /**
     * Ready for the round after [round]; it starts once both are. Whether the match is
     * already decided only the phones know (they fight the battles), so a phone that is
     * done asks for a rematch instead; a stray "next" needs the other player too.
     */
    @Synchronized
    fun next(playerId: String, round: Int, now: Long): String? {
        val seat = seatOf(playerId)
        if (seat < 0) return "you are not in this room"
        if (round != this.round || picks.last().size < TURNS) return "that round is not over"
        if (round + 1 >= MAX_ROUNDS) return "the match is over"
        ready[seat] = true
        if (ready.all { it }) {
            picks.add(mutableListOf())
            ready.fill(false)
            arm(now)
        }
        touch(now)
        return null
    }

    /** Ready for a new match after match [match]; it starts, on a new seed, once both are. */
    @Synchronized
    fun rematch(playerId: String, match: Int, now: Long): String? {
        val seat = seatOf(playerId)
        if (seat < 0) return "you are not in this room"
        if (match != this.match || picks.last().size < TURNS) return "that match is not over"
        rematch[seat] = true
        if (rematch.all { it }) {
            this.match++
            seed = random.nextInt(1, Int.MAX_VALUE)
            picks.clear()
            picks.add(mutableListOf())
            ready.fill(false)
            rematch.fill(false)
            arm(now)
        }
        touch(now)
        return null
    }

    /** A pick left too long is made for its player: the first card of the pair. */
    @Synchronized
    fun tick(now: Long) {
        val since = turnSince ?: return
        if (now - since < TURN_MILLIS) return
        picks.last().add(0)
        arm(now)
        version++
    }

    @Synchronized
    fun snapshot(playerId: String, now: Long): DraftState = DraftState(
        code = code,
        you = seatOf(playerId),
        seats = seats.map { it?.let { s -> DraftSeatView(s.name, s.connected, s.left) } },
        seed = seed,
        match = match,
        picks = picks.map { it.toList() },
        ready = ready.toList(),
        rematch = rematch.toList(),
        turnLeftMs = turnSince?.let { (TURN_MILLIS - (now - it)).coerceAtLeast(0) },
        turnMs = TURN_MILLIS,
        build = BuildInfo.id,
    )

    /** Nobody sitting here, or only players who left mid-match. */
    val isEmpty: Boolean @Synchronized get() = nobodyHere

    @Synchronized
    fun playerIds(): List<String> = seats.mapNotNull { it?.playerId }

    companion object {
        /** Mirrors draft-engine.js: POOL / 2 turns a round, up to MAX_ROUNDS rounds. */
        const val TURNS = 5
        const val MAX_ROUNDS = 5
        const val TURN_MILLIS = 20_000L

        /** Who keeps a card on [turn] of [round]; draft-engine.js `picker` is the same rule. */
        fun picker(round: Int, turn: Int) = (turn + round) % 2
    }
}

@Serializable
data class DraftSeatView(val name: String, val connected: Boolean, val left: Boolean)

@Serializable
data class DraftState(
    val code: String,
    /** The asking player's seat, or -1 for somebody watching. */
    val you: Int,
    val seats: List<DraftSeatView?>,
    val seed: Int,
    val match: Int,
    /** Per round, the card kept on each turn (0 or 1 of the pair). */
    val picks: List<List<Int>>,
    val ready: List<Boolean>,
    val rematch: List<Boolean>,
    /** Time left for the pick that is due, when one is, out of [turnMs]. */
    val turnLeftMs: Long?,
    val turnMs: Long,
    /** The server's build: a phone on another build would fight different battles. */
    val build: String,
)
