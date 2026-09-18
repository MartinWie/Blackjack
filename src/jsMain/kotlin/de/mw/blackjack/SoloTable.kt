@file:OptIn(ExperimentalJsExport::class, kotlinx.coroutines.DelicateCoroutinesApi::class)

package de.mw.blackjack

import de.mw.blackjack.game.Action
import de.mw.blackjack.game.Room
import de.mw.blackjack.models.Names
import de.mw.blackjack.models.TableState
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.promise
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlin.js.Promise

/**
 * A table that runs in the browser.
 *
 * This is the *same* [Room] the server runs — the rules are compiled to JavaScript
 * rather than reimplemented in it, which is the only reason offline play is allowed
 * to exist at all. A second set of rules in JS would be a second set to keep right.
 *
 * Every call answers the envelope the HTTP API answers: the whole table state, or an
 * error, so `table.js` renders one shape whichever transport it is on.
 */
@JsExport
class SoloTable(name: String) {

    private val json = Json { encodeDefaults = true }
    private val room = Room(CODE)
    private val playerId = "local"
    private val displayName = Names.clean(name)

    fun join(): Promise<String> = envelope { room.join(playerId, displayName); null }

    fun bet(amount: Int): Promise<String> = envelope { room.placeBet(playerId, amount) }

    fun clearBet(): Promise<String> = envelope { room.clearBet(playerId) }

    fun deal(): Promise<String> = envelope { room.lockBet(playerId) }

    fun act(action: String): Promise<String> = envelope {
        val parsed = runCatching { Action.valueOf(action.uppercase()) }.getOrNull()
        if (parsed == null) "unknown action" else room.act(playerId, parsed)
    }

    /**
     * Driven by the page on an interval, exactly as the server's sweep drives a room.
     * Answers the version rather than a state: this runs four times a second, and
     * serialising a table nobody has touched is pure waste.
     */
    fun tick(now: Double): Promise<Double> = GlobalScope.promise {
        room.tick(now.toLong())
        room.version.toDouble()
    }

    fun state(): Promise<String> = envelope { null }

    /** The version the page polls to decide whether a re-render is worth it. */
    fun version(): Double = room.version.toDouble()

    private fun envelope(block: suspend () -> String?): Promise<String> = GlobalScope.promise {
        val error = block()
        if (error != null) """{"ok":false,"body":{"error":${json.encodeToString(String.serializer(), error)}}}"""
        else """{"ok":true,"body":${json.encodeToString(TableState.serializer(), room.snapshot(playerId))}}"""
    }

    companion object {
        /** Solo tables are never shared, so the code is decoration — but the state
         *  shape carries one, and the header shows it. */
        const val CODE = "SOLO"
    }
}
