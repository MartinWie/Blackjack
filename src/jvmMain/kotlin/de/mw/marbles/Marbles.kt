package de.mw.marbles

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*
import io.ktor.server.websocket.*
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.util.UUID

private val logger = LoggerFactory.getLogger("de.mw.marbles.Marbles")

/** Marbles' own identity; the cookie is registered next to blackjack's in `configureSessions`. */
@Serializable
data class UserSession(
    val id: String,
    val playerName: String? = null,
)

const val MARBLES_SESSION = "user_session"

fun Application.configureMarbles() {
    install(WebSockets) {
        pingPeriodMillis = 0
        timeoutMillis = 20_000
        maxFrameSize = 64 * 1024L
        masking = false
    }
    RealtimeMaintenanceService.start()
    environment.monitor.subscribe(ApplicationStopped) {
        RealtimeMaintenanceService.stop()
    }

    routing {
        route(MARBLES) {
            // Every marbles request carries a session; blackjack's routes never see this.
            intercept(ApplicationCallPipeline.Plugins) {
                if (call.sessions.get<UserSession>() == null) {
                    call.sessions.set(UserSession(id = UUID.randomUUID().toString().substring(0, 8)))
                }
            }
            registerPageRoutes()
            registerMarblesRoutes(::isAllowedWebSocketOrigin)
            registerSharedRoutes()
        }
    }
    logger.info("Marbles mounted at {}", MARBLES)
}

/** Live marbles games, for `/metrics`. */
fun marblesGameCount(): Int = GameManager.gameCount()
