package de.mw.marbles

import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlin.random.Random

private val logger = LoggerFactory.getLogger(Game::class.java)

/** Seconds to show round results before auto-advancing to next round. */
const val ROUND_RESULT_COUNTDOWN_SECONDS = 5

/**
 * Phases of the Marble Game.
 *
 * The game progresses through these phases in order:
 * 1. [WAITING_FOR_PLAYERS] - Lobby, waiting for players to join
 * 2. [PLACING_MARBLES] - Current player hides marbles in their hand
 * 3. [GUESSING] - Other players guess if the count is even or odd
 * 4. [ROUND_RESULT] - Shows who won/lost the round
 * 5. [GAME_OVER] - One player has won (or all others eliminated)
 */
enum class GamePhase {
    /** Game created, waiting for players to join. */
    WAITING_FOR_PLAYERS,

    /** Current player is placing marbles (hiding them in their hand). */
    PLACING_MARBLES,

    /** Other players are guessing even or odd. */
    GUESSING,

    /** Showing round results before continuing. */
    ROUND_RESULT,

    /** Game has ended - one player has won. */
    GAME_OVER,
}

/**
 * A player's guess for the current round.
 */
enum class Guess {
    EVEN,
    ODD,
}

/**
 * Result of a completed round.
 *
 * @property placerName Name of the player who placed marbles
 * @property placerSessionId Session ID of the player who placed marbles
 * @property marblesPlaced How many marbles were hidden
 * @property wasEven Whether the count was even
 * @property winners Names of players who guessed correctly
 * @property winnerSessionIds Session IDs of players who guessed correctly
 * @property losers Names of players who guessed incorrectly
 * @property loserSessionIds Session IDs of players who guessed incorrectly
 * @property marblesWonPerWinner How many marbles each winner received
 * @property marblesLostByPlacer Net marbles lost by the placer (negative if gained)
 */
data class RoundResult(
    val placerName: String,
    val placerSessionId: String,
    val marblesPlaced: Int,
    val wasEven: Boolean,
    val winners: List<String>,
    val winnerSessionIds: List<String>,
    val losers: List<String>,
    val loserSessionIds: List<String>,
    val marblesWonPerWinner: Int,
    val marblesLostByPlacer: Int,
)

/**
 * Represents a single Marble Game session.
 *
 * ## Game Rules
 * - Players start with 10 marbles each
 * - Each round, one player (the "placer") hides some marbles
 * - Other players guess if the hidden count is EVEN or ODD
 * - Correct guessers split the placed marbles from the placer
 * - Wrong guessers lose marbles equal to the placed amount to the placer
 * - A player with 0 marbles becomes a spectator
 * - Last player with marbles wins
 *
 * ## Connection Handling
 * Players who disconnect have a 15-second grace period to reconnect.
 * During this time, they're still considered "available" for game logic.
 * If they don't reconnect, their marbles are distributed to remaining players.
 *
 * @property id Unique game identifier (8-character code for sharing)
 * @param creatorSessionId Session ID of the player who created the game
 * @param random Random source for starting player selection (injectable for testing)
 */
