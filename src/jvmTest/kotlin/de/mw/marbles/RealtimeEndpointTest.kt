package de.mw.marbles

import de.mw.blackjack.module
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.parameters
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Integration tests for HTTP endpoints and HTMX redirect handling.
 */
class RealtimeEndpointTest {
    private fun io.ktor.client.statement.HttpResponse.firstSetCookieValue(name: String): String? =
        headers
            .getAll(HttpHeaders.SetCookie)
            ?.asSequence()
            ?.map { it.substringBefore(';').split('=', limit = 2) }
            ?.firstOrNull { it.size == 2 && it[0] == name }
            ?.get(1)

    @Test
    fun `game create with HTMX request returns HX-Redirect header`() =
        testApplication {
            application { module() }

            val client =
                createClient {
                    install(HttpCookies)
                    followRedirects = false
                }

            client.get("/marbles")

            val response =
                client.submitForm(
                    url = "/marbles/game/create",
                    formParameters = parameters { append("playerName", "TestPlayer") },
                ) {
                    header("HX-Request", "true")
                }

            assertEquals(HttpStatusCode.OK, response.status)
            assertNotNull(response.headers["HX-Redirect"])
            assertTrue(response.headers["HX-Redirect"]!!.startsWith("/marbles/game/"))
        }

    @Test
    fun `marbles websocket endpoint emits ping and update frames`() =
        testApplication {
            application { module() }

            val ownerClient =
                createClient {
                    install(HttpCookies)
                    install(WebSockets)
                    followRedirects = false
                }
            ownerClient.get("/marbles")
            val createResponse =
                ownerClient.submitForm(
                    url = "/marbles/game/create",
                    formParameters = parameters { append("playerName", "WsOwner") },
                )
            val gameId = createResponse.headers["Location"]!!.substringAfterLast("/marbles/game/")

            ownerClient.webSocket("/marbles/ws/game/$gameId") {
                var sawPing = false
                var sawUpdate = false

                withTimeout(15_000) {
                    while (!sawPing || !sawUpdate) {
                        val frame = incoming.receive() as? Frame.Text ?: continue
                        val text = frame.readText()
                        if (text == "__PING__") {
                            sawPing = true
                        }
                        if (text.startsWith("__GAME_UPDATE__:")) {
                            sawUpdate = true
                        }
                    }
                }

                assertTrue(sawUpdate)
                assertTrue(sawPing)
            }

            GameManager.removeGame(gameId)
        }

    @Test
    fun `marbles websocket reconnect triggers update to other player only`() =
        testApplication {
            application { module() }

            val hostClient =
                createClient {
                    install(HttpCookies)
                    install(WebSockets)
                    followRedirects = false
                }
            hostClient.get("/marbles")
            val createResponse =
                hostClient.submitForm(
                    url = "/marbles/game/create",
                    formParameters = parameters { append("playerName", "Host") },
                )
            val gameId = createResponse.headers["Location"]!!.substringAfterLast("/marbles/game/")

            val joinClient =
                createClient {
                    install(HttpCookies)
                    install(WebSockets)
                    followRedirects = false
                }
            val joinRoot = joinClient.get("/marbles")
            val joinSession = joinRoot.firstSetCookieValue("user_session") ?: error("No join session cookie")
            joinClient.submitForm(
                url = "/marbles/game/join",
                formParameters =
                    parameters {
                        append("playerName", "Guest")
                        append("gameId", gameId)
                    },
            )

            val reconnectClient =
                createClient {
                    install(WebSockets)
                    followRedirects = false
                }

            hostClient.webSocket("/marbles/ws/game/$gameId") {
                var hostSawReconnect = false

                withTimeout(5_000) {
                    while (true) {
                        val frame = incoming.receive() as? Frame.Text ?: continue
                        val text = frame.readText()
                        if (text.startsWith("__GAME_UPDATE__:")) {
                            break
                        }
                    }
                }

                reconnectClient.webSocket(
                    urlString = "/marbles/ws/game/$gameId",
                    request = {
                        header(HttpHeaders.Cookie, "user_session=$joinSession")
                    },
                ) {
                    withTimeout(5_000) {
                        while (true) {
                            val frame = incoming.receive() as? Frame.Text ?: continue
                            if (frame.readText().startsWith("__GAME_UPDATE__:")) break
                        }
                    }
                }

                withTimeout(8_000) {
                    while (!hostSawReconnect) {
                        val frame = incoming.receive() as? Frame.Text ?: continue
                        val text = frame.readText()
                        if (text.startsWith("__GAME_UPDATE__:") && text.contains("Guest")) {
                            hostSawReconnect = true
                        }
                    }
                }

                assertTrue(hostSawReconnect)
            }

            GameManager.removeGame(gameId)
        }

    @Test
    fun `legacy endpoint is not available`() =
        testApplication {
            application { module() }

            val client =
                createClient {
                    install(HttpCookies)
                    followRedirects = false
                }

            val response = client.get("/marbles/legacy/00000000")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

    @Test
    fun `legacy realtime endpoint is not available`() =
        testApplication {
            application { module() }

            val client = createClient { followRedirects = false }

            val response = client.get("/marbles/game/00000000/events")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

    @Test
    fun `game page includes shared realtime scripts`() =
        testApplication {
            application { module() }

            val client =
                createClient {
                    install(HttpCookies)
                    followRedirects = false
                }

            client.get("/marbles")

            val create =
                client.submitForm(
                    url = "/marbles/game/create",
                    formParameters = parameters { append("playerName", "ScriptHost") },
                )
            val gameUrl = create.headers["Location"]!!
            val body = client.get(gameUrl).bodyAsText()

            assertTrue(body.contains("/static/marbles/realtime.js"))
            assertTrue(body.contains("/static/marbles/ui-shared.js"))
            assertTrue(body.contains("/static/marbles/game.js"))

            GameManager.removeGame(gameUrl.substringAfterLast("/marbles/game/"))
        }

    @Test
    fun `game create without HTMX header returns regular redirect`() =
        testApplication {
            application { module() }

            val client =
                createClient {
                    install(HttpCookies)
                    followRedirects = false
                }

            client.get("/marbles")

            val response =
                client.submitForm(
                    url = "/marbles/game/create",
                    formParameters = parameters { append("playerName", "TestPlayer") },
                )

            assertEquals(HttpStatusCode.Found, response.status)
            assertNotNull(response.headers["Location"])
            assertTrue(response.headers["Location"]!!.startsWith("/marbles/game/"))
            assertNull(response.headers["HX-Redirect"])
        }

    @Test
    fun `game join with HTMX request returns HX-Redirect header`() =
        testApplication {
            application { module() }

            val game = GameManager.createGame("creator-session")

            try {
                val client =
                    createClient {
                        install(HttpCookies)
                        followRedirects = false
                    }

                client.get("/marbles")

                val response =
                    client.submitForm(
                        url = "/marbles/game/join",
                        formParameters =
                            parameters {
                                append("playerName", "JoiningPlayer")
                                append("gameId", game.id)
                            },
                    ) {
                        header("HX-Request", "true")
                    }

                assertEquals(HttpStatusCode.OK, response.status)
                assertNotNull(response.headers["HX-Redirect"])
                assertEquals("/marbles/game/${game.id}", response.headers["HX-Redirect"])
            } finally {
                GameManager.removeGame(game.id)
            }
        }
}
