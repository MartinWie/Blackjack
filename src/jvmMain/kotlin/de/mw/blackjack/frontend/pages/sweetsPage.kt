package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

private const val ICON_LEVELS =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>"""
private const val ICON_RESTART =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>"""
private const val ICON_HELP =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 1 1 4.3 2.7c-1 .5-1.5 1.2-1.5 2.3v.5"/><circle cx="12" cy="18.5" r=".6"/></svg>"""

private fun DIV.toolButton(id: String, label: String, icon: String) {
    button(classes = "tool") {
        this.id = id
        attributes["aria-label"] = label
        attributes["data-label"] = label
        unsafe { +icon }
    }
}

/** Sweet Swap: an offline match-3. Static, so the service worker serves it with no network. */
fun sweetsPage(): String = buildString {
    append("<!DOCTYPE html>")
    appendHTML().html {
        attributes["lang"] = "en"
        head {
            meta(charset = "utf-8")
            meta(name = "viewport", content = "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no")
            meta(name = "theme-color", content = "#FFE3F1")
            meta(name = "apple-mobile-web-app-capable", content = "yes")
            title("Sweet Swap")
            link(rel = "manifest", href = "/static/manifest.webmanifest")
            link(rel = "icon", href = asset("/static/img/games/sweets-192.png"), type = "image/png")
            link(rel = "apple-touch-icon", href = asset("/static/img/games/hub-180.png"))
            link(rel = "stylesheet", href = asset("/static/sweets/sweets.css"))
            script(src = asset("/static/sweets/sweets-engine.js")) { defer = true }
            script(src = asset("/static/gift.js")) { defer = true }
            script(src = asset("/static/sweets/sweets.js")) { defer = true }
        }
        body {
            section(classes = "screen") {
                id = "map"
                div(classes = "map-top") {
                    h1(classes = "logo") { +"Sweet"; span { +"Swap" } }
                }
                p(classes = "intro") { +"Swap neighbours to match three or more. Every level here has been beaten by our candy bot." }
                div(classes = "levels") { id = "levels" }
            }
            section(classes = "screen") {
                id = "play"
                hidden = true
                div(classes = "hud") {
                    div(classes = "lvl") {
                        small { id = "type-label" }
                        strong { id = "lvl-num" }
                    }
                    div(classes = "counter") {
                        id = "counter-box"
                        span { id = "counter-label"; +"Moves" }
                        b { id = "counter" }
                    }
                }
                div(classes = "scorebar") {
                    i { id = "score-fill" }
                    repeat(3) { span(classes = "star") { +"★" } }
                    b { id = "score"; +"0" }
                }
                div(classes = "goals") { id = "goals" }
                div(classes = "boardwrap") {
                    id = "boardwrap"
                    div(classes = "board") { id = "board" }
                    div(classes = "fx") { id = "fx" }
                    div(classes = "banner") { id = "banner" }
                }
                div(classes = "sugar") {
                    span { +"Sugar rush" }
                    div(classes = "meter") { id = "sugar-meter"; i { id = "sugar-fill" } }
                }
                div(classes = "toolbar") {
                    toolButton("map-btn", "Map", ICON_LEVELS)
                    toolButton("restart-btn", "Restart", ICON_RESTART)
                    toolButton("help-btn", "Rules", ICON_HELP)
                }
                div(classes = "boosters") { id = "boosters" }
                p(classes = "tip") { id = "tip"; +"Swipe or tap two neighbours to swap them" }
            }
            div(classes = "overlay") {
                id = "overlay"
                hidden = true
                div(classes = "card") {
                    h2 { id = "ov-title" }
                    div(classes = "big-stars") { id = "ov-stars" }
                    p { id = "ov-text" }
                    div(classes = "goal-list") { id = "ov-goals" }
                    div(classes = "actions") { id = "ov-actions" }
                }
            }
            div(classes = "sheet") {
                id = "sheet"
                hidden = true
                div(classes = "sheet-card") {
                    button(classes = "sheet-close") { id = "sheet-close"; attributes["aria-label"] = "Close"; +"×" }
                    div { id = "sheet-body" }
                }
            }
            script(src = asset("/static/sw-register.js")) { defer = true }
        }
    }
}
