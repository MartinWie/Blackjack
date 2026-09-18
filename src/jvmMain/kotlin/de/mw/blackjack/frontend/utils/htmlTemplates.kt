package de.mw.blackjack.frontend.utils

import de.mw.blackjack.BuildInfo.asset
import de.mw.blackjack.models.Rules
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

fun buildHTMLString(builderAction: TagConsumer<StringBuilder>.() -> Unit): String =
    buildString { appendHTML().builderAction() }

/**
 * The shell every screen shares. Scripts are all local — anime.js included — because
 * the table has to deal a hand with no network (see README, "Offline").
 */
fun page(
    pageTitle: String,
    bodyClasses: String = "min-h-[100dvh] bg-felt text-chalk",
    scripts: List<String> = emptyList(),
    content: BODY.() -> Unit,
): String = buildString {
    append("<!DOCTYPE html>")
    appendHTML().html {
        attributes["lang"] = "en"
        attributes["data-theme"] = "casino"
        head {
            meta(charset = "utf-8")
            meta(name = "viewport", content = "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no")
            meta(name = "theme-color", content = "#0B3B2E")
            meta(name = "apple-mobile-web-app-capable", content = "yes")
            meta(name = "apple-mobile-web-app-status-bar-style", content = "black-translucent")
            title(pageTitle)
            link(rel = "manifest", href = "/static/manifest.webmanifest")
            link(rel = "icon", href = asset("/static/img/favicon-32.png"), type = "image/png")
            link(rel = "apple-touch-icon", href = asset("/static/img/apple-touch-icon.png"))
            link(rel = "stylesheet", href = asset("/static/output.css"))
            // The table rules, once, from the one place that defines them — the
            // client must never carry its own copy of a bet size or a payout.
            script {
                unsafe {
                    +"""window.BJ={minBet:${Rules.MIN_BET},maxBet:${Rules.MAX_BET},chips:${Rules.CHIPS},startingCash:${Rules.STARTING_CASH},rebuy:${Rules.REBUY}};"""
                }
            }
            script(src = asset("/static/vendor/anime.umd.min.js")) {}
            scripts.forEach { script(src = asset(it)) { defer = true } }
        }
        body(classes = bodyClasses) {
            content()
            script(src = asset("/static/sw-register.js")) { defer = true }
        }
    }
}
