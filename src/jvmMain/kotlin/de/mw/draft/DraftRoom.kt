package de.mw.draft

import de.mw.blackjack.BuildInfo
import kotlinx.serialization.Serializable
import kotlin.random.Random

/**
 * One live Draft Battle between two seats. The server only collects the picks: both
 * seats draft at once, each from offers of its own, and neither sees the other's picks
 * of a round until both are done. The cards, the offers and the battles live in
 * `static/draft/draft-engine.js`, which both phones run on the same seed and picks, so
 * they see the same battle.
 *
 * Every method locks the room; the sweep in [DraftRooms] broadcasts when [version] moves.
 */
class DraftRoom(val code: String, createdAt: Long, private val random: Random = Random.Default) {

    /** `left`: gone mid-match. The seat stays theirs and the clock picks for them. */
    private class Seat(val playerId: String, var name: String, var connected: Boolean = false, var left: Boolean = false)

    private val seats = arrayOfNulls<Seat>(2)
    private var seed = random.nextInt(1, Int.MAX_VALUE)
    private var match = 0
    /** Per round, per seat, the choices made (an index into that pick's offer). */
    private val picks = mutableListOf(newRound())
    private val ready = BooleanArray(2)
    private val rematch = BooleanArray(2)
    /** Per seat, when its current pick became due; null while it owes none. */
    private val due = arrayOfNulls<Long>(2)

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
    private val matchStarted get() = picks.any { r -> r.any { it.isNotEmpty() } }
    private val nobodyHere get() = seats.all { it == null || it.left }

    private fun newRound() = List(2) { mutableListOf<Int>() }
    private fun owes(seat: Int) = picks.last()[seat].size < picksIn(round)
    private val roundDone get() = (0..1).none(::owes)
    private fun seatOf(playerId: String) = seats.indexOfFirst { it?.playerId == playerId }

    private fun touch(now: Long) {
        version++
        lastActivity = now
    }

    /** Starts a seat's pick clock when it owes a pick and both players are there. */
    private fun arm(seat: Int, now: Long) {
        due[seat] = if (bothSeated && owes(seat)) now else null
    }

    private fun armBoth(now: Long) = (0..1).forEach { arm(it, now) }

    @Synchronized
    fun join(playerId: String, name: String, now: Long): Int? {
        // A returning player gets their own seat back, with the clocks where they were.
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
        (0..1).forEach { if (due[it] == null) arm(it, now) }
        touch(now)
        return free
    }

    /**
     * Before the first pick the seat is simply freed. Once a match is under way it stays
     * the player's, so they can come back to their own army, and the clock keeps picking
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
            due.fill(null)
        }
        ready[seat] = false
        rematch[seat] = false
        if (nobodyHere) emptySince = now
        advance(now)
        touch(now)
    }

    @Synchronized
    fun setConnected(playerId: String, connected: Boolean) {
        val seat = seatOf(playerId)
        if (seat < 0 || seats[seat]!!.connected == connected) return
        seats[seat]!!.connected = connected
        version++
    }

    /** Keeps card [choice] of the offer at [pick] of [round]; null when that was allowed. */
    @Synchronized
    fun pick(playerId: String, round: Int, pick: Int, choice: Int, now: Long): String? {
        val seat = seatOf(playerId)
        if (seat < 0) return "you are not in this room"
        if (!bothSeated) return "waiting for an opponent"
        if (round != this.round || pick != picks.last()[seat].size || !owes(seat)) return "that pick is over"
        if (choice !in 0 until OFFER) return "pick one of the cards on offer"
        picks.last()[seat].add(choice)
        arm(seat, now)
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
        if (round != this.round || !roundDone) return "that round is not over"
        if (round + 1 >= MAX_ROUNDS) return "the match is over"
        ready[seat] = true
        advance(now)
        touch(now)
        return null
    }

    /**
     * Starts the next round once every seat is ready. A seat that left counts as ready:
     * the clock drafts for it, so the player still here can play the match out.
     */
    private fun advance(now: Long) {
        if (!roundDone || round + 1 >= MAX_ROUNDS || ready.none { it }) return
        if ((0..1).all { ready[it] || seats[it]?.left == true }) {
            picks.add(newRound())
            ready.fill(false)
            armBoth(now)
        }
    }

    /** Ready for a new match after match [match]; it starts, on a new seed, once both are. */
    @Synchronized
    fun rematch(playerId: String, match: Int, now: Long): String? {
        val seat = seatOf(playerId)
        if (seat < 0) return "you are not in this room"
        if (match != this.match || !roundDone) return "that match is not over"
        rematch[seat] = true
        if (rematch.all { it }) {
            this.match++
            seed = random.nextInt(1, Int.MAX_VALUE)
            picks.clear()
            picks.add(newRound())
            ready.fill(false)
            rematch.fill(false)
            armBoth(now)
        }
        touch(now)
        return null
    }

    /** A pick left too long is made for its player: the first card on offer. */
    @Synchronized
    fun tick(now: Long) {
        for (seat in 0..1) {
            val since = due[seat] ?: continue
            if (now - since < TURN_MILLIS) continue
            picks.last()[seat].add(0)
            arm(seat, now)
            version++
        }
    }

    /**
     * The room as [playerId] may see it: the rival's picks of a round still being drafted
     * show as -1, so a phone knows how far they are but not what they took.
     */
    @Synchronized
    fun snapshot(playerId: String, now: Long): DraftState {
        val you = seatOf(playerId)
        val sealed = roundDone
        return DraftState(
            code = code,
            you = you,
            seats = seats.map { it?.let { s -> DraftSeatView(s.name, s.connected, s.left) } },
            seed = seed,
            match = match,
            picks = picks.mapIndexed { r, both ->
                both.mapIndexed { seat, choices ->
                    if (r < round || sealed || seat == you) choices.toList() else choices.map { -1 }
                }
            },
            ready = ready.toList(),
            rematch = rematch.toList(),
            turnLeftMs = due.getOrNull(you)?.let { (TURN_MILLIS - (now - it)).coerceAtLeast(0) },
            turnMs = TURN_MILLIS,
            build = BuildInfo.id,
        )
    }

    /** Nobody sitting here, or only players who left mid-match. */
    val isEmpty: Boolean @Synchronized get() = nobodyHere

    @Synchronized
    fun playerIds(): List<String> = seats.mapNotNull { it?.playerId }

    companion object {
        /** Mirrors draft-engine.js; check:draft holds the two equal. */
        const val OFFER = 3
        const val FIRST_PICKS = 3
        const val PICKS = 2
        const val MAX_ROUNDS = 15
        const val TURN_MILLIS = 20_000L

        /** Picks each seat makes in [round]; draft-engine.js `picksIn` is the same rule. */
        fun picksIn(round: Int) = if (round == 0) FIRST_PICKS else PICKS
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
    /** Per round, per seat, the choices made; -1 for a rival's pick not shown yet. */
    val picks: List<List<List<Int>>>,
    val ready: List<Boolean>,
    val rematch: List<Boolean>,
    /** Time left for your own pick when one is due, out of [turnMs]. */
    val turnLeftMs: Long?,
    val turnMs: Long,
    /** The server's build: a phone on another build would fight different battles. */
    val build: String,
)
