package de.mw.blackjack.frontend.utils

import de.mw.blackjack.BuildInfo.asset
import kotlinx.html.HEAD
import kotlinx.html.link
import kotlinx.html.meta
import kotlinx.html.script
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Everything that can sit on a home screen: the launcher and each game. A game installs
 * from its own subdomain, because a browser installs one app per origin; under the
 * launcher's host its manifest still works, starting at the game's path instead.
 */
class App(
    val key: String,
    val name: String,
    val shortName: String,
    val subdomain: String,
    /** Where the app lives under any host, e.g. games.7mw.de/meow or localhost:8090/meow. */
    val path: String,
    val theme: String,
    val background: String,
    /** Icon file prefix in /static/img/games: `<icon>-180.png`, `-192`, `-512`. */
    val icon: String,
    val offline: Boolean,
) {
    fun startUrl(host: String): String = if (host.startsWith("$subdomain.")) "/" else path

    fun manifest(host: String): String {
        val start = startUrl(host)
        fun image(size: Int, purpose: String) = buildJsonObject {
            put("src", "/static/img/games/$icon-$size.png")
            put("sizes", "${size}x$size")
            put("type", "image/png")
            put("purpose", purpose)
        }
        return buildJsonObject {
            put("id", start)
            put("name", name)
            put("short_name", shortName)
            put("start_url", start)
            put("scope", "/")
            put("display", "standalone")
            put("orientation", "portrait")
            put("background_color", background)
            put("theme_color", theme)
            put("icons", buildJsonArray { add(image(192, "any")); add(image(512, "any")); add(image(512, "maskable")) })
        }.toString()
    }
}

object Apps {
    val hub = App("games", "Games", "Games", "games", "/games", "#0B3B2E", "#072A20", "hub", offline = true)
    val blackjack = App("blackjack", "Blackjack", "Blackjack", "blackjack", "/blackjack", "#0B3B2E", "#072A20", "blackjack", offline = true)
    val meow = App("meow", "Hide & Meow", "Meow", "meow", "/meow", "#F7F1EA", "#F7F1EA", "meow", offline = true)
    val sweets = App("sweets", "Sweet Swap", "Sweets", "sweets", "/sweets", "#FFE3F1", "#FFE3F1", "sweets", offline = true)
    val picnic = App("picnic", "Ant Picnic", "Picnic", "picnic", "/picnic", "#F4EFE3", "#B98257", "picnic", offline = true)
    val draft = App("draft", "Draft Battle", "Draft", "draft", "/draft", "#F4E9D4", "#F4E9D4", "draft", offline = true)
    val cells = App("cells", "Cell Survivor", "Cells", "cells", "/cells", "#DFF3EE", "#DFF3EE", "cells", offline = true)
    val marbles = App("marbles", "Marbles", "Marbles", "marbles", "/marbles", "#4A90D9", "#1E3A5F", "marbles", offline = false)

    private val all = listOf(hub, blackjack, meow, sweets, picnic, draft, cells, marbles)

    fun byKey(key: String): App? = all.firstOrNull { it.key == key }
}

/**
 * The home-screen half of a page head: manifest, icon, title, and the install offer.
 * `ask` marks the one page that may offer installing on its own (the launcher).
 */
fun HEAD.installable(app: App, ask: Boolean = false) {
    link(rel = "manifest", href = "/manifest/${app.key}.webmanifest")
    link(rel = "apple-touch-icon", href = asset("/static/img/games/${app.icon}-180.png"))
    meta(name = "apple-mobile-web-app-title", content = app.shortName)
    script(src = asset("/static/install.js")) {
        defer = true
        attributes["data-name"] = app.name
        attributes["data-icon"] = asset("/static/img/games/${app.icon}-192.png")
        if (app.offline) attributes["data-offline"] = "true"
        if (ask) attributes["data-ask"] = "true"
    }
}
