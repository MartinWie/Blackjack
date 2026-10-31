package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import de.mw.blackjack.frontend.utils.page
import kotlinx.html.*

private class Game(
    val href: String,
    val name: String,
    val blurb: String,
    val icon: String,
    val accent: String,
    val offline: Boolean,
    val badge: String,
)

private val games = listOf(
    Game("/blackjack", "Blackjack", "Solo or at a shared table", "/static/img/icon-192.png", "from-gold/25", offline = true, badge = "Online/Offline"),
    Game("/meow", "Hide & Meow", "Find the hiding cats · gets trickier as you go", "/static/img/games/meow-192.png", "from-rose-300/25", offline = true, badge = "Offline"),
    Game("/sweets", "Sweet Swap", "Match three · six kinds of level", "/static/img/games/sweets-192.png", "from-pink-400/25", offline = true, badge = "Offline"),
    Game("/marbles", "Marbles", "Guess odd or even with friends", "/static/img/games/marbles-192.png", "from-sky-400/25", offline = false, badge = "Online"),
)

/** The launcher. Static, so the service worker serves it with no network. */
fun hubPage(): String = page(pageTitle = "Games", scripts = listOf("/static/hub.js"), favicon = "/static/img/games/hub-32.png") {
    div(classes = "mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 px-4 pb-8 pt-[max(2rem,env(safe-area-inset-top))]") {
        header {
            p(classes = "text-[10px] uppercase tracking-[0.3em] text-gold/70") { +"Pick a game" }
            h1(classes = "font-display text-4xl font-black text-gold drop-shadow") { +"Games" }
        }
        main(classes = "flex flex-col gap-3") {
            games.forEach { game ->
                a(href = game.href, classes = "game-card group flex items-center gap-4 rounded-lg bg-gradient-to-r ${game.accent} to-black/20 p-4 shadow-lg ring-1 ring-white/10 transition active:scale-[.98] aria-disabled:pointer-events-none aria-disabled:opacity-40") {
                    if (!game.offline) attributes["data-online-only"] = "true"
                    img(alt = "", src = asset(game.icon), classes = "h-16 w-16 shrink-0 rounded-md object-cover shadow transition group-hover:rotate-[-4deg]")
                    div(classes = "min-w-0 flex-1") {
                        h2(classes = "font-display text-2xl font-black text-chalk") { +game.name }
                        p(classes = "text-sm text-chalk/60") { +game.blurb }
                    }
                    span(classes = "status shrink-0 rounded-pill bg-black/30 px-2 py-1 text-[10px] uppercase tracking-widest text-chalk/50") {
                        +game.badge
                    }
                }
            }
        }
        p(classes = "mt-auto text-center text-xs text-chalk/40") { +"Add to your home screen to play anywhere." }
    }
}
