package de.mw.marbles

import kotlin.test.*

class GameManagerTest {
    private val createdGameIds = mutableListOf<String>()

    @BeforeTest
    fun setup() {
        // Track games created in tests for cleanup
        createdGameIds.clear()
    }

    @AfterTest
    fun cleanup() {
        // Clean up games created during tests
        createdGameIds.forEach { GameManager.removeGame(it) }
    }

    private fun createTrackedGame(sessionId: String): Game {
        val game = GameManager.createGame(sessionId)
        createdGameIds.add(game.id)
        return game
    }

    @Test
    fun `createGame returns new game with unique ID`() {
        val game1 = createTrackedGame("session1")
        val game2 = createTrackedGame("session2")

        assertNotEquals(game1.id, game2.id)
        assertEquals("session1", game1.creatorSessionId)
        assertEquals("session2", game2.creatorSessionId)
    }

    @Test
    fun `getGame returns created game`() {
        val game = createTrackedGame("session1")

        val retrieved = GameManager.getGame(game.id)

        assertNotNull(retrieved)
        assertEquals(game.id, retrieved.id)
    }

    @Test
    fun `getGame returns null for non-existent game`() {
        val result = GameManager.getGame("nonexistent-id")

        assertNull(result)
    }

    @Test
    fun `removeGame removes game`() {
        val game = createTrackedGame("session1")

        assertNotNull(GameManager.getGame(game.id))

        GameManager.removeGame(game.id)
        createdGameIds.remove(game.id) // Already removed

        assertNull(GameManager.getGame(game.id))
    }

    @Test
    fun `findGameByPlayer returns game containing player`() {
        val game = createTrackedGame("session1")
        game.addPlayer("session1", "Alice")
        game.addPlayer("session2", "Bob")

        val foundByAlice = GameManager.findGameByPlayer("session1")
        val foundByBob = GameManager.findGameByPlayer("session2")

        assertNotNull(foundByAlice)
        assertNotNull(foundByBob)
        assertEquals(game.id, foundByAlice.id)
        assertEquals(game.id, foundByBob.id)
    }

    @Test
    fun `findGameByPlayer returns null for unknown session`() {
        val result = GameManager.findGameByPlayer("unknown-session")

        assertNull(result)
    }

    @Test
    fun `multiple games are tracked independently`() {
        val game1 = createTrackedGame("creator1")
        val game2 = createTrackedGame("creator2")

        game1.addPlayer("creator1", "Alice")
        game1.addPlayer("player1", "Bob")

        game2.addPlayer("creator2", "Charlie")
        game2.addPlayer("player2", "Dave")

        assertEquals(2, GameManager.getGame(game1.id)?.players?.size)
        assertEquals(2, GameManager.getGame(game2.id)?.players?.size)

        // Players are in different games
        val aliceGame = GameManager.findGameByPlayer("creator1")
        val charlieGame = GameManager.findGameByPlayer("creator2")

        assertNotEquals(aliceGame?.id, charlieGame?.id)
    }

    @Test
    fun `game ID is case-sensitive for lookup`() {
        val game = createTrackedGame("session1")
        val id = game.id

        assertNotNull(GameManager.getGame(id))
        // An all-digit id has no upper case to differ from.
        if (id != id.uppercase()) assertNull(GameManager.getGame(id.uppercase()))
    }

    @Test
    fun `gameCount returns number of active games`() {
        val initialCount = GameManager.gameCount()

        val game1 = createTrackedGame("session1")
        assertEquals(initialCount + 1, GameManager.gameCount())

        val game2 = createTrackedGame("session2")
        assertEquals(initialCount + 2, GameManager.gameCount())

        GameManager.removeGame(game1.id)
        createdGameIds.remove(game1.id)
        assertEquals(initialCount + 1, GameManager.gameCount())
    }

    @Test
    fun `cleanupOldGames removes finished games after TTL`() {
        val game = createTrackedGame("session1")
        game.addPlayer("session1", "Alice").connected = true
        game.addPlayer("session2", "Bob").connected = true

        // Set game to GAME_OVER and make it old
        game.phase = GamePhase.GAME_OVER

        // Use reflection to set lastActivityAt to simulate old game
        val field = game.javaClass.getDeclaredField("lastActivityAt")
        field.isAccessible = true
        field.set(game, System.currentTimeMillis() - (2 * 60 * 60 * 1000L)) // 2 hours ago

        assertNotNull(GameManager.getGame(game.id))

        GameManager.cleanupOldGames()

        assertNull(GameManager.getGame(game.id))
        createdGameIds.remove(game.id) // Already cleaned up
    }

    @Test
    fun `cleanupOldGames does not remove active games`() {
        val game = createTrackedGame("session1")
        game.addPlayer("session1", "Alice").connected = true

        // Game is in WAITING_FOR_PLAYERS phase (not finished)
        assertEquals(GamePhase.WAITING_FOR_PLAYERS, game.phase)

        GameManager.cleanupOldGames()

        // Game should still exist (not old enough)
        assertNotNull(GameManager.getGame(game.id))
    }

    @Test
    fun `cleanupOldGames removes abandoned unfinished games after long TTL`() {
        val game = createTrackedGame("session1")

        // Make the game very old (abandoned)
        val field = game.javaClass.getDeclaredField("lastActivityAt")
        field.isAccessible = true
        field.set(game, System.currentTimeMillis() - (5 * 60 * 60 * 1000L)) // 5 hours ago

        GameManager.cleanupOldGames()

        assertNull(GameManager.getGame(game.id))
        createdGameIds.remove(game.id)
    }

    @Test
    fun `cleanupOldGames closes player channels when removing game`() {
        val game = createTrackedGame("session1")
        val player = game.addPlayer("session1", "Alice")

        // Verify channel is open
        assertFalse(player.channel.isClosedForSend)

        // Make the game old and finished
        game.phase = GamePhase.GAME_OVER
        val field = game.javaClass.getDeclaredField("lastActivityAt")
        field.isAccessible = true
        field.set(game, System.currentTimeMillis() - (2 * 60 * 60 * 1000L))

        GameManager.cleanupOldGames()

        // Channel should be closed after cleanup
        assertTrue(player.channel.isClosedForSend)
        createdGameIds.remove(game.id)
    }

    @Test
    fun `removeGame does nothing for non-existent game`() {
        val initialCount = GameManager.gameCount()

        GameManager.removeGame("non-existent-game-id")

        assertEquals(initialCount, GameManager.gameCount())
    }
}
