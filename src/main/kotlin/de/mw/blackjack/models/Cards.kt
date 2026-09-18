package de.mw.blackjack.models

import kotlin.random.Random

enum class Suit(val symbol: String, val red: Boolean) {
    SPADES("♠", false),
    HEARTS("♥", true),
    DIAMONDS("♦", true),
    CLUBS("♣", false),
}

enum class Rank(val label: String, val value: Int) {
    TWO("2", 2), THREE("3", 3), FOUR("4", 4), FIVE("5", 5), SIX("6", 6),
    SEVEN("7", 7), EIGHT("8", 8), NINE("9", 9), TEN("10", 10),
    JACK("J", 10), QUEEN("Q", 10), KING("K", 10), ACE("A", 11),
}

data class Card(val rank: Rank, val suit: Suit) {
    /** Stable id so the client can tell a re-render from a newly dealt card. */
    val code: String get() = "${rank.label}${suit.name.first()}"
}

/**
 * A multi-deck shoe. [remaining] drives the cut card; the shoe is never reshuffled
 * mid-round, only between rounds (see [needsShuffle]).
 */
class Shoe(
    private val decks: Int = Rules.DECKS,
    private val random: Random = Random.Default,
    /** Test seam: these come off the top before the shuffled shoe does. */
    private val stacked: List<Card> = emptyList(),
) {
    private var cards: MutableList<Card> = mutableListOf()
    private var dealt = 0
    private var stackedLeft = stacked.toMutableList()

    init {
        shuffle()
    }

    val remaining: Int get() = cards.size - dealt
    val size: Int get() = cards.size
    val needsShuffle: Boolean get() = remaining < cards.size * Rules.RESHUFFLE_AT

    fun shuffle() {
        cards = buildList {
            repeat(decks) {
                Suit.entries.forEach { suit -> Rank.entries.forEach { rank -> add(Card(rank, suit)) } }
            }
        }.shuffled(random).toMutableList()
        dealt = 0
    }

    fun draw(): Card {
        stackedLeft.removeFirstOrNull()?.let { return it }
        if (remaining == 0) shuffle()
        return cards[dealt++]
    }
}
