package de.mw.blackjack.game

import de.mw.blackjack.models.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicLong

enum class Phase { BETTING, PLAYER_TURN, DEALER_TURN, PAYOUT }

enum class Action { HIT, STAND, DOUBLE, SPLIT }

class PlayerHand(
    val id: String,
    val cards: MutableList<Card> = mutableListOf(),
    var bet: Int = 0,
    var doubled: Boolean = false,
    var fromSplit: Boolean = false,
    var splitAces: Boolean = false,
    var done: Boolean = false,
    var outcome: Outcome? = null,
    var returned: Int? = null,
)

class Seat(val index: Int) {
    var playerId: String? = null
    var name: String? = null
    var lastSeen: Long = System.currentTimeMillis()
    var connected: Boolean = false

    var pendingBet: Int = 0
    var betLocked: Boolean = false
    var hands: MutableList<PlayerHand> = mutableListOf()

    /** Gross amount handed back at the last settlement, bets included. Sticky — see
     *  [Room.settledRound]; it is replaced at the next one, never cleared. */
    var returned: Int = 0

    val occupied: Boolean get() = playerId != null
    val stake: Int get() = pendingBet + hands.sumOf { it.bet }

    fun clearRound() {
        hands = mutableListOf()
        pendingBet = 0
        betLocked = false
    }

    fun free() {
        playerId = null
        name = null
        connected = false
        clearRound()
    }
}

/**
 * One table. Every mutation goes through [mutex] and bumps [version]; nothing outside
 * this class touches the state, so the whole game is one lock wide.
 *
 * Solo tables (one seated player) run without deadlines — a phone in a pocket should
 * not lose a hand. As soon as a second player sits down the clocks arm themselves.
 */
class Room(val code: String, private val shoe: Shoe = Shoe()) {

    private val mutex = Mutex()
    private val versionCounter = AtomicLong()

    val seats: List<Seat> = (0 until Rules.MAX_SEATS).map { Seat(it) }

    private var phase = Phase.BETTING
    private var roundId = 1

    /**
     * The round whose payouts are on the seats — kept past the payout phase on
     * purpose. The browser holds the bankroll and credits a win when this changes, so
     * a client that misses the four seconds of PAYOUT (a reconnect, a locked screen)
     * still finds the result waiting on the next frame it sees.
     */
    private var settledRound = 0
    private var deadline: Long? = null
    private var turnSeat = 0
    private var turnHand = 0
    private var message: String? = null
    private var dealer: MutableList<Card> = mutableListOf()
    private var holeHidden = true
    private var cardSeq = 0

    /** Last moment the room had anybody in it; the registry drops it after a TTL. */
    var emptySince: Long? = System.currentTimeMillis()
        private set

    val version: Long get() = versionCounter.get()

    /**
     * The last time a player did something here — bet, acted, joined or reconnected.
     * [Seat.lastSeen] is updated at every one of those, so this needs no field of its
     * own to fall out of date. An empty table falls back to [emptySince].
     */
    val lastPlayerActivity: Long
        get() = seats.filter { it.occupied }.maxOfOrNull { it.lastSeen }
            ?: emptySince
            ?: System.currentTimeMillis()

    // ---- entry points ------------------------------------------------------

    /** Seats a player, or returns their existing seat. Null when the table is full. */
    suspend fun join(playerId: String, name: String): Int? = change {
        seats.firstOrNull { it.playerId == playerId }?.let { seat ->
            seat.name = name
            seat.lastSeen = System.currentTimeMillis()
            return@change seat.index
        }
        val seat = seats.firstOrNull { !it.occupied } ?: return@change null
        seat.playerId = playerId
        seat.name = name
        seat.lastSeen = System.currentTimeMillis()
        emptySince = null
        // A table that was solo had no clock; the second player starts it.
        reconcileClock()
        seat.index
    }

    suspend fun leave(playerId: String) = change {
        seats.firstOrNull { it.playerId == playerId }?.let { seat ->
            // Mid-round the seat keeps playing itself out: its hands are already in
            // the shoe's history and the turn order walks past them.
            val wasTurn = phase == Phase.PLAYER_TURN && turnSeat == seat.index
            seat.hands.forEach { it.done = true }
            seat.free()
            // Only when the leaver held the turn — otherwise this skips the hand of
            // whoever is actually acting.
            if (wasTurn) advanceTurn()
            reconcileClock()
            maybeStartRound()
        }
        touchEmpty()
    }

