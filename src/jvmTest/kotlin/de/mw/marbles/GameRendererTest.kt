package de.mw.marbles

import kotlin.random.Random
import kotlin.test.*

/**
 * Tests for GameRenderer functions.
 *
 * Tests the HTML rendering logic for different game states and player perspectives.
 */
class GameRendererTest {
    private fun createGameWithPlayers(vararg names: String): Game {
        val game = Game(creatorSessionId = "creator", random = Random(1))
        names.forEachIndexed { index, name ->
            val sessionId = if (index == 0) "creator" else "player$index"
            game.addPlayer(sessionId, name).also { it.connected = true }
        }
        return game
    }

    // ==================== escapeHtml Tests ====================

    @Test
    fun `escapeHtml escapes ampersand`() {
        assertEquals("&amp;", "&".escapeHtml())
    }

    @Test
    fun `escapeHtml escapes less than`() {
        assertEquals("&lt;", "<".escapeHtml())
    }

    @Test
    fun `escapeHtml escapes greater than`() {
        assertEquals("&gt;", ">".escapeHtml())
    }

    @Test
    fun `escapeHtml escapes double quotes`() {
        assertEquals("&quot;", "\"".escapeHtml())
    }

    @Test
    fun `escapeHtml escapes single quotes`() {
        assertEquals("&#x27;", "'".escapeHtml())
    }

    @Test
    fun `escapeHtml escapes all special characters in string`() {
        val input = "<script>alert('XSS & \"injection\"')</script>"
        val expected = "&lt;script&gt;alert(&#x27;XSS &amp; &quot;injection&quot;&#x27;)&lt;/script&gt;"
        assertEquals(expected, input.escapeHtml())
    }

    @Test
    fun `escapeHtml leaves normal text unchanged`() {
        assertEquals("Hello World", "Hello World".escapeHtml())
    }

    @Test
    fun `escapeHtml handles empty string`() {
        assertEquals("", "".escapeHtml())
    }

    // ==================== renderGameState Tests ====================

    @Test
    fun `renderGameState shows waiting for players phase`() {
        val game = createGameWithPlayers("Alice", "Bob")

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Waiting for Players"))
        assertTrue(html.contains("Start Game"))
    }

    @Test
    fun `renderGameState shows player list`() {
        val game = createGameWithPlayers("Alice", "Bob")

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Alice"))
        assertTrue(html.contains("Bob"))
        assertTrue(html.contains("Players"))
    }

