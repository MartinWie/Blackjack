package de.mw.marbles

import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import org.slf4j.LoggerFactory

private val realtimeLogger = LoggerFactory.getLogger("Routing")

private const val REALTIME_PING_INTERVAL_MS = 5_000L
private const val WS_PING_MESSAGE = "__PING__"

internal suspend fun DefaultWebSocketServerSession.runRealtimeWebSocketSession(
    player: Player,
    updatePrefix: String,
    logLabel: String,
    notifyOthersOnConnect: () -> Unit,
    renderInitialState: () -> String,
    onDisconnect: () -> Unit,
) {
    while (player.channel.tryReceive().isSuccess) {
        // Discard old messages
    }
    player.clearPendingStateHtml()

    val connectionId = player.startNewConnection()
    realtimeLogger.debug("{} connected: {} connectionId={}", logLabel, player.name, connectionId)

    var connectionAlive = true
    val pingJob =
        launch {
            while (isActive && connectionAlive) {
                delay(REALTIME_PING_INTERVAL_MS)
                try {
                    send(Frame.Text(WS_PING_MESSAGE))
                } catch (_: Exception) {
                    connectionAlive = false
                    player.enqueueConnectionCheck()
                    break
                }
            }
        }

    val inboundJob =
        launch {
            try {
                for (incomingFrame in incoming) {
                    when (incomingFrame) {
                        is Frame.Close,
                        is Frame.Ping,
                        is Frame.Pong,
                        -> {
                            if (incomingFrame is Frame.Close) {
                                connectionAlive = false
                                player.enqueueConnectionCheck()
                                break
                            }
                        }

                        else -> {
                            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unsupported client frame"))
                            connectionAlive = false
                            player.enqueueConnectionCheck()
                            break
                        }
                    }
                }
            } catch (_: Exception) {
                connectionAlive = false
                player.enqueueConnectionCheck()
            } finally {
                if (connectionAlive) {
                    connectionAlive = false
                    player.enqueueConnectionCheck()
                }
            }
        }

    try {
        notifyOthersOnConnect()
        send(Frame.Text(updatePrefix + renderInitialState()))

        while (true) {
            val pending = player.pollPendingStateHtml() ?: break
            send(Frame.Text(updatePrefix + pending))
        }

        val refreshJob =
            launch {
                delay(100)
                if (connectionId == player.currentConnectionId && connectionAlive) {
                    try {
                        send(Frame.Text(updatePrefix + renderInitialState()))
                    } catch (_: Exception) {
                        // Connection might be closed, ignore
                    }
                }
            }

        for (signal in player.channel) {
            if (!connectionAlive) {
                break
            }
            if (signal == PlayerOutboundSignal.ConnectionCheck) {
                continue
            }
            if (connectionId != player.currentConnectionId) {
                if (player.hasPendingStateHtml()) {
                    player.channel.trySend(PlayerOutboundSignal.Flush)
                }
                break
            }

            while (true) {
                val message = player.pollPendingStateHtml() ?: break
                send(Frame.Text(updatePrefix + message))
            }
        }

        refreshJob.cancel()
    } catch (e: Exception) {
        realtimeLogger.warn("{} error for {}: {}", logLabel, player.name, e.message)
    } finally {
        pingJob.cancel()
        inboundJob.cancel()
        player.endConnection(connectionId)

        if (!player.connected) {
            onDisconnect()
        }
    }
}
