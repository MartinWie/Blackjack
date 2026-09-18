package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import de.mw.blackjack.frontend.utils.page
import kotlinx.html.*

/** Served from the service worker cache when a navigation fails. */
fun offlinePage(): String = page(pageTitle = "Blackjack · offline") {
    div(classes = "flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-8 text-center") {
        img(alt = "", src = asset("/static/img/icon-192.png"), classes = "h-20 w-20 rounded-lg opacity-70 shadow-lg")
        h1(classes = "font-display text-3xl font-black text-gold") { +"No signal" }
        p(classes = "text-chalk/70") { +"The table needs a connection to deal. Everything else is already on your phone." }
        a(href = "/", classes = "btn rounded-pill border-none bg-gold px-8 text-felt-dark") { +"Try again" }
    }
}