    @Test
    fun `renderGameState marks current player as you`() {
        val game = createGameWithPlayers("Alice", "Bob")

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("(You)"))
    }

    @Test
    fun `renderGameState shows start button only for creator with 2+ players`() {
        val game = createGameWithPlayers("Alice", "Bob")

        val creatorHtml = renderGameState(game, "creator", "en")
        val playerHtml = renderGameState(game, "player1", "en")

        assertTrue(creatorHtml.contains("Start Game"))
        assertFalse(playerHtml.contains("Start Game"))
    }

    @Test
    fun `renderGameState shows waiting for host message for non-creator`() {
        val game = createGameWithPlayers("Alice", "Bob")

        val playerHtml = renderGameState(game, "player1", "en")

        assertTrue(playerHtml.contains("Waiting for"))
        assertTrue(playerHtml.contains("Alice"))
    }

    @Test
    fun `renderGameState shows placing marbles phase for current player`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Your Turn"))
        assertTrue(html.contains("marble-picker"))
    }

    @Test
    fun `renderGameState shows waiting message for non-current player during placing`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        val html = renderGameState(game, "player1", "en")

        assertTrue(html.contains("Waiting"))
        assertTrue(html.contains("Alice"))
    }

    @Test
    fun `renderGameState shows guessing phase with buttons for non-placer`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)

        val html = renderGameState(game, "player1", "en")

        assertTrue(html.contains("EVEN"))
        assertTrue(html.contains("ODD"))
        assertTrue(html.contains("Your Guess"))
    }

    @Test
    fun `renderGameState shows waiting for guesses for placer`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Waiting for Guesses"))
    }

    @Test
    fun `renderGameState shows already guessed message after guessing`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.EVEN)

        val html = renderGameState(game, "player1", "en")

        assertTrue(html.contains("Waiting for Others"))
        assertTrue(html.contains("EVEN"))
    }

    @Test
    fun `renderGameState shows spectator message for player with no marbles`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.players["player2"]?.marbles = 0
        game.startGame()
        game.placeMarbles("creator", 3)

        val html = renderGameState(game, "player2", "en")

        assertTrue(html.contains("Spectating") || html.contains("out of marbles"))
    }

    @Test
    fun `renderGameState shows round result with winners and losers`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 2) // Even
        game.makeGuess("player1", Guess.EVEN) // Winner
        game.makeGuess("player2", Guess.ODD) // Loser
        game.resolveRound()

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Result"))
        assertTrue(html.contains("EVEN"))
        assertTrue(html.contains("Next round in"))
    }

    @Test
    fun `renderGameState shows game over with winner`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["player1"]?.marbles = 0
        game.phase = GamePhase.GAME_OVER

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Game Over"))
        assertTrue(html.contains("Play Again"))
    }

    @Test
    fun `renderGameState shows you won message for winner`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["player1"]?.marbles = 0
        game.phase = GamePhase.GAME_OVER

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Congratulations") || html.contains("You won"))
    }

    @Test
    fun `renderGameState shows player marble counts`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["creator"]?.marbles = 15

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("15"))
        assertTrue(html.contains("marbles"))
    }

    @Test
    fun `renderGameState shows disconnected player status`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["player1"]?.connected = false
        game.players["player1"]?.disconnectedAt = System.currentTimeMillis() - 31_000 // Past grace period

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Offline") || html.contains("Disconnected"))
    }

    @Test
    fun `renderGameState shows reconnecting countdown for player in grace period`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["player1"]?.connected = false
        game.players["player1"]?.disconnectedAt = System.currentTimeMillis() // Just disconnected

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Reconnecting") || html.contains("countdown"))
    }

    @Test
    fun `renderGameState shows pending players section`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.addPendingPlayer("pending1", "Charlie").connected = true

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Charlie"))
        assertTrue(html.contains("Joining") || html.contains("next round"))
    }

    @Test
    fun `renderGameState shows guessed indicator during guessing phase`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.EVEN)

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Guessed"))
    }

    @Test
    fun `renderGameState escapes player names to prevent XSS`() {
        val game = Game(creatorSessionId = "creator", random = Random(1))
        game.addPlayer("creator", "<script>alert('XSS')</script>").connected = true
        game.addPlayer("player1", "Bob").connected = true

        val html = renderGameState(game, "player1", "en")

        assertFalse(html.contains("<script>alert('XSS')</script>"))
        assertTrue(html.contains("&lt;script&gt;"))
    }

    @Test
    fun `renderGameState shows your status bar with marble count`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["creator"]?.marbles = 7

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("your-status") || html.contains("Your marbles"))
    }

    @Test
    fun `renderGameState shows spectator badge for spectating player`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["creator"]?.marbles = 0

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Spectator"))
    }

    @Test
    fun `renderGameState shows pending badge for pending player`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.addPendingPlayer("pending1", "Charlie").connected = true

        val html = renderGameState(game, "pending1", "en")

        assertTrue(html.contains("Watching") || html.contains("Pending") || html.contains("next round"))
    }

    @Test
    fun `renderGameState uses German translations when lang is de`() {
        val game = createGameWithPlayers("Alice", "Bob")

        val html = renderGameState(game, "creator", "de")

        assertTrue(html.contains("Spieler") || html.contains("Warte"))
    }

    @Test
    fun `renderGameState shows need players hint when only 1 connected`() {
        val game = Game(creatorSessionId = "creator", random = Random(1))
        game.addPlayer("creator", "Alice").connected = true

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("Need") || html.contains("2"))
    }

    @Test
    fun `renderGameState shows current player marker during game`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        val html = renderGameState(game, "player1", "en")

        assertTrue(html.contains("Current") || html.contains("current"))
    }

    @Test
    fun `renderGameState displays marble grid for placing`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        val html = renderGameState(game, "creator", "en")

        assertTrue(html.contains("marble-grid") || html.contains("marble-picker"))
        // Should have buttons for 1-10 marbles
        assertTrue(html.contains("data-value"))
    }

    @Test
    fun `renderGameState shows game id in hx-post urls`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)

        val html = renderGameState(game, "player1", "en")

        assertTrue(html.contains("/marbles/game/${game.id}/guess"))
    }
}
