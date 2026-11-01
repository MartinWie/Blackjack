package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import de.mw.blackjack.frontend.utils.Apps
import de.mw.blackjack.frontend.utils.installable
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

private const val ICON_LEVELS =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/></svg>"""
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
            link(rel = "icon", href = asset("/static/img/games/sweets-192.png"), type = "image/png")
            installable(Apps.sweets)
            link(rel = "stylesheet", href = asset("/static/sweets/sweets.css"))
            script(src = asset("/static/sweets/sweets-engine.js")) { defer = true }
            script(src = asset("/static/gift.js")) { defer = true }
            script(src = asset("/static/sweets/sweets.js")) { defer = true }
        }
        body {
            section(classes = "screen") {
                id = "play"
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
                div(classes = "toolbar") {
                    toolButton("levels-btn", "Levels", ICON_LEVELS)
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
