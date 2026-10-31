package de.mw.marbles

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.html.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*
import kotlinx.html.*

internal fun Route.registerPageRoutes() {
    // Home page - create or join a game
    get("/") {
        val session = call.sessions.get<UserSession>()
        val savedName = session?.playerName?.take(MAX_PLAYER_NAME_LENGTH) ?: ""
        val error = call.request.queryParameters["error"]
        val lang = call.getLanguage()

        call.respondHtml {
            basePage(
                title = "home.title".t(lang),
                lang = lang,
                includeHtmx = true,
            ) {
                h1 { +"home.title".t(lang) }

                if (error == "game_not_found") {
                    div("error-message") {
                        +"error.gameNotFound".t(lang)
                    }
                }

                div("card") {
                    h2 { +"home.createGame".t(lang) }
                    p("hint") { +"home.createGameHint".t(lang) }

                    form {
                        id = "create-form-marbles"
                        hxPost("$MARBLES/game/create")
                        hxTarget("body")

                        div("form-group") {
                            label { +"home.yourName".t(lang) }
                            input(type = InputType.text, name = "playerName") {
                                required = true
                                placeholder = "home.namePlaceholder".t(lang)
                                value = savedName
                                maxLength = MAX_PLAYER_NAME_LENGTH.toString()
                            }
                        }
                        button(type = ButtonType.submit, classes = "btn btn-primary") { +"button.create".t(lang) }
                    }
                }
            }
        }
    }

    // Imprint page
    get("/imprint") {
        val lang = call.getLanguage()
        call.respondHtml {
            basePage("${"footer.imprint".t(lang)} - ${"game.title".t(lang)}", lang) {
                h1 { +"footer.imprint".t(lang) }
                div("card") {
                    style = "text-align: left;"
                    h2 { +"imprint.headline".t(lang) }
                    p { +"imprint.hobbyProject".t(lang) }
                    h3 { +"imprint.contact".t(lang) }
                    p { +"imprint.email".t(lang) }
                    h3 { +"imprint.liabilityContent".t(lang) }
                    p { +"imprint.liabilityContentText".t(lang) }
                    h3 { +"imprint.liabilityLinks".t(lang) }
                    p { +"imprint.liabilityLinksText".t(lang) }
                }
            }
        }
    }

    // Privacy policy page
    get("/privacy") {
        val lang = call.getLanguage()
        call.respondHtml {
            basePage("${"footer.privacy".t(lang)} - ${"game.title".t(lang)}", lang) {
                h1 { +"footer.privacy".t(lang) }
                div("card") {
                    style = "text-align: left;"
                    h2 { +"privacy.headline".t(lang) }

                    h3 { +"privacy.controller".t(lang) }
                    p { +"privacy.controllerText".t(lang) }
                    p { +"privacy.controllerEmail".t(lang) }
                    p { +"privacy.hobbyProject".t(lang) }

                    h3 { +"privacy.dataCollected".t(lang) }
                    p { +"privacy.dataCollectedText".t(lang) }
                    ul {
                        li { +"privacy.dataSession".t(lang) }
                        li { +"privacy.dataPlayer".t(lang) }
                        li { +"privacy.dataAnalytics".t(lang) }
                    }

                    h3 { +"privacy.legalBasis".t(lang) }
                    p { +"privacy.legalBasisText".t(lang) }
                    ul {
                        li { +"privacy.legalBasisNecessary".t(lang) }
                        li { +"privacy.legalBasisConsent".t(lang) }
                    }

                    h3 { +"privacy.retention".t(lang) }
                    p { +"privacy.retentionText".t(lang) }

                    h3 { +"privacy.rights".t(lang) }
                    p { +"privacy.rightsText".t(lang) }
                    ul {
                        li { +"privacy.rightsAccess".t(lang) }
                        li { +"privacy.rightsRectification".t(lang) }
                        li { +"privacy.rightsErasure".t(lang) }
                        li { +"privacy.rightsRestriction".t(lang) }
                        li { +"privacy.rightsWithdraw".t(lang) }
                        li { +"privacy.rightsComplaint".t(lang) }
                    }

                    h3 { +"privacy.cookies".t(lang) }
                    p { +"privacy.cookiesText".t(lang) }

                    h3 { +"privacy.thirdParties".t(lang) }
                    p { +"privacy.thirdPartiesText".t(lang) }
                }
            }
        }
    }
}
