package de.mw.marbles

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Tests for Translations and translation helper functions.
 */
class TranslationsTest {
    @Test
    fun `get returns English translation for en language`() {
        val result = Translations.get("en", "game.title")
        assertEquals("Marble Game", result)
    }

    @Test
    fun `get returns German translation for de language`() {
        val result = Translations.get("de", "game.title")
        assertEquals("Murmelspiel", result)
    }

    @Test
    fun `get falls back to English for unknown language`() {
        val result = Translations.get("fr", "game.title")
        assertEquals("Marble Game", result)
    }

    @Test
    fun `get returns key if translation not found`() {
        val result = Translations.get("en", "nonexistent.key")
        assertEquals("nonexistent.key", result)
    }

    @Test
    fun `get formats string with arguments`() {
        val result = Translations.get("en", "phase.waiting.playerCount", 5, 3)
        assertEquals("Players: 5 (3 connected)", result)
    }

    @Test
    fun `get formats German string with arguments`() {
        val result = Translations.get("de", "phase.waiting.playerCount", 5, 3)
        assertEquals("Spieler: 5 (3 verbunden)", result)
    }

    @Test
    fun `t extension returns English translation`() {
        val result = "game.title".t("en")
        assertEquals("Marble Game", result)
    }

    @Test
    fun `t extension returns German translation`() {
        val result = "game.title".t("de")
        assertEquals("Murmelspiel", result)
    }

    @Test
    fun `t extension with arguments formats correctly`() {
        val result = "phase.guessing.guessCount".t("en", 2, 3)
        assertEquals("Guesses: 2 / 3", result)
    }

    @Test
    fun `button translations exist in both languages`() {
        val enShare = "button.share".t("en")
        val deShare = "button.share".t("de")

        assertEquals("Share", enShare)
        assertEquals("Teilen", deShare)
    }

    @Test
    fun `player status translations exist in both languages`() {
        val enYou = "players.you".t("en")
        val deYou = "players.you".t("de")

        assertEquals("(You)", enYou)
        assertEquals("(Du)", deYou)
    }

    @Test
    fun `guess translations exist in both languages`() {
        val enEven = "guess.even".t("en")
        val deEven = "guess.even".t("de")

        assertEquals("EVEN", enEven)
        assertEquals("GERADE", deEven)
    }

    @Test
    fun `game over translations exist in both languages`() {
        val enGameOver = "phase.gameOver.title".t("en")
        val deGameOver = "phase.gameOver.title".t("de")

        assertEquals("Game Over!", enGameOver)
        assertEquals("Spiel vorbei!", deGameOver)
    }

    @Test
    fun `winner translation formats with name and marble count`() {
        val result = "phase.gameOver.winner".t("en", "Alice", 15)
        assertEquals("Alice wins with 15 marbles!", result)
    }

    @Test
    fun `error translations exist`() {
        val enError = "error.gameNotFound".t("en")
        val deError = "error.gameNotFound".t("de")

        assertTrue(enError.contains("not found"))
        assertTrue(deError.contains("nicht gefunden"))
    }

    @Test
    fun `join page translations exist`() {
        val enJoin = "join.title".t("en")
        val deJoin = "join.title".t("de")

        assertEquals("Join Game", enJoin)
        assertEquals("Spiel beitreten", deJoin)
    }

    @Test
    fun `spectator translations exist`() {
        val enSpec = "players.spectator".t("en")
        val deSpec = "players.spectator".t("de")

        assertEquals("Spectator", enSpec)
        assertEquals("Zuschauer", deSpec)
    }

    @Test
    fun `placing phase translations exist`() {
        val enTurn = "phase.placing.yourTurn".t("en")
        val deTurn = "phase.placing.yourTurn".t("de")

        assertEquals("Your Turn", enTurn)
        assertEquals("Du bist dran", deTurn)
    }
}
