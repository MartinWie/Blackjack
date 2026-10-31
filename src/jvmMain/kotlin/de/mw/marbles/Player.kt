package de.mw.marbles

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** Grace period for disconnected players before they are removed from the game (15 seconds). */
const val DISCONNECT_GRACE_PERIOD_MS = 15_000L

sealed interface PlayerOutboundSignal {
    data object Flush : PlayerOutboundSignal

    data object ConnectionCheck : PlayerOutboundSignal
}

private const val PLAYER_SIGNAL_CHANNEL_CAPACITY = 1

/**
 * Represents a player in the Marble Game.
 *
 * Each player has:
 * - A unique session ID (from their browser session)
 * - A display name
 * - A marble count (starts at 10, game ends when reaching 0)
 * - Connection state tracking for realtime sessions
 * - A channel for receiving game state updates
 * - A language preference for UI translations
 *
 * The player tracks their connection state with a grace period system:
 * when a player disconnects (e.g., closes tab, loses network), they have
 * [DISCONNECT_GRACE_PERIOD_MS] to reconnect before being removed from the game.
 *
 * @property sessionId Unique identifier for this player's session
 * @property name Display name shown to other players
 * @property marbles Current marble count (0 = spectator)
 * @property currentGuess The player's guess for the current round (EVEN or ODD)
 * @property channel Coroutine channel for signaling outbound updates to this player
 * @property lang Language code for UI translations (e.g., "en", "de")
 */
