package de.mw.marbles

import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private val logger = LoggerFactory.getLogger(GameManager::class.java)

/**
 * Global singleton managing all active games in the application.
 *
 * Provides thread-safe operations for creating, retrieving, and removing games.
 * Uses [ConcurrentHashMap] to ensure safe concurrent access from multiple coroutines
 * handling player connections.
 *
 * ## Automatic Cleanup
 * Games are automatically removed when:
 * - A finished game (GAME_OVER) has been inactive for 1 hour
 * - An unfinished game has been inactive for 4 hours
 *
 * ## Usage Example
 * ```kotlin
 * // Create a new game
 * val game = GameManager.createGame(creatorSessionId = "session-123")
 *
 * // Retrieve an existing game
 * val existingGame = GameManager.getGame(game.id)
 *
 * // Find which game a player is in
 * val playerGame = GameManager.findGameByPlayer("session-456")
 *
 * // Remove a game when it's finished
 * GameManager.removeGame(game.id)
 * ```
 *
 * @see Game
 */
object GameManager {
    /** TTL for finished games (1 hour). */
    private const val FINISHED_GAME_TTL_MS = 1 * 60 * 60 * 1000L

    /** TTL for unfinished/abandoned games (4 hours). */
    private const val ABANDONED_GAME_TTL_MS = 4 * 60 * 60 * 1000L

    /** How often to run the cleanup task (15 minutes). */
    private const val CLEANUP_INTERVAL_MINUTES = 15L

    /**
     * Thread-safe map storing all active games, keyed by game ID.
     */
    private val games = ConcurrentHashMap<String, Game>()

    /**
     * Scheduler for periodic cleanup of old games.
     */
    private val cleanupScheduler =
        Executors
            .newSingleThreadScheduledExecutor { runnable ->
                Thread(runnable, "GameManager-Cleanup").apply { isDaemon = true }
            }.also { scheduler ->
                scheduler.scheduleAtFixedRate(
                    ::cleanupOldGames,
                    CLEANUP_INTERVAL_MINUTES,
                    CLEANUP_INTERVAL_MINUTES,
                    TimeUnit.MINUTES,
                )
            }

    /**
     * Creates a new game with the specified creator.
     *
     * The creator's session ID is stored so they can control game lifecycle
     * (starting rounds, resetting games). If the creator disconnects permanently,
     * creator status transfers to another connected player.
     *
     * @param creatorSessionId The session ID of the player creating the game.
     * @return The newly created [Game] instance, already registered in the manager.
     *
     * @see Game.creatorSessionId
     */
    fun createGame(creatorSessionId: String): Game {
        val game = Game(creatorSessionId = creatorSessionId)
        games[game.id] = game
        logger.info("Game {} created, {} active games total", game.id, games.size)
        return game
    }

    /**
     * Retrieves a game by its unique identifier.
     *
     * @param gameId The unique game ID (UUID format).
     * @return The [Game] if found, or `null` if no game exists with that ID.
     */
    fun getGame(gameId: String): Game? = games[gameId]

    /**
     * Removes a game from the manager.
     *
     * Should be called when a game is finished or abandoned. This does not
     * clean up player connections - ensure all realtime connections are closed
     * before removing the game.
     *
     * @param gameId The unique game ID to remove.
     */
    fun removeGame(gameId: String) {
        games.remove(gameId)
    }

    /**
     * Finds the game that contains a specific player.
     *
     * Useful for reconnection scenarios where the player knows their session
     * but not which game they were in.
     *
     * @param sessionId The player's session ID to search for.
     * @return The [Game] containing this player, or `null` if the player
     *         is not in any active game.
     */
    fun findGameByPlayer(sessionId: String): Game? = games.values.find { it.players.containsKey(sessionId) }

    /**
     * Returns the current number of active games.
     * Useful for monitoring and debugging.
     */
    fun gameCount(): Int = games.size

    fun allGames(): List<Game> = games.values.toList()

    /**
     * Cleans up old/abandoned games based on their TTL.
     *
     * Called automatically by the scheduler, but can also be called manually for testing.
     * Closes all player channels before removing games to ensure proper resource cleanup.
     */
    fun cleanupOldGames() {
        val now = System.currentTimeMillis()
        val toRemove = mutableListOf<String>()

        games.forEach { (gameId, game) ->
            val age = now - game.lastActivityAt
            val shouldRemove =
                when {
                    game.phase == GamePhase.GAME_OVER && age > FINISHED_GAME_TTL_MS -> true
                    age > ABANDONED_GAME_TTL_MS -> true
                    else -> false
                }

            if (shouldRemove) {
                toRemove.add(gameId)
            }
        }

        toRemove.forEach { gameId ->
            games.remove(gameId)?.cleanup()
        }

        if (toRemove.isNotEmpty()) {
            logger.info("Cleaned up {} old games, {} remaining", toRemove.size, games.size)
        }
    }
}
