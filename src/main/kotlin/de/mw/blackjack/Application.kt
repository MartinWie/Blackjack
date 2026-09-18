package de.mw.blackjack

import de.mw.blackjack.game.RoomRegistry
import de.mw.blackjack.plugins.configureRouting
import de.mw.blackjack.plugins.configureSessions
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("de.mw.blackjack.Application")

val envHost: String = System.getenv("APP_HOST") ?: "0.0.0.0"
val envPort: Int = System.getenv("APP_PORT")?.toIntOrNull() ?: 8090

/**
 * Cookie signing key (hex). The dev default is public knowledge — a deployment sets
 * its own, or every restart hands out new player ids.
 */
val sessionSignKey: String = System.getenv("SECRET_BJ_SESSION-KEY")
    ?: "3f2a91c07d5e4b8aa1c6f0e93b7d2456".also {
        logger.warn("SECRET_BJ_SESSION-KEY is not set — using the dev default.")
    }

fun main() {
    logger.info("Starting Blackjack on $envHost:$envPort")
    embeddedServer(Netty, port = envPort, host = envHost, module = Application::module).start(wait = true)
}

fun Application.module() {
    install(ContentNegotiation) {
        json(Json { encodeDefaults = true })
    }
    configureSessions()
    configureRouting()
    RoomRegistry.start()
}
