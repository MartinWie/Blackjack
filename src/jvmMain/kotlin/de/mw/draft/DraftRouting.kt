package de.mw.draft

import de.mw.blackjack.plugins.ApiError
import de.mw.blackjack.plugins.CreatedRoom
import de.mw.blackjack.plugins.PlayerSession
import de.mw.blackjack.plugins.player
import de.mw.blackjack.plugins.streamRoom
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

/** All empty for a standard match; any set opens a room on custom rules. */
@Serializable
private data class CreateRequest(val hearts: Int? = null, val picks: Int? = null, val balance: Boolean? = null)

@Serializable
private data class PickRequest(val round: Int, val pick: Int, val choice: Int)

@Serializable
private data class NextRequest(val round: Int)

@Serializable
private data class RematchRequest(val match: Int)

/**
 * Draft Battle's live rooms, under /api/draft. Identity is the same signed player
 * cookie as the blackjack tables. Every answer to a move is the room's state, which
 * the stream also pushes; the solo game never calls any of this.
 */
fun Route.draftApi() {
    route("/api/draft") {
        post("/rooms") {
            call.player()
            val body = try {
                call.receive<CreateRequest>()
            } catch (e: BadRequestException) {
                return@post call.respond(HttpStatusCode.BadRequest, ApiError("those are not rules a room can open with"))
            }
            val rules = if (body.hearts == null && body.picks == null) DraftRules.STANDARD.copy(balance = body.balance ?: true)
            else DraftRules.custom(body.hearts ?: DraftRules.HEARTS, body.picks ?: DraftRules.PICKS, body.balance ?: true)
            val room = DraftRooms.create(System.currentTimeMillis(), rules)
                ?: return@post call.respond(HttpStatusCode.ServiceUnavailable, ApiError("no free rooms right now"))
            call.respond(CreatedRoom(room.code))
        }

        route("/rooms/{code}") {
            post("/join") {
                val (room, player) = call.draftRoom() ?: return@post
                room.join(player.playerId, player.name, System.currentTimeMillis())
                    ?: return@post call.respond(HttpStatusCode.Conflict, ApiError("that room already has two players"))
                call.respondState(room, player)
            }

            post("/leave") {
                val (room, player) = call.draftRoom() ?: return@post
                room.leave(player.playerId, System.currentTimeMillis())
                call.respond(HttpStatusCode.OK, ApiError("ok"))
            }

            post("/pick") {
                val (room, player) = call.draftRoom() ?: return@post
                val body = call.receive<PickRequest>()
                room.pick(player.playerId, body.round, body.pick, body.choice, System.currentTimeMillis())
                    ?.let { return@post call.respond(HttpStatusCode.Conflict, ApiError(it)) }
                call.respondState(room, player)
            }

            post("/next") {
                val (room, player) = call.draftRoom() ?: return@post
                room.next(player.playerId, call.receive<NextRequest>().round, System.currentTimeMillis())
                    ?.let { return@post call.respond(HttpStatusCode.Conflict, ApiError(it)) }
                call.respondState(room, player)
            }

            post("/rematch") {
                val (room, player) = call.draftRoom() ?: return@post
                room.rematch(player.playerId, call.receive<RematchRequest>().match, System.currentTimeMillis())
                    ?.let { return@post call.respond(HttpStatusCode.Conflict, ApiError(it)) }
                call.respondState(room, player)
            }

            get("/events") {
                val (room, player) = call.draftRoom() ?: return@get
                val sub = DraftEvents.subscribe(room.code, player.playerId)
                room.setConnected(player.playerId, true)
                try {
                    call.streamRoom(sub, DraftRooms.state(room, player.playerId))
                } finally {
                    DraftEvents.unsubscribe(sub)
                    room.setConnected(player.playerId, false)
                }
            }
        }
    }
}

private suspend fun ApplicationCall.respondState(room: DraftRoom, player: PlayerSession) =
    respondText(DraftRooms.state(room, player.playerId), ContentType.Application.Json)

/** The room in the path and the caller, or a 404 already answered. */
private suspend fun ApplicationCall.draftRoom(): Pair<DraftRoom, PlayerSession>? {
    val room = DraftRooms.get(parameters["code"].orEmpty())
    if (room == null) {
        respond(HttpStatusCode.NotFound, ApiError("that room is gone"))
        return null
    }
    return room to player()
}
