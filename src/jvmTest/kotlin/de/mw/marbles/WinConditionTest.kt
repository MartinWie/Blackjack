package de.mw.marbles

import kotlin.test.*

class WinConditionTest {
    private fun createGameWithPlayers(vararg names: String): Game {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))
        names.forEachIndexed { index, name ->
            val sessionId = if (index == 0) "creator" else "player$index"
            game.addPlayer(sessionId, name).also { it.connected = true }
        }
        return game
    }

    // ==================== Game Over Detection ====================

    @Test
    fun `game over when only one connected player has marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.ODD)
        game.resolveRound()

        // Manually set Bob to 0 marbles
        game.players["player1"]!!.marbles = 0

        val continued = game.nextRound()

        assertFalse(continued)
        assertEquals(GamePhase.GAME_OVER, game.phase)
    }

    @Test
    fun `game continues when multiple players have marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.ODD)
        game.resolveRound()

        // Both players still have marbles
        assertTrue(game.players["creator"]!!.marbles > 0)
        assertTrue(game.players["player1"]!!.marbles > 0)

        val continued = game.nextRound()

        assertTrue(continued)
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
    }

    @Test
    fun `game over when all but one player disconnects`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.ODD)
        game.makeGuess("player2", Guess.ODD)
        game.resolveRound()

        // Bob and Charlie disconnect
        game.players["player1"]!!.connected = false
        game.players["player2"]!!.connected = false

        val continued = game.nextRound()

        assertFalse(continued)
        assertEquals(GamePhase.GAME_OVER, game.phase)
    }

    // ==================== Winner Determination ====================

    @Test
    fun `getWinner returns null when game not over`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertNull(game.getWinner())
    }

    @Test
    fun `getWinner returns player with marbles when game over`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.ODD)
        game.resolveRound()

        // Set Bob to 0 marbles to trigger game over
        game.players["player1"]!!.marbles = 0
        game.nextRound()

        val winner = game.getWinner()

        assertNotNull(winner)
        assertEquals("Alice", winner.name)
    }

    @Test
    fun `getWinner prefers connected players`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.phase = GamePhase.GAME_OVER

        // Alice has marbles but disconnected
        game.players["creator"]!!.marbles = 10
        game.players["creator"]!!.connected = false

        // Bob has marbles and connected
        game.players["player1"]!!.marbles = 5
        game.players["player1"]!!.connected = true

        // Charlie is spectator
        game.players["player2"]!!.marbles = 0

        val winner = game.getWinner()

        assertNotNull(winner)
        assertEquals("Bob", winner.name)
    }

    // ==================== Complex Win Scenarios ====================

    @Test
    fun `player wins by taking all opponents marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")

        // Give Alice all marbles except 1 for Bob
        game.players["creator"]!!.marbles = 19
        game.players["player1"]!!.marbles = 1

        game.startGame()
        game.placeMarbles("creator", 1) // Alice places 1 (odd)
        game.makeGuess("player1", Guess.EVEN) // Bob guesses wrong
        game.resolveRound()

        // Bob should have 0 marbles now (lost his 1)
        assertEquals(0, game.players["player1"]!!.marbles)

        game.nextRound()

        assertEquals(GamePhase.GAME_OVER, game.phase)
        assertEquals("Alice", game.getWinner()?.name)
    }

    @Test
    fun `three player game - last player standing wins`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")

        // Alice has 18, Bob has 1, Charlie has 1
        game.players["creator"]!!.marbles = 18
        game.players["player1"]!!.marbles = 1
        game.players["player2"]!!.marbles = 1

        game.startGame()
        game.placeMarbles("creator", 2) // Alice places 2 (even)
        game.makeGuess("player1", Guess.ODD) // Bob wrong
        game.makeGuess("player2", Guess.ODD) // Charlie wrong
        game.resolveRound()

        // Both Bob and Charlie lose their 1 marble each
        assertEquals(0, game.players["player1"]!!.marbles)
        assertEquals(0, game.players["player2"]!!.marbles)
        assertEquals(20, game.players["creator"]!!.marbles)

        game.nextRound()

        assertEquals(GamePhase.GAME_OVER, game.phase)
        assertEquals("Alice", game.getWinner()?.name)
    }

    // ==================== Edge Cases ====================

    @Test
    fun `game handles player going to exactly zero marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["player1"]!!.marbles = 3

        game.startGame()
        game.placeMarbles("creator", 3) // Odd
        game.makeGuess("player1", Guess.EVEN) // Bob wrong, will lose 3
        game.resolveRound()

        assertEquals(0, game.players["player1"]!!.marbles)
        assertTrue(game.players["player1"]!!.isSpectator)
    }

    @Test
    fun `spectator player order is maintained`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.players["player1"]!!.marbles = 0 // Bob is spectator from start

        game.startGame()

        // allPlayers should include spectators
        assertEquals(3, game.allPlayers.size)

        // activePlayers should exclude spectators
        assertEquals(2, game.activePlayers.size)

        // connectedActivePlayers should exclude spectators
        assertEquals(2, game.connectedActivePlayers.size)
    }


    @Test
    fun `new player joining during GAME_OVER does not become winner`() {
        val game = createGameWithPlayers("Alice", "Bob")

        // Give Alice all marbles except 1 for Bob
        game.players["creator"]!!.marbles = 19
        game.players["player1"]!!.marbles = 1

        game.startGame()
        game.placeMarbles("creator", 1) // Alice places 1 (odd)
        game.makeGuess("player1", Guess.EVEN) // Bob guesses wrong
        game.resolveRound()
        game.nextRound()

        // Game should be over with Alice as winner
        assertEquals(GamePhase.GAME_OVER, game.phase)
        assertEquals("Alice", game.getWinner()?.name)

        // Now a new player joins (this would happen via routing during GAME_OVER)
        game.addPlayer("newplayer", "NewGuy", "en").also { it.connected = true }

        // Winner should still be Alice, NOT the new player
        assertEquals("Alice", game.getWinner()?.name)
        assertNotEquals("NewGuy", game.getWinner()?.name)
    }

    @Test
    fun `winner is preserved even if they disconnect during GAME_OVER`() {
        val game = createGameWithPlayers("Alice", "Bob")

        game.players["creator"]!!.marbles = 19
        game.players["player1"]!!.marbles = 1

        game.startGame()
        game.placeMarbles("creator", 1)
        game.makeGuess("player1", Guess.EVEN)
        game.resolveRound()
        game.nextRound()

        assertEquals(GamePhase.GAME_OVER, game.phase)
        assertEquals("Alice", game.getWinner()?.name)

        // Alice disconnects
        game.players["creator"]!!.connected = false

        // Winner should still be Alice even though she's disconnected
        assertEquals("Alice", game.getWinner()?.name)
    }
}
