package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

private const val ICON_LEVELS =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/></svg>"""
private const val ICON_HINT =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17h6M10 20.5h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>"""
private const val ICON_UNDO =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>"""
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

/**
 * Hide & Meow: a cat-finding logic puzzle that never talks to the server. Its own
 * shell rather than `page()`, which carries the casino theme and the blackjack rules.
 */
fun meowPage(): String = buildString {
    append("<!DOCTYPE html>")
    appendHTML().html {
        attributes["lang"] = "en"
        head {
            meta(charset = "utf-8")
            meta(name = "viewport", content = "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no")
            meta(name = "theme-color", content = "#F7F1EA")
            meta(name = "apple-mobile-web-app-capable", content = "yes")
            title("Hide & Meow")
            link(rel = "manifest", href = "/static/manifest.webmanifest")
            link(rel = "icon", href = asset("/static/img/games/meow-192.png"), type = "image/png")
            link(rel = "apple-touch-icon", href = asset("/static/img/games/hub-180.png"))
            link(rel = "stylesheet", href = asset("/static/meow/meow.css"))
            script(src = asset("/static/meow/meow-engine.js")) { defer = true }
            script(src = asset("/static/meow/meow-cats.js")) { defer = true }
            script(src = asset("/static/gift.js")) { defer = true }
            script(src = asset("/static/meow/meow.js")) { defer = true }
        }
        body {
            div(classes = "wrap") {
                div(classes = "top") {
                    a(href = "/games", classes = "back") { +"‹ Games" }
                    div(classes = "logo") {
                        img(alt = "", src = asset("/static/meow/cat.svg"))
                        h1 { +"Hide &"; br(); span { +"Meow" } }
                    }
                    div(classes = "level-label") {
                        strong { id = "level"; +"Level 1" }
                        span { id = "difficulty"; +"Easy" }
                    }
                }
                div(classes = "rules") {
                    p {
                        unsafe { +"""<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="4" fill="#5FB3A6"/><circle cx="16" cy="9" r="4" fill="#EFA163"/><circle cx="12" cy="16" r="4" fill="#B9607A"/></svg>""" }
                        span { +"One per colour" }
                    }
                    p {
                        unsafe { +"""<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M12 3v18" stroke="#A07B68" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="3.2" fill="#E58A9A"/></svg>""" }
                        span { +"One per row & column" }
                    }
                    p {
                        unsafe { +"""<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="12" r="4" fill="#E58A9A"/><circle cx="17" cy="12" r="4" fill="#E58A9A"/><path d="M10.5 8.5l3 7M13.5 8.5l-3 7" stroke="#7A4E3A" stroke-width="1.8" stroke-linecap="round"/></svg>""" }
                        span { +"No touching" }
                    }
                }
                div(classes = "status") {
                    div(classes = "found") {
                        img(alt = "", src = asset("/static/meow/cat.svg"))
                        div(classes = "pill") {
                            i { id = "pill-fill" }
                            b { id = "pill-text"; +"0/0" }
                        }
                    }
                    div(classes = "fish") { id = "fish"; attributes["aria-label"] = "Fish left" }
                }
                div(classes = "board") { id = "board" }
                div(classes = "message") { id = "message"; attributes["aria-live"] = "polite" }
                div(classes = "toolbar") {
                    toolButton("levels-btn", "Levels", ICON_LEVELS)
                    toolButton("hint-btn", "Hint", ICON_HINT)
                    toolButton("undo-btn", "Undo", ICON_UNDO)
                    toolButton("restart-btn", "Restart", ICON_RESTART)
                    toolButton("help-btn", "Rules", ICON_HELP)
                }
                div(classes = "powerups") { id = "powerups" }
                p(classes = "hint") { +"Tap or drag to mark a spot · double tap to look underneath" }
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