    suspend fun setConnected(playerId: String, connected: Boolean) = change {
        seats.firstOrNull { it.playerId == playerId }?.let {
            it.connected = connected
            it.lastSeen = System.currentTimeMillis()
        }
        touchEmpty()
    }

    suspend fun placeBet(playerId: String, amount: Int): String? = change {
        val seat = seatOf(playerId) ?: return@change "not seated"
        if (phase != Phase.BETTING) return@change "betting is closed"
        if (seat.betLocked) return@change "bet is already in"
        val next = (seat.pendingBet + amount).coerceAtLeast(0)
        if (next > Rules.MAX_BET) return@change "table maximum is ${Rules.MAX_BET}"
        seat.pendingBet = next
        seat.lastSeen = System.currentTimeMillis()
        null
    }

    suspend fun clearBet(playerId: String): String? = change {
        val seat = seatOf(playerId) ?: return@change "not seated"
        if (phase != Phase.BETTING || seat.betLocked) return@change "betting is closed"
        seat.pendingBet = 0
        null
    }

    /** Locks the bet in. The round starts once every seated player has. */
    suspend fun lockBet(playerId: String): String? = change {
        val seat = seatOf(playerId) ?: return@change "not seated"
        if (phase != Phase.BETTING) return@change "betting is closed"
        if (seat.pendingBet < Rules.MIN_BET) return@change "minimum bet is ${Rules.MIN_BET}"
        seat.betLocked = true
        seat.lastSeen = System.currentTimeMillis()
        maybeStartRound()
        null
    }

    suspend fun act(playerId: String, action: Action): String? = change {
        val seat = seatOf(playerId) ?: return@change "not seated"
        if (phase != Phase.PLAYER_TURN) return@change "not your turn"
        if (seats[turnSeat].playerId != playerId) return@change "not your turn"
        val hand = seat.hands.getOrNull(turnHand) ?: return@change "no hand"
        seat.lastSeen = System.currentTimeMillis()
        when (action) {
            Action.HIT -> {
                hand.cards += shoe.draw()
                if (score(hand.cards).value >= 21) {
                    hand.done = true
                    advanceTurn()
                } else {
                    armDeadline(Pace.ACTION_SECONDS * 1000)
                }
            }

            Action.STAND -> {
                hand.done = true
                advanceTurn()
            }

            Action.DOUBLE -> {
                if (!canDouble(hand.cards, hand.splitAces)) return@change "cannot double here"
                hand.bet *= 2
                hand.doubled = true
                hand.cards += shoe.draw()
                hand.done = true
                advanceTurn()
            }

            Action.SPLIT -> {
                if (!canSplit(hand.cards, seat.hands.size)) return@change "cannot split here"
                val second = PlayerHand(
                    id = "h${roundId}-${seat.index}-${seat.hands.size}",
                    bet = hand.bet,
                    fromSplit = true,
                )
                val aces = hand.cards[0].rank == Rank.ACE
                second.cards += hand.cards.removeAt(1)
                hand.fromSplit = true
                hand.splitAces = aces
                second.splitAces = aces
                hand.cards += shoe.draw()
                second.cards += shoe.draw()
                seat.hands.add(turnHand + 1, second)
                if (aces) {
                    // Split aces draw one card each and stand — the house rule that
                    // stops two hands of 21 on a natural.
                    hand.done = true
                    second.done = true
                    advanceTurn()
                } else {
                    armDeadline(Pace.ACTION_SECONDS * 1000)
                }
            }
        }
        null
    }

    /** Called by the registry loop; advances whatever the clock is holding. */
    suspend fun tick(now: Long) = change {
        freeIdleSeats(now)
        val due = deadline ?: return@change
        if (now < due) return@change
        when (phase) {
            Phase.BETTING -> {
                if (seats.any { it.occupied && it.pendingBet >= Rules.MIN_BET }) startRound()
                else armDeadline(Pace.BETTING_SECONDS * 1000)
            }

            Phase.PLAYER_TURN -> {
                // Time out as a stand — never as a fold, which would cost the bet.
                seats[turnSeat].hands.getOrNull(turnHand)?.done = true
                message = "${seats[turnSeat].name ?: "Seat ${turnSeat + 1}"} timed out"
                advanceTurn()
            }

            Phase.DEALER_TURN -> dealerStep()
            Phase.PAYOUT -> newRound()
        }
    }

    suspend fun snapshot(playerId: String?): TableState = mutex.withLock { render(playerId) }

    val isEmpty: Boolean get() = seats.none { it.occupied }

