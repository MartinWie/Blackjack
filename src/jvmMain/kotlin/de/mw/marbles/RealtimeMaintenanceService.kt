package de.mw.marbles

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.slf4j.LoggerFactory
import java.util.concurrent.atomic.AtomicBoolean

internal object RealtimeMaintenanceService {
    private val logger = LoggerFactory.getLogger("RealtimeMaintenanceService")
    private const val TICK_INTERVAL_MS = 1_000L

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val started = AtomicBoolean(false)
    private val lifecycleLock = Any()

    @Volatile
    private var job: Job? = null

    fun start() {
        synchronized(lifecycleLock) {
            if (job?.isActive == true) {
                return
            }
            started.set(true)
            job =
                scope.launch {
                    while (isActive) {
                        delay(TICK_INTERVAL_MS)
                        tickMarblesGames()
                    }
                }

            job?.invokeOnCompletion {
                synchronized(lifecycleLock) {
                    started.set(false)
                    if (job?.isCompleted == true) {
                        job = null
                    }
                }
            }
        }
    }

    fun stop() {
        synchronized(lifecycleLock) {
            started.set(false)
            val current = job
            job = null
            current?.cancel()
        }
    }

    private fun tickMarblesGames() {
        runCatching {
            GameManager.allGames().forEach { game ->
                runCatching {
                    var stateChanged = false

                    val expiredPlayers =
                        game.allPlayers
                            .filter { !it.connected && !it.isWithinGracePeriod() }
                            .map { it.sessionId }

                    expiredPlayers.forEach { sessionId ->
                        if (game.handleGracePeriodExpired(sessionId)) {
                            stateChanged = true
                        }
                    }

                    if (game.phase == GamePhase.ROUND_RESULT && game.roundResultCooldownRemaining() <= 0) {
                        val advanced = game.nextRound()
                        if (advanced || game.phase == GamePhase.GAME_OVER || game.phase == GamePhase.PLACING_MARBLES) {
                            stateChanged = true
                        }
                    }

                    if (stateChanged) {
                        game.broadcastToAllConnected(::renderGameState)
                    }
                }.onFailure { ex ->
                    logger.warn("Maintenance tick failed for marbles game {}: {}", game.id, ex.message)
                }
            }
        }.onFailure { ex ->
            logger.warn("Maintenance tick failed for marbles sweep: {}", ex.message)
        }
    }
}
