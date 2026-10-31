package de.mw.marbles

import kotlin.test.*

class PendingPlayersTest {
    private fun createGameWithPlayers(vararg names: String): Game {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))
        names.forEachIndexed { index, name ->
            val sessionId = if (index == 0) "creator" else "player$index"
            game.addPlayer(sessionId, name).also { it.connected = true }
        }
        return game
    }

    // ==================== Pending Player Addition ====================

    @Test
    fun `addPendingPlayer creates player with 0 marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")

        val charlie = game.players["pending1"]
        assertNotNull(charlie)
        assertEquals(0, charlie.marbles)
        assertEquals("Charlie", charlie.name)
    }

    @Test
    fun `addPendingPlayer adds player to pendingPlayers list`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertEquals(0, game.pendingPlayers.size)

        game.addPendingPlayer("pending1", "Charlie")

        assertEquals(1, game.pendingPlayers.size)
        assertEquals("Charlie", game.pendingPlayers[0].name)
    }

    @Test
    fun `pending players are not in allPlayers list`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")

        assertEquals(2, game.allPlayers.size)
        assertFalse(game.allPlayers.any { it.name == "Charlie" })
    }

    @Test
    fun `pending players are not in activePlayers list`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")

        assertEquals(2, game.activePlayers.size)
        assertFalse(game.activePlayers.any { it.name == "Charlie" })
    }

    @Test
    fun `adding same pending player twice does not duplicate`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")
        game.addPendingPlayer("pending1", "Charlie Updated")

        assertEquals(1, game.pendingPlayers.size)
        assertEquals("Charlie Updated", game.players["pending1"]?.name)
    }

    // ==================== Pending Player Promotion ====================

    @Test
    fun `promotePendingPlayers moves pending to active players`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")
        assertEquals(1, game.pendingPlayers.size)
        assertEquals(2, game.allPlayers.size)

        game.promotePendingPlayers()

        assertEquals(0, game.pendingPlayers.size)
        assertEquals(3, game.allPlayers.size)
        assertTrue(game.allPlayers.any { it.name == "Charlie" })
    }

    @Test
    fun `promotePendingPlayers gives starting marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")
        assertEquals(0, game.players["pending1"]?.marbles)

        game.promotePendingPlayers()

        assertEquals(10, game.players["pending1"]?.marbles)
    }

    @Test
    fun `promotePendingPlayers promotes multiple players`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")
        game.addPendingPlayer("pending2", "Diana")
        game.addPendingPlayer("pending3", "Eve")
        assertEquals(3, game.pendingPlayers.size)

        game.promotePendingPlayers()

        assertEquals(0, game.pendingPlayers.size)
        assertEquals(5, game.allPlayers.size)
        assertTrue(game.allPlayers.any { it.name == "Charlie" })
        assertTrue(game.allPlayers.any { it.name == "Diana" })
        assertTrue(game.allPlayers.any { it.name == "Eve" })
    }

    @Test
    fun `promotePendingPlayers does nothing when no pending players`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertEquals(2, game.allPlayers.size)

        game.promotePendingPlayers()

        assertEquals(2, game.allPlayers.size)
    }

    // ==================== Integration with nextRound ====================

    @Test
    fun `nextRound promotes pending players`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Play through a round
        game.placeMarbles("creator", 2)
        game.players["player1"]?.connected = true
        game.makeGuess("player1", Guess.EVEN)
        game.resolveRound()

        // Add a pending player during round result
        game.addPendingPlayer("pending1", "Charlie")
        assertEquals(1, game.pendingPlayers.size)
        assertEquals(2, game.allPlayers.size)

        // Next round should promote pending players
        game.nextRound()

        assertEquals(0, game.pendingPlayers.size)
        assertEquals(3, game.allPlayers.size)
        assertEquals(10, game.players["pending1"]?.marbles)
    }

    @Test
    fun `promoted player can participate in game after nextRound`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Play through a round
        game.placeMarbles("creator", 2)
        game.makeGuess("player1", Guess.EVEN)
        game.resolveRound()

        // Add a pending player
        game.addPendingPlayer("pending1", "Charlie")
        game.players["pending1"]?.connected = true

        // Next round
        game.nextRound()

        // Charlie should now be active and able to play
        assertTrue(game.activePlayers.any { it.name == "Charlie" })
        assertTrue(game.connectedActivePlayers.any { it.name == "Charlie" })
    }

    @Test
    fun `pending player is spectator and cannot guess`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")

        // Alice places marbles
        game.placeMarbles("creator", 3)

        // Charlie (pending) should be a spectator and cannot guess
        val charlie = game.players["pending1"]!!
        assertTrue(charlie.isSpectator) // 0 marbles = spectator
        assertFalse(game.makeGuess("pending1", Guess.ODD))
    }

    // ==================== Edge Cases ====================

    @Test
    fun `pending player not affected by disconnect handling`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")
        game.players["pending1"]?.connected = true

        // Disconnect Charlie
        game.handlePlayerDisconnect("pending1")

        // Charlie should still be in pending players
        assertEquals(1, game.pendingPlayers.size)
        assertEquals("Charlie", game.pendingPlayers[0].name)
    }

    @Test
    fun `game can end while pending players exist`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.addPendingPlayer("pending1", "Charlie")

        // Bob disconnects
        game.handlePlayerDisconnect("player1")

        // Game doesn't end immediately due to grace period
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)

        // Simulate grace period expired
        game.players["player1"]?.disconnectedAt = System.currentTimeMillis() - DISCONNECT_GRACE_PERIOD_MS - 1000

        // Handle the grace period expiration
        game.handleGracePeriodExpired("player1")

        // With only 1 available player, game should end
        assertEquals(GamePhase.GAME_OVER, game.phase)
        // Pending player still exists
        assertEquals(1, game.pendingPlayers.size)
    }
}
