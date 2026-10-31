package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

private const val ICON_LEVELS =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/></svg>"""
private const val ICON_RESTART =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>"""
private const val ICON_HELP =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 1 1 4.3 2.7c-1 .5-1.5 1.2-1.5 2.3v.5"/><circle cx="12" cy="18.5" r=".6"/></svg>"""
private const val LOGO_ANT =
    """<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="#3B2A22" stroke-width="2" stroke-linecap="round" fill="none"><path d="M14 18 6 12M14 22 5 22M15 26 7 32M26 18l8-6M26 22h9M25 26l8 6M17 9l-3-6M23 9l3-6"/></g><ellipse cx="20" cy="12" rx="5" ry="4.5" fill="#E5484D" stroke="#3B2A22" stroke-width="1.5"/><ellipse cx="20" cy="21" rx="4.5" ry="4" fill="#E5484D" stroke="#3B2A22" stroke-width="1.5"/><ellipse cx="20" cy="31" rx="6.5" ry="6" fill="#E5484D" stroke="#3B2A22" stroke-width="1.5"/><circle cx="18" cy="11" r="1.1" fill="#3B2A22"/><circle cx="22" cy="11" r="1.1" fill="#3B2A22"/></svg>"""

private fun DIV.toolButton(id: String, label: String, icon: String) {
    button(classes = "tool") {
        this.id = id
        attributes["aria-label"] = label
        attributes["data-label"] = label
        unsafe { +icon }
    }
}

/** Ant Picnic: an offline pixel-eating puzzle. Static, so the service worker serves it with no network. */
fun picnicPage(): String = buildString {
    append("<!DOCTYPE html>")
    appendHTML().html {
        attributes["lang"] = "en"
        head {
            meta(charset = "utf-8")
            meta(name = "viewport", content = "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no")
            meta(name = "theme-color", content = "#F4EFE3")
            meta(name = "apple-mobile-web-app-capable", content = "yes")
            title("Ant Picnic")
            link(rel = "manifest", href = "/static/manifest.webmanifest")
            link(rel = "icon", href = asset("/static/img/games/picnic-192.png"), type = "image/png")
            link(rel = "apple-touch-icon", href = asset("/static/img/games/hub-180.png"))
            link(rel = "stylesheet", href = asset("/static/picnic/picnic.css"))
            script(src = asset("/static/picnic/picnic-pics.js")) { defer = true }
            script(src = asset("/static/picnic/picnic-engine.js")) { defer = true }
            script(src = asset("/static/gift.js")) { defer = true }
            script(src = asset("/static/picnic/picnic.js")) { defer = true }
        }
        body {
            div(classes = "wrap") {
                div(classes = "top") {
                    div(classes = "logo") {
                        unsafe { +LOGO_ANT }
                        h1 { +"Ant"; br(); span { +"Picnic" } }
                    }
                    div(classes = "level-label") {
                        strong { id = "level"; +"Level 1" }
                        span { id = "difficulty"; +"Easy" }
                    }
                }
                div(classes = "plate") {
                    id = "plate"
                    div(classes = "board") { id = "board" }
                    // Every ant carries its block back down here.
                    div(classes = "hole") { id = "hole" }
                }
                div(classes = "seats") { id = "seats"; attributes["aria-label"] = "Seats for waiting ants" }
                div(classes = "lanes") { id = "lanes" }
                p(classes = "message") { id = "message"; attributes["aria-live"] = "polite" }
                div(classes = "toolbar") {
                    toolButton("levels-btn", "Levels", ICON_LEVELS)
                    toolButton("restart-btn", "Restart", ICON_RESTART)
                    toolButton("help-btn", "Rules", ICON_HELP)
                }
                div(classes = "powerups") { id = "powerups" }
            }
            div(classes = "fly") { id = "fly" }
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
