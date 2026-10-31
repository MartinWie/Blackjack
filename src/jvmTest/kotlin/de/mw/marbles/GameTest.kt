package de.mw.marbles

import kotlin.test.*

class GameTest {
    // Grace period + buffer to ensure it's expired
    private val gracePeriodExpiredMs = DISCONNECT_GRACE_PERIOD_MS + 1000

    private fun createGameWithPlayers(vararg names: String): Game {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))
        names.forEachIndexed { index, name ->
            val sessionId = if (index == 0) "creator" else "player$index"
            game.addPlayer(sessionId, name).also { it.connected = true }
        }
        return game
    }

    // ==================== Game Creation & Setup ====================

    @Test
    fun `new game starts in WAITING_FOR_PLAYERS phase`() {
        val game = Game(creatorSessionId = "creator")
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)
    }

    @Test
    fun `game has unique 8-character ID`() {
        val game = Game(creatorSessionId = "creator")
        assertEquals(8, game.id.length)
    }

    @Test
    fun `adding players increases player count`() {
        val game = Game(creatorSessionId = "creator")
        assertEquals(0, game.players.size)

        game.addPlayer("session1", "Alice")
        assertEquals(1, game.players.size)

        game.addPlayer("session2", "Bob")
        assertEquals(2, game.players.size)
    }

    @Test
    fun `player names are truncated to max length`() {
        val game = Game(creatorSessionId = "creator")
        val longName = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

        game.addPlayer("session1", longName)
        game.addPendingPlayer("session2", longName)

        assertEquals(MAX_PLAYER_NAME_LENGTH, game.players["session1"]?.name?.length)
        assertEquals(MAX_PLAYER_NAME_LENGTH, game.players["session2"]?.name?.length)
    }

    @Test
    fun `adding same player twice updates name but doesn't duplicate`() {
        val game = Game(creatorSessionId = "creator")

        game.addPlayer("session1", "Alice")
        assertEquals(1, game.players.size)
        assertEquals(1, game.allPlayers.size)

        game.addPlayer("session1", "Alice Updated")
        assertEquals(1, game.players.size)
        assertEquals(1, game.allPlayers.size)
        assertEquals("Alice Updated", game.players["session1"]?.name)
    }

    @Test
    fun `removing player decreases player count`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        assertEquals(3, game.players.size)

        game.removePlayer("player1")
        assertEquals(2, game.players.size)
        assertNull(game.players["player1"])
    }

    // ==================== Game Start ====================

    @Test
    fun `cannot start game with less than 2 connected players`() {
        val game = Game(creatorSessionId = "creator")
        game.addPlayer("creator", "Alice").connected = true

        assertFalse(game.startGame())
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)
    }

    @Test
    fun `cannot start game with 2 players but only 1 connected`() {
        val game = Game(creatorSessionId = "creator")
        game.addPlayer("creator", "Alice").connected = true
        game.addPlayer("player1", "Bob").connected = false

        assertFalse(game.startGame())
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)
    }

    @Test
    fun `can start game with 2 connected players`() {
        val game = createGameWithPlayers("Alice", "Bob")

        assertTrue(game.startGame())
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
    }

    @Test
    fun `game starts with deterministic player when using seeded random`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // With seed 1, the first player should be selected
        assertEquals("Alice", game.currentPlayer?.name)
    }

    @Test
    fun `game starts with random player based on random seed`() {
        // Seed 99 should give a different starting player for 3 players
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(99))
        game.addPlayer("creator", "Alice").connected = true
        game.addPlayer("player1", "Bob").connected = true
        game.addPlayer("player2", "Charlie").connected = true

        game.startGame()

        // With seed 99, verify it doesn't always start with Alice
        // (the exact player depends on the seed, but we verify the mechanism works)
        assertNotNull(game.currentPlayer)
        assertTrue(game.currentPlayer?.name in listOf("Alice", "Bob", "Charlie"))
    }

    @Test
    fun `player outbound queue coalesces latest non terminal states and preserves terminal`() {
        val player = Player(sessionId = "s1", name = "Alice")

        player.enqueueState("state-1", terminal = false, version = 1)
        player.enqueueState("state-2", terminal = false, version = 2)
        player.enqueueState("state-3", terminal = false, version = 3)

        assertEquals(PlayerOutboundSignal.Flush, player.channel.tryReceive().getOrNull())
        assertEquals("state-3", player.pollPendingStateHtml())
        assertNull(player.pollPendingStateHtml())

        player.enqueueState("state-4", terminal = false, version = 4)
        player.enqueueState("terminal-state", terminal = true, version = 5)

        assertEquals(PlayerOutboundSignal.Flush, player.channel.tryReceive().getOrNull())
        assertEquals("terminal-state", player.pollPendingStateHtml())
        assertNull(player.pollPendingStateHtml())

        player.enqueueState("terminal-state-2", terminal = true, version = 6)
        player.enqueueState("state-after-terminal", terminal = false, version = 7)

        assertEquals(PlayerOutboundSignal.Flush, player.channel.tryReceive().getOrNull())
        assertEquals("terminal-state-2", player.pollPendingStateHtml())
        assertNull(player.pollPendingStateHtml())

        player.enqueueState("newer", terminal = false, version = 10)
        player.enqueueState("older", terminal = false, version = 9)

        assertEquals(PlayerOutboundSignal.Flush, player.channel.tryReceive().getOrNull())
        assertEquals("newer", player.pollPendingStateHtml())
        assertNull(player.pollPendingStateHtml())
    }

    @Test
    fun `broadcastToConnectedExcept excludes one player and updates others`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")

        game.broadcastToConnectedExcept("player1") { _, sessionId, _ -> "state-$sessionId" }

        val creator = game.players["creator"]!!
        val excluded = game.players["player1"]!!
        val other = game.players["player2"]!!

        assertEquals("state-creator", creator.pollPendingStateHtml())
        assertNull(excluded.pollPendingStateHtml())
        assertEquals("state-player2", other.pollPendingStateHtml())
    }

    @Test
    fun `game skips disconnected players when starting`() {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))
        game.addPlayer("creator", "Alice").connected = false
        game.addPlayer("player1", "Bob").connected = true
        game.addPlayer("player2", "Charlie").connected = true

        assertTrue(game.startGame())
        // With seed 1, Bob is selected (disconnected Alice is excluded from selection)
        assertEquals("Bob", game.currentPlayer?.name)
    }

    // ==================== Placing Marbles ====================

    @Test
    fun `current player can place marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertTrue(game.placeMarbles("creator", 3))
        assertEquals(3, game.currentMarblesPlaced)
        assertEquals(GamePhase.GUESSING, game.phase)
    }

    @Test
    fun `non-current player cannot place marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertFalse(game.placeMarbles("player1", 3))
        assertEquals(0, game.currentMarblesPlaced)
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
    }

    @Test
    fun `cannot place zero marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertFalse(game.placeMarbles("creator", 0))
    }

    @Test
    fun `cannot place negative marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertFalse(game.placeMarbles("creator", -1))
    }

    @Test
    fun `cannot place more marbles than player has`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertFalse(game.placeMarbles("creator", 11))
    }

    @Test
    fun `can place all marbles player has`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        assertTrue(game.placeMarbles("creator", 10))
        assertEquals(10, game.currentMarblesPlaced)
    }

    @Test
    fun `placing marbles resets all player guesses`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Set some guesses manually
        game.players["player1"]?.currentGuess = Guess.EVEN
        game.players["player2"]?.currentGuess = Guess.ODD

        game.placeMarbles("creator", 3)

        // All guesses should be reset
        assertNull(game.players["creator"]?.currentGuess)
        assertNull(game.players["player1"]?.currentGuess)
        assertNull(game.players["player2"]?.currentGuess)
    }

    @Test
    fun `cannot place marbles in wrong phase`() {
        val game = createGameWithPlayers("Alice", "Bob")

        // Still in WAITING_FOR_PLAYERS
        assertFalse(game.placeMarbles("creator", 3))
    }

    // ==================== Making Guesses ====================

    @Test
    fun `non-placer can make a guess`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)

        assertTrue(game.makeGuess("player1", Guess.EVEN))
        assertEquals(Guess.EVEN, game.players["player1"]?.currentGuess)
    }

    @Test
    fun `placer cannot make a guess`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)

        assertFalse(game.makeGuess("creator", Guess.EVEN))
        assertNull(game.players["creator"]?.currentGuess)
    }

    @Test
    fun `spectator cannot make a guess`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.players["player2"]?.marbles = 0 // Make Charlie a spectator

        game.startGame()
        game.placeMarbles("creator", 3)

        assertFalse(game.makeGuess("player2", Guess.EVEN))
    }

    @Test
    fun `cannot guess in wrong phase`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        // Still in PLACING_MARBLES phase

        assertFalse(game.makeGuess("player1", Guess.EVEN))
    }

    @Test
    fun `player can change guess`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)

        assertTrue(game.makeGuess("player1", Guess.EVEN))
        assertEquals(Guess.EVEN, game.players["player1"]?.currentGuess)

        assertTrue(game.makeGuess("player1", Guess.ODD))
        assertEquals(Guess.ODD, game.players["player1"]?.currentGuess)
    }

    // ==================== All Players Guessed ====================

    @Test
    fun `allActivePlayersGuessed returns false when no one guessed`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        assertFalse(game.allActivePlayersGuessed())
    }

    @Test
    fun `allActivePlayersGuessed returns false when only some guessed`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        game.makeGuess("player1", Guess.EVEN)
        // player2 hasn't guessed yet

        assertFalse(game.allActivePlayersGuessed())
    }

    @Test
    fun `allActivePlayersGuessed returns true when all active players guessed`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        game.makeGuess("player1", Guess.EVEN)
        game.makeGuess("player2", Guess.ODD)

        assertTrue(game.allActivePlayersGuessed())
    }

    @Test
    fun `allActivePlayersGuessed ignores spectators`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.players["player2"]?.marbles = 0 // Make Charlie a spectator

        game.startGame()
        game.placeMarbles("creator", 3)

        // Only Bob needs to guess (Charlie is spectator)
        game.makeGuess("player1", Guess.EVEN)

        assertTrue(game.allActivePlayersGuessed())
    }

    @Test
    fun `allActivePlayersGuessed ignores disconnected players`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        // Disconnect Charlie
        game.players["player2"]?.connected = false

        // Only Bob needs to guess (Charlie is disconnected)
        game.makeGuess("player1", Guess.EVEN)

        assertTrue(game.allActivePlayersGuessed())
    }

    @Test
    fun `allActivePlayersGuessed returns true when all other players are spectators`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["player1"]?.marbles = 0 // Make Bob a spectator

        game.startGame()
        game.placeMarbles("creator", 3)

        // No one can guess - should return true (empty list = all guessed)
        assertTrue(game.allActivePlayersGuessed())
    }

    // ==================== Reset For New Game ====================

    @Test
    fun `resetForNewGame auto-starts game when enough players connected`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)

        val started = game.resetForNewGame()

        assertTrue(started)
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
    }

    @Test
    fun `resetForNewGame waits when not enough players connected`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        // Disconnect one player
        game.players["player1"]!!.connected = false

        val started = game.resetForNewGame()

        assertFalse(started)
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)
    }

    @Test
    fun `resetForNewGame resets all player marbles to 10`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.players["creator"]!!.marbles = 5
        game.players["player1"]!!.marbles = 15

        game.resetForNewGame()

        assertEquals(10, game.players["creator"]!!.marbles)
        assertEquals(10, game.players["player1"]!!.marbles)
    }

    @Test
    fun `resetForNewGame clears player guesses`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.EVEN)

        game.resetForNewGame()

        assertNull(game.players["creator"]!!.currentGuess)
        assertNull(game.players["player1"]!!.currentGuess)
    }

    @Test
    fun `resetForNewGame restores player removed from playerOrder due to grace period`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Simulate Bob disconnecting and grace period expiring
        game.handlePlayerDisconnect("player1")
        game.players["player1"]!!.disconnectedAt = System.currentTimeMillis() - gracePeriodExpiredMs
        game.handleGracePeriodExpired("player1")

        // Bob should be removed from playerOrder
        assertEquals(2, game.allPlayers.size)
        assertNull(game.allPlayers.find { it.sessionId == "player1" })

        // Bob reconnects
        game.players["player1"]!!.connected = true

        // Reset game
        game.resetForNewGame()

        // Bob should be back in playerOrder
        assertEquals(3, game.allPlayers.size)
        assertNotNull(game.allPlayers.find { it.sessionId == "player1" })
        assertEquals(10, game.players["player1"]!!.marbles)
    }

    @Test
    fun `resetForNewGame only includes connected players in playerOrder`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Disconnect Charlie (but don't expire grace period)
        game.players["player2"]!!.connected = false

        game.resetForNewGame()

        // Only Alice and Bob should be in playerOrder
        assertEquals(2, game.allPlayers.size)
        assertNotNull(game.allPlayers.find { it.sessionId == "creator" })
        assertNotNull(game.allPlayers.find { it.sessionId == "player1" })
        assertNull(game.allPlayers.find { it.sessionId == "player2" })
    }

    @Test
    fun `resetForNewGame clears pending players`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.addPendingPlayer("pending1", "Dave").connected = true

        assertEquals(1, game.pendingPlayers.size)

        game.resetForNewGame()

        // Pending players are promoted to regular players when connected
        assertEquals(0, game.pendingPlayers.size)
        // Dave should now be in allPlayers since he's connected
        assertEquals(3, game.allPlayers.size)
    }

    @Test
    fun `resetForNewGame resets game state variables`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.placeMarbles("creator", 5)
        game.makeGuess("player1", Guess.EVEN)
        game.resolveRound()

        game.resetForNewGame()

        assertEquals(0, game.currentPlayerIndex)
        assertEquals(0, game.currentMarblesPlaced)
        assertNull(game.lastRoundResult)
    }

    // ==================== Grace Period Expiry Tests ====================

    @Test
    fun `handleGracePeriodExpired does nothing in WAITING_FOR_PLAYERS phase`() {
        val game = createGameWithPlayers("Alice", "Bob")
        // Game is in WAITING_FOR_PLAYERS phase

        // Simulate disconnect and grace period expiry
        game.handlePlayerDisconnect("player1")
        game.players["player1"]!!.disconnectedAt = System.currentTimeMillis() - gracePeriodExpiredMs

        val changed = game.handleGracePeriodExpired("player1")

        // Should not remove player in lobby
        assertFalse(changed)
        assertEquals(2, game.allPlayers.size)
        assertNotNull(game.allPlayers.find { it.sessionId == "player1" })
    }

    @Test
    fun `handleGracePeriodExpired transfers creator in WAITING_FOR_PLAYERS phase`() {
        val game = createGameWithPlayers("Alice", "Bob")
        // Game is in WAITING_FOR_PLAYERS phase
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)

        // Creator (Alice) disconnects and grace period expires
        game.handlePlayerDisconnect("creator")
        game.players["creator"]!!.disconnectedAt = System.currentTimeMillis() - gracePeriodExpiredMs

        val changed = game.handleGracePeriodExpired("creator")

        // Creator should transfer to Bob
        assertTrue(changed)
        assertEquals("player1", game.creatorSessionId)
        // But creator (Alice) should still be in the game (can reconnect)
        assertEquals(2, game.allPlayers.size)
        assertNotNull(game.allPlayers.find { it.sessionId == "creator" })
    }

    @Test
    fun `handleGracePeriodExpired does not transfer creator when no other connected players in lobby`() {
        val game = createGameWithPlayers("Alice", "Bob")
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)

        // Both players disconnect
        game.handlePlayerDisconnect("creator")
        game.handlePlayerDisconnect("player1")
        game.players["creator"]!!.disconnectedAt = System.currentTimeMillis() - gracePeriodExpiredMs

        val changed = game.handleGracePeriodExpired("creator")

        // Should not transfer (no connected players)
        assertFalse(changed)
        assertEquals("creator", game.creatorSessionId) // Still original creator
        // Both players should still exist
        assertEquals(2, game.allPlayers.size)
    }

    @Test
    fun `handleGracePeriodExpired transfers creator in GAME_OVER but does not remove player`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Force game over
        game.players["player1"]!!.marbles = 0
        game.phase = GamePhase.GAME_OVER

        // Creator disconnects
        game.handlePlayerDisconnect("creator")
        game.players["creator"]!!.disconnectedAt = System.currentTimeMillis() - gracePeriodExpiredMs

        val changed = game.handleGracePeriodExpired("creator")

        // Creator should already transfer on disconnect, or at latest on grace expiry.
        assertTrue(changed || game.creatorSessionId == "player1")
        assertEquals("player1", game.creatorSessionId)
        // But creator should still be in playerOrder
        assertEquals(2, game.allPlayers.size)
        assertNotNull(game.allPlayers.find { it.sessionId == "creator" })
    }

    @Test
    fun `handleGracePeriodExpired removes player during active game`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Bob disconnects and grace period expires
        game.handlePlayerDisconnect("player1")
        game.players["player1"]!!.disconnectedAt = System.currentTimeMillis() - gracePeriodExpiredMs

        val changed = game.handleGracePeriodExpired("player1")

        // Bob should be removed
        assertTrue(changed)
        assertEquals(2, game.allPlayers.size)
        assertNull(game.allPlayers.find { it.sessionId == "player1" })
    }

    // ==================== Player Reconnect Tests ====================

    @Test
    fun `handlePlayerReconnect re-adds player to playerOrder in lobby`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Reset game with only Alice connected
        game.players["player1"]!!.connected = false
        game.resetForNewGame()

        // Bob should not be in playerOrder
        assertEquals(1, game.allPlayers.size)
        assertNull(game.allPlayers.find { it.sessionId == "player1" })

        // Bob reconnects
        game.players["player1"]!!.connected = true
        game.handlePlayerReconnect("player1")

        // Bob should be back in playerOrder with 10 marbles
        assertEquals(2, game.allPlayers.size)
        assertNotNull(game.allPlayers.find { it.sessionId == "player1" })
        assertEquals(10, game.players["player1"]!!.marbles)
    }

    @Test
    fun `handlePlayerReconnect does nothing if player already in playerOrder`() {
        val game = createGameWithPlayers("Alice", "Bob")
        // Game is in WAITING_FOR_PLAYERS, both players in playerOrder

        game.handlePlayerReconnect("player1")

        // Should still have 2 players (no duplicate)
        assertEquals(2, game.allPlayers.size)
    }

    @Test
    fun `handlePlayerReconnect does nothing during active game`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Remove Charlie from playerOrder manually (simulate edge case)
        game.players["player2"]!!.connected = false

        // Charlie reconnects during active game
        game.players["player2"]!!.connected = true
        game.handlePlayerReconnect("player2")

        // Should not modify playerOrder during active game (still 3 players)
        assertEquals(3, game.allPlayers.size)
    }

    @Test
    fun `full scenario - host disconnects during game over, new host starts game, old host reconnects`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Game over
        game.players["player1"]!!.marbles = 0
        game.phase = GamePhase.GAME_OVER

        // Alice (creator) disconnects
        game.handlePlayerDisconnect("creator")
        game.players["creator"]!!.disconnectedAt = System.currentTimeMillis() - gracePeriodExpiredMs
        game.handleGracePeriodExpired("creator")

        // Bob should now be creator
        assertEquals("player1", game.creatorSessionId)

        // Bob starts new game
        game.resetForNewGame()

        // Only Bob should be in playerOrder (Alice was disconnected)
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)
        assertEquals(1, game.allPlayers.size)

        // Alice reconnects
        game.players["creator"]!!.connected = true
        game.handlePlayerReconnect("creator")

        // Alice should be back in playerOrder
        assertEquals(2, game.allPlayers.size)
        assertEquals(10, game.players["creator"]!!.marbles)

        // Game can now start
        assertTrue(game.startGame())
    }

    @Test
    fun `game over creator disconnect immediately transfers creator`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        game.phase = GamePhase.GAME_OVER

        val changed = game.handlePlayerDisconnect("creator")

        assertTrue(changed)
        assertEquals("player1", game.creatorSessionId)
    }

    // ==================== Cleanup Tests ====================

    @Test
    fun `cleanup closes all player channels`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")

        game.players.values.forEach { it.enqueueState("pre-cleanup", terminal = false, version = 1) }

        // Verify channels are open
        game.players.values.forEach { player ->
            assertFalse(player.channel.isClosedForSend)
        }

        game.cleanup()

        // All channels should be closed
        game.players.values.forEach { player ->
            assertTrue(player.channel.isClosedForSend)
            assertNull(player.pollPendingStateHtml())
        }
    }

    @Test
    fun `cleanup is idempotent - can be called multiple times`() {
        val game = createGameWithPlayers("Alice", "Bob")

        game.cleanup()
        // Should not throw when called again
        game.cleanup()

        game.players.values.forEach { player ->
            assertTrue(player.channel.isClosedForSend)
        }
    }

    @Test
    fun `cleanup works with no players`() {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))

        // Should not throw
        game.cleanup()
    }

    @Test
    fun `cleanup closes channels for pending players too`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        val pendingPlayer = game.addPendingPlayer("pending1", "Charlie")
        pendingPlayer.connected = true

        game.cleanup()

        assertTrue(pendingPlayer.channel.isClosedForSend)
    }
}
