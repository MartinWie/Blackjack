package de.mw.blackjack.plugins

import de.mw.blackjack.BuildInfo

import de.mw.blackjack.frontend.pages.hubPage
import de.mw.blackjack.frontend.utils.Apps
import de.mw.blackjack.frontend.pages.lobbyPage
import de.mw.blackjack.frontend.pages.meowPage
import de.mw.blackjack.frontend.pages.picnicPage
import de.mw.blackjack.frontend.pages.sweetsPage
import de.mw.blackjack.frontend.pages.offlinePage
import de.mw.blackjack.frontend.pages.tablePage
import de.mw.blackjack.game.Action
import de.mw.blackjack.game.Room
import de.mw.blackjack.game.RoomRegistry
import de.mw.blackjack.models.Names
import de.mw.blackjack.models.TableState
import de.mw.blackjack.realtime.RoomEvents
import de.mw.marbles.marblesGameCount
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.plugins.compression.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*
import io.ktor.util.cio.*
import io.ktor.utils.io.*
import kotlinx.coroutines.channels.ClosedReceiveChannelException
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID

@Serializable
private data class CreatedRoom(val code: String)

@Serializable
private data class JoinResult(val code: String, val seat: Int)

@Serializable
private data class ApiError(val error: String)

@Serializable
private data class BetRequest(val amount: Int)

@Serializable
private data class ActionRequest(val action: String)

@Serializable
private data class NameRequest(val name: String)

private const val HEARTBEAT_MILLIS = 15_000L
private val json = Json { encodeDefaults = true }

/** The session, created on first contact — there is nothing to sign up for. */
private fun ApplicationCall.player(): PlayerSession =
    sessions.get<PlayerSession>() ?: PlayerSession(UUID.randomUUID().toString(), Names.random())
        .also { sessions.set(it) }

