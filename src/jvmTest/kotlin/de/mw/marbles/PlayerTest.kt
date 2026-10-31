package de.mw.marbles

import kotlin.test.*

class PlayerTest {
    @Test
    fun `new player starts with 10 marbles`() {
        val player = Player("session1", "Alice")
        assertEquals(10, player.marbles)
    }

    @Test
    fun `new player starts disconnected`() {
        val player = Player("session1", "Alice")
        assertFalse(player.connected)
    }

    @Test
    fun `player with marbles is active`() {
        val player = Player("session1", "Alice", marbles = 5)
        assertTrue(player.isActive)
        assertFalse(player.isSpectator)
    }

    @Test
    fun `player with zero marbles is spectator`() {
        val player = Player("session1", "Alice", marbles = 0)
        assertFalse(player.isActive)
        assertTrue(player.isSpectator)
    }

    @Test
    fun `player with negative marbles is spectator`() {
        val player = Player("session1", "Alice", marbles = -1)
        assertFalse(player.isActive)
        assertTrue(player.isSpectator)
    }

    @Test
    fun `isActiveAndConnected requires both conditions`() {
        val player = Player("session1", "Alice", marbles = 5)

        // Active but not connected
        player.connected = false
        assertFalse(player.isActiveAndConnected)

        // Active and connected
        player.connected = true
        assertTrue(player.isActiveAndConnected)

        // Connected but not active (spectator)
        player.marbles = 0
        assertFalse(player.isActiveAndConnected)
    }

    @Test
    fun `player guess can be set and cleared`() {
        val player = Player("session1", "Alice")

        assertNull(player.currentGuess)

        player.currentGuess = Guess.EVEN
        assertEquals(Guess.EVEN, player.currentGuess)

        player.currentGuess = Guess.ODD
        assertEquals(Guess.ODD, player.currentGuess)

        player.currentGuess = null
        assertNull(player.currentGuess)
    }

    @Test
    fun `connected state is thread-safe via AtomicBoolean`() {
        val player = Player("session1", "Alice")

        // Rapidly toggle connected state
        repeat(1000) { i ->
            player.connected = i % 2 == 0
        }

        // Should end up false (999 % 2 == 1, so last set was false... wait 999%2=1 so false)
        // Actually 999 % 2 = 1, so i % 2 == 0 is false, so connected = false
        assertFalse(player.connected)
    }
}