    // ---- round machinery ---------------------------------------------------

    private fun startRound() {
        if (shoe.needsShuffle) {
            shoe.shuffle()
            message = "New shoe"
        }
        dealer = mutableListOf()
        holeHidden = true
        val players = seats.filter { it.occupied && it.pendingBet >= Rules.MIN_BET }
        if (players.isEmpty()) {
            armDeadline(Pace.BETTING_SECONDS * 1000)
            return
        }
        players.forEach { seat ->
            seat.hands = mutableListOf(PlayerHand(id = "h$roundId-${seat.index}-0", bet = seat.pendingBet))
            seat.pendingBet = 0
        }
        // Dealt the way a table deals: one card around, then the dealer's up card,
        // then the second card around, then the hole card.
        repeat(2) {
            players.forEach { seat -> seat.hands[0].cards += shoe.draw() }
            dealer += shoe.draw()
        }
        phase = Phase.PLAYER_TURN
        turnSeat = 0
        turnHand = 0

        if (isBlackjack(dealer)) {
            // Dealer peek: nobody acts against a natural.
            players.forEach { seat -> seat.hands.forEach { it.done = true } }
            holeHidden = false
            settleRound()
            return
        }
        // A table of naturals has nothing to act on either.
        players.forEach { seat -> seat.hands.forEach { if (isBlackjack(it.cards)) it.done = true } }
        advanceTurn(fresh = true)
    }

    /**
     * The table is waiting on nobody — deal. Checked wherever the set of seated
     * players changes, not just on the lock that happens to be last: a player leaving
     * mid-bet used to leave everybody else sitting out the rest of the clock.
     */
    private fun maybeStartRound() {
        if (phase != Phase.BETTING) return
        val seated = seats.filter { it.occupied }
        if (seated.isNotEmpty() && seated.all { it.betLocked }) startRound()
    }

    private fun advanceTurn(fresh: Boolean = false) {
        if (!fresh) {
            // Stay on the same seat while it has another hand (after a split).
            turnHand++
        }
        while (turnSeat < seats.size) {
            val seat = seats[turnSeat]
            while (turnHand < seat.hands.size) {
                if (!seat.hands[turnHand].done) {
                    armDeadline(Pace.ACTION_SECONDS * 1000)
                    return
                }
                turnHand++
            }
            turnSeat++
            turnHand = 0
        }
        startDealerTurn()
    }

    private fun startDealerTurn() {
        phase = Phase.DEALER_TURN
        holeHidden = false
        deadline = System.currentTimeMillis() + Pace.DEALER_DRAW_MILLIS
    }

    private fun dealerStep() {
        val live = seats.any { seat -> seat.hands.any { !score(it.cards).bust } }
        if (live && dealerMustHit(dealer)) {
            dealer += shoe.draw()
            deadline = System.currentTimeMillis() + Pace.DEALER_DRAW_MILLIS
            return
        }
        settleRound()
    }

    private fun settleRound() {
        seats.filter { it.hands.isNotEmpty() }.forEach { seat ->
            var back = 0
            seat.hands.forEach { hand ->
                val outcome = settle(hand.cards, dealer, hand.fromSplit)
                hand.outcome = outcome
                hand.returned = returned(hand.bet, outcome)
                back += hand.returned ?: 0
            }
            seat.returned = back
        }
        phase = Phase.PAYOUT
        settledRound = roundId
        holeHidden = false
        deadline = System.currentTimeMillis() + Pace.PAYOUT_MILLIS
    }

    private fun newRound() {
        roundId++
        dealer = mutableListOf()
        holeHidden = true
        message = null
        seats.forEach { it.clearRound() }
        phase = Phase.BETTING
        armDeadline(Pace.BETTING_SECONDS * 1000)
    }

    /**
     * Clocks exist to stop one player stalling the others, so a table with a single
     * player has none. The clock re-arms itself the moment a second seat fills.
     */
    private fun armDeadline(millis: Long) {
        deadline = if (seats.count { it.occupied } > 1) System.currentTimeMillis() + millis else null
    }

