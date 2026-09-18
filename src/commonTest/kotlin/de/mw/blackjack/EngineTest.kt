package de.mw.blackjack

import de.mw.blackjack.game.*
import de.mw.blackjack.models.Card
import de.mw.blackjack.models.Rank
import de.mw.blackjack.models.Suit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private fun hand(vararg ranks: Rank) = ranks.map { Card(it, Suit.SPADES) }

class EngineTest {

    @Test
    fun `ace counts eleven until it would bust`() {
        assertEquals(HandScore(21, soft = true), score(hand(Rank.ACE, Rank.KING)))
        assertEquals(HandScore(13, soft = true), score(hand(Rank.ACE, Rank.TWO)))
        assertEquals(HandScore(13, soft = false), score(hand(Rank.ACE, Rank.TWO, Rank.KING)))
        assertEquals(HandScore(12, soft = true), score(hand(Rank.ACE, Rank.ACE)))
    }

    @Test
    fun `blackjack is two cards only`() {
        assertTrue(isBlackjack(hand(Rank.ACE, Rank.QUEEN)))
        assertFalse(isBlackjack(hand(Rank.SEVEN, Rank.SEVEN, Rank.SEVEN)))
    }

    @Test
    fun `dealer stands on seventeen, soft included`() {
        assertTrue(dealerMustHit(hand(Rank.NINE, Rank.SEVEN)))
        assertFalse(dealerMustHit(hand(Rank.TEN, Rank.SEVEN)))
        // S17 house rule: A-6 is 17 and the dealer stops there.
        assertFalse(dealerMustHit(hand(Rank.ACE, Rank.SIX)))
    }

    @Test
    fun `splitting needs a pair by value and a free hand`() {
        assertTrue(canSplit(hand(Rank.KING, Rank.QUEEN), handsAtSeat = 1))
        assertFalse(canSplit(hand(Rank.KING, Rank.NINE), handsAtSeat = 1))
        assertFalse(canSplit(hand(Rank.KING, Rank.QUEEN), handsAtSeat = 2))
    }

    @Test
    fun `doubling is two cards and never a split ace`() {
        assertTrue(canDouble(hand(Rank.FIVE, Rank.SIX), splitAces = false))
        assertFalse(canDouble(hand(Rank.FIVE, Rank.SIX, Rank.TWO), splitAces = false))
        assertFalse(canDouble(hand(Rank.ACE, Rank.SIX), splitAces = true))
    }

    @Test
    fun `settlement covers naturals, pushes and busts`() {
        assertEquals(Outcome.BLACKJACK, settle(hand(Rank.ACE, Rank.KING), hand(Rank.TEN, Rank.NINE), false))
        assertEquals(Outcome.PUSH, settle(hand(Rank.ACE, Rank.KING), hand(Rank.ACE, Rank.QUEEN), false))
        assertEquals(Outcome.LOSE, settle(hand(Rank.TEN, Rank.NINE), hand(Rank.ACE, Rank.QUEEN), false))
        assertEquals(Outcome.BUST, settle(hand(Rank.TEN, Rank.NINE, Rank.FIVE), hand(Rank.TEN, Rank.SIX), false))
        assertEquals(Outcome.WIN, settle(hand(Rank.TEN, Rank.NINE), hand(Rank.TEN, Rank.SEVEN), false))
        assertEquals(Outcome.PUSH, settle(hand(Rank.TEN, Rank.NINE), hand(Rank.TEN, Rank.NINE), false))
        // 21 on a split hand pays even money, not 3:2.
        assertEquals(Outcome.WIN, settle(hand(Rank.ACE, Rank.KING), hand(Rank.TEN, Rank.NINE), playerSplit = true))
    }

    @Test
    fun `payouts come back gross`() {
        assertEquals(25, returned(10, Outcome.BLACKJACK))
        assertEquals(20, returned(10, Outcome.WIN))
        assertEquals(10, returned(10, Outcome.PUSH))
        assertEquals(0, returned(10, Outcome.LOSE))
        assertEquals(0, returned(10, Outcome.BUST))
    }
}
