package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

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
            link(rel = "icon", href = asset("/static/meow/cat.svg"), type = "image/svg+xml")
            link(rel = "stylesheet", href = asset("/static/meow/meow.css"))
            script(src = asset("/static/meow/meow-engine.js")) { defer = true }
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
                    div(classes = "levels") {
                        button { id = "prev"; attributes["aria-label"] = "Previous level"; +"‹" }
                        strong { id = "level"; +"Level 1" }
                        button { id = "next"; attributes["aria-label"] = "Next level"; +"›" }
                    }
                }
                div(classes = "tabs") {
                    id = "tabs"
                    listOf("easy" to "Easy", "medium" to "Medium", "hard" to "Hard", "expert" to "Expert").forEach { (key, label) ->
                        button { attributes["data-d"] = key; +label }
                    }
                }
                div(classes = "rules") {
                    p { +"One cat per colour" }
                    p { +"One cat per row & column" }
                    p { +"Cats never touch, not even corners" }
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
                div(classes = "actions") {
                    button { id = "clear"; +"Clear marks" }
                    button { id = "restart"; +"Restart level" }
                }
                p(classes = "hint") { +"Tap or drag to mark a spot · double tap to look underneath" }
            }
            script(src = asset("/static/sw-register.js")) { defer = true }
        }
    }
}
