package de.mw.marbles

import kotlinx.coroutines.test.runTest
import kotlin.test.*

class BroadcastTest {
    private fun createGameWithPlayers(vararg names: String): Game {
        val game = Game(creatorSessionId = "creator", random = kotlin.random.Random(1))
        names.forEachIndexed { index, name ->
            val sessionId = if (index == 0) "creator" else "player$index"
            game.addPlayer(sessionId, name).also { it.connected = true }
        }
        return game
    }

    @Test
    fun `broadcastToAllConnected sends to all connected players`() =
        runTest {
            val game = createGameWithPlayers("Alice", "Bob", "Charlie")

            var messagesSent = 0
            val renderFunc: (Game, String, String) -> String = { _, sessionId, _ ->
                messagesSent++
                "state for $sessionId"
            }

            game.broadcastToAllConnected(renderFunc)

            assertEquals(3, messagesSent)
        }

    @Test
    fun `broadcastToAllConnected skips disconnected players`() =
        runTest {
            val game = createGameWithPlayers("Alice", "Bob", "Charlie")
            game.players["player1"]!!.connected = false // Bob disconnected

            var messagesSent = 0
            val renderFunc: (Game, String, String) -> String = { _, _, _ ->
                messagesSent++
                "state"
            }

            game.broadcastToAllConnected(renderFunc)

            assertEquals(2, messagesSent) // Only Alice and Charlie
        }

    @Test
    fun `broadcastToAllConnected sends personalized state to each player`() =
        runTest {
            val game = createGameWithPlayers("Alice", "Bob")

            val receivedSessionIds = mutableListOf<String>()
            val renderFunc: (Game, String, String) -> String = { _, sessionId, _ ->
                receivedSessionIds.add(sessionId)
                "state for $sessionId"
            }

            game.broadcastToAllConnected(renderFunc)

            assertTrue(receivedSessionIds.contains("creator"))
            assertTrue(receivedSessionIds.contains("player1"))
        }

    @Test
    fun `player channel receives broadcast messages`() =
        runTest {
            val game = createGameWithPlayers("Alice", "Bob")
            game.broadcastToAllConnected { _, sessionId, _ -> "Hello $sessionId" }

            val alice = game.players["creator"]!!
            val bob = game.players["player1"]!!

            val firstSignal = alice.channel.tryReceive().getOrNull()
            val secondSignal = bob.channel.tryReceive().getOrNull()
            assertEquals(PlayerOutboundSignal.Flush, firstSignal)
            assertEquals(PlayerOutboundSignal.Flush, secondSignal)
            assertEquals("Hello creator", alice.pollPendingStateHtml())
            assertEquals("Hello player1", bob.pollPendingStateHtml())
        }

    @Test
    fun `multiple broadcasts are coalesced to latest state in queue`() =
        runTest {
            val game = createGameWithPlayers("Alice")

            game.broadcastToAllConnected { _, _, _ -> "Message 1" }
            game.broadcastToAllConnected { _, _, _ -> "Message 2" }
            game.broadcastToAllConnected { _, _, _ -> "Message 3" }

            val player = game.players["creator"]!!

            assertEquals(PlayerOutboundSignal.Flush, player.channel.tryReceive().getOrNull())
            assertEquals("Message 3", player.pollPendingStateHtml())
            assertNull(player.pollPendingStateHtml())
            assertNull(player.channel.tryReceive().getOrNull())
        }

    @Test
    fun `broadcast with no connected players does nothing`() =
        runTest {
            val game = createGameWithPlayers("Alice", "Bob")
            game.players.values.forEach { it.connected = false }

            var called = false
            game.broadcastToAllConnected { _, _, _ ->
                called = true
                "state"
            }

            assertFalse(called)
        }
}
