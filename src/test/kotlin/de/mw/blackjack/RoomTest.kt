package de.mw.blackjack

import de.mw.blackjack.game.Action
import de.mw.blackjack.game.Room
import de.mw.blackjack.models.Card
import de.mw.blackjack.models.Rank
import de.mw.blackjack.models.Rules
import de.mw.blackjack.models.Shoe
import de.mw.blackjack.models.Suit
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RoomTest {

    @Test
    fun `a solo round runs from bet to payout`() = runBlocking {
        val room = Room("TEST")
        assertEquals(0, room.join("p1", "Ada"))

        assertNull(room.placeBet("p1", 25))
        assertEquals(25, room.snapshot("p1").seats[0].pendingBet)
        assertNull(room.lockBet("p1"))

        var state = room.snapshot("p1")
        assertEquals(2, state.seats[0].hands[0].cards.size)

        // Naturals settle without anybody acting, so only act when there is a turn.
        if (state.phase == "PLAYER_TURN") {
            assertTrue(state.dealer.cards.any { it.hidden })
            assertNull(room.act("p1", Action.STAND))
        }
        // Each tick is handed a future clock, so one dealer card falls per tick.
        var guard = 0
        while (room.snapshot("p1").phase != "PAYOUT" && guard++ < 30) {
            room.tick(System.currentTimeMillis() + 10_000)
        }

        state = room.snapshot("p1")
        assertEquals("PAYOUT", state.phase)
        assertEquals(state.roundId, state.settleId)
        assertNotNull(state.seats[0].hands[0].outcome)
        assertTrue(state.dealer.cards.none { it.hidden })

        room.tick(System.currentTimeMillis() + 60_000)
        state = room.snapshot("p1")
        assertEquals("BETTING", state.phase)
        assertEquals(0, state.seats[0].stake)
    }

    @Test
    fun `a solo table has no clock and a second player starts one`() = runBlocking {
        val room = Room("TEST")
        room.join("p1", "Ada")
        assertNull(room.snapshot("p1").deadlineIn)
        room.join("p2", "Bo")
        assertNotNull(room.snapshot("p1").deadlineIn)
    }

    @Test
    fun `a table that drops back to solo loses its clock`() = runBlocking {
        val room = Room("TEST")
        room.join("p1", "Ada")
        room.join("p2", "Bo")
        assertNotNull(room.snapshot("p1").deadlineIn)
        room.leave("p2")
        assertNull(room.snapshot("p1").deadlineIn, "a player alone must never be auto-stood")
    }

    @Test
    fun `the last payout stays visible into the next betting phase`() = runBlocking {
        val room = Room("TEST", Shoe(stacked = listOf(Card(Rank.TEN, Suit.SPADES), Card(Rank.NINE, Suit.HEARTS))))
        room.join("p1", "Ada")
        room.placeBet("p1", 25)
        room.lockBet("p1")
        if (room.snapshot("p1").phase == "PLAYER_TURN") room.act("p1", Action.STAND)
        var guard = 0
        while (room.snapshot("p1").phase != "PAYOUT" && guard++ < 30) {
            room.tick(System.currentTimeMillis() + 10_000)
        }
        val settled = room.snapshot("p1")
        val paid = settled.seats[0].returned

        room.tick(System.currentTimeMillis() + 60_000)
        val betting = room.snapshot("p1")
        assertEquals("BETTING", betting.phase)
        // The browser holds the money, so a client that missed the payout phase has
        // to still find the result on the frame it does see.
        assertEquals(settled.settleId, betting.settleId)
        assertEquals(paid, betting.seats[0].returned)
    }

    @Test
    fun `bets are bounded and closed once the cards are out`() = runBlocking {
        val room = Room("TEST")
        room.join("p1", "Ada")
        assertEquals("table maximum is ${Rules.MAX_BET}", room.placeBet("p1", Rules.MAX_BET + 5))
        assertEquals("minimum bet is ${Rules.MIN_BET}", room.lockBet("p1"))
        room.placeBet("p1", Rules.MIN_BET)
        room.lockBet("p1")
        assertEquals("betting is closed", room.placeBet("p1", 5))
    }

    @Test
    fun `the table fills up and empties again`() = runBlocking {
        val room = Room("TEST")
        repeat(Rules.MAX_SEATS) { i -> assertEquals(i, room.join("p$i", "P$i")) }
        assertNull(room.join("overflow", "Late"))
        repeat(Rules.MAX_SEATS) { i -> room.leave("p$i") }
        assertTrue(room.isEmpty)
    }

    @Test
    fun `an action from the wrong seat is refused`() = runBlocking {
        val room = Room("TEST")
        room.join("p1", "Ada")
        room.join("p2", "Bo")
        room.placeBet("p1", 10); room.lockBet("p1")
        room.placeBet("p2", 10); room.lockBet("p2")

        val state = room.snapshot(null)
        if (state.phase != "PLAYER_TURN") return@runBlocking // both dealt naturals
        val waiting = state.seats.first { seat -> seat.name != null && seat.hands.none { it.active } }
        assertEquals("not your turn", room.act("p${waiting.index + 1}", Action.HIT))
    }
}

