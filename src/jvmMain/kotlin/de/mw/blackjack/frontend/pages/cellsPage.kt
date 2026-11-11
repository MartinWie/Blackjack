package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import de.mw.blackjack.frontend.utils.Apps
import de.mw.blackjack.frontend.utils.installable
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

private const val ICON_HOME =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></svg>"""
private const val ICON_LAB =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/></svg>"""
private const val ICON_HELP =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 1 1 4.3 2.7c-1 .5-1.5 1.2-1.5 2.3v.5"/><circle cx="12" cy="18.5" r=".6"/></svg>"""
private const val ICON_PAUSE =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>"""
private const val ICON_FAST =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l7 6-7 6z"/><path d="M12 6l7 6-7 6z"/></svg>"""
private const val LOGO_CELL =
    """<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 5c6 0 9 3 12 6s4 6 3 10-3 8-7 11-9 3-13 1-8-5-9-10 1-9 4-12 5-6 10-6z" fill="#fff" stroke="#3B2C22" stroke-width="2"/><circle cx="15" cy="18" r="2.4" fill="#3B2C22"/><circle cx="25" cy="18" r="2.4" fill="#3B2C22"/><path d="M16 25q4 3 8 0" fill="none" stroke="#3B2C22" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="8" r="4" fill="#7BC96F" stroke="#3B2C22" stroke-width="1.5"/><path d="M32 2v2M32 12v2M26 8h2M36 8h2" stroke="#3B2C22" stroke-width="1.5" stroke-linecap="round"/></svg>"""

private fun DIV.toolButton(id: String, label: String, icon: String, classes: String = "tool") {
    button(classes = classes) {
        this.id = id
        attributes["aria-label"] = label
        attributes["data-label"] = label
        unsafe { +icon }
    }
}

/** Cell Survivor: guard the heart of a petri dish from virus chains. Pure client, offline. */
fun cellsPage(): String = buildString {
    append("<!DOCTYPE html>")
    appendHTML().html {
        attributes["lang"] = "en"
        head {
            meta(charset = "utf-8")
            meta(name = "viewport", content = "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no")
            meta(name = "theme-color", content = "#DFF3EE")
            meta(name = "apple-mobile-web-app-capable", content = "yes")
            title("Cell Survivor")
            link(rel = "icon", href = asset("/static/img/games/cells-192.png"), type = "image/png")
            installable(Apps.cells)
            link(rel = "stylesheet", href = asset("/static/cells/cells.css"))
            script(src = asset("/static/cells/cells-engine.js")) { defer = true }
            script(src = asset("/static/cells/cells.js")) { defer = true }
        }
        body {
            div(classes = "wrap") {
                div(classes = "top") {
                    div(classes = "logo") {
                        unsafe { +LOGO_CELL }
                        h1 { +"Cell"; br(); span { +"Survivor" } }
                    }
                    div(classes = "wallet") {
                        span(classes = "coin") {}
                        strong { id = "coins"; +"0" }
                    }
                }

                section(classes = "screen") {
                    id = "home"
                    div(classes = "chapter") {
                        div(classes = "dish") {
                            button(classes = "arrow") { id = "prev-ch"; attributes["aria-label"] = "Previous chapter"; +"‹" }
                            canvas(classes = "preview") { id = "preview" }
                            button(classes = "arrow") { id = "next-ch"; attributes["aria-label"] = "Next chapter"; +"›" }
                        }
                        h2 { id = "chapter-name"; +"Chapter 1" }
                        p { id = "chapter-line" }
                    }
                    button(classes = "big-btn") { id = "play"; +"Play" }
                    div(classes = "toolbar") {
                        a(href = "/games", classes = "tool") {
                            attributes["aria-label"] = "Games"
                            attributes["data-label"] = "Games"
                            unsafe { +ICON_HOME }
                        }
                        toolButton("lab-btn", "Lab", ICON_LAB)
                        toolButton("help-btn", "Rules", ICON_HELP)
                    }
                }

                section(classes = "screen run") {
                    id = "run"
                    hidden = true
                    div(classes = "hud") {
                        id = "hud"
                        div(classes = "core") {
                            attributes["role"] = "img"
                            attributes["aria-label"] = "Heart"
                            span(classes = "heart") {}
                            strong { id = "core"; +"20" }
                        }
                        div(classes = "track") {
                            attributes["role"] = "progressbar"
                            attributes["aria-label"] = "Chapter progress"
                            attributes["aria-valuemin"] = "0"
                            attributes["aria-valuemax"] = "100"
                            div(classes = "fill") { id = "progress-fill" }
                            div(classes = "chests") { id = "chests" }
                        }
                        div(classes = "lvl") {
                            span { +"Lv" }
                            strong { id = "level"; +"1" }
                            div(classes = "xp") { div(classes = "xp-fill") { id = "xp-fill" } }
                        }
                    }
                    div(classes = "stage") {
                        // The dish is pictures only; what matters is in the HUD and the overlays.
                        canvas(classes = "field") { id = "field"; attributes["aria-hidden"] = "true" }
                        div(classes = "banner") { id = "banner"; attributes["aria-live"] = "polite" }
                        div(classes = "overlay") {
                            id = "overlay"
                            hidden = true
                            attributes["role"] = "dialog"
                            attributes["aria-modal"] = "true"
                            attributes["aria-labelledby"] = "overlay-title"
                        }
                    }
                    div(classes = "dock") {
                        id = "dock"
                        div(classes = "weapons") { id = "weapons" }
                        toolButton("fast-btn", "Faster", ICON_FAST)
                        toolButton("pause", "Pause", ICON_PAUSE)
                        button(classes = "ult") {
                            id = "ult"
                            attributes["aria-label"] = "Antibody burst"
                            span { +"Burst" }
                        }
                    }
                }
            }
            div(classes = "sheet") {
                id = "sheet"
                hidden = true
                div(classes = "sheet-card") {
                    attributes["role"] = "dialog"
                    attributes["aria-modal"] = "true"
                    button(classes = "sheet-close") { id = "sheet-close"; attributes["aria-label"] = "Close"; +"×" }
                    div { id = "sheet-body" }
                }
            }
            script(src = asset("/static/sw-register.js")) { defer = true }
        }
    }
}