class Player(
    val sessionId: String,
    var name: String,
    var marbles: Int = 10,
    var currentGuess: Guess? = null,
    val channel: Channel<PlayerOutboundSignal> =
        Channel(
            capacity = PLAYER_SIGNAL_CHANNEL_CAPACITY,
            onBufferOverflow = BufferOverflow.DROP_OLDEST,
        ),
    var lang: String = "en",
) {
    private val outboundLock = Any()

    @Volatile
    private var pendingLatestStateHtml: String? = null

    @Volatile
    private var pendingTerminalStateHtml: String? = null

    @Volatile
    private var pendingNonTerminalVersion: Long = 0L

    @Volatile
    private var pendingTerminalVersion: Long = 0L

    /** Thread-safe connection state tracking. */
    private val _connected = AtomicBoolean(false)

    /**
     * Connection ID to handle race conditions during reconnect.
     *
     * When a player reconnects (e.g., page refresh), there's a brief period where
     * both the old and new realtime connections exist. This ID ensures that when the
     * old connection's cleanup code runs, it doesn't mark the player as disconnected
     * if a new connection has already been established.
     */
    @Volatile
    var currentConnectionId: Long = 0L
        private set

    /**
     * Starts a new realtime connection for this player.
     *
     * Generates a new connection ID and marks the player as connected.
     * The returned ID should be stored by the realtime handler and passed to
     * [endConnection] when the connection closes.
     *
     * @return The new connection ID
     */
    fun startNewConnection(): Long {
        val newId = connectionIdCounter.incrementAndGet()
        currentConnectionId = newId
        connected = true
        return newId
    }

    companion object {
        /** Global atomic counter for connection IDs to ensure uniqueness even in rapid succession. */
        private val connectionIdCounter = AtomicLong(0L)
    }

    fun enqueueState(
        html: String,
        terminal: Boolean,
        version: Long,
    ) {
        synchronized(outboundLock) {
            if (terminal) {
                if (version < pendingTerminalVersion) {
                    return
                }
                if (pendingTerminalStateHtml == html) {
                    return
                }
                pendingTerminalStateHtml = html
                pendingTerminalVersion = version
                pendingLatestStateHtml = null
                pendingNonTerminalVersion = 0L
            } else {
                if (pendingTerminalStateHtml != null) {
                    return
                }
                if (version < pendingNonTerminalVersion) {
                    return
                }
                if (pendingLatestStateHtml == html) {
                    return
                }
                pendingLatestStateHtml = html
                pendingNonTerminalVersion = version
            }
        }
        val result = channel.trySend(PlayerOutboundSignal.Flush)
        if (result.isFailure && !channel.isClosedForSend) {
            // Best effort signal queue; state remains pending and may be sent by next signal cycle.
        }
    }

    fun enqueueConnectionCheck() {
        channel.trySend(PlayerOutboundSignal.ConnectionCheck)
    }

    fun pollPendingStateHtml(): String? =
        synchronized(outboundLock) {
            pendingTerminalStateHtml?.also { pendingTerminalStateHtml = null }
                ?: pendingLatestStateHtml?.also { pendingLatestStateHtml = null }
        }

    fun clearPendingStateHtml() {
        synchronized(outboundLock) {
            pendingTerminalStateHtml = null
            pendingLatestStateHtml = null
            pendingTerminalVersion = 0L
            pendingNonTerminalVersion = 0L
        }
    }

    fun hasPendingStateHtml(): Boolean =
        synchronized(outboundLock) {
            pendingTerminalStateHtml != null || pendingLatestStateHtml != null
        }

    /**
     * Ends a realtime connection for this player.
     *
     * Only marks the player as disconnected if the provided [connectionId]
     * matches the current connection. This prevents race conditions where
     * an old connection's cleanup runs after a new connection was established.
     *
     * @param connectionId The ID returned from [startNewConnection]
     */
    fun endConnection(connectionId: Long) {
        if (connectionId == currentConnectionId) {
            connected = false
        }
    }

    /**
     * Whether the player is currently connected via realtime transport.
     *
     * When set to `true`, clears the [disconnectedAt] timestamp.
     * When set to `false`, records the current time as [disconnectedAt]
     * (only if the player was previously connected).
     */
    var connected: Boolean
        get() = _connected.get()
        set(value) {
            val wasConnected = _connected.getAndSet(value)
            if (value) {
                if (!wasConnected) {
                    connectedSinceAt = System.currentTimeMillis()
                }
                disconnectedAt = null
            } else if (wasConnected) {
                disconnectedAt = System.currentTimeMillis()
            }
        }

    /** Timestamp when the current live connection started (null when never connected). */
    var connectedSinceAt: Long? = null
        internal set

    /**
     * Timestamp when the player disconnected.
     *
     * Used to calculate the grace period remaining. Set automatically when
     * [connected] becomes `false`. Cleared when [connected] becomes `true`.
     *
     * Visible for testing to simulate expired grace periods.
     */
    var disconnectedAt: Long? = null

    /** Whether this player has no marbles and is just watching. */
    val isSpectator: Boolean get() = marbles <= 0

    /** Whether this player has marbles and can participate in rounds. */
    val isActive: Boolean get() = marbles > 0

    /** Whether this player is active and currently connected. */
    val isActiveAndConnected: Boolean get() = isActive && connected

    /**
     * Checks if the player is within the reconnect grace period.
     *
     * Returns `true` if:
     * - The player is currently connected, OR
     * - The player disconnected less than [DISCONNECT_GRACE_PERIOD_MS] ago
     *
     * @return `true` if the player should still be considered "available" for game logic
     */
    fun isWithinGracePeriod(): Boolean {
        if (connected) return true
        val disconnectTime = disconnectedAt ?: return true
        return System.currentTimeMillis() - disconnectTime < DISCONNECT_GRACE_PERIOD_MS
    }

    /**
     * Gets the remaining seconds in the grace period.
     *
     * @return Seconds remaining before grace period expires, or 0 if connected or expired
     */
    fun gracePeriodRemainingSeconds(): Int {
        if (connected) return 0
        val disconnectTime = disconnectedAt ?: return 0
        val elapsed = System.currentTimeMillis() - disconnectTime
        val remaining = DISCONNECT_GRACE_PERIOD_MS - elapsed
        return if (remaining > 0) (remaining / 1000).toInt() else 0
    }
}
