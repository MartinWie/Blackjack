package de.mw.marbles

import de.mw.blackjack.module
import io.ktor.server.application.call
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.application
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

private const val PROP_ALLOWED_ORIGINS = "realtime.allowed.origins"
private const val PROP_ALLOW_NULL_ORIGIN = "realtime.allow.null.origin"

class RouteSharedTest {
    private inline fun withRealtimeConfig(
        allowedOrigins: String? = null,
        allowNullOrigin: String? = null,
        block: () -> Unit,
    ) {
        val previousAllowed = System.getProperty(PROP_ALLOWED_ORIGINS)
        val previousAllowNull = System.getProperty(PROP_ALLOW_NULL_ORIGIN)
        try {
            if (allowedOrigins != null) {
                System.setProperty(PROP_ALLOWED_ORIGINS, allowedOrigins)
            } else {
                System.clearProperty(PROP_ALLOWED_ORIGINS)
            }
            if (allowNullOrigin != null) {
                System.setProperty(PROP_ALLOW_NULL_ORIGIN, allowNullOrigin)
            } else {
                System.clearProperty(PROP_ALLOW_NULL_ORIGIN)
            }
            block()
        } finally {
            if (previousAllowed != null) {
                System.setProperty(PROP_ALLOWED_ORIGINS, previousAllowed)
            } else {
                System.clearProperty(PROP_ALLOWED_ORIGINS)
            }
            if (previousAllowNull != null) {
                System.setProperty(PROP_ALLOW_NULL_ORIGIN, previousAllowNull)
            } else {
                System.clearProperty(PROP_ALLOW_NULL_ORIGIN)
            }
        }
    }

    private fun ApplicationTestBuilder.installOriginProbe() {
        application {
            module()
            routing {
                get("/_test/origin") {
                    call.respondText(if (isAllowedWebSocketOrigin(call)) "ok" else "blocked")
                }
            }
        }
    }

    @Test
    fun `websocket origin check allows matching host header with forwarded origin`() {
        withRealtimeConfig(allowedOrigins = null, allowNullOrigin = null) {
            testApplication {
                installOriginProbe()

                val response =
                    client.get("/_test/origin") {
                        header(HttpHeaders.Origin, "https://games.7mw.de")
                        header(HttpHeaders.Host, "games.7mw.de")
                    }

                assertEquals(HttpStatusCode.OK, response.status)
                assertEquals("ok", response.bodyAsText())
            }
        }
    }

    @Test
    fun `websocket origin check rejects null origin by default`() {
        withRealtimeConfig(allowedOrigins = null, allowNullOrigin = null) {
            testApplication {
                installOriginProbe()

                val response =
                    client.get("/_test/origin") {
                        header(HttpHeaders.Origin, "null")
                        header(HttpHeaders.Host, "localhost")
                    }

                assertEquals(HttpStatusCode.OK, response.status)
                assertEquals("blocked", response.bodyAsText())
            }
        }
    }

    @Test
    fun `websocket origin check rejects mismatched host when allowlist not set`() {
        withRealtimeConfig(allowedOrigins = null, allowNullOrigin = null) {
            testApplication {
                installOriginProbe()

                val response =
                    client.get("/_test/origin") {
                        header(HttpHeaders.Origin, "https://evil.example")
                        header(HttpHeaders.Host, "games.7mw.de")
                    }

                assertEquals(HttpStatusCode.OK, response.status)
                assertEquals("blocked", response.bodyAsText())
            }
        }
    }

    @Test
    fun `websocket origin check with allowlist allows only configured origins`() {
        withRealtimeConfig(allowedOrigins = "https://games.7mw.de", allowNullOrigin = "false") {
            testApplication {
                installOriginProbe()

                val allowed =
                    client.get("/_test/origin") {
                        header(HttpHeaders.Origin, "https://games.7mw.de")
                        header(HttpHeaders.Host, "localhost")
                    }

                val blockedSameHostFallback =
                    client.get("/_test/origin") {
                        header(HttpHeaders.Origin, "https://localhost")
                        header(HttpHeaders.Host, "localhost")
                    }

                assertEquals("ok", allowed.bodyAsText())
                assertEquals("blocked", blockedSameHostFallback.bodyAsText())
            }
        }
    }

    @Test
    fun `websocket origin check allows null origin only when explicitly enabled`() {
        withRealtimeConfig(allowedOrigins = "https://games.7mw.de", allowNullOrigin = "true") {
            testApplication {
                installOriginProbe()

                val response =
                    client.get("/_test/origin") {
                        header(HttpHeaders.Origin, "null")
                        header(HttpHeaders.Host, "games.7mw.de")
                    }

                assertEquals(HttpStatusCode.OK, response.status)
                assertEquals("ok", response.bodyAsText())
            }
        }
    }
}