    /**
     * Frees seats whose player is gone. A solo player gets a far longer rope than one
     * holding up a table — nobody is waiting on them, and their phone locking is not
     * a reason to take their hand away.
     */
    private fun freeIdleSeats(now: Long) {
        val solo = seats.count { it.occupied } <= 1
        val graceMillis = (if (solo) Pace.SOLO_IDLE_SECONDS else Pace.SEAT_IDLE_SECONDS) * 1000
        var freed = false
        seats.filter { it.occupied && !it.connected }.forEach { seat ->
            if (now - seat.lastSeen > graceMillis) {
                val wasTurn = phase == Phase.PLAYER_TURN && turnSeat == seat.index
                seat.hands.forEach { it.done = true }
                seat.free()
                if (wasTurn) advanceTurn()
                freed = true
            }
        }
        if (freed) {
            reconcileClock()
            maybeStartRound()
        }
        touchEmpty()
    }

    /**
     * Re-reads the clock after the table's size changed. A table that has just become
     * solo must lose its deadline, or the player left behind is auto-stood while
     * their phone is in a pocket; one that has just gained a second player needs one.
     */
    private fun reconcileClock() {
        if (phase != Phase.BETTING && phase != Phase.PLAYER_TURN) return
        val multi = seats.count { it.occupied } > 1
        if (!multi) deadline = null
        else if (deadline == null) {
            armDeadline(if (phase == Phase.BETTING) Pace.BETTING_SECONDS * 1000 else Pace.ACTION_SECONDS * 1000)
        }
    }

    private fun touchEmpty() {
        emptySince = if (isEmpty) (emptySince ?: System.currentTimeMillis()) else null
    }

    private fun seatOf(playerId: String): Seat? = seats.firstOrNull { it.playerId == playerId }

    // ---- rendering ---------------------------------------------------------

    private fun cardView(card: Card, hidden: Boolean, key: String) = CardView(
        key = key,
        rank = if (hidden) "" else card.rank.label,
        suit = if (hidden) "" else card.suit.symbol,
        red = !hidden && card.suit.red,
        hidden = hidden,
    )

    private fun render(playerId: String?): TableState {
        val visibleDealer = dealer.mapIndexed { i, card ->
            cardView(card, hidden = holeHidden && i == 1, key = "d$roundId-$i")
        }
        val dealerCards = if (holeHidden) dealer.filterIndexed { i, _ -> i != 1 } else dealer
        val dealerScore = score(dealerCards)

        val seatViews = seats.map { seat ->
            SeatView(
                index = seat.index,
                name = seat.name,
                you = playerId != null && seat.playerId == playerId,
                connected = seat.connected,
                pendingBet = seat.pendingBet,
                betLocked = seat.betLocked,
                stake = seat.stake,
                returned = seat.returned,
                hands = seat.hands.mapIndexed { hi, hand ->
                    val s = score(hand.cards)
                    HandView(
                        id = hand.id,
                        cards = hand.cards.mapIndexed { ci, c -> cardView(c, false, "${hand.id}-$ci") },
                        value = s.value,
                        soft = s.soft,
                        bet = hand.bet,
                        doubled = hand.doubled,
                        active = phase == Phase.PLAYER_TURN && turnSeat == seat.index && turnHand == hi,
                        outcome = hand.outcome?.name,
                        returned = hand.returned,
                    )
                },
            )
        }

        val you = playerId?.let { pid -> seats.firstOrNull { it.playerId == pid } }
        return TableState(
            code = code,
            solo = seats.count { it.occupied } <= 1,
            phase = phase.name,
            roundId = roundId,
            settleId = settledRound,
            deadlineIn = deadline?.let { (it - System.currentTimeMillis()).coerceAtLeast(0) },
            dealer = DealerView(
                cards = visibleDealer,
                value = dealerScore.value,
                soft = dealerScore.soft,
                blackjack = !holeHidden && isBlackjack(dealer),
            ),
            seats = seatViews,
            yourSeat = you?.index,
            actions = you?.let { availableActions(it) } ?: emptyList(),
            shoePct = if (shoe.size == 0) 100 else shoe.remaining * 100 / shoe.size,
            message = message,
            version = versionCounter.get(),
        )
    }

    private fun availableActions(seat: Seat): List<String> {
        if (phase != Phase.PLAYER_TURN || seats[turnSeat].index != seat.index) return emptyList()
        val hand = seat.hands.getOrNull(turnHand) ?: return emptyList()
        return buildList {
            add(Action.HIT.name)
            add(Action.STAND.name)
            if (canDouble(hand.cards, hand.splitAces)) add(Action.DOUBLE.name)
            if (canSplit(hand.cards, seat.hands.size)) add(Action.SPLIT.name)
        }
    }

    // ---- lock helper -------------------------------------------------------

    private suspend fun <T> change(block: () -> T): T = mutex.withLock {
        val result = block()
        versionCounter.incrementAndGet()
        result
    }
}
