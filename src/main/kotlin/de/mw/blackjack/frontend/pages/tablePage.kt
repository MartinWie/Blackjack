package de.mw.blackjack.frontend.pages

import de.mw.blackjack.frontend.utils.page
import de.mw.blackjack.models.Rules
import kotlinx.html.*

/**
 * The table is a skeleton: `table.js` renders seats, hands and chips from the state
 * that arrives over SSE, and anime.js animates the difference between two states.
 */
fun tablePage(code: String): String = page(
    pageTitle = "Blackjack · $code",
    scripts = listOf("/static/bank.js", "/static/table.js"),
) {
    div(classes = "relative mx-auto flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden") {
        attributes["data-code"] = code

        header(classes = "flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2") {
            a(href = "/", classes = "rounded-pill bg-black/30 px-3 py-2 text-sm text-chalk/70") { +"Leave" }
            button(classes = "rounded-pill bg-black/30 px-4 py-2 text-center") {
                id = "share"
                span(classes = "block text-[10px] uppercase tracking-widest text-chalk/50") { +"Table" }
                span(classes = "block text-lg font-bold tracking-[0.3em] text-gold") { id = "code"; +code }
            }
            div(classes = "rounded-pill bg-black/30 px-4 py-2 text-right") {
                span(classes = "block text-[10px] uppercase tracking-widest text-chalk/50") { +"Cash" }
                span(classes = "block text-lg font-bold text-gold") { id = "cash"; +"—" }
            }
        }

        // Dealer
        section(classes = "relative flex flex-col items-center gap-2 pt-2") {
            div(classes = "flex items-center gap-2 text-xs uppercase tracking-widest text-chalk/50") {
                span { +"Dealer" }
                span(classes = "rounded-pill bg-black/30 px-2 py-0.5 text-gold") { id = "dealer-score" }
            }
            div(classes = "flex min-h-[7.5rem] items-start justify-center") { id = "dealer-cards" }
        }

        div(classes = "pointer-events-none absolute left-1/2 top-[28%] h-64 w-[130%] -translate-x-1/2 rounded-[50%] border border-gold/20 bg-felt-light/40") {}

        // Players
        section(classes = "relative z-10 flex flex-1 items-end justify-center overflow-x-auto px-2") {
            div(classes = "flex w-full items-end justify-center gap-2 pb-2") { id = "seats" }
        }

        div(classes = "pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center") {
            div(classes = "rounded-pill bg-black/60 px-5 py-2 text-lg font-bold text-gold opacity-0") { id = "banner" }
        }

        // Controls
        footer(classes = "relative z-10 space-y-2 bg-black/30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur") {
            div(classes = "flex items-center justify-between text-xs text-chalk/60") {
                span { id = "phase"; +"Place your bet" }
                span(classes = "font-mono") { id = "clock" }
            }

            div(classes = "flex gap-2") {
                id = "chips"
                Rules.CHIPS.forEach { chip ->
                    button(classes = "chip flex-1") {
                        attributes["data-chip"] = chip.toString()
                        +chip.toString()
                    }
                }
            }

            div(classes = "flex gap-2") {
                id = "bet-actions"
                button(classes = "btn h-12 flex-1 rounded-pill border-none bg-chalk/10 text-chalk") { id = "clear"; +"Clear" }
                button(classes = "btn h-12 flex-[2] rounded-pill border-none bg-gold text-felt-dark") { id = "deal"; +"Deal" }
            }

            div(classes = "hidden gap-2") {
                id = "play-actions"
                button(classes = "btn h-12 flex-1 rounded-pill border-none bg-gold text-felt-dark") {
                    attributes["data-action"] = "HIT"; +"Hit"
                }
                button(classes = "btn h-12 flex-1 rounded-pill border-none bg-chalk/15 text-chalk") {
                    attributes["data-action"] = "STAND"; +"Stand"
                }
                button(classes = "btn h-12 flex-1 rounded-pill border-none bg-chalk/15 text-chalk") {
                    attributes["data-action"] = "DOUBLE"; +"Double"
                }
                button(classes = "btn h-12 flex-1 rounded-pill border-none bg-chalk/15 text-chalk") {
                    attributes["data-action"] = "SPLIT"; +"Split"
                }
            }

            p(classes = "min-h-4 text-center text-xs text-rose-300") { id = "error" }
        }
    }
}
