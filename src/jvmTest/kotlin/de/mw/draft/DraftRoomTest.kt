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

    private fun seated(now: Long = 0, rules: DraftRules = DraftRules.STANDARD): DraftRoom {
        val room = DraftRoom("TEST", now, Random(1), rules)
        assertEquals(0, room.join("a", "Ada", now))
        assertEquals(1, room.join("b", "Bo", now))
        return room
    }

    /** Both seats make every pick of [round]. */
    private fun draftRound(room: DraftRoom, round: Int, now: Long) {
        repeat(room.rules.picksIn(round)) { pick ->
            assertNull(room.pick("a", round, pick, pick % DraftRoom.OFFER, now))
            assertNull(room.pick("b", round, pick, (pick + 1) % DraftRoom.OFFER, now))
        }
    }

    @Test
    fun `both seats pick at once and the rival's picks stay hidden until both are done`() {
        val room = seated()
        assertNull(room.pick("b", 0, 0, 2, 1))
        assertNull(room.pick("a", 0, 0, 1, 1))
        assertNull(room.pick("a", 0, 1, 0, 2))
        assertEquals("that pick is over", room.pick("a", 0, 1, 0, 3))
        // Each sees their own picks and only how many the other made.
        assertEquals(listOf(listOf(1, 0), listOf(-1)), room.snapshot("a", 3).picks[0])
        assertEquals(listOf(listOf(-1, -1), listOf(2)), room.snapshot("b", 3).picks[0])
        assertEquals(listOf(listOf(-1, -1), listOf(-1)), room.snapshot("z", 3).picks[0])
        assertNull(room.pick("a", 0, 2, 2, 4))
        assertEquals("that pick is over", room.pick("a", 0, 3, 0, 4))
        assertNull(room.pick("b", 0, 1, 1, 5))
        assertNull(room.pick("b", 0, 2, 0, 5))
        // The round is sealed: everything is shown.
        assertEquals(listOf(listOf(1, 0, 2), listOf(2, 1, 0)), room.snapshot("a", 5).picks[0])
        assertEquals(listOf(listOf(1, 0, 2), listOf(2, 1, 0)), room.snapshot("z", 5).picks[0])
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
        assertNotNull(room.snapshot("b", 2).turnLeftMs)
    }

    @Test
    fun `the next round starts when both are ready and asks for fewer picks`() {
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
        draftRound(room, 1, 4)
        assertEquals(DraftRules.PICKS, room.snapshot("a", 4).picks[1][0].size)
        assertNull(room.snapshot("a", 4).turnLeftMs)
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
        assertEquals(listOf(listOf(emptyList<Int>(), emptyList())), after.picks)
        assertEquals("that match is not over", room.rematch("a", 0, 4))
    }

    @Test
    fun `a pick left too long is made for its player alone`() {
        val room = seated(0)
        assertNull(room.pick("a", 0, 0, 2, 5))
        room.tick(DraftRoom.TURN_MILLIS - 1)
        assertTrue(room.snapshot("b", 0).picks[0][1].isEmpty())
        room.tick(DraftRoom.TURN_MILLIS)
        assertEquals(listOf(0), room.snapshot("b", 0).picks[0][1])
        // Seat 0's clock started at its own pick, so it has not run out yet.
        assertEquals(listOf(2), room.snapshot("a", 0).picks[0][0])
        // The clock restarts for the next pick.
        room.tick(DraftRoom.TURN_MILLIS + 1)
        assertEquals(1, room.snapshot("b", 0).picks[0][1].size)
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
        val state = room.snapshot("b", 20)
        assertEquals(true, state.seats[1]?.left)
        // Nobody else can take it, and the clock keeps running for the absent player.
        assertNull(room.join("c", "Cy", 21))
        assertEquals(DraftRoom.TURN_MILLIS - 20, state.turnLeftMs)
        // Coming back is the same seat, and does not restart the clock.
        assertEquals(1, room.join("b", "Bo", 30))
        assertEquals(DraftRoom.TURN_MILLIS - 30, room.snapshot("b", 30).turnLeftMs)
        assertEquals(false, room.snapshot("a", 30).seats[1]?.left)
        // Both gone: the room counts as empty and can be handed back.
        room.leave("a", 40)
        room.leave("b", 41)
        assertTrue(room.isEmpty)
        assertEquals(41L, room.emptySince)
    }

    @Test
    fun `a player left alone can play the match out`() {
        val room = seated(0)
        draftRound(room, 0, 1)
        room.leave("b", 2)
        // The one still here moves on; the absent seat counts as ready.
        assertNull(room.next("a", 0, 3))
        assertEquals(2, room.snapshot("a", 3).picks.size)
        // Ready first, then the rival leaves: the round starts too.
        repeat(DraftRules.STANDARD.picksIn(1)) { assertNull(room.pick("a", 1, it, 0, 4)) }
        // The clock drafts for the absent seat, which then comes back.
        room.tick(4 + DraftRoom.TURN_MILLIS)
        room.tick(4 + 2 * DraftRoom.TURN_MILLIS)
        assertEquals(1, room.join("b", "Bo", 5))
        assertNull(room.next("a", 1, 6))
        assertEquals(2, room.snapshot("a", 6).picks.size)
        room.leave("b", 7)
        assertEquals(3, room.snapshot("a", 7).picks.size)
    }

    @Test
    fun `bad picks and a round past the last are refused`() {
        val room = seated()
        assertEquals("pick one of the cards on offer", room.pick("a", 0, 0, DraftRoom.OFFER, 1))
        assertEquals("pick one of the cards on offer", room.pick("a", 0, 0, -1, 1))
        assertEquals("you are not in this room", room.pick("z", 0, 0, 0, 1))
        for (round in 0 until DraftRules.STANDARD.maxRounds) {
            draftRound(room, round, 2)
            if (round < DraftRules.STANDARD.maxRounds - 1) {
                assertNull(room.next("a", round, 3))
                assertNull(room.next("b", round, 3))
            }
        }
        assertEquals("the match is over", room.next("a", DraftRules.STANDARD.maxRounds - 1, 4))
    }

    @Test
    fun `a custom room counts its own picks and rounds`() {
        val rules = DraftRules.custom(hearts = 2, picks = 4)
        assertEquals(DraftRules(2, 4, 4), rules)
        val room = seated(rules = rules)
        assertEquals(rules, room.snapshot("a", 0).rules)
        for (round in 0 until rules.maxRounds) {
            draftRound(room, round, 1)
            assertEquals(4, room.snapshot("a", 1).picks[round][0].size)
            assertEquals("that pick is over", room.pick("a", round, 4, 0, 1))
            if (round < rules.maxRounds - 1) {
                assertNull(room.next("a", round, 2))
                assertNull(room.next("b", round, 2))
            }
        }
        assertEquals(10, rules.maxRounds)
        assertEquals("the match is over", room.next("a", rules.maxRounds - 1, 3))
        // A rematch keeps the room's rules.
        assertNull(room.rematch("a", 0, 4))
        assertNull(room.rematch("b", 0, 4))
        assertEquals(rules, room.snapshot("a", 4).rules)
    }

    @Test
    fun `custom rules stay in bounds`() {
        assertEquals(DraftRules(1, 1, 1), DraftRules.custom(0, -3))
        assertEquals(false, DraftRules.custom(5, 2, balance = false).balance)
        assertEquals(true, DraftRules.STANDARD.balance)
        assertEquals(DraftRules(DraftRules.MAX_HEARTS, DraftRules.MAX_PICKS, DraftRules.MAX_PICKS), DraftRules.custom(Int.MAX_VALUE, 99))
        assertEquals(DraftRules.ROUND_LIMIT, DraftRules.custom(Int.MAX_VALUE, 1).maxRounds)
        assertEquals(20 * DraftRules.ROUNDS_PER_HEART, DraftRules.custom(20, 1).maxRounds)
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
