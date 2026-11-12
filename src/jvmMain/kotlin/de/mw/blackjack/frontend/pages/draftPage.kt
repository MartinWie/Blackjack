package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import de.mw.blackjack.frontend.utils.Apps
import de.mw.blackjack.frontend.utils.installable
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

private const val ICON_HOME =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></svg>"""
private const val ICON_FAST =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l7 6-7 6z"/><path d="M12 6l7 6-7 6z"/></svg>"""
private const val ICON_HELP =
    """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 1 1 4.3 2.7c-1 .5-1.5 1.2-1.5 2.3v.5"/><circle cx="12" cy="18.5" r=".6"/></svg>"""
private const val LOGO_SWORDS =
    """<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round"><path d="M8 6l17 17" stroke="#5B4636" stroke-width="7"/><path d="M8 6l17 17" stroke="#D9E2EC" stroke-width="4"/><path d="M32 6 15 23" stroke="#5B4636" stroke-width="7"/><path d="M32 6 15 23" stroke="#D9E2EC" stroke-width="4"/><path d="M11 26l6-6M23 20l6 6" stroke="#5B4636" stroke-width="4"/><path d="M9 31l5-5M31 31l-5-5" stroke="#8A5A35" stroke-width="4"/></g><circle cx="9" cy="31" r="2.6" fill="#E5484D" stroke="#5B4636" stroke-width="1.4"/><circle cx="31" cy="31" r="2.6" fill="#3E7BEA" stroke="#5B4636" stroke-width="1.4"/></svg>"""

private fun DIV.toolButton(id: String, label: String, icon: String) {
    button(classes = "tool") {
        this.id = id
        attributes["aria-label"] = label
        attributes["data-label"] = label
        unsafe { +icon }
    }
}

/** A number with a minus and a plus button; draft.js reads and bounds it. */
private fun DIV.stepper(id: String, text: String) {
    div(classes = "stepper") {
        label { htmlFor = id; +text }
        div(classes = "stepper-box") {
            button(type = ButtonType.button, classes = "step") {
                attributes["data-for"] = id; attributes["data-d"] = "-1"; attributes["aria-label"] = "$text, fewer"; +"−"
            }
            input(type = InputType.number, classes = "step-input") {
                this.id = id
                attributes["min"] = "1"
                attributes["inputmode"] = "numeric"
            }
            button(type = ButtonType.button, classes = "step") {
                attributes["data-for"] = id; attributes["data-d"] = "1"; attributes["aria-label"] = "$text, more"; +"+"
            }
        }
    }
}

/**
 * Draft Battle: both players draft an army at once, it grows every round, and the
 * armies fight it out; a lost battle costs a heart. Solo against a bot works offline;
 * a room needs the server.
 */
