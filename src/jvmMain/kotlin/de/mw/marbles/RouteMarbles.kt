package de.mw.marbles

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.html.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.html.*
import org.slf4j.LoggerFactory

internal const val WS_GAME_UPDATE_PREFIX = "__GAME_UPDATE__:"

private val marblesRouteLogger = LoggerFactory.getLogger("RouteMarbles")

internal fun Route.registerMarblesRoutes(isAllowedWebSocketOrigin: (ApplicationCall) -> Boolean) {
    // Create a new game
    post("/game/create") {
        val session =
            call.sessions.get<UserSession>() ?: run {
                call.respondText("Session not found", status = HttpStatusCode.BadRequest)
                return@post
            }
        val params = call.receiveParameters()
        val playerName = params["playerName"]?.trim()?.take(MAX_PLAYER_NAME_LENGTH)?.takeIf { it.isNotEmpty() } ?: "Player"
        val lang = call.getLanguage()

        // Save player name to session
        call.sessions.set(session.copy(playerName = playerName))

        val game = GameManager.createGame(session.id)
        game.addPlayer(session.id, playerName, lang)

        // Use HX-Redirect for HTMX requests to force full page navigation
        // This ensures scripts on the game page are properly loaded and executed
        val redirectUrl = "$MARBLES/game/${game.id}"
        if (call.request.headers["HX-Request"] == "true") {
            call.response.header("HX-Redirect", redirectUrl)
            call.respond(HttpStatusCode.OK)
        } else {
            call.respondRedirect(redirectUrl)
        }
    }

    // Join an existing game
    post("/game/join") {
        val session =
            call.sessions.get<UserSession>() ?: run {
                call.respondText("Session not found", status = HttpStatusCode.BadRequest)
                return@post
            }
        val params = call.receiveParameters()
        val playerName = params["playerName"]?.trim()?.take(MAX_PLAYER_NAME_LENGTH)?.takeIf { it.isNotEmpty() } ?: "Player"
        val gameId =
            params["gameId"]?.trim()?.lowercase() ?: run {
                call.respondText("Game ID required", status = HttpStatusCode.BadRequest)
                return@post
            }

        // Save player name to session
        call.sessions.set(session.copy(playerName = playerName))

        val game =
            GameManager.getGame(gameId) ?: run {
                call.respondRedirect("$MARBLES/?error=game_not_found")
                return@post
            }

        val lang = call.getLanguage()

        // Add player - as regular player if waiting/game over, or as pending spectator if game in progress
        if (game.phase == GamePhase.WAITING_FOR_PLAYERS || game.phase == GamePhase.GAME_OVER) {
            game.addPlayer(session.id, playerName, lang)
        } else {
            game.addPendingPlayer(session.id, playerName, lang)
        }

        // Notify existing connected players about the new player
        game.broadcastToAllConnected(::renderGameState)

        // Use HX-Redirect for HTMX requests to force full page navigation
        // This ensures scripts on the game page are properly loaded and executed
        val redirectUrl = "$MARBLES/game/${game.id}"
        if (call.request.headers["HX-Request"] == "true") {
            call.response.header("HX-Redirect", redirectUrl)
            call.respond(HttpStatusCode.OK)
        } else {
            call.respondRedirect(redirectUrl)
        }
    }

    // Direct join via URL
    get("/game/{gameId}/join") {
        val session = call.sessions.get<UserSession>()
        val savedName = session?.playerName?.take(MAX_PLAYER_NAME_LENGTH) ?: ""

        val gameId =
            call.parameters["gameId"] ?: run {
                call.respondRedirect(MARBLES)
                return@get
            }
        val game =
            GameManager.getGame(gameId) ?: run {
                call.respondRedirect("$MARBLES/?error=game_not_found")
                return@get
            }

        // Auto-join if session has a saved name
        if (session != null && savedName.isNotEmpty()) {
            // Check if already in game
            if (game.players[session.id] == null) {
                val lang = call.getLanguage()
                if (game.phase == GamePhase.WAITING_FOR_PLAYERS || game.phase == GamePhase.GAME_OVER) {
                    game.addPlayer(session.id, savedName, lang)
                } else {
                    game.addPendingPlayer(session.id, savedName, lang)
                }
                game.broadcastToAllConnected(::renderGameState)
            }
            call.respondRedirect("$MARBLES/game/$gameId")
            return@get
        }

        val gameInProgress = game.phase != GamePhase.WAITING_FOR_PLAYERS && game.phase != GamePhase.GAME_OVER
        val lang = call.getLanguage()

        call.respondHtml {
            basePage("join.title".t(lang), lang, includeHtmx = true) {
                h1 { +"join.title".t(lang) }

                div("card") {
                    if (gameInProgress) {
                        p("hint") { +"join.spectatorHint".t(lang) }
                    }
                    form {
                        hxPost("$MARBLES/game/join")
                        hxTarget("body")

                        input(type = InputType.hidden, name = "gameId") { value = gameId }
                        div("form-group") {
                            label { +"home.yourName".t(lang) }
                            input(type = InputType.text, name = "playerName") {
                                required = true
                                placeholder = "home.namePlaceholder".t(lang)
                                value = savedName
                                maxLength = MAX_PLAYER_NAME_LENGTH.toString()
                            }
                        }
                        button(type = ButtonType.submit, classes = "btn btn-primary") {
                            if (gameInProgress) +"button.joinSpectator".t(lang) else +"button.join".t(lang)
                        }
                    }
                }
            }
        }
    }

    // Game page
    get("/game/{gameId}") {
        val session =
            call.sessions.get<UserSession>() ?: run {
                call.respondRedirect(MARBLES)
                return@get
            }
        val gameId =
            call.parameters["gameId"] ?: run {
                call.respondRedirect(MARBLES)
                return@get
            }
        val game =
            GameManager.getGame(gameId) ?: run {
                val lang = call.getLanguage()
                call.respondHtml(HttpStatusCode.NotFound) {
                    basePage("error.gameNotFound".t(lang), lang) {
                        div("card") {
                            h1 { +"error.gameNotFound".t(lang) }
                            a(href = MARBLES, classes = "btn btn-primary") { +"button.goBack".t(lang) }
                        }
                    }
                }
                return@get
            }

        val player = game.players[session.id]
        if (player == null) {
            call.respondRedirect("$MARBLES/game/$gameId/join")
            return@get
        }

        val lang = call.getLanguage()
        call.respondHtml {
            renderGamePage(game, session.id, lang)
        }
    }

    webSocket("/ws/game/{gameId}") {
        if (!isAllowedWebSocketOrigin(call)) {
            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Invalid origin"))
            return@webSocket
        }
        val session =
            call.sessions.get<UserSession>() ?: run {
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Session required"))
                return@webSocket
            }
        val gameId =
            call.parameters["gameId"] ?: run {
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Missing game id"))
                return@webSocket
            }
        val game =
            GameManager.getGame(gameId) ?: run {
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Game not found"))
                return@webSocket
            }
        val player =
            game.players[session.id] ?: run {
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Not in game"))
                return@webSocket
            }
        val lang = call.getLanguage()
        game.handlePlayerReconnect(session.id)
        player.lang = lang

        runRealtimeWebSocketSession(
            player = player,
            updatePrefix = WS_GAME_UPDATE_PREFIX,
            logLabel = "WS",
            notifyOthersOnConnect = {
                game.broadcastToConnectedExcept(session.id, ::renderGameState)
            },
            renderInitialState = { renderGameState(game, session.id, lang) },
            onDisconnect = {
                val stateChanged = game.handlePlayerDisconnect(session.id)
                if (stateChanged) {
                    game.broadcastToAllConnected(::renderGameState)
                }
            },
        )
    }

    // Start the game
    post("/game/{gameId}/start") {
        val session =
            call.sessions.get<UserSession>() ?: run {
                call.respondText("Unauthorized", status = HttpStatusCode.Unauthorized)
                return@post
            }
        val gameId = call.parameters["gameId"] ?: return@post
        val game = GameManager.getGame(gameId) ?: return@post

        if (game.creatorSessionId != session.id) {
            call.respondText("Only the creator can start the game", status = HttpStatusCode.Forbidden)
            return@post
        }

        if (!game.startGame()) {
            call.respondText("Need at least 2 connected players", status = HttpStatusCode.BadRequest)
            return@post
        }

        marblesRouteLogger.info("Game {} started with {} players", game.id, game.allPlayers.size)
        game.broadcastToAllConnected(::renderGameState)

        call.respondText("OK")
    }

    // Place marbles
    post("/game/{gameId}/place") {
        val session = call.sessions.get<UserSession>() ?: return@post
        val gameId = call.parameters["gameId"] ?: return@post
        val game = GameManager.getGame(gameId) ?: return@post
        val params = call.receiveParameters()
        val amount = params["amount"]?.toIntOrNull() ?: return@post

        if (!game.placeMarbles(session.id, amount)) {
            call.respondText("Invalid move", status = HttpStatusCode.BadRequest)
            return@post
        }

        if (game.allActivePlayersGuessed()) {
            game.resolveRound()
        }

        game.broadcastToAllConnected(::renderGameState)

        call.respondText("OK")
    }

    // Make a guess
    post("/game/{gameId}/guess") {
        val session = call.sessions.get<UserSession>() ?: return@post
        val gameId = call.parameters["gameId"] ?: return@post
        val game = GameManager.getGame(gameId) ?: return@post
        val params = call.receiveParameters()
        val guessStr = params["guess"] ?: return@post
        val guess =
            when (guessStr.uppercase()) {
                "EVEN" -> Guess.EVEN
                "ODD" -> Guess.ODD
                else -> return@post
            }

        if (!game.makeGuess(session.id, guess)) {
            call.respondText("Invalid guess", status = HttpStatusCode.BadRequest)
            return@post
        }

        if (game.allActivePlayersGuessed()) {
            game.resolveRound()
        }

        game.broadcastToAllConnected(::renderGameState)

        call.respondText("OK")
    }

    // New game (restart)
    post("/game/{gameId}/new-game") {
        val session =
            call.sessions.get<UserSession>() ?: run {
                call.respondText("Unauthorized", status = HttpStatusCode.Unauthorized)
                return@post
            }
        val gameId = call.parameters["gameId"] ?: return@post
        val game = GameManager.getGame(gameId) ?: return@post

        if (game.creatorSessionId != session.id) {
            call.respondText("Only the creator can start a new game", status = HttpStatusCode.Forbidden)
            return@post
        }

        game.resetForNewGame()
        game.broadcastToAllConnected(::renderGameState)

        call.respondText("OK")
    }
}
