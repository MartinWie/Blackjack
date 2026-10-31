package de.mw.marbles

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.plugins.origin
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

internal fun isAllowedWebSocketOrigin(call: ApplicationCall): Boolean {
    val origin = call.request.headers[HttpHeaders.Origin] ?: return true
    val normalizedOrigin = origin.removeSuffix("/").lowercase()
    val allowedOrigins = RealtimeConfig.allowedOrigins
    if (normalizedOrigin == "null") {
        return RealtimeConfig.allowNullOrigin
    }

    if (allowedOrigins.isNotEmpty()) {
        return allowedOrigins.contains(normalizedOrigin)
    }

    val hostHeader =
        call.request.headers[HttpHeaders.Host]
            ?.trim()
            ?.lowercase()
    if (!hostHeader.isNullOrBlank()) {
        val hostWithoutPort = hostHeader.substringBefore(':')
        val originHost =
            runCatching {
                Url(normalizedOrigin).host.lowercase()
            }.getOrNull()
        if (originHost != null && originHost == hostWithoutPort) {
            return true
        }
    }

    val req = call.request.origin
    val scheme = req.scheme.lowercase()
    val host = req.serverHost.lowercase()
    val port = req.serverPort
    val defaultPort = if (scheme == "https") 443 else 80
    val withPort = "$scheme://$host:$port"
    val withoutPort = "$scheme://$host"
    return if (port == defaultPort) {
        normalizedOrigin == withoutPort || normalizedOrigin == withPort
    } else {
        normalizedOrigin == withPort
    }
}

internal fun Route.registerSharedRoutes() {
    get("/qr") {
        val target =
            call.request.queryParameters["target"] ?: run {
                call.respondText("Missing target", status = HttpStatusCode.BadRequest)
                return@get
            }

        if (!target.startsWith("$MARBLES/game/")) {
            call.respondText("Invalid target", status = HttpStatusCode.BadRequest)
            return@get
        }
        if (!target.endsWith("/join")) {
            call.respondText("Invalid target", status = HttpStatusCode.BadRequest)
            return@get
        }

        val absoluteTarget = "${call.request.origin.scheme}://${call.request.host()}$target"
        val png = QRCodeService.create(absoluteTarget)
        call.respondBytes(png, contentType = ContentType.Image.PNG)
    }
}