fun draftPage(): String = buildString {
    append("<!DOCTYPE html>")
    appendHTML().html {
        attributes["lang"] = "en"
        head {
            meta(charset = "utf-8")
            meta(name = "viewport", content = "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no")
            meta(name = "theme-color", content = "#F4E9D4")
            meta(name = "apple-mobile-web-app-capable", content = "yes")
            title("Draft Battle")
            link(rel = "icon", href = asset("/static/img/games/draft-192.png"), type = "image/png")
            installable(Apps.draft)
            link(rel = "stylesheet", href = asset("/static/draft/draft.css"))
            script(src = asset("/static/draft/draft-engine.js")) { defer = true }
            script(src = asset("/static/draft/draft.js")) { defer = true }
        }
        body {
            div(classes = "wrap") {
                div(classes = "top") {
                    div(classes = "logo") {
                        unsafe { +LOGO_SWORDS }
                        h1 { +"Draft"; br(); span { +"Battle" } }
                    }
                    div(classes = "rank") {
                        id = "rank"
                        strong { id = "rank-name"; +"Bronze" }
                        span { id = "trophies"; +"0" }
                    }
                    // In a room, its code stays in sight: it is the way back in.
                    div(classes = "room-tag") {
                        id = "room-tag"
                        hidden = true
                        span { +"Room" }
                        b { +"····" }
                    }
                }

                section(classes = "screen") {
                    id = "home"
                    div(classes = "hero") {
                        div(classes = "hero-art") { id = "hero-art" }
                        p { +"Pick your army card by card. It grows every round. Three hearts each: lose a battle, lose a heart." }
                    }
                    button(classes = "big-btn") {
                        id = "play-bot"
                        span { +"Play" }
                        small { id = "bot-line"; +"against the camp's best" }
                    }
                    // The hidden custom mode: the mage at the foot of the rules shows it.
                    div(classes = "custom") {
                        id = "custom"
                        hidden = true
                        h2 { +"Custom match" }
                        div(classes = "steppers") {
                            stepper("custom-hearts", "Hearts")
                            stepper("custom-picks", "Cards a round")
                        }
                        div(classes = "row") {
                            button(classes = "mid-btn") { id = "custom-play"; +"Play the bot" }
                            button(classes = "mid-btn") { id = "custom-room"; +"Open a room" }
                        }
                        p(classes = "note") { +"Custom matches count for no trophies." }
                    }
                    div(classes = "friends") {
                        h2 { +"Play a friend" }
                        p(classes = "me") {
                            +"You are "
                            button(classes = "name-btn") { id = "my-name"; +"…" }
                        }
                        button(classes = "mid-btn") { id = "create-room"; +"Open a room" }
                        form(classes = "join") {
                            id = "join-form"
                            input(type = InputType.text, classes = "code-input") {
                                id = "join-code"
                                attributes["maxlength"] = "4"
                                attributes["autocomplete"] = "off"
                                attributes["autocapitalize"] = "characters"
                                attributes["aria-label"] = "Room code"
                                placeholder = "CODE"
                            }
                            button(type = ButtonType.submit, classes = "mid-btn") { +"Join" }
                        }
                        p(classes = "note") { id = "room-note" }
                    }
                }

                section(classes = "screen") {
                    id = "lobby"
                    hidden = true
                    div(classes = "lobby-card") {
                        p { +"Room code" }
                        strong(classes = "room-code") { id = "room-code"; +"····" }
                        p(classes = "note") { id = "lobby-note"; +"Waiting for your friend to join…" }
                        button(classes = "mid-btn") { id = "share-room"; +"Send the link" }
                        button(classes = "text-btn") { id = "leave-lobby"; +"Cancel" }
                    }
                }

                section(classes = "screen match") {
                    id = "match"
                    hidden = true
                    div(classes = "side them") {
                        div(classes = "who") {
                            span(classes = "avatar") { id = "them-avatar" }
                            div(classes = "id") {
                                strong { id = "them-name"; +"Rival" }
                                span(classes = "status") { id = "them-status" }
                            }
                            span(classes = "hearts") { id = "them-hearts"; attributes["role"] = "img" }
                        }
                        div(classes = "army") { id = "them-army" }
                    }
                    div(classes = "stage") {
                        id = "stage"
                        div(classes = "draft") {
                            id = "draft"
                            div(classes = "round-line") {
                                strong { id = "round-name"; +"Round 1" }
                                span { id = "pick-line" }
                            }
                            p(classes = "comeback") { id = "comeback"; hidden = true; +"Lost the last round: rarer cards for you." }
                            div(classes = "offer") { id = "offer" }
                            p(classes = "prompt") { id = "prompt"; attributes["aria-live"] = "polite" }
                        }
                        canvas(classes = "field") { id = "field"; hidden = true }
                        div(classes = "banner") { id = "banner"; attributes["aria-live"] = "polite" }
                        div(classes = "panel") { id = "panel"; hidden = true; attributes["aria-live"] = "polite" }
                    }
                    div(classes = "side you") {
                        div(classes = "army") { id = "you-army" }
                        div(classes = "who") {
                            span(classes = "avatar") { id = "you-avatar" }
                            div(classes = "id") {
                                strong { id = "you-name"; +"You" }
                                span(classes = "status") { id = "you-status" }
                            }
                            span(classes = "hearts") { id = "you-hearts"; attributes["role"] = "img" }
                        }
                    }
                }

                div(classes = "toolbar") {
                    toolButton("home-btn", "Home", ICON_HOME)
                    toolButton("fast-btn", "Faster", ICON_FAST)
                    toolButton("help-btn", "Rules", ICON_HELP)
                }
            }
            div(classes = "fly") { id = "fly" }
            div(classes = "sheet") {
                id = "sheet"
                hidden = true
                div(classes = "sheet-card") {
                    attributes["role"] = "dialog"
                    attributes["aria-modal"] = "true"
                    attributes["aria-label"] = "How to play"
                    button(classes = "sheet-close") { id = "sheet-close"; attributes["aria-label"] = "Close"; +"×" }
                    div { id = "sheet-body" }
                }
            }
            script(src = asset("/static/sw-register.js")) { defer = true }
        }
    }
}
