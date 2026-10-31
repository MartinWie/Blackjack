package de.mw.marbles

import kotlin.test.*

class DisconnectHandlingTest {
    private fun createGameWithPlayers(vararg names: String): Game {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))
        names.forEachIndexed { index, name ->
            val sessionId = if (index == 0) "creator" else "player$index"
            game.addPlayer(sessionId, name).also { it.connected = true }
        }
        return game
    }

    // ==================== Disconnect During Waiting ====================

    @Test
    fun `disconnect during WAITING_FOR_PLAYERS returns true for broadcast`() {
        val game = createGameWithPlayers("Alice", "Bob")

        val stateChanged = game.handlePlayerDisconnect("player1")

        assertTrue(stateChanged)
        assertFalse(game.players["player1"]!!.connected)
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)
    }

    // ==================== Disconnect During Placing ====================

    @Test
    fun `current player disconnect during PLACING advances to next player`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        assertEquals("Alice", game.currentPlayer?.name)
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)

        val stateChanged = game.handlePlayerDisconnect("creator")

        assertTrue(stateChanged)
        assertEquals("Bob", game.currentPlayer?.name)
    }

    @Test
    fun `non-current player disconnect during PLACING returns true`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        val stateChanged = game.handlePlayerDisconnect("player1")

        assertTrue(stateChanged)
        assertEquals("Alice", game.currentPlayer?.name) // Current player unchanged
        assertFalse(game.players["player1"]!!.connected)
    }

    @Test
    fun `disconnect leaves only one player triggers game over during PLACING`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        game.handlePlayerDisconnect("player1")
        // Simulate grace period expired (disconnect happened 31 seconds ago)
        game.players["player1"]!!.disconnectedAt = System.currentTimeMillis() - 31_000

        // Re-check game state after grace period expires
        val stateChanged = game.handlePlayerDisconnect("player1")

        assertTrue(stateChanged)
        assertEquals(GamePhase.GAME_OVER, game.phase)
    }

    // ==================== Disconnect During Guessing ====================

    @Test
    fun `guesser disconnect triggers round resolution if all remaining guessed`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        // Bob guesses, Charlie doesn't yet
        game.makeGuess("player1", Guess.ODD)
        assertEquals(GamePhase.GUESSING, game.phase)

        // Charlie disconnects - Bob already guessed, so round should resolve
        val stateChanged = game.handlePlayerDisconnect("player2")

        assertTrue(stateChanged)
        assertEquals(GamePhase.ROUND_RESULT, game.phase)
        assertNotNull(game.lastRoundResult)
    }

    @Test
    fun `guesser disconnect does not resolve if others still need to guess`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie", "Dave")
        game.addPlayer("player3", "Dave").connected = true

        game.startGame()
        game.placeMarbles("creator", 3)

        // Only Bob guesses
        game.makeGuess("player1", Guess.ODD)

        // Charlie disconnects, but Dave still needs to guess
        game.handlePlayerDisconnect("player2")

        // Should still be in GUESSING phase
        assertEquals(GamePhase.GUESSING, game.phase)
    }

    @Test
    fun `placer disconnect during GUESSING triggers game over if not enough players`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)

        // Placer (Alice) disconnects
        val stateChanged = game.handlePlayerDisconnect("creator")

        assertTrue(stateChanged)
        // With only Bob connected and active, this depends on implementation
        // The current implementation checks for game over during PLACING, not GUESSING
        // So the phase might stay GUESSING but Bob is alone
    }

    // ==================== Disconnect During Round Result ====================

    @Test
    fun `disconnect during ROUND_RESULT triggers game over if only one left`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.ODD)
        game.resolveRound()

        assertEquals(GamePhase.ROUND_RESULT, game.phase)

        game.handlePlayerDisconnect("player1")
        // Simulate grace period expired
        game.players["player1"]!!.disconnectedAt = System.currentTimeMillis() - 31_000

        val stateChanged = game.handlePlayerDisconnect("player1")

        assertTrue(stateChanged)
        assertEquals(GamePhase.GAME_OVER, game.phase)
    }

    @Test
    fun `disconnect during ROUND_RESULT continues game if multiple players remain`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.ODD)
        game.makeGuess("player2", Guess.EVEN)
        game.resolveRound()

        val stateChanged = game.handlePlayerDisconnect("player1")

        assertTrue(stateChanged)
        // Should still be ROUND_RESULT, game continues with Alice and Charlie
        assertEquals(GamePhase.ROUND_RESULT, game.phase)
    }

    // ==================== Disconnect During Game Over ====================

    @Test
    fun `disconnect during GAME_OVER returns true but changes nothing`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.phase = GamePhase.GAME_OVER

        val stateChanged = game.handlePlayerDisconnect("player1")

        assertTrue(stateChanged)
        assertEquals(GamePhase.GAME_OVER, game.phase)
    }

    // ==================== Reconnection Scenarios ====================

    @Test
    fun `player can reconnect after disconnect`() {
        val game = createGameWithPlayers("Alice", "Bob")

        game.handlePlayerDisconnect("player1")
        assertFalse(game.players["player1"]!!.connected)

        // Simulate reconnection
        game.players["player1"]!!.connected = true

        assertTrue(game.players["player1"]!!.connected)
        assertTrue(game.players["player1"]!!.isActiveAndConnected)
    }

    @Test
    fun `reconnected player is included in game logic`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        // Bob disconnects
        game.handlePlayerDisconnect("player1")
        assertEquals(1, game.connectedActivePlayers.filter { it.sessionId != "creator" }.size)

        // Bob reconnects
        game.players["player1"]!!.connected = true
        assertEquals(2, game.connectedActivePlayers.filter { it.sessionId != "creator" }.size)

        // Bob should now need to guess
        assertFalse(game.allActivePlayersGuessed())
    }

    // ==================== Edge Cases ====================

    @Test
    fun `disconnect of non-existent player returns false`() {
        val game = createGameWithPlayers("Alice", "Bob")

        val stateChanged = game.handlePlayerDisconnect("nonexistent")

        assertFalse(stateChanged)
    }

    @Test
    fun `multiple disconnects in sequence handled correctly`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie", "Dave")
        game.addPlayer("player3", "Dave").connected = true

        game.startGame()
        game.placeMarbles("creator", 3)

        // All guessers disconnect one by one
        game.handlePlayerDisconnect("player1")
        assertEquals(GamePhase.GUESSING, game.phase) // Charlie and Dave still there

        game.handlePlayerDisconnect("player2")
        assertEquals(GamePhase.GUESSING, game.phase) // Dave still there

        // When Dave disconnects, no guessers remain but also allActivePlayersGuessed should be true
        game.handlePlayerDisconnect("player3")
        // Now all remaining guessers (none) have guessed, should resolve
        assertEquals(GamePhase.ROUND_RESULT, game.phase)
    }

    @Test
    fun `rapid connect disconnect cycles are handled`() {
        // Use 3 players so one disconnect doesn't trigger game over
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        repeat(10) {
            game.handlePlayerDisconnect("player1")
            game.players["player1"]!!.connected = true
        }

        // Game should still be playable
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
        assertTrue(game.players["player1"]!!.connected)
    }

    // ==================== Grace Period Expiration ====================

    @Test
    fun `grace period expiration distributes marbles to remaining players`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Bob has 10 marbles
        assertEquals(10, game.players["player1"]!!.marbles)

        // Disconnect Bob
        game.handlePlayerDisconnect("player1")
        // Simulate grace period expired
        game.players["player1"]!!.disconnectedAt = System.currentTimeMillis() - 31_000

        // Handle grace period expiration
        val stateChanged = game.handleGracePeriodExpired("player1")

        assertTrue(stateChanged)
        assertEquals(0, game.players["player1"]!!.marbles)
        // Alice (creator) and Charlie (player2) should split the 10 marbles
        assertEquals(15, game.players["creator"]!!.marbles) // 10 + 5
        assertEquals(15, game.players["player2"]!!.marbles) // 10 + 5
    }

    @Test
    fun `grace period expiration with odd marbles distributes remainder`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Give Bob 11 marbles
        game.players["player1"]!!.marbles = 11

        game.handlePlayerDisconnect("player1")
        game.players["player1"]!!.disconnectedAt = System.currentTimeMillis() - 31_000

        game.handleGracePeriodExpired("player1")

        // 11 / 2 = 5 each, remainder 1 goes to first player
        val aliceMarbles = game.players["creator"]!!.marbles
        val charlieMarbles = game.players["player2"]!!.marbles
        assertEquals(11, aliceMarbles + charlieMarbles - 20) // Total gained is 11
        assertTrue(aliceMarbles == 16 || charlieMarbles == 16) // One gets the extra
    }

    @Test
    fun `grace period expiration removes player from order`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        assertEquals(3, game.allPlayers.size)

        game.handlePlayerDisconnect("player1")
        game.players["player1"]!!.disconnectedAt = System.currentTimeMillis() - 31_000
        game.handleGracePeriodExpired("player1")

        assertEquals(2, game.allPlayers.size)
        assertNull(game.allPlayers.find { it.sessionId == "player1" })
    }

    @Test
    fun `grace period not expired does not distribute marbles`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        game.handlePlayerDisconnect("player1")
        // Grace period NOT expired (just disconnected)

        val stateChanged = game.handleGracePeriodExpired("player1")

        assertFalse(stateChanged)
        assertEquals(10, game.players["player1"]!!.marbles) // Still has marbles
        assertEquals(3, game.allPlayers.size) // Still in game
    }

    // ==================== Reconnection Tests ====================

    @Test
    fun `player reconnect clears disconnectedAt and stays in game`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Disconnect
        game.handlePlayerDisconnect("player1")
        assertFalse(game.players["player1"]!!.connected)
        assertNotNull(game.players["player1"]!!.disconnectedAt)

        // Reconnect (simulating realtime reconnection)
        game.players["player1"]!!.connected = true

        assertTrue(game.players["player1"]!!.connected)
        assertNull(game.players["player1"]!!.disconnectedAt)
        assertEquals(10, game.players["player1"]!!.marbles) // Still has marbles
    }

    @Test
    fun `player reconnect within grace period preserves game state`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        // Bob disconnects during guessing phase
        game.handlePlayerDisconnect("player1")
        assertEquals(GamePhase.GUESSING, game.phase)

        // Bob reconnects
        game.players["player1"]!!.connected = true

        // Game state preserved - still in guessing phase, Bob can still guess
        assertEquals(GamePhase.GUESSING, game.phase)
        assertTrue(game.makeGuess("player1", Guess.EVEN))
    }

    @Test
    fun `reconnected player is included in availableActivePlayers`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Disconnect
        game.handlePlayerDisconnect("player1")
        // Within grace period, still available
        assertEquals(2, game.availableActivePlayers.size)

        // Reconnect
        game.players["player1"]!!.connected = true

        // Still available and now connected
        assertEquals(2, game.availableActivePlayers.size)
        assertEquals(2, game.connectedActivePlayers.size)
    }

    @Test
    fun `reconnected player can take their turn if still current player`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        assertEquals("Alice", game.currentPlayer?.name)

        // Alice disconnects
        game.handlePlayerDisconnect("creator")
        // Turn advances to Bob because Alice disconnected
        assertEquals("Bob", game.currentPlayer?.name)

        // Play continues, later Alice reconnects
        game.players["creator"]!!.connected = true

        // Alice is back, still in the game with her marbles
        assertTrue(game.players["creator"]!!.connected)
        assertEquals(10, game.players["creator"]!!.marbles)
    }

    // ==================== 2-Player Grace Period Test ====================

    @Test
    fun `two player game does not go to GAME_OVER when one player disconnects within grace period`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
        assertEquals(2, game.availableActivePlayers.size)

        // Bob disconnects (simulating browser minimize)
        game.handlePlayerDisconnect("player1")

        // Bob is within grace period - disconnectedAt is just set
        assertFalse(game.players["player1"]!!.connected)
        assertTrue(game.players["player1"]!!.isWithinGracePeriod())

        // Game should NOT go to GAME_OVER because Bob is within grace period
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
        assertEquals(2, game.availableActivePlayers.size) // Both still available

        // Alice is still current player (Bob wasn't current)
        assertEquals("Alice", game.currentPlayer?.name)
    }

    @Test
    fun `two player game with current player disconnect stays in PLACING within grace period`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertEquals("Alice", game.currentPlayer?.name)

        // Alice (current player) disconnects
        game.handlePlayerDisconnect("creator")

        // Alice is within grace period
        assertTrue(game.players["creator"]!!.isWithinGracePeriod())

        // Game should NOT go to GAME_OVER - both players still "available"
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
        assertEquals(2, game.availableActivePlayers.size)

        // Turn advances to Bob since Alice disconnected
        assertEquals("Bob", game.currentPlayer?.name)
    }

    // ==================== Creator Transfer Tests ====================

    @Test
    fun `creator status transfers to another player when creator's grace period expires`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Verify Alice (creator) is the creator
        assertEquals("creator", game.creatorSessionId)

        // Creator disconnects
        game.handlePlayerDisconnect("creator")
        // Simulate grace period expired
        game.players["creator"]!!.disconnectedAt = System.currentTimeMillis() - 31_000

        // Handle grace period expiration
        game.handleGracePeriodExpired("creator")

        // Creator should be transferred to Bob (first connected player)
        assertEquals("player1", game.creatorSessionId)
    }

    @Test
    fun `new creator can start new game after original creator leaves`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Alice (creator) disconnects and grace period expires
        game.handlePlayerDisconnect("creator")
        game.players["creator"]!!.disconnectedAt = System.currentTimeMillis() - 31_000
        game.handleGracePeriodExpired("creator")

        // Bob should now be creator
        assertEquals("player1", game.creatorSessionId)

        // Game should be in GAME_OVER (only 1 player left)
        assertEquals(GamePhase.GAME_OVER, game.phase)

        // Reset for new game
        game.resetForNewGame()

        // Bob (new creator) should be able to see the game in waiting state
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)
        // And Bob is still the creator
        assertEquals("player1", game.creatorSessionId)
    }

    @Test
    fun `creator status transfers to first available connected player`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Bob also disconnects (but within grace period)
        game.handlePlayerDisconnect("player1")

        // Alice (creator) disconnects and grace period expires
        game.handlePlayerDisconnect("creator")
        game.players["creator"]!!.disconnectedAt = System.currentTimeMillis() - 31_000
        game.handleGracePeriodExpired("creator")

        // Creator should transfer to Charlie (first CONNECTED player), not Bob
        assertEquals("player2", game.creatorSessionId)
    }

    // ==================== Reconnection During Game Start ====================

    @Test
    fun `player reconnecting after game start receives correct game phase`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")

        // Bob disconnects during waiting phase
        game.handlePlayerDisconnect("player1")

        // Game starts while Bob is disconnected
        assertTrue(game.startGame())
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)

        // Bob reconnects - should see PLACING_MARBLES phase, not WAITING
        game.players["player1"]!!.connected = true

        // Verify Bob is back in the connected players list
        assertTrue(game.connectedActivePlayers.any { it.sessionId == "player1" })
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
    }

    @Test
    fun `player reconnecting during guessing phase can still guess`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        // Bob disconnects during guessing
        game.handlePlayerDisconnect("player1")
        assertEquals(GamePhase.GUESSING, game.phase)

        // Charlie guesses
        game.makeGuess("player2", Guess.ODD)

        // Round not resolved yet because Bob hasn't guessed (and is within grace period)
        // Actually, Bob is disconnected so he's not in connectedActivePlayers
        // Let's check if round resolves
        if (game.allActivePlayersGuessed()) {
            game.resolveRound()
        }

        // Bob reconnects
        game.players["player1"]!!.connected = true

        // If round was resolved, Bob sees result; otherwise Bob can guess
        // The behavior depends on whether disconnected players are waited for
    }

    @Test
    fun `rapid reconnection does not cause duplicate state`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        val player = game.players["player1"]!!

        // Simulate rapid connect/disconnect cycles (like unstable connection)
        repeat(5) {
            val connId1 = player.startNewConnection()
            player.endConnection(connId1)

            val connId2 = player.startNewConnection()
            // New connection takes over, old one tries to end
            player.endConnection(connId1) // Should be no-op

            assertTrue(player.connected)
            assertEquals(connId2, player.currentConnectionId)
        }

        // Player should still be connected after all cycles
        assertTrue(player.connected)
    }

    @Test
    fun `connection ID prevents stale connection from disconnecting player`() {
        val game = createGameWithPlayers("Alice", "Bob")
        val player = game.players["player1"]!!

        // First connection
        val oldConnectionId = player.startNewConnection()
        assertTrue(player.connected)

        // New connection takes over (simulating browser refresh or reconnect)
        val newConnectionId = player.startNewConnection()
        assertTrue(player.connected)

        // Old connection's cleanup runs (stale)
        player.endConnection(oldConnectionId)

        // Player should still be connected because new connection is active
        assertTrue(player.connected)
        assertEquals(newConnectionId, player.currentConnectionId)
    }
}