fun Application.configureRouting() {
    install(Compression) { gzip() }
    // `/marbles` and `/marbles/` are the same page.
    install(IgnoreTrailingSlash)

    install(StatusPages) {
        exception<Throwable> { call, cause ->
            call.application.log.error("Unhandled exception on ${call.request.local.uri}", cause)
            call.respond(HttpStatusCode.InternalServerError, ApiError("something went wrong"))
        }
        status(HttpStatusCode.NotFound) { call, _ ->
            // Pages only. StatusPages fires for responses that already have a body,
            // so redirecting unconditionally turned every API 404 into a 302 to the
            // lobby — and the client's "is this table gone?" check followed it and
            // read 200.
            // Marbles answers its own 404s (a gone game has a page of its own).
            val uri = call.request.local.uri
            val marbles = uri == "/marbles" || uri.startsWith("/marbles/") || uri.startsWith("/marbles?")
            if (!uri.startsWith("/api/") && !uri.startsWith("/manifest/") && !marbles) call.respondRedirect("/")
        }
    }

    routing {
        get("/health") { call.respondText("ok") }

        /**
         * What the process is holding. Counts only — there is nothing private in a
         * room code count — and it exists so a long run can be watched: all three
         * numbers must come back down when people stop playing.
         */
        get("/metrics") {
            val runtime = Runtime.getRuntime()
            val heapMb = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024)
            call.respondText(
                "rooms ${RoomRegistry.count()}\n" +
                    "streams ${RoomEvents.streamCount()}\n" +
                    "stream_rooms ${RoomEvents.codes().size}\n" +
                    "marbles_games ${marblesGameCount()}\n" +
                    "heap_mb $heapMb\n",
            )
        }

        // The launcher and both offline games are static, so the service worker can
        // serve them with no network at all.
        // A game's own subdomain (blackjack.7mw.de, …) opens that game; any other
        // host gets the launcher.
        get("/") {
            when (call.request.host().substringBefore('.')) {
                "blackjack" -> call.respondText(lobbyPage(call.player().name), ContentType.Text.Html)
                "meow" -> call.respondText(meowPage(), ContentType.Text.Html)
                "sweets" -> call.respondText(sweetsPage(), ContentType.Text.Html)
                "picnic" -> call.respondText(picnicPage(), ContentType.Text.Html)
                "marbles" -> call.respondRedirect("/marbles")
                else -> call.respondText(hubPage(), ContentType.Text.Html)
            }
        }

        get("/games") { call.respondText(hubPage(), ContentType.Text.Html) }

        // One manifest per app, so each game installs as its own home-screen app.
        get("/manifest/{app}.webmanifest") {
            val app = Apps.byKey(call.parameters["app"].orEmpty())
            if (app == null) call.respond(HttpStatusCode.NotFound)
            else call.respondText(app.manifest(call.request.host()), ContentType.parse("application/manifest+json"))
        }

        get("/meow") { call.respondText(meowPage(), ContentType.Text.Html) }

        get("/sweets") { call.respondText(sweetsPage(), ContentType.Text.Html) }

        get("/picnic") { call.respondText(picnicPage(), ContentType.Text.Html) }

        get("/blackjack") {
            val player = call.player()
            call.respondText(lobbyPage(player.name), ContentType.Text.Html)
        }

        get("/offline") { call.respondText(offlinePage(), ContentType.Text.Html) }

        // The service worker must be served from the root to control the whole app.
        get("/sw.js") {
            val stream = javaClass.getResourceAsStream("/static/sw.js")
            // The cache is named after the build, so every deploy installs a fresh one.
            if (stream == null) call.respond(HttpStatusCode.NotFound)
            else call.respondText(
                stream.bufferedReader().readText().replace(Regex("const VERSION = '[^']*';"), "const VERSION = 'games-${BuildInfo.id}';"),
                ContentType.Text.JavaScript,
            )
        }

        /**
         * Solo, and never anything else: the table runs entirely in the browser, so
         * this page is static and the service worker can serve it with no network at
         * all. Nothing about this request creates a room on the server.
         */
        get("/solo") {
            call.player()
            call.respondText(tablePage(code = "SOLO", local = true), ContentType.Text.Html)
        }

        get("/t/{code}") {
            val code = call.parameters["code"]?.uppercase().orEmpty()
            if (RoomRegistry.get(code) == null) return@get call.respondRedirect("/blackjack")
            call.player()
            call.respondText(tablePage(code), ContentType.Text.Html)
        }

        staticResources("/static", "static") {
            preCompressed(CompressedFileType.GZIP)
        }

        route("/api") {
            post("/name") {
                val player = call.player()
                val requested = call.receive<NameRequest>().name
                call.sessions.set(player.copy(name = Names.clean(requested)))
                call.respond(HttpStatusCode.OK, ApiError("ok"))
            }

            post("/rooms") {
                call.player()
                val room = RoomRegistry.create()
                    ?: return@post call.respond(HttpStatusCode.ServiceUnavailable, ApiError("no free tables right now"))
                call.respond(CreatedRoom(room.code))
            }

            route("/rooms/{code}") {
                post("/join") {
                    val (room, player) = call.roomAndPlayer() ?: return@post
                    val seat = room.join(player.playerId, player.name)
                        ?: return@post call.respond(HttpStatusCode.Conflict, ApiError("that table is full"))
                    call.respond(JoinResult(room.code, seat))
                }

                post("/leave") {
                    val (room, player) = call.roomAndPlayer() ?: return@post
                    room.leave(player.playerId)
                    call.respond(HttpStatusCode.OK, ApiError("ok"))
                }

                post("/bet") {
                    val (room, player) = call.roomAndPlayer() ?: return@post
                    val amount = call.receive<BetRequest>().amount
                    room.placeBet(player.playerId, amount).let { error ->
                        if (error != null) call.respond(HttpStatusCode.BadRequest, ApiError(error))
                        else call.respond(room.snapshot(player.playerId))
                    }
                }

                post("/bet/clear") {
                    val (room, player) = call.roomAndPlayer() ?: return@post
                    room.clearBet(player.playerId)
                    call.respond(room.snapshot(player.playerId))
                }

                post("/deal") {
                    val (room, player) = call.roomAndPlayer() ?: return@post
                    room.lockBet(player.playerId).let { error ->
                        if (error != null) call.respond(HttpStatusCode.BadRequest, ApiError(error))
                        else call.respond(room.snapshot(player.playerId))
                    }
                }

                post("/action") {
                    val (room, player) = call.roomAndPlayer() ?: return@post
                    val action = runCatching { Action.valueOf(call.receive<ActionRequest>().action.uppercase()) }
                        .getOrNull() ?: return@post call.respond(HttpStatusCode.BadRequest, ApiError("unknown action"))
                    room.act(player.playerId, action).let { error ->
                        if (error != null) call.respond(HttpStatusCode.BadRequest, ApiError(error))
                        else call.respond(room.snapshot(player.playerId))
                    }
                }

                get("/state") {
                    val (room, player) = call.roomAndPlayer() ?: return@get
                    call.respond(room.snapshot(player.playerId))
                }

                get("/events") {
                    val (room, player) = call.roomAndPlayer() ?: return@get
                    val sub = RoomEvents.subscribe(room.code, player.playerId)
                    room.setConnected(player.playerId, true)
                    try {
                        call.respondTextWriter(ContentType.Text.EventStream) {
                            write("retry: 2000\n\n")
                            write(sseFrame(json.encodeToString(TableState.serializer(), room.snapshot(player.playerId))))
                            flush()
                            while (this@get.coroutineContext.isActive) {
                                // A heartbeat so a dead socket is noticed and no proxy
                                // closes a stream that is merely between rounds.
                                val payload = withTimeoutOrNull(HEARTBEAT_MILLIS) { sub.channel.receive() }
                                if (payload == null) {
                                    write(": ping\n\n")
                                } else {
                                    write(sseFrame(payload))
                                }
                                flush()
                            }
                        }
                    } catch (_: ClosedReceiveChannelException) {
                        // Room went away or the stream was rotated out.
                    } catch (e: Exception) {
                        application.log.debug("SSE stream ended for {}: {}", room.code, e.message)
                    } finally {
                        RoomEvents.unsubscribe(sub)
                        room.setConnected(player.playerId, false)
                    }
                }
            }
        }
    }
}

private fun sseFrame(payload: String): String =
    buildString {
        append("event: state\n")
        payload.lineSequence().forEach { append("data: ").append(it).append("\n") }
        append("\n")
    }

/** Resolves the room in the path, answering 404 itself when there is none. */
private suspend fun ApplicationCall.roomAndPlayer(): Pair<Room, PlayerSession>? {
    val code = parameters["code"]?.uppercase().orEmpty()
    val room = RoomRegistry.get(code)
    if (room == null) {
        respond(HttpStatusCode.NotFound, ApiError("that table is gone"))
        return null
    }
    return room to player()
}