class Game(
    val id: String = UUID.randomUUID().toString().substring(0, 8),
    creatorSessionId: String,
    private val random: Random = Random.Default,
) {
    /** Timestamp when this game was created (for cleanup purposes). */
    val createdAt: Long = System.currentTimeMillis()

    /** Timestamp of the last activity in this game. */
    @Volatile
    var lastActivityAt: Long = System.currentTimeMillis()
        private set

    private val stateVersion = AtomicLong(0L)

    /**
     * Session ID of the current game creator/host.
     *
     * The creator can start the game. If they leave, this is transferred
     * to another connected player.
     */
    var creatorSessionId: String = creatorSessionId
        private set

    /** All players who have joined (including disconnected ones). */
    val players = ConcurrentHashMap<String, Player>()

    private val playerSignalVersions = ConcurrentHashMap<String, Long>()

    /** Current phase of the game. Thread-safe via @Volatile. */
    @Volatile
    var phase: GamePhase = GamePhase.WAITING_FOR_PLAYERS

    /** Index into [playerOrder] for the current player's turn. */
    var currentPlayerIndex: Int = 0

    /** Number of marbles placed by current player this round. */
    var currentMarblesPlaced: Int = 0

    /** Result from the most recent round (for display). */
    var lastRoundResult: RoundResult? = null

    /** Timestamp when round result phase started (for auto-advance countdown). */
    var roundResultTimestamp: Long? = null
        private set

    /**
     * Session ID of the winner when game is over. Thread-safe via @Volatile.
     *
     * Set when the game transitions to GAME_OVER phase to prevent
     * new players joining from incorrectly being shown as winners.
     */
    @Volatile
    var winnerSessionId: String? = null
        private set

    /** Ordered list of active player session IDs (determines turn order). */
    private val playerOrder = mutableListOf<String>()

    /** Players waiting to join (spectators who will join next round). */
    private val pendingPlayerOrder = mutableListOf<String>()

    // ==================== Player Accessors ====================

    /** The player whose turn it currently is, or null if no players. */
    @get:Synchronized
    val currentPlayer: Player?
        get() {
            if (playerOrder.isEmpty()) return null
            val sessionId = playerOrder.getOrNull(currentPlayerIndex) ?: return null
            return players[sessionId]
        }

    /** All players with marbles (regardless of connection status). */
    @get:Synchronized
    val activePlayers: List<Player>
        get() = playerOrder.mapNotNull { players[it] }.filter { it.isActive }

    /** Players who are active AND currently connected. */
    @get:Synchronized
    val connectedActivePlayers: List<Player>
        get() = playerOrder.mapNotNull { players[it] }.filter { it.isActiveAndConnected }

    /**
     * Players who are active and either connected OR within grace period.
     *
     * Used for game-over checks to avoid ending the game when a player
     * is temporarily disconnected.
     */
    @get:Synchronized
    val availableActivePlayers: List<Player>
        get() = playerOrder.mapNotNull { players[it] }.filter { it.isActive && (it.connected || it.isWithinGracePeriod()) }

    /** All players in the current game (in turn order). */
    @get:Synchronized
    val allPlayers: List<Player>
        get() = playerOrder.mapNotNull { players[it] }

    /** Players waiting to join next round. */
    @get:Synchronized
    val pendingPlayers: List<Player>
        get() = pendingPlayerOrder.mapNotNull { players[it] }

    // ==================== Player Management ====================

    /**
     * Updates the last activity timestamp.
     * Called automatically on game actions to track game liveness.
     */
    fun touch() {
        lastActivityAt = System.currentTimeMillis()
    }

    /**
     * Adds a player as pending (spectator who will join next round).
     *
     * Used when someone joins a game that's already in progress.
     * They'll watch as a spectator until the next round starts.
     *
     * @param sessionId The player's session ID
     * @param name The player's display name
     * @return The created Player object
     */
    @Synchronized
    fun addPendingPlayer(
        sessionId: String,
        name: String,
        lang: String = "en",
    ): Player {
        val clampedName = name.take(MAX_PLAYER_NAME_LENGTH)
        val player = Player(sessionId, clampedName, lang = lang)
        player.marbles = 0 // Start as spectator
        players[sessionId] = player
        if (sessionId !in pendingPlayerOrder && sessionId !in playerOrder) {
            pendingPlayerOrder.add(sessionId)
        }
        return player
    }

    /**
     * Promotes pending players to active players.
     *
     * Called at the start of a new round. Pending players receive
     * 10 marbles and are added to the turn order.
     */
    fun promotePendingPlayers() {
        pendingPlayerOrder.forEach { sessionId ->
            players[sessionId]?.let { player ->
                player.marbles = 10
                playerOrder.add(sessionId)
            }
        }
        pendingPlayerOrder.clear()
    }

    /**
     * Adds a new player to the game.
     *
     * Used during the WAITING_FOR_PLAYERS phase.
     *
     * @param sessionId The player's session ID
     * @param name The player's display name
     * @param lang The player's language preference
     * @return The created Player object
     */
    @Synchronized
    fun addPlayer(
        sessionId: String,
        name: String,
        lang: String = "en",
    ): Player {
        touch()
        val clampedName = name.take(MAX_PLAYER_NAME_LENGTH)
        val existing = players[sessionId]
        if (existing != null) {
            existing.name = clampedName
            existing.lang = lang
            return existing
        }
        val player = Player(sessionId, clampedName, lang = lang)
        players[sessionId] = player
        if (sessionId !in playerOrder) {
            playerOrder.add(sessionId)
        }
        return player
    }

    /**
     * Removes a player from the game entirely.
     *
     * @param sessionId The player's session ID
     */
    @Synchronized
    fun removePlayer(sessionId: String) {
        players.remove(sessionId)
        playerSignalVersions.remove(sessionId)
        playerOrder.remove(sessionId)
        if (currentPlayerIndex >= playerOrder.size && playerOrder.isNotEmpty()) {
            currentPlayerIndex = 0
        }
    }

    /**
     * Handles a player reconnecting to the game.
     *
     * In lobby phase, re-adds the player to playerOrder if they were removed.
     *
     * @param sessionId The reconnecting player's session ID
     */
    @Synchronized
    fun handlePlayerReconnect(sessionId: String) {
        val player = players[sessionId] ?: return

        // In lobby, ensure reconnecting players are in playerOrder
        if (phase == GamePhase.WAITING_FOR_PLAYERS && sessionId !in playerOrder) {
            player.marbles = 10
            playerOrder.add(sessionId)
            logger.info("Game {} player '{}' re-added to lobby", id, player.name)
        }
    }

    // ==================== Game Flow ====================

    /**
     * Starts the game.
     *
     * Requires at least 2 connected players. Transitions from
     * WAITING_FOR_PLAYERS to PLACING_MARBLES phase. The starting player
     * is randomly selected from connected active players.
     *
     * @return `true` if game started successfully, `false` if not enough players
     */
    @Synchronized
    fun startGame(): Boolean {
        touch()
        val connectedPlayerIndices =
            playerOrder.indices.filter { index ->
                val player = players[playerOrder[index]]
                player != null && player.connected && !player.isSpectator
            }
        if (connectedPlayerIndices.size < 2) return false

        phase = GamePhase.PLACING_MARBLES
        currentPlayerIndex = connectedPlayerIndices.random(random)
        return true
    }

    /**
     * Current player places marbles to be guessed.
     *
     * @param sessionId Must match the current player
     * @param amount Number of marbles to place (1 to player's total)
     * @return `true` if placement was valid
     */
    @Synchronized
    fun placeMarbles(
        sessionId: String,
        amount: Int,
    ): Boolean {
        touch()
        val player = currentPlayer

        if (player == null) return false
        if (player.sessionId != sessionId) return false
        if (phase != GamePhase.PLACING_MARBLES) return false
        if (amount < 1 || amount > player.marbles) return false

        currentMarblesPlaced = amount
        players.values.forEach { it.currentGuess = null }
        phase = GamePhase.GUESSING
        return true
    }

    /**
     * Player makes a guess for the current round.
     *
     * @param sessionId The guessing player (cannot be the placer)
     * @param guess EVEN or ODD
     * @return `true` if guess was recorded
     */
    @Synchronized
    fun makeGuess(
        sessionId: String,
        guess: Guess,
    ): Boolean {
        touch()
        val player = players[sessionId]

        if (player == null) return false
        if (phase != GamePhase.GUESSING) return false
        if (player.sessionId == currentPlayer?.sessionId) return false
        if (player.isSpectator) return false

        player.currentGuess = guess
        return true
    }

    /**
     * Checks if all connected active players have made their guess.
     *
     * @return `true` if round can be resolved
     */
    @Synchronized
    fun allActivePlayersGuessed(): Boolean {
        val guessingPlayers = connectedActivePlayers.filter { it.sessionId != currentPlayer?.sessionId }
        return guessingPlayers.all { it.currentGuess != null }
    }

    /**
     * Resolves the current round and distributes marbles.
     *
     * - Correct guessers split the placed marbles from the placer
     * - Wrong guessers lose marbles equal to the placed amount to the placer
     *
     * @return The round result, or null if not in GUESSING phase
     */
    @Synchronized
    fun resolveRound(): RoundResult? {
        val placer = currentPlayer ?: return null
        if (phase != GamePhase.GUESSING) return null

        val isEven = currentMarblesPlaced % 2 == 0
        val guessingPlayers = connectedActivePlayers.filter { it.sessionId != placer.sessionId }

        val winners =
            guessingPlayers.filter {
                (it.currentGuess == Guess.EVEN && isEven) || (it.currentGuess == Guess.ODD && !isEven)
            }
        val losers =
            guessingPlayers.filter {
                (it.currentGuess == Guess.EVEN && !isEven) || (it.currentGuess == Guess.ODD && isEven)
            }

        var marblesWonPerWinner = 0
        var marblesLostByPlacer = 0
        var marblesGainedFromLosers = 0

        // Winners split the placed marbles from the placer
        if (winners.isNotEmpty()) {
            marblesWonPerWinner = currentMarblesPlaced / winners.size
            val totalPayout = marblesWonPerWinner * winners.size
            marblesLostByPlacer = minOf(totalPayout, placer.marbles)
            placer.marbles -= marblesLostByPlacer

            val actualPerWinner = marblesLostByPlacer / winners.size
            winners.forEach { it.marbles += actualPerWinner }
        }

        // Losers always lose marbles to the placer (regardless of whether there are winners)
        if (losers.isNotEmpty()) {
            losers.forEach { loser ->
                val lossAmount = minOf(currentMarblesPlaced, loser.marbles)
                loser.marbles -= lossAmount
                placer.marbles += lossAmount
                marblesGainedFromLosers += lossAmount
            }
        }

        // Net marbles lost by placer (negative means gained)
        val netMarblesLostByPlacer = marblesLostByPlacer - marblesGainedFromLosers

        lastRoundResult =
            RoundResult(
                placerName = placer.name,
                placerSessionId = placer.sessionId,
                marblesPlaced = currentMarblesPlaced,
                wasEven = isEven,
                winners = winners.map { it.name },
                winnerSessionIds = winners.map { it.sessionId },
                losers = losers.map { it.name },
                loserSessionIds = losers.map { it.sessionId },
                marblesWonPerWinner = marblesWonPerWinner,
                marblesLostByPlacer = netMarblesLostByPlacer,
            )

        phase = GamePhase.ROUND_RESULT
        roundResultTimestamp = System.currentTimeMillis()
        return lastRoundResult
    }

    /**
     * Advances to the next round.
     *
     * Promotes pending players and moves to the next player's turn.
     *
     * @return `true` if game continues, `false` if game over or not in ROUND_RESULT phase
     */
    @Synchronized
    fun nextRound(): Boolean {
        // Guard: only advance if we're actually in ROUND_RESULT phase
        // This prevents race conditions from multiple clients calling simultaneously
        if (phase != GamePhase.ROUND_RESULT) return false

        promotePendingPlayers()

        val playersWithMarbles = connectedActivePlayers
        if (playersWithMarbles.size <= 1) {
            winnerSessionId = playersWithMarbles.firstOrNull()?.sessionId
                ?: players.values.find { it.isActive }?.sessionId
            phase = GamePhase.GAME_OVER
            return false
        }

        currentPlayerIndex = (currentPlayerIndex + 1) % playerOrder.size
        advanceToNextActivePlayer()

        currentMarblesPlaced = 0
        phase = GamePhase.PLACING_MARBLES
        return true
    }

    /**
     * Gets the remaining seconds before auto-advancing from round result.
     *
     * @return Remaining seconds, or 0 if countdown has passed or not in ROUND_RESULT phase
     */
    @Synchronized
    fun roundResultCooldownRemaining(): Int {
        if (phase != GamePhase.ROUND_RESULT) return 0
        val timestamp = roundResultTimestamp ?: return 0
        val elapsed = (System.currentTimeMillis() - timestamp) / 1000
        return maxOf(0, ROUND_RESULT_COUNTDOWN_SECONDS - elapsed.toInt())
    }

    /**
     * Skips to the next active, connected player.
     *
     * Called when the current player is a spectator or disconnected.
     */
    private fun advanceToNextActivePlayer() {
        val startIndex = currentPlayerIndex
        var attempts = 0

        while ((currentPlayer?.isSpectator == true || currentPlayer?.connected == false) && attempts < playerOrder.size) {
            currentPlayerIndex = (currentPlayerIndex + 1) % playerOrder.size
            attempts++
        }
    }

    /**
     * Gets the winner of the game.
     *
     * Returns the player who was determined as winner when the game ended.
     * The winner is stored when the game transitions to GAME_OVER to prevent
     * new players joining from incorrectly appearing as winners.
     *
     * Falls back to finding the best candidate if winnerSessionId is not set
     * (for backwards compatibility with tests that directly set phase).
     *
     * @return The winning player, or null if game not over
     */
    @Synchronized
    fun getWinner(): Player? {
        if (phase != GamePhase.GAME_OVER) return null
        // Use stored winner if available
        winnerSessionId?.let { return players[it] }
        // Fallback: find best candidate (connected active player, or any active player)
        return connectedActivePlayers.firstOrNull() ?: players.values.find { it.isActive }
    }

    // ==================== Disconnect Handling ====================

    /**
     * Handles a player disconnecting.
     *
     * May advance game state if needed (e.g., skip disconnected player's turn,
     * resolve round if all remaining players have guessed).
     *
     * @param sessionId The disconnected player's session ID
     * @return `true` if game state changed and broadcast is needed
     */
    @Synchronized
    fun handlePlayerDisconnect(sessionId: String): Boolean {
        val player = players[sessionId] ?: return false

        if (player.connected) {
            player.connected = false
        }

        when (phase) {
            GamePhase.WAITING_FOR_PLAYERS -> {
                return true
            }
            GamePhase.PLACING_MARBLES -> {
                if (currentPlayer?.sessionId == sessionId) {
                    advanceToNextActivePlayer()
                }
                val available = availableActivePlayers
                if (available.size <= 1) {
                    logger.info("Game {} ended - only 1 player remaining", id)
                    winnerSessionId = available.firstOrNull()?.sessionId
                    phase = GamePhase.GAME_OVER
                }
                return true
            }
            GamePhase.GUESSING -> {
                if (allActivePlayersGuessed()) {
                    resolveRound()
                    return true
                }
            }
            GamePhase.ROUND_RESULT -> {
                val available = availableActivePlayers
                if (available.size <= 1) {
                    winnerSessionId = available.firstOrNull()?.sessionId
                    phase = GamePhase.GAME_OVER
                    return true
                }
            }
            GamePhase.GAME_OVER -> {
                if (sessionId == creatorSessionId) {
                    val newCreator =
                        players.values.firstOrNull { it.connected && it.sessionId != sessionId }
                            ?: players.values.firstOrNull { it.sessionId != sessionId }
                    if (newCreator != null) {
                        creatorSessionId = newCreator.sessionId
                        logger.info("Game {} creator transferred to '{}' (immediate game-over disconnect)", id, newCreator.name)
                    }
                }
            }
        }
        return true
    }

    /**
     * Handles a player's grace period expiring.
     *
     * Distributes their marbles to remaining players and removes them
     * from the game. If the creator leaves, transfers creator status.
     *
     * @param sessionId The player whose grace period expired
     * @return `true` if game state changed and broadcast is needed
     */
    @Synchronized
    fun handleGracePeriodExpired(sessionId: String): Boolean {
        val player = players[sessionId] ?: return false

        if (player.connected || player.isWithinGracePeriod()) return false

        // In lobby, transfer creator if needed but don't remove player (they can reconnect)
        if (phase == GamePhase.WAITING_FOR_PLAYERS) {
            if (sessionId == creatorSessionId) {
                val newCreator = players.values.firstOrNull { it.connected && it.sessionId != sessionId }
                if (newCreator != null) {
                    creatorSessionId = newCreator.sessionId
                    logger.info("Game {} creator transferred to '{}' (lobby)", id, newCreator.name)
                    return true
                }
            }
            return false
        }

        // In game over, only transfer creator if needed (don't remove player)
        if (phase == GamePhase.GAME_OVER) {
            if (sessionId == creatorSessionId) {
                val newCreator =
                    players.values.firstOrNull { it.connected && it.sessionId != sessionId }
                        ?: players.values.firstOrNull { it.sessionId != sessionId }
                if (newCreator != null) {
                    creatorSessionId = newCreator.sessionId
                    logger.info("Game {} creator transferred to '{}' (game over)", id, newCreator.name)
                    return true
                }
            }
            return false
        }

        // Transfer creator status if needed
        if (sessionId == creatorSessionId) {
            val newCreator = connectedActivePlayers.firstOrNull { it.sessionId != sessionId }
            if (newCreator != null) {
                creatorSessionId = newCreator.sessionId
                logger.info("Game {} creator transferred to '{}'", id, newCreator.name)
            }
        }

        // Distribute marbles to remaining players
        val recipients = connectedActivePlayers.filter { it.sessionId != sessionId }
        if (recipients.isNotEmpty() && player.marbles > 0) {
            val marblesEach = player.marbles / recipients.size
            val remainder = player.marbles % recipients.size

            recipients.forEachIndexed { index, recipient ->
                recipient.marbles += marblesEach + if (index < remainder) 1 else 0
            }
            player.marbles = 0
        }

        // Adjust turn order
        val removedIndex = playerOrder.indexOf(sessionId)
        val wasCurrentPlayer = currentPlayerIndex == removedIndex

        playerOrder.remove(sessionId)

        if (playerOrder.isNotEmpty()) {
            if (removedIndex != -1 && removedIndex < currentPlayerIndex) {
                currentPlayerIndex--
            }
            if (currentPlayerIndex >= playerOrder.size) {
                currentPlayerIndex = 0
            }
        }

        // Check for game over
        val available = availableActivePlayers
        if (available.size <= 1) {
            winnerSessionId = available.firstOrNull()?.sessionId
            phase = GamePhase.GAME_OVER
        } else if (wasCurrentPlayer) {
            advanceToNextActivePlayer()
        }

        return true
    }

    // ==================== Broadcasting ====================

    private fun enqueueRenderedState(
        player: Player,
        renderState: (Game, String, String) -> String,
    ) {
        val terminal = phase == GamePhase.GAME_OVER
        val globalVersion = stateVersion.incrementAndGet()
        val version = playerSignalVersions.merge(player.sessionId, globalVersion) { old, _ -> old + 1 } ?: globalVersion
        val html = renderState(this, player.sessionId, player.lang)
        player.enqueueState(html, terminal = terminal, version = version)
    }

    /**
     * Sends updated game state to all connected players.
     *
     * @param renderState Function to render HTML for a specific player's view (game, sessionId, lang)
     */
    fun broadcastToAllConnected(renderState: (Game, String, String) -> String) {
        players.values
            .filter { it.connected }
            .forEach { player -> enqueueRenderedState(player, renderState) }
    }

    fun broadcastToConnectedExcept(
        excludedSessionId: String,
        renderState: (Game, String, String) -> String,
    ) {
        players.values
            .filter { it.connected && it.sessionId != excludedSessionId }
            .forEach { player -> enqueueRenderedState(player, renderState) }
    }

    /**
     * Resets the game for a new round (Play Again functionality).
     *
     * All connected players get 10 marbles and are re-added to the turn order.
     * If there are enough players, the game starts immediately.
     *
     * @return `true` if game started immediately, `false` if waiting for more players
     */
    @Synchronized
    fun resetForNewGame(): Boolean {
        currentPlayerIndex = 0
        currentMarblesPlaced = 0
        lastRoundResult = null
        roundResultTimestamp = null
        winnerSessionId = null

        val connectedSessionIds =
            players.values
                .filter { it.connected }
                .map { it.sessionId }
                .toSet()

        playerOrder.clear()
        pendingPlayerOrder.clear()

        players.values.forEach { player ->
            player.currentGuess = null
            if (player.connected) {
                player.marbles = 10
                if (player.sessionId !in playerOrder) {
                    playerOrder.add(player.sessionId)
                }
            }
        }

        logger.info("Game {} reset with {} players", id, playerOrder.size)

        // Auto-start if we have enough players
        if (playerOrder.size >= 2) {
            phase = GamePhase.PLACING_MARBLES
            logger.info("Game {} auto-started after reset", id)
            return true
        } else {
            phase = GamePhase.WAITING_FOR_PLAYERS
            return false
        }
    }

    /**
     * Cleans up resources when the game is being removed.
     *
     * Closes all player channels to ensure coroutines waiting on them
     * are properly notified and resources are released immediately.
     */
    @Synchronized
    fun cleanup() {
        players.values.forEach { player ->
            player.clearPendingStateHtml()
            runCatching { player.channel.close() }
        }
        playerSignalVersions.clear()
        logger.debug("Game {} cleaned up, closed {} player channels", id, players.size)
    }
}
