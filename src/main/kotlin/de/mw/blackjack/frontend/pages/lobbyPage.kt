package de.mw.blackjack.frontend.pages

import de.mw.blackjack.BuildInfo.asset
import de.mw.blackjack.frontend.utils.page
import de.mw.blackjack.models.Rules
import kotlinx.html.*

fun lobbyPage(playerName: String): String = page(
    pageTitle = "Blackjack",
    scripts = listOf("/static/bank.js", "/static/lobby.js"),
) {
    div(classes = "mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]") {
        header(classes = "flex items-center justify-between") {
            div(classes = "flex items-center gap-3") {
                img(alt = "", src = asset("/static/img/icon-192.png"), classes = "h-14 w-14 rounded-md shadow-lg")
                div {
                    p(classes = "text-xs uppercase tracking-[0.35em] text-gold/70") { +"Table 21" }
                    h1(classes = "font-display text-4xl font-black text-gold drop-shadow") { +"Blackjack" }
                }
            }
            div(classes = "rounded-pill bg-black/30 px-4 py-2 text-right") {
                p(classes = "text-[10px] uppercase tracking-widest text-chalk/50") { +"Cash" }
                p(classes = "text-xl font-bold text-gold") { id = "cash"; +"—" }
            }
        }

        section(classes = "rounded-lg bg-black/20 p-4") {
            label(classes = "mb-2 block text-xs uppercase tracking-widest text-chalk/60") {
                htmlFor = "name"; +"Your name"
            }
            input(type = InputType.text, classes = "input w-full rounded-pill bg-felt-dark text-chalk") {
                id = "name"
                name = "name"
                value = playerName
                maxLength = "14"
                autoComplete = false
            }
        }

        main(classes = "flex flex-col gap-3") {
            button(classes = "btn btn-lg h-16 w-full rounded-pill border-none bg-gold text-felt-dark hover:bg-gold/90") {
                id = "solo"
                +"Play solo"
            }
            button(classes = "btn btn-lg h-14 w-full rounded-pill border border-gold/40 bg-transparent text-chalk hover:bg-black/20") {
                id = "create"
                +"Create a table"
            }
            div(classes = "flex gap-2") {
                input(type = InputType.text, classes = "input flex-1 rounded-pill bg-felt-dark text-center text-2xl font-bold uppercase tracking-[0.4em] text-chalk") {
                    id = "code"
                    placeholder = "CODE"
                    maxLength = "4"
                    autoComplete = false
                    attributes["inputmode"] = "text"
                    attributes["autocapitalize"] = "characters"
                }
                button(classes = "btn h-14 rounded-pill border-none bg-chalk/10 px-6 text-chalk") {
                    id = "join"
                    +"Join"
                }
            }
            p(classes = "min-h-5 text-center text-sm text-rose-300") { id = "error" }
        }

        footer(classes = "mt-auto space-y-3 text-center text-xs text-chalk/50") {
            p {
                +"${Rules.DECKS} decks · dealer stands on 17 · blackjack pays 3:2"
                br()
                +"min ${Rules.MIN_BET} · max ${Rules.MAX_BET} · double and split allowed"
            }
            button(classes = "text-chalk/40 underline") { id = "reset"; +"Reset bankroll to ${Rules.STARTING_CASH}" }
        }
    }
}
