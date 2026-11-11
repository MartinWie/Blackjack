package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import de.mw.blackjack.frontend.utils.Apps
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
    /** Its own subdomain on the live site, which is also where it installs from. */
    val subdomain: String,
)

private val games = listOf(
    Game("/blackjack", "Blackjack", "Solo or at a shared table", "/static/img/icon-192.png", "from-gold/25", offline = true, badge = "Online/Offline", subdomain = "blackjack"),
    Game("/meow", "Hide & Meow", "Find the hiding cats", "/static/img/games/meow-192.png", "from-rose-300/25", offline = true, badge = "Offline", subdomain = "meow"),
    Game("/sweets", "Sweet Swap", "Match three", "/static/img/games/sweets-192.png", "from-pink-400/25", offline = true, badge = "Offline", subdomain = "sweets"),
    Game("/picnic", "Ant Picnic", "Feed the ants, clear the plate", "/static/img/games/picnic-192.png", "from-red-400/25", offline = true, badge = "Offline", subdomain = "picnic"),
    Game("/draft", "Draft Battle", "Keep a card, give one away, clash", "/static/img/games/draft-192.png", "from-amber-300/25", offline = true, badge = "Online/Offline", subdomain = "draft"),
    Game("/cells", "Cell Survivor", "Guard the heart from virus chains", "/static/img/games/cells-192.png", "from-teal-300/25", offline = true, badge = "Offline", subdomain = "cells"),
    Game("/marbles", "Marbles", "Guess odd or even with friends", "/static/img/games/marbles-192.png", "from-sky-400/25", offline = false, badge = "Online", subdomain = "marbles"),
)

/** The launcher. Static, so the service worker serves it with no network. */
fun hubPage(): String = page(
    pageTitle = "Games",
    scripts = listOf("/static/hub.js"),
    favicon = "/static/img/games/hub-32.png",
    app = Apps.hub,
    askToInstall = true,
) {
    div(classes = "mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 px-4 pb-8 pt-[max(2rem,env(safe-area-inset-top))]") {
        header(classes = "flex items-end justify-between gap-4") {
            div {
                p(classes = "text-[10px] uppercase tracking-[0.3em] text-gold/70") { +"Pick a game" }
                h1(classes = "font-display text-4xl font-black text-gold drop-shadow") { +"Games" }
            }
            button(classes = "mb-1 flex items-center gap-1.5 rounded-pill bg-black/30 px-3 py-2 text-xs font-bold text-chalk/80 ring-1 ring-white/10 transition hover:bg-black/50 active:scale-95") {
                attributes["data-install"] = "open"
                attributes["aria-label"] = "Add the launcher to your home screen"
                unsafe { +INSTALL_ICON }
                +"Install"
            }
        }
        main(classes = "flex flex-col gap-3") {
            games.forEach { game ->
              // The link button sits beside the card rather than in it: a button
              // inside a link is not allowed.
              div(classes = "relative") {
                a(href = game.href, classes = "game-card group flex items-center gap-4 rounded-lg bg-gradient-to-r ${game.accent} to-black/20 p-4 shadow-lg ring-1 ring-white/10 transition active:scale-[.98] aria-disabled:pointer-events-none aria-disabled:opacity-40") {
                    if (!game.offline) attributes["data-online-only"] = "true"
                    img(alt = "", src = asset(game.icon), classes = "h-16 w-16 shrink-0 rounded-md object-cover shadow transition group-hover:rotate-[-4deg]")
                    div(classes = "min-w-0 flex-1") {
                        h2(classes = "font-display text-2xl font-black text-chalk") { +game.name }
                        p(classes = "text-sm text-chalk/60") { +game.blurb }
                    }
                    div(classes = "flex shrink-0 flex-col items-end gap-3 self-stretch justify-between") {
                        span(classes = "status rounded-pill bg-black/30 px-2 py-1 text-[10px] uppercase tracking-widest text-chalk/50") {
                            +game.badge
                        }
                        span(classes = "h-8 w-[4.5rem]") {}
                    }
                }
                button(classes = "share-link absolute bottom-4 right-4 grid h-8 w-8 place-items-center rounded-pill bg-black/30 text-chalk/70 transition hover:bg-black/50 hover:text-chalk active:scale-90") {
                    attributes["data-path"] = game.href
                    attributes["data-subdomain"] = game.subdomain
                    attributes["aria-label"] = "Copy a direct link to ${game.name}"
                    unsafe {
                        +"""<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>"""
                    }
                }
                // To the game's own subdomain, which opens its install sheet (install.js).
                a(classes = "install-link absolute bottom-4 right-14 grid h-8 w-8 place-items-center rounded-pill bg-black/30 text-chalk/70 transition hover:bg-black/50 hover:text-chalk active:scale-90") {
                    attributes["data-path"] = game.href
                    attributes["data-subdomain"] = game.subdomain
                    attributes["data-install"] = "link"
                    href = "${game.href}#install"
                    attributes["aria-label"] = "Add ${game.name} to your home screen"
                    unsafe { +INSTALL_ICON }
                }
              }
            }
        }
        button(classes = "mt-auto text-center text-xs text-chalk/40 underline-offset-2 hover:underline") {
            attributes["data-install"] = "open"
            +"Add to your home screen to play anywhere."
        }
        div(classes = "pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4") {
            p(classes = "share-toast rounded-pill bg-chalk px-4 py-2 text-sm font-bold text-felt-dark opacity-0 shadow-lg transition duration-300") {
                attributes["role"] = "status"
            }
        }
    }
}

private const val INSTALL_ICON =
    """<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 7.5v7M9 11.5l3 3 3-3"/></svg>"""