/** Rounds dealt off a stacked shoe, so split and double have a known shape. */
class StackedRoomTest {

    private fun card(rank: Rank) = Card(rank, Suit.SPADES)

    /** Deal order: player, dealer, player, dealer — then whatever is hit or drawn. */
    private fun roomWith(vararg cards: Rank) =
        Room("TEST", Shoe(stacked = cards.map { card(it) }))

    @Test
    fun `a pair splits into two hands, each with its own bet`() = runBlocking {
        val room = roomWith(Rank.EIGHT, Rank.SEVEN, Rank.EIGHT, Rank.SIX, Rank.TWO, Rank.THREE)
        room.join("p1", "Ada")
        room.placeBet("p1", 25)
        room.lockBet("p1")

        assertNull(room.act("p1", Action.SPLIT))
        val state = room.snapshot("p1")
        assertEquals(2, state.seats[0].hands.size)
        assertEquals(listOf(25, 25), state.seats[0].hands.map { it.bet })
        assertEquals(50, state.seats[0].stake)
        // Each split hand drew one card and the first of them is now on the clock.
        assertTrue(state.seats[0].hands.all { it.cards.size == 2 })
        assertTrue(state.seats[0].hands[0].active)
    }

    @Test
    fun `split aces draw one card each and stand`() = runBlocking {
        val room = roomWith(Rank.ACE, Rank.SEVEN, Rank.ACE, Rank.SIX, Rank.FIVE, Rank.FOUR)
        room.join("p1", "Ada")
        room.placeBet("p1", 10)
        room.lockBet("p1")

        assertNull(room.act("p1", Action.SPLIT))
        val state = room.snapshot("p1")
        assertTrue(state.actions.isEmpty(), "split aces leave nothing to decide")
        assertTrue(state.phase != "PLAYER_TURN")
    }

    @Test
    fun `doubling takes one card, doubles the stake and ends the hand`() = runBlocking {
        val room = roomWith(Rank.SIX, Rank.TEN, Rank.FIVE, Rank.SEVEN, Rank.NINE)
        room.join("p1", "Ada")
        room.placeBet("p1", 20)
        room.lockBet("p1")

        assertNull(room.act("p1", Action.DOUBLE))
        val state = room.snapshot("p1")
        val hand = state.seats[0].hands[0]
        assertEquals(40, hand.bet)
        assertEquals(3, hand.cards.size)
        assertEquals(20, hand.value)
        assertTrue(hand.doubled)
        assertTrue(state.actions.isEmpty())
    }

    @Test
    fun `a dealer natural ends the round before anybody acts`() = runBlocking {
        val room = roomWith(Rank.NINE, Rank.ACE, Rank.SEVEN, Rank.KING)
        room.join("p1", "Ada")
        room.placeBet("p1", 15)
        room.lockBet("p1")

        val state = room.snapshot("p1")
        assertEquals("PAYOUT", state.phase)
        assertEquals("LOSE", state.seats[0].hands[0].outcome)
        assertTrue(state.dealer.blackjack)
    }

    @Test
    fun `a player natural pays three to two`() = runBlocking {
        val room = roomWith(Rank.ACE, Rank.NINE, Rank.KING, Rank.SEVEN)
        room.join("p1", "Ada")
        room.placeBet("p1", 100)
        room.lockBet("p1")
        var guard = 0
        while (room.snapshot("p1").phase != "PAYOUT" && guard++ < 30) {
            room.tick(System.currentTimeMillis() + 10_000)
        }

        val hand = room.snapshot("p1").seats[0].hands[0]
        assertEquals("BLACKJACK", hand.outcome)
        assertEquals(250, hand.returned)
    }
}
