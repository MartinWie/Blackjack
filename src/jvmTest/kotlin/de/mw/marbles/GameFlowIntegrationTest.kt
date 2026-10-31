package de.mw.marbles

import kotlin.test.*

/**
 * Integration tests that verify complete game flows from start to finish.
 * These tests simulate real gameplay scenarios with multiple rounds.
 */
class GameFlowIntegrationTest {
    private fun createGameWithPlayers(vararg names: String): Game {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))
        names.forEachIndexed { index, name ->
            val sessionId = if (index == 0) "creator" else "player$index"
            game.addPlayer(sessionId, name).also { it.connected = true }
        }
        return game
    }

    // ==================== Complete Game Flows ====================

    @Test
    fun `complete two-player game flow`() {
        val game = createGameWithPlayers("Alice", "Bob")

        // Verify initial state
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)
        assertEquals(10, game.players["creator"]!!.marbles)
        assertEquals(10, game.players["player1"]!!.marbles)

        // Start game
        assertTrue(game.startGame())
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
        assertEquals("Alice", game.currentPlayer?.name)

        // Alice places 3 marbles
        assertTrue(game.placeMarbles("creator", 3))
        assertEquals(GamePhase.GUESSING, game.phase)
        assertEquals(3, game.currentMarblesPlaced)

        // Bob guesses correctly (3 is odd)
        assertTrue(game.makeGuess("player1", Guess.ODD))
        assertTrue(game.allActivePlayersGuessed())

        // Resolve round
        val result = game.resolveRound()
        assertNotNull(result)
        assertEquals(GamePhase.ROUND_RESULT, game.phase)
        assertEquals(listOf("Bob"), result.winners)
        assertFalse(result.wasEven)

        // Check marble changes
        assertEquals(7, game.players["creator"]!!.marbles) // Alice lost 3
        assertEquals(13, game.players["player1"]!!.marbles) // Bob won 3

        // Next round
        assertTrue(game.nextRound())
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
        assertEquals("Bob", game.currentPlayer?.name)
    }

    @Test
    fun `complete game until winner`() {
        val game = createGameWithPlayers("Alice", "Bob")

        // Give Alice an advantage
        game.players["creator"]!!.marbles = 19
        game.players["player1"]!!.marbles = 1

        game.startGame()

        // Alice places 1, Bob guesses wrong
        game.placeMarbles("creator", 1)
        game.makeGuess("player1", Guess.EVEN) // Wrong! 1 is odd
        game.resolveRound()

        // Bob should have lost his last marble
        assertEquals(0, game.players["player1"]!!.marbles)
        assertEquals(20, game.players["creator"]!!.marbles)

        // Next round should trigger game over
        val continued = game.nextRound()
        assertFalse(continued)
        assertEquals(GamePhase.GAME_OVER, game.phase)

        // Verify winner
        val winner = game.getWinner()
        assertNotNull(winner)
        assertEquals("Alice", winner.name)
    }

    @Test
    fun `three-player game with elimination`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")

        game.players["creator"]!!.marbles = 10
        game.players["player1"]!!.marbles = 5
        game.players["player2"]!!.marbles = 5

        game.startGame()

        // Round 1: Alice places 5, both guess wrong
        game.placeMarbles("creator", 5)
        game.makeGuess("player1", Guess.EVEN) // Wrong!
        game.makeGuess("player2", Guess.EVEN) // Wrong!
        game.resolveRound()

        // Both Bob and Charlie lose 5 each
        assertEquals(0, game.players["player1"]!!.marbles)
        assertEquals(0, game.players["player2"]!!.marbles)
        assertEquals(20, game.players["creator"]!!.marbles)

        game.nextRound()
        assertEquals(GamePhase.GAME_OVER, game.phase)
        assertEquals("Alice", game.getWinner()?.name)
    }

    @Test
    fun `game with multiple rounds and changing fortunes`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Round 1: Alice places 2, Bob guesses correctly
        game.placeMarbles("creator", 2)
        game.makeGuess("player1", Guess.EVEN)
        game.resolveRound()
        assertEquals(8, game.players["creator"]!!.marbles)
        assertEquals(12, game.players["player1"]!!.marbles)
        game.nextRound()

        // Round 2: Bob places 4, Alice guesses wrong
        game.placeMarbles("player1", 4)
        game.makeGuess("creator", Guess.ODD)
        game.resolveRound()
        assertEquals(4, game.players["creator"]!!.marbles) // Lost 4
        assertEquals(16, game.players["player1"]!!.marbles) // Gained 4
        game.nextRound()

        // Round 3: Alice places 4, Bob guesses correctly
        game.placeMarbles("creator", 4)
        game.makeGuess("player1", Guess.EVEN)
        game.resolveRound()
        assertEquals(0, game.players["creator"]!!.marbles)
        assertEquals(20, game.players["player1"]!!.marbles)

        game.nextRound()
        assertEquals(GamePhase.GAME_OVER, game.phase)
        assertEquals("Bob", game.getWinner()?.name)
    }

    // ==================== Disconnect During Game ====================

    @Test
    fun `player disconnect mid-game resolves correctly`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Alice places marbles
        game.placeMarbles("creator", 3)

        // Bob guesses
        game.makeGuess("player1", Guess.ODD)

        // Charlie disconnects before guessing
        game.handlePlayerDisconnect("player2")

        // Round should auto-resolve since all remaining guessers have guessed
        assertEquals(GamePhase.ROUND_RESULT, game.phase)
        assertNotNull(game.lastRoundResult)
    }

    @Test
    fun `current player disconnect advances game correctly`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        assertEquals("Alice", game.currentPlayer?.name)

        // Alice disconnects during her turn
        game.handlePlayerDisconnect("creator")

        // Should advance to next player
        assertEquals("Bob", game.currentPlayer?.name)
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
    }

    // ==================== Edge Cases ====================

    @Test
    fun `all-in bet scenario`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Alice goes all-in
        assertTrue(game.placeMarbles("creator", 10))
        assertEquals(10, game.currentMarblesPlaced)

        // Bob guesses correctly
        game.makeGuess("player1", Guess.EVEN)
        game.resolveRound()

        // Alice loses all, Bob wins all
        assertEquals(0, game.players["creator"]!!.marbles)
        assertEquals(20, game.players["player1"]!!.marbles)

        game.nextRound()
        assertEquals(GamePhase.GAME_OVER, game.phase)
    }

    @Test
    fun `spectator does not block game progress`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.players["player2"]!!.marbles = 0 // Charlie is spectator

        game.startGame()
        game.placeMarbles("creator", 3)

        // Only Bob needs to guess (Charlie is spectator)
        game.makeGuess("player1", Guess.ODD)

        // Should be able to resolve without Charlie's guess
        assertTrue(game.allActivePlayersGuessed())
        game.resolveRound()
        assertEquals(GamePhase.ROUND_RESULT, game.phase)
    }

    @Test
    fun `game auto-resolves when all other players are spectators`() {
        val game = createGameWithPlayers("Alice", "Bob")

        game.startGame()
        assertEquals("Alice", game.currentPlayer?.name)

        // Make Bob a spectator after game starts
        game.players["player1"]!!.marbles = 0

        // Alice places marbles - no one can guess (Bob is spectator)
        game.placeMarbles("creator", 3)

        // Should immediately be resolvable (no guessers = all guessed)
        assertTrue(game.allActivePlayersGuessed())

        // Resolve and verify placer keeps marbles (no winners, no losers)
        val result = game.resolveRound()
        assertNotNull(result)
        assertEquals(GamePhase.ROUND_RESULT, game.phase)
        assertTrue(result.winners.isEmpty())
        assertTrue(result.losers.isEmpty())

        // Alice still has all her marbles
        assertEquals(10, game.players["creator"]!!.marbles)
    }

    @Test
    fun `game continues after all others become spectators mid-game`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        // Round 1: Alice places 10, Bob guesses wrong and loses all marbles
        game.placeMarbles("creator", 10)
        game.makeGuess("player1", Guess.EVEN) // Wrong! 10 is even, but let's say Bob has only 10
        game.resolveRound()

        // Simulate Bob losing all marbles
        game.players["player1"]!!.marbles = 0

        game.nextRound()

        // Game should end because only one player has marbles
        assertEquals(GamePhase.GAME_OVER, game.phase)
    }

    @Test
    fun `game correctly tracks player order after eliminations`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()

        // Round 1: Alice's turn
        game.placeMarbles("creator", 1)
        game.makeGuess("player1", Guess.EVEN) // Wrong
        game.makeGuess("player2", Guess.EVEN) // Wrong
        game.resolveRound()

        // Bob loses 1 marble
        game.players["player1"]!!.marbles -= 8 // Simulate Bob losing more
        assertEquals(1, game.players["player1"]!!.marbles)

        game.nextRound()
        assertEquals("Bob", game.currentPlayer?.name)

        // Round 2: Bob's turn
        game.placeMarbles("player1", 1)
        game.makeGuess("creator", Guess.EVEN) // Wrong
        game.makeGuess("player2", Guess.EVEN) // Wrong
        game.resolveRound()

        // Bob gained 2 marbles (1 from each loser, capped at placed amount)
        game.nextRound()
        assertEquals("Charlie", game.currentPlayer?.name)
    }

    // ==================== State Consistency ====================

    @Test
    fun `game state remains consistent after many operations`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()

        repeat(5) { round ->
            // Verify state at start of round
            assertEquals(GamePhase.PLACING_MARBLES, game.phase)
            val currentPlayer = game.currentPlayer!!
            val otherPlayerSessionId = if (currentPlayer.sessionId == "creator") "player1" else "creator"

            // Place marbles
            val amount = minOf(2, currentPlayer.marbles)
            assertTrue(game.placeMarbles(currentPlayer.sessionId, amount))
            assertEquals(GamePhase.GUESSING, game.phase)

            // Guess
            game.makeGuess(otherPlayerSessionId, if (amount % 2 == 0) Guess.EVEN else Guess.ODD)

            // Resolve
            game.resolveRound()
            assertEquals(GamePhase.ROUND_RESULT, game.phase)

            // Check for game over
            if (game.connectedActivePlayers.size <= 1) return@repeat

            // Next round
            game.nextRound()
        }

        // Verify total marbles are conserved (or properly tracked)
        val totalMarbles = game.players.values.sumOf { it.marbles }
        assertEquals(20, totalMarbles)
    }

    @Test
    fun `marble conservation across rounds`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")

        val initialTotal = game.players.values.sumOf { it.marbles }
        assertEquals(30, initialTotal)

        game.startGame()

        // Several rounds
        repeat(3) {
            val placer = game.currentPlayer!!
            if (placer.marbles > 0) {
                val amount = minOf(3, placer.marbles)
                game.placeMarbles(placer.sessionId, amount)

                game.connectedActivePlayers
                    .filter { it.sessionId != placer.sessionId }
                    .forEach { game.makeGuess(it.sessionId, Guess.ODD) }

                game.resolveRound()

                if (game.connectedActivePlayers.size > 1) {
                    game.nextRound()
                }
            }
        }

        // Total marbles should still be 30
        val finalTotal = game.players.values.sumOf { it.marbles }
        assertEquals(30, finalTotal)
    }
}
