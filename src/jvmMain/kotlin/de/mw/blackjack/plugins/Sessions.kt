package de.mw.blackjack.plugins

import de.mw.blackjack.sessionSignKey
import de.mw.marbles.MARBLES_SESSION
import de.mw.marbles.UserSession
import io.ktor.server.application.*
import io.ktor.server.sessions.*
import io.ktor.util.hex
import kotlinx.serialization.Serializable

/**
 * The only identity this app has: a signed cookie holding a random id and a display
 * name. No accounts, no database — the cash lives in the browser (see `bank.js`).
 */
@Serializable
data class PlayerSession(val playerId: String, val name: String)

const val PLAYER_SESSION = "bj-player"

fun Application.configureSessions() {
    install(Sessions) {
        cookie<PlayerSession>(PLAYER_SESSION) {
            cookie.path = "/"
            cookie.maxAgeInSeconds = 60L * 60 * 24 * 90
            cookie.httpOnly = true
            cookie.extensions["SameSite"] = "Lax"
            transform(SessionTransportTransformerMessageAuthentication(hex(sessionSignKey)))
        }
        // Marbles keys every game seat on this id, so it is signed like ours.
        cookie<UserSession>(MARBLES_SESSION) {
            cookie.path = "/marbles"
            cookie.maxAgeInSeconds = 60L * 60 * 24
            cookie.httpOnly = true
            cookie.extensions["SameSite"] = "Lax"
            transform(SessionTransportTransformerMessageAuthentication(hex(sessionSignKey)))
        }
    }
}
