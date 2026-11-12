package de.mw.draft

import de.mw.blackjack.realtime.RoomStreams
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

/** Draft Battle rooms' streams; separate from blackjack's, whose codes may collide. */
object DraftEvents : RoomStreams()

/**
 * Every live Draft Battle room and the one loop that drives them: connection flags,
 * the pick clock, broadcasts, and handing rooms back. Like the blackjack tables, a
 * room goes when it has stood empty past [EMPTY_TTL_MILLIS] or untouched past
 * [IDLE_MILLIS]; the second bounds a long run, since a tab left open never leaves.
 */
object DraftRooms {

    private val logger = LoggerFactory.getLogger(javaClass)
    private val json = Json { encodeDefaults = true }
    private val rooms = ConcurrentHashMap<String, DraftRoom>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private const val MAX_ROOMS = 300
    private const val TICK_MILLIS = 250L
    const val EMPTY_TTL_MILLIS = 2 * 60_000L
    const val IDLE_MILLIS = 30 * 60_000L
    private const val ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    fun create(now: Long, rules: DraftRules = DraftRules.STANDARD): DraftRoom? {
        if (rooms.size >= MAX_ROOMS) {
            logger.warn("Draft room ceiling reached ({}), refusing to create another", MAX_ROOMS)
            return null
        }
        repeat(20) {
            val code = (1..4).map { ALPHABET[Random.nextInt(ALPHABET.length)] }.joinToString("")
            val room = DraftRoom(code, now, rules = rules)
            if (rooms.putIfAbsent(code, room) == null) return room
        }
        return null
    }

    fun get(code: String): DraftRoom? = rooms[code.uppercase()]

    fun count(): Int = rooms.size

    fun state(room: DraftRoom, playerId: String): String =
        json.encodeToString(DraftState.serializer(), room.snapshot(playerId, System.currentTimeMillis()))

    internal fun reclaimable(room: DraftRoom, now: Long): Boolean {
        val empty = room.isEmpty && (room.emptySince ?: now) < now - EMPTY_TTL_MILLIS
        val abandoned = room.lastActivity < now - IDLE_MILLIS
        return empty || abandoned
    }

    fun start() {
        scope.launch {
            while (isActive) {
                delay(TICK_MILLIS)
                try {
                    sweep(System.currentTimeMillis())
                } catch (e: Exception) {
                    logger.error("Draft sweep failed", e)
                }
            }
        }
    }

    private suspend fun sweep(now: Long) {
        if (rooms.isEmpty()) return
        rooms.values.forEach { room ->
            room.playerIds().forEach { room.setConnected(it, DraftEvents.isOnline(room.code, it)) }
            room.tick(now)
            if (room.broadcastVersion != room.version) {
                room.broadcastVersion = room.version
                DraftEvents.publish(room.code) { playerId -> state(room, playerId) }
            }
        }
        rooms.values.filter { reclaimable(it, now) }.forEach { room ->
            rooms.remove(room.code, room)
            DraftEvents.closeRoom(room.code)
        }
        // A stream that resolved its room just before the drop subscribes after it.
        DraftEvents.closeOrphans { rooms.containsKey(it) }
    }
}
