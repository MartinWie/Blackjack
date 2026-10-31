package de.mw.marbles

import kotlin.test.*

class RoundResolutionTest {
    private fun createGameWithPlayers(vararg names: String): Game {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))
        names.forEachIndexed { index, name ->
            val sessionId = if (index == 0) "creator" else "player$index"
            game.addPlayer(sessionId, name).also { it.connected = true }
        }
        return game
    }

    private fun setupGuessing(
        game: Game,
        marblesPlaced: Int,
    ): Boolean {
        if (!game.startGame()) return false
        return game.placeMarbles("creator", marblesPlaced)
    }

    // ==================== Even/Odd Detection ====================

    @Test
    fun `even number of marbles is detected as even`() {
        val game = createGameWithPlayers("Alice", "Bob")
        setupGuessing(game, 4)

        game.makeGuess("player1", Guess.EVEN)
        val result = game.resolveRound()

        assertNotNull(result)
        assertTrue(result.wasEven)
    }

    @Test
    fun `odd number of marbles is detected as odd`() {
        val game = createGameWithPlayers("Alice", "Bob")
        setupGuessing(game, 3)

        game.makeGuess("player1", Guess.ODD)
        val result = game.resolveRound()

        assertNotNull(result)
        assertFalse(result.wasEven)
    }

    @Test
    fun `one marble is odd`() {
        val game = createGameWithPlayers("Alice", "Bob")
        setupGuessing(game, 1)

        game.makeGuess("player1", Guess.ODD)
        val result = game.resolveRound()

        assertNotNull(result)
        assertFalse(result.wasEven)
    }

    @Test
    fun `two marbles is even`() {
        val game = createGameWithPlayers("Alice", "Bob")
        setupGuessing(game, 2)

        game.makeGuess("player1", Guess.EVEN)
        val result = game.resolveRound()

        assertNotNull(result)
        assertTrue(result.wasEven)
    }

    // ==================== Winner Gets Marbles ====================

    @Test
    fun `single winner gets all placed marbles`() {
        val game = createGameWithPlayers("Alice", "Bob")
        val aliceStartMarbles = game.players["creator"]!!.marbles
        val bobStartMarbles = game.players["player1"]!!.marbles

        setupGuessing(game, 4) // Even
        game.makeGuess("player1", Guess.EVEN) // Bob guesses correctly

        val result = game.resolveRound()

        assertNotNull(result)
        assertEquals(listOf("Bob"), result.winners)
        assertTrue(result.losers.isEmpty())
        assertEquals(4, result.marblesWonPerWinner)

        // Bob should have gained marbles, Alice should have lost
        assertEquals(bobStartMarbles + 4, game.players["player1"]!!.marbles)
        assertEquals(aliceStartMarbles - 4, game.players["creator"]!!.marbles)
    }

    @Test
    fun `multiple winners split marbles evenly`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        setupGuessing(game, 4) // Even, will be split between 2 winners

        game.makeGuess("player1", Guess.EVEN) // Bob correct
        game.makeGuess("player2", Guess.EVEN) // Charlie correct

        val result = game.resolveRound()

        assertNotNull(result)
        assertEquals(2, result.winners.size)
        assertTrue(result.winners.contains("Bob"))
        assertTrue(result.winners.contains("Charlie"))
        assertEquals(2, result.marblesWonPerWinner) // 4 / 2 = 2 each

        // Both should have gained 2
        assertEquals(12, game.players["player1"]!!.marbles)
        assertEquals(12, game.players["player2"]!!.marbles)
        // Alice loses 4
        assertEquals(6, game.players["creator"]!!.marbles)
    }

    @Test
    fun `odd split rounds down for winners`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        setupGuessing(game, 3) // Odd, to be split between 2 winners = 1 each

        game.makeGuess("player1", Guess.ODD) // Bob correct
        game.makeGuess("player2", Guess.ODD) // Charlie correct

        val result = game.resolveRound()

        assertNotNull(result)
        assertEquals(1, result.marblesWonPerWinner) // 3 / 2 = 1 each (floor division)

        // Each winner gets 1 (total 2 paid out)
        assertEquals(11, game.players["player1"]!!.marbles)
        assertEquals(11, game.players["player2"]!!.marbles)
        // Alice loses only 2 (not 3, due to rounding)
        assertEquals(8, game.players["creator"]!!.marbles)
    }

    @Test
    fun `placer with insufficient marbles pays what they have to winners`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie", "Dave")
        game.addPlayer("player3", "Dave").connected = true

        // Alice places 6 marbles (she has 10, so this is valid)
        // 3 winners would each get 6/3 = 2 marbles
        // But we'll set Alice to have fewer marbles after placing (simulating edge case)
        game.startGame()
        game.placeMarbles("creator", 6) // Alice bets 6

        // Reduce Alice's marbles to test the safety bounds
        // (In normal gameplay this can't happen mid-round)
        game.players["creator"]!!.marbles = 4 // Alice only has 4 now

        game.makeGuess("player1", Guess.EVEN) // Bob correct (6 is even)
        game.makeGuess("player2", Guess.EVEN) // Charlie correct
        game.makeGuess("player3", Guess.EVEN) // Dave correct

        game.resolveRound()

        // marblesWonPerWinner = 6/3 = 2
        // totalPayout = 2*3 = 6
        // marblesLostByPlacer = min(6, 4) = 4
        // actualPerWinner = 4/3 = 1 (integer division)
        // Each winner gets 1, total distributed = 3
        // Note: 1 marble is "lost" to rounding when placer can't fully pay

        assertEquals(0, game.players["creator"]!!.marbles) // Alice: 4 - 4 = 0
        assertEquals(11, game.players["player1"]!!.marbles) // Bob: 10 + 1 = 11
        assertEquals(11, game.players["player2"]!!.marbles) // Charlie: 10 + 1 = 11
        assertEquals(11, game.players["player3"]!!.marbles) // Dave: 10 + 1 = 11
        // Total: 0 + 11 + 11 + 11 = 33 (was 4 + 10 + 10 + 10 = 34)
        // 1 marble lost to double rounding - acceptable for this edge case
    }

    // ==================== Loser Pays Placer ====================

    @Test
    fun `single loser pays placer the placed amount`() {
        val game = createGameWithPlayers("Alice", "Bob")
        val aliceStartMarbles = game.players["creator"]!!.marbles
        val bobStartMarbles = game.players["player1"]!!.marbles

        setupGuessing(game, 3) // Odd
        game.makeGuess("player1", Guess.EVEN) // Bob guesses wrong

        val result = game.resolveRound()

        assertNotNull(result)
        assertTrue(result.winners.isEmpty())
        assertEquals(listOf("Bob"), result.losers)

        // Bob loses 3 marbles to Alice
        assertEquals(bobStartMarbles - 3, game.players["player1"]!!.marbles)
        assertEquals(aliceStartMarbles + 3, game.players["creator"]!!.marbles)
    }

    @Test
    fun `multiple losers each pay placer`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        val aliceStartMarbles = game.players["creator"]!!.marbles

        setupGuessing(game, 3) // Odd
        game.makeGuess("player1", Guess.EVEN) // Bob wrong
        game.makeGuess("player2", Guess.EVEN) // Charlie wrong

        val result = game.resolveRound()

        assertNotNull(result)
        assertEquals(2, result.losers.size)

        // Each loser pays 3 marbles
        assertEquals(7, game.players["player1"]!!.marbles)
        assertEquals(7, game.players["player2"]!!.marbles)
        // Alice gains 3 + 3 = 6
        assertEquals(aliceStartMarbles + 6, game.players["creator"]!!.marbles)
    }

    @Test
    fun `loser cannot pay more than they have`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.players["player1"]!!.marbles = 2 // Bob only has 2 marbles

        setupGuessing(game, 5) // Odd, would normally cost 5
        game.makeGuess("player1", Guess.EVEN) // Bob wrong

        game.resolveRound()

        // Bob can only lose 2 (all he has)
        assertEquals(0, game.players["player1"]!!.marbles)
        // Alice gains only 2
        assertEquals(12, game.players["creator"]!!.marbles)
    }

    // ==================== Mixed Winners and Losers ====================

    @Test
    fun `some winners some losers - winners get marbles and losers lose marbles`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie", "Dave")

        // Add Dave manually
        game.addPlayer("player3", "Dave").connected = true

        setupGuessing(game, 4) // Even
        game.makeGuess("player1", Guess.EVEN) // Bob correct
        game.makeGuess("player2", Guess.ODD) // Charlie wrong
        game.makeGuess("player3", Guess.EVEN) // Dave correct

        val result = game.resolveRound()

        assertNotNull(result)
        assertEquals(2, result.winners.size)
        assertEquals(1, result.losers.size)
        assertTrue(result.winners.contains("Bob"))
        assertTrue(result.winners.contains("Dave"))
        assertTrue(result.losers.contains("Charlie"))

        // Winners split the 4 marbles = 2 each
        assertEquals(12, game.players["player1"]!!.marbles) // Bob: 10 + 2 = 12
        assertEquals(12, game.players["player3"]!!.marbles) // Dave: 10 + 2 = 12
        // Charlie loses 4 marbles to placer (wrong guess)
        assertEquals(6, game.players["player2"]!!.marbles) // Charlie: 10 - 4 = 6
        // Alice loses 4 to winners but gains 4 from Charlie = net 0
        assertEquals(10, game.players["creator"]!!.marbles) // Alice: 10 - 4 + 4 = 10
    }

    @Test
    fun `mixed winners and losers - all losers pay placer independently`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie", "Dave", "Eve")

        // Add extra players
        game.addPlayer("player3", "Dave").connected = true
        game.addPlayer("player4", "Eve").connected = true

        setupGuessing(game, 3) // Odd
        game.makeGuess("player1", Guess.ODD) // Bob correct
        game.makeGuess("player2", Guess.EVEN) // Charlie wrong
        game.makeGuess("player3", Guess.EVEN) // Dave wrong
        game.makeGuess("player4", Guess.ODD) // Eve correct

        val result = game.resolveRound()

        assertNotNull(result)
        assertEquals(2, result.winners.size)
        assertEquals(2, result.losers.size)

        // Winners split 3 marbles = 1 each (integer division)
        assertEquals(11, game.players["player1"]!!.marbles) // Bob: 10 + 1 = 11
        assertEquals(11, game.players["player4"]!!.marbles) // Eve: 10 + 1 = 11

        // Both losers pay 3 marbles each to placer
        assertEquals(7, game.players["player2"]!!.marbles) // Charlie: 10 - 3 = 7
        assertEquals(7, game.players["player3"]!!.marbles) // Dave: 10 - 3 = 7

        // Alice loses 2 to winners (1 each, rounded down from 3/2) but gains 6 from losers (3 each)
        // Net: 10 - 2 + 6 = 14
        assertEquals(14, game.players["creator"]!!.marbles)
    }

    @Test
    fun `loser with insufficient marbles pays what they have when there are also winners`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.players["player2"]!!.marbles = 2 // Charlie only has 2 marbles

        setupGuessing(game, 5) // Odd
        game.makeGuess("player1", Guess.ODD) // Bob correct
        game.makeGuess("player2", Guess.EVEN) // Charlie wrong

        game.resolveRound()

        // Bob wins 5 marbles from Alice
        assertEquals(15, game.players["player1"]!!.marbles) // Bob: 10 + 5 = 15
        // Charlie loses all 2 marbles (all he has)
        assertEquals(0, game.players["player2"]!!.marbles) // Charlie: 2 - 2 = 0
        // Alice loses 5 to Bob, gains 2 from Charlie = net -3
        assertEquals(7, game.players["creator"]!!.marbles) // Alice: 10 - 5 + 2 = 7
    }

    // ==================== Phase Transition ====================

    @Test
    fun `resolveRound changes phase to ROUND_RESULT`() {
        val game = createGameWithPlayers("Alice", "Bob")
        setupGuessing(game, 3)
        game.makeGuess("player1", Guess.ODD)

        assertEquals(GamePhase.GUESSING, game.phase)

        game.resolveRound()

        assertEquals(GamePhase.ROUND_RESULT, game.phase)
    }

    @Test
    fun `resolveRound stores last round result`() {
        val game = createGameWithPlayers("Alice", "Bob")
        setupGuessing(game, 3)
        game.makeGuess("player1", Guess.ODD)

        assertNull(game.lastRoundResult)

        game.resolveRound()

        assertNotNull(game.lastRoundResult)
        assertEquals("Alice", game.lastRoundResult!!.placerName)
        assertEquals(3, game.lastRoundResult!!.marblesPlaced)
    }

    @Test
    fun `cannot resolve round in wrong phase`() {
        val game = createGameWithPlayers("Alice", "Bob")
        game.startGame()
        // Still in PLACING_MARBLES

        val result = game.resolveRound()

        assertNull(result)
    }

    // ==================== Next Round ====================

    @Test
    fun `nextRound advances to next player`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        setupGuessing(game, 3)
        game.makeGuess("player1", Guess.ODD)
        game.makeGuess("player2", Guess.ODD)
        game.resolveRound()

        assertEquals("Alice", game.currentPlayer?.name)

        game.nextRound()

        assertEquals("Bob", game.currentPlayer?.name)
        assertEquals(GamePhase.PLACING_MARBLES, game.phase)
    }

    @Test
    fun `nextRound wraps around to first player`() {
        val game = createGameWithPlayers("Alice", "Bob")

        // Complete first round (Alice places)
        setupGuessing(game, 3)
        game.makeGuess("player1", Guess.ODD)
        game.resolveRound()
        game.nextRound()

        assertEquals("Bob", game.currentPlayer?.name)

        // Complete second round (Bob places)
        game.placeMarbles("player1", 2)
        game.makeGuess("creator", Guess.EVEN)
        game.resolveRound()
        game.nextRound()

        // Should wrap back to Alice
        assertEquals("Alice", game.currentPlayer?.name)
    }

    @Test
    fun `nextRound skips spectators`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.players["player1"]!!.marbles = 0 // Bob becomes spectator

        setupGuessing(game, 3)
        game.makeGuess("player2", Guess.ODD) // Only Charlie guesses (Bob is spectator)
        game.resolveRound()
        game.nextRound()

        // Should skip Bob (spectator) and go to Charlie
        assertEquals("Charlie", game.currentPlayer?.name)
    }

    @Test
    fun `nextRound skips disconnected players`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)
        game.makeGuess("player1", Guess.ODD)
        game.makeGuess("player2", Guess.ODD)
        game.resolveRound()

        // Bob disconnects
        game.players["player1"]!!.connected = false

        game.nextRound()

        // Should skip Bob (disconnected) and go to Charlie
        assertEquals("Charlie", game.currentPlayer?.name)
    }

    // ==================== No Guessers Edge Case ====================

    @Test
    fun `round with no guessers resolves immediately with no marble changes`() {
        val game = createGameWithPlayers("Alice", "Bob")

        game.startGame()

        // Make Bob a spectator after game starts
        game.players["player1"]!!.marbles = 0

        val aliceMarblesBefore = game.players["creator"]!!.marbles

        // Alice places marbles - no one can guess (Bob is spectator)
        game.placeMarbles("creator", 3)

        // Should be immediately resolvable
        assertTrue(game.allActivePlayersGuessed())

        val result = game.resolveRound()

        assertNotNull(result)
        assertEquals(GamePhase.ROUND_RESULT, game.phase)
        assertTrue(result.winners.isEmpty())
        assertTrue(result.losers.isEmpty())

        // Alice keeps her marbles (no one to win/lose against)
        assertEquals(aliceMarblesBefore, game.players["creator"]!!.marbles)
    }

    @Test
    fun `round with all guessers disconnected resolves with no marble changes`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.startGame()
        game.placeMarbles("creator", 3)

        val aliceMarblesBefore = game.players["creator"]!!.marbles
        val bobMarblesBefore = game.players["player1"]!!.marbles
        val charlieMarblesBefore = game.players["player2"]!!.marbles

        // First guesser disconnects
        game.handlePlayerDisconnect("player1")
        assertEquals(GamePhase.GUESSING, game.phase) // Still waiting for Charlie

        // Second guesser disconnects - should auto-resolve
        game.handlePlayerDisconnect("player2")

        // Round should have auto-resolved via handlePlayerDisconnect
        assertEquals(GamePhase.ROUND_RESULT, game.phase)

        // No marble changes since no one actually guessed
        assertEquals(aliceMarblesBefore, game.players["creator"]!!.marbles)
        assertEquals(bobMarblesBefore, game.players["player1"]!!.marbles)
        assertEquals(charlieMarblesBefore, game.players["player2"]!!.marbles)
    }

    @Test
    fun `mixed spectators and active players resolves correctly`() {
        val game = createGameWithPlayers("Alice", "Bob", "Charlie")
        game.players["player1"]!!.marbles = 0 // Bob is spectator

        game.startGame()
        game.placeMarbles("creator", 4) // Even

        // Only Charlie can guess (Bob is spectator)
        assertFalse(game.allActivePlayersGuessed())

        game.makeGuess("player2", Guess.EVEN) // Correct!

        assertTrue(game.allActivePlayersGuessed())

        val result = game.resolveRound()

        assertNotNull(result)
        assertEquals(listOf("Charlie"), result.winners)
        assertTrue(result.losers.isEmpty())
        assertEquals(4, result.marblesWonPerWinner)
    }
}
