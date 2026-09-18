package de.mw.blackjack.realtime

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import java.util.concurrent.ConcurrentHashMap

/**
 * Per-room SSE fan-out, in process. Every event is a whole table state, so a client
 * that misses one is corrected by the next — which is why the channel may drop.
 */
object RoomEvents {

    class Subscriber(val code: String, val playerId: String) {
        val openedAt: Long = System.nanoTime()
        val channel = Channel<String>(capacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    }

    private val subscribers = ConcurrentHashMap<String, MutableSet<Subscriber>>()

    /** One client may hold a couple of tabs open; past this it is a loop, not a player. */
    private const val MAX_STREAMS_PER_ROOM = 24

    fun subscribe(code: String, playerId: String): Subscriber {
        val sub = Subscriber(code, playerId)
        val set = subscribers.computeIfAbsent(code) { ConcurrentHashMap.newKeySet() }
        set.add(sub)
        while (set.size > MAX_STREAMS_PER_ROOM) {
            val oldest = set.minByOrNull { it.openedAt } ?: break
            if (oldest === sub) break
            set.remove(oldest)
            oldest.channel.close()
        }
        return sub
    }

    fun unsubscribe(sub: Subscriber) {
        subscribers[sub.code]?.let { set ->
            set.remove(sub)
            if (set.isEmpty()) subscribers.remove(sub.code, set)
        }
        sub.channel.close()
    }

    fun playersOnline(code: String): Set<String> =
        subscribers[code]?.map { it.playerId }?.toSet() ?: emptySet()

    /** [render] runs once per subscriber — each player sees their own seat. */
    suspend fun publish(code: String, render: suspend (playerId: String) -> String) {
        val set = subscribers[code] ?: return
        set.forEach { sub -> sub.channel.trySend(render(sub.playerId)) }
    }

    /** Room went away: close every stream so the browsers fall back to the lobby. */
    fun closeRoom(code: String) {
        subscribers.remove(code)?.forEach { it.channel.close() }
    }
}
