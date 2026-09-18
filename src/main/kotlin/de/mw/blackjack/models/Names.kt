package de.mw.blackjack.models

import kotlin.random.Random

/** A name to put on a seat before anybody types one. */
object Names {
    private val adjectives = listOf(
        "Lucky", "Cool", "Swift", "Golden", "Silent", "Wild", "Neon", "Royal", "Sly", "Bold",
    )
    private val nouns = listOf(
        "Ace", "Kid", "Shark", "Chip", "Joker", "Queen", "King", "Tiger", "Fox", "Rider",
    )

    fun random(): String =
        "${adjectives.random(Random)} ${nouns.random(Random)}"

    /** Keeps a seat label short and printable; empty falls back to a random one. */
    fun clean(input: String?): String =
        input?.trim()?.filter { it.isLetterOrDigit() || it == ' ' || it == '-' }?.take(14)
            ?.takeIf { it.isNotBlank() } ?: random()
}
