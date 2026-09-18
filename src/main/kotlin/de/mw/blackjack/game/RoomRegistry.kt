package de.mw.blackjack.game

import de.mw.blackjack.models.Pace
import de.mw.blackjack.models.TableState
import de.mw.blackjack.realtime.RoomEvents
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap
import kotlin.random.Random

/**
 * Every live table, plus the single loop that drives them.
 *
 * One loop rather than a coroutine per room: a table is idle almost all the time, and
 * a 250 ms sweep over a handful of rooms costs nothing next to the bookkeeping of
 * cancelling per-room timers on every phase change.
 */
object RoomRegistry {

    private val logger = LoggerFactory.getLogger(javaClass)
    private val json = Json { encodeDefaults = true }

    private val rooms = ConcurrentHashMap<String, Room>()

    /** Last version broadcast per room, so a quiet table sends nothing. */
    private val published = ConcurrentHashMap<String, Long>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Ceiling on live tables — codes are cheap to ask for, rooms are not. */
    private const val MAX_ROOMS = 500

    private const val ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    fun create(): Room? {
        if (rooms.size >= MAX_ROOMS) {
            logger.warn("Room ceiling reached ({}), refusing to create another", MAX_ROOMS)
            return null
        }
        repeat(20) {
            val code = (1..4).map { ALPHABET[Random.nextInt(ALPHABET.length)] }.joinToString("")
            val room = Room(code)
            if (rooms.putIfAbsent(code, room) == null) return room
        }
        return null
    }

    fun get(code: String): Room? = rooms[code.uppercase()]

    fun count(): Int = rooms.size

    fun start() {
        scope.launch {
            while (isActive) {
                delay(Pace.TICK_MILLIS)
                try {
                    sweep()
                } catch (e: Exception) {
                    logger.error("Room sweep failed", e)
                }
            }
        }
    }

    private suspend fun sweep() {
        val now = System.currentTimeMillis()
        rooms.values.forEach { room ->
            val online = RoomEvents.playersOnline(room.code)
            room.seats.forEach { seat ->
                // Read once: a concurrent leave nulls this out under the room's lock,
                // and an NPE here would abort the sweep for every other table too.
                val playerId = seat.playerId ?: return@forEach
                val connected = playerId in online
                if (connected != seat.connected) room.setConnected(playerId, connected)
            }
            room.tick(now)
            if (published[room.code] != room.version) {
                published[room.code] = room.version
                RoomEvents.publish(room.code) { playerId -> json.encodeToString(TableState.serializer(), room.snapshot(playerId)) }
            }
        }
        // Drop tables nobody is sitting at. Without this the map is a slow leak: one
        // entry per code anybody ever asked for, each holding a 312-card shoe.
        rooms.values
            .filter { it.isEmpty && (it.emptySince ?: now) < now - Pace.EMPTY_ROOM_TTL_SECONDS * 1000 }
            .forEach { room ->
                rooms.remove(room.code, room)
                published.remove(room.code)
                RoomEvents.closeRoom(room.code)
                logger.debug("Dropped empty room {}", room.code)
            }
    }
}
