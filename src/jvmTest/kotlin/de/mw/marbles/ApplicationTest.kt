package de.mw.marbles

import de.mw.blackjack.module
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ApplicationTest {
    @Test
    fun testRoot() =
        testApplication {
            application {
                module()
            }
            client.get("/marbles").apply {
                assertEquals(HttpStatusCode.OK, status)
            }
        }

    @Test
    fun `join page for invalid game redirects to home with error`() =
        testApplication {
            application {
                module()
            }
            client
                .config {
                    followRedirects = false
                }.get("/marbles/game/invalid123/join")
                .apply {
                    assertEquals(HttpStatusCode.Found, status)
                    assertTrue(headers["Location"]?.contains("error=game_not_found") == true)
                }
        }

    @Test
    fun `home page shows error message when error param present`() =
        testApplication {
            application {
                module()
            }
            client.get("/marbles/?error=game_not_found").apply {
                assertEquals(HttpStatusCode.OK, status)
                val body = bodyAsText()
                assertTrue(body.contains("Game not found"))
            }
        }

    @Test
    fun `home page without error param has no error message`() =
        testApplication {
            application {
                module()
            }
            client.get("/marbles").apply {
                assertEquals(HttpStatusCode.OK, status)
                val body = bodyAsText()
                assertTrue(!body.contains("error-message"))
            }
        }

    @Test
    fun `home page uses German when Accept-Language is de`() =
        testApplication {
            application {
                module()
            }
            client
                .get("/marbles") {
                    header("Accept-Language", "de")
                }.apply {
                    assertEquals(HttpStatusCode.OK, status)
                    val body = bodyAsText()
                    assertTrue(body.contains("Marbles") || body.contains("Spiel starten"))
                }
        }

    @Test
    fun `home page uses English when Accept-Language is en`() =
        testApplication {
            application {
                module()
            }
            client
                .get("/marbles") {
                    header("Accept-Language", "en")
                }.apply {
                    assertEquals(HttpStatusCode.OK, status)
                    val body = bodyAsText()
                    assertTrue(body.contains("Marbles") || body.contains("Start Game"))
                }
        }

    @Test
    fun `join page uses German translation`() =
        testApplication {
            application {
                module()
            }
            val game = GameManager.createGame("test-session")
            game.addPlayer("test-session", "Host", "de")
            try {
                client
                    .get("/marbles/game/${game.id}/join") {
                        header("Accept-Language", "de")
                    }.apply {
                        assertEquals(HttpStatusCode.OK, status)
                        val body = bodyAsText()
                        assertTrue(body.contains("beitreten") || body.contains("Spiel"))
                    }
            } finally {
                GameManager.removeGame(game.id)
            }
        }
}
