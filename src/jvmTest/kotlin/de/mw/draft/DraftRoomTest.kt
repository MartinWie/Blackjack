package de.mw.draft

import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DraftRoomTest {

    private fun seated(now: Long = 0): DraftRoom {
        val room = DraftRoom("TEST", now, Random(1))
        assertEquals(0, room.join("a", "Ada", now))
        assertEquals(1, room.join("b", "Bo", now))
        return room
    }

    /** Plays every turn of the current round, each by whoever's turn it is. */
    private fun draftRound(room: DraftRoom, round: Int, now: Long) {
        repeat(DraftRoom.TURNS) { turn ->
            val who = if (DraftRoom.picker(round, turn) == 0) "a" else "b"
            assertNull(room.pick(who, round, turn, turn % 2, now))
        }
    }

    @Test
    fun `turns alternate and the round decides who starts`() {
        val room = seated()
        assertEquals("it is not your turn", room.pick("b", 0, 0, 0, 1))
        assertNull(room.pick("a", 0, 0, 1, 1))
        assertEquals("it is not your turn", room.pick("a", 0, 1, 0, 2))
        assertNull(room.pick("b", 0, 1, 0, 2))
        assertEquals("that pick is over", room.pick("a", 0, 1, 0, 3))
        assertEquals(listOf(1, 0), room.snapshot("a", 3).picks[0])
        // Round 1 is started by seat 1.
        assertEquals(1, DraftRoom.picker(1, 0))
    }

    @Test
    fun `nothing is picked before both seats are filled`() {
        val room = DraftRoom("TEST", 0, Random(1))
        room.join("a", "Ada", 0)
        assertEquals("waiting for an opponent", room.pick("a", 0, 0, 0, 1))
        assertNull(room.snapshot("a", 1).turnLeftMs)
        assertEquals(1, room.join("b", "Bo", 1))
        // A third player is turned away.
        assertNull(room.join("c", "Cy", 2))
        assertNotNull(room.snapshot("a", 2).turnLeftMs)
    }

    @Test
    fun `the next round starts when both are ready`() {
        val room = seated()
        assertEquals("that round is not over", room.next("a", 0, 1))
        draftRound(room, 0, 1)
        assertNull(room.next("a", 0, 2))
        assertEquals(1, room.snapshot("a", 2).picks.size)
        assertEquals(listOf(true, false), room.snapshot("a", 2).ready)
        assertNull(room.next("b", 0, 3))
        val state = room.snapshot("a", 3)
        assertEquals(2, state.picks.size)
        assertEquals(listOf(false, false), state.ready)
        assertEquals(DraftRoom.TURN_MILLIS, state.turnLeftMs)
    }

    @Test
    fun `a rematch deals a new seed once both ask`() {
        val room = seated()
        draftRound(room, 0, 1)
        val before = room.snapshot("a", 1)
        assertNull(room.rematch("a", 0, 2))
        assertEquals(before.seed, room.snapshot("a", 2).seed)
        assertNull(room.rematch("b", 0, 3))
        val after = room.snapshot("a", 3)
        assertEquals(1, after.match)
        assertNotEquals(before.seed, after.seed)
        assertEquals(listOf(emptyList<Int>()), after.picks)
        assertEquals("that match is not over", room.rematch("a", 0, 4))
    }

    @Test
    fun `a pick left too long is made for its player`() {
        val room = seated(0)
        room.tick(DraftRoom.TURN_MILLIS - 1)
        assertTrue(room.snapshot("a", 0).picks[0].isEmpty())
        room.tick(DraftRoom.TURN_MILLIS)
        assertEquals(listOf(0), room.snapshot("a", 0).picks[0])
        // The clock restarts for the next pick.
        room.tick(DraftRoom.TURN_MILLIS + 1)
        assertEquals(1, room.snapshot("a", 0).picks[0].size)
    }

    @Test
    fun `leaving before the first pick frees the seat`() {
        val room = seated()
        room.leave("b", 5)
        val state = room.snapshot("a", 5)
        assertNull(state.seats[1])
        assertNull(state.turnLeftMs)
        assertFalse(room.isEmpty)
        assertEquals(1, room.join("c", "Cy", 6))
        room.leave("a", 7)
        room.leave("c", 8)
        assertTrue(room.isEmpty)
        assertEquals(8L, room.emptySince)
    }

    @Test
    fun `leaving mid-match keeps the seat and the clock`() {
        val room = seated(0)
        assertNull(room.pick("a", 0, 0, 1, 10))
        room.leave("b", 20)
        val state = room.snapshot("a", 20)
        assertEquals(true, state.seats[1]?.left)
        // Nobody else can take it, and the clock keeps running for the absent player.
        assertNull(room.join("c", "Cy", 21))
        assertEquals(DraftRoom.TURN_MILLIS - 10, state.turnLeftMs)
        // Coming back is the same seat, and does not restart the clock.
        assertEquals(1, room.join("b", "Bo", 30))
        assertEquals(DraftRoom.TURN_MILLIS - 20, room.snapshot("a", 30).turnLeftMs)
        assertEquals(false, room.snapshot("a", 30).seats[1]?.left)
        // Both gone: the room counts as empty and can be handed back.
        room.leave("a", 40)
        room.leave("b", 41)
        assertTrue(room.isEmpty)
        assertEquals(41L, room.emptySince)
    }

    @Test
    fun `bad picks and a sixth round are refused`() {
        val room = seated()
        assertEquals("pick one of the two cards", room.pick("a", 0, 0, 2, 1))
        assertEquals("you are not in this room", room.pick("z", 0, 0, 0, 1))
        for (round in 0 until DraftRoom.MAX_ROUNDS) {
            draftRound(room, round, 2)
            if (round < DraftRoom.MAX_ROUNDS - 1) {
                assertNull(room.next("a", round, 3))
                assertNull(room.next("b", round, 3))
            }
        }
        assertEquals("the match is over", room.next("a", DraftRoom.MAX_ROUNDS - 1, 4))
    }

    @Test
    fun `rooms are handed back when empty or abandoned`() {
        val fresh = DraftRoom("A", 0, Random(1))
        assertFalse(DraftRooms.reclaimable(fresh, DraftRooms.EMPTY_TTL_MILLIS))
        assertTrue(DraftRooms.reclaimable(fresh, DraftRooms.EMPTY_TTL_MILLIS + 1))
        val busy = seated(0)
        assertFalse(DraftRooms.reclaimable(busy, DraftRooms.IDLE_MILLIS))
        assertTrue(DraftRooms.reclaimable(busy, DraftRooms.IDLE_MILLIS + 1))
    }
}
