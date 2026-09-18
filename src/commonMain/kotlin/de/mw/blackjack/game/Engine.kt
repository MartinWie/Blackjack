package de.mw.blackjack.game

import de.mw.blackjack.models.Card
import de.mw.blackjack.models.Rank
import de.mw.blackjack.models.Rules

/** What a finished hand did, and what the box pays back because of it. */
enum class Outcome { WIN, LOSE, PUSH, BLACKJACK, BUST, SURRENDER }

data class HandScore(val value: Int, val soft: Boolean) {
    val bust: Boolean get() = value > 21
}

/**
 * Best value for a hand, and whether an ace is still counted as 11 (a "soft" hand —
 * the dealer rule and the double/hit advice both turn on it).
 */
fun score(cards: List<Card>): HandScore {
    var total = cards.sumOf { it.rank.value }
    var aces = cards.count { it.rank == Rank.ACE }
    while (total > 21 && aces > 0) {
        total -= 10
        aces--
    }
    return HandScore(total, soft = aces > 0)
}

/** Blackjack is exactly two cards — a 21 made after a hit or a split is not one. */
fun isBlackjack(cards: List<Card>): Boolean = cards.size == 2 && score(cards).value == 21

fun dealerMustHit(cards: List<Card>): Boolean {
    val s = score(cards)
    return when {
        s.value < 17 -> true
        s.value == 17 && s.soft && Rules.DEALER_HITS_SOFT_17 -> true
        else -> false
    }
}

fun canSplit(cards: List<Card>, handsAtSeat: Int): Boolean =
    cards.size == 2 &&
        handsAtSeat < Rules.MAX_HANDS_PER_SEAT &&
        // Casino rule: split on equal *rank value*, so K-Q is a legal pair of tens.
        cards[0].rank.value == cards[1].rank.value

/** Doubling is two cards only, and never on the single card a split ace is dealt. */
fun canDouble(cards: List<Card>, splitAces: Boolean): Boolean = cards.size == 2 && !splitAces

/**
 * Settlement for one player hand against the dealer's final hand.
 *
 * Player blackjack against a dealer blackjack is a push, which is why the dealer's
 * hand is checked for its own natural rather than just its total.
 */
fun settle(player: List<Card>, dealer: List<Card>, playerSplit: Boolean): Outcome {
    val p = score(player)
    if (p.bust) return Outcome.BUST

    // A 21 on a split hand is an ordinary 21, never a natural.
    val playerNatural = !playerSplit && isBlackjack(player)
    val dealerNatural = isBlackjack(dealer)
    if (playerNatural) return if (dealerNatural) Outcome.PUSH else Outcome.BLACKJACK
    if (dealerNatural) return Outcome.LOSE

    val d = score(dealer)
    return when {
        d.bust -> Outcome.WIN
        p.value > d.value -> Outcome.WIN
        p.value < d.value -> Outcome.LOSE
        else -> Outcome.PUSH
    }
}

/**
 * What comes back to the player, bet included — 0 on a loss, the bet on a push,
 * double on a win, 2.5× on a natural. Returned gross so the client can add one
 * number to its bankroll (the stake left it when the bet was placed).
 */
fun returned(bet: Int, outcome: Outcome): Int = when (outcome) {
    // Rounded up, so a table-minimum natural is not quietly short-changed by
    // integer division: 5 at 3:2 is 7.5, and the player gets the 8.
    Outcome.BLACKJACK -> bet + (bet * Rules.BLACKJACK_PAYS_NUMERATOR + Rules.BLACKJACK_PAYS_DENOMINATOR - 1) /
        Rules.BLACKJACK_PAYS_DENOMINATOR
    Outcome.WIN -> bet * 2
    Outcome.PUSH -> bet
    Outcome.SURRENDER -> bet / 2
    Outcome.LOSE, Outcome.BUST -> 0
}
