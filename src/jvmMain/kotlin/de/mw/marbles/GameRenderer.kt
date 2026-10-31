package de.mw.marbles

import de.mw.blackjack.BuildInfo.asset
import kotlinx.html.*

/**
 * HTML rendering utilities for the Marble Game.
 *
 * Contains functions to render game state and pages as HTML strings
 * for server-side rendering with HTMX updates.
 */

/**
 * Escapes a string for safe HTML output, preventing XSS attacks.
 *
 * Converts special HTML characters to their entity equivalents:
 * - `&` → `&amp;`
 * - `<` → `&lt;`
 * - `>` → `&gt;`
 * - `"` → `&quot;`
 * - `'` → `&#x27;`
 *
 * @return The escaped string safe for HTML output.
 */
internal fun String.escapeHtml(): String =
    this
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#x27;")

/**
 * Configuration for analytics and tracking.
 *
 * Reads from environment variables with sensible defaults.
 */
internal object AnalyticsConfig {
    /**
     * Whether PostHog analytics is enabled.
     *
     * Controlled by the `POSTHOG_ENABLED` environment variable.
     * Defaults to `true` if not set (production behavior).
     * Set to `false` to disable analytics (e.g., for local development).
     */
    val posthogEnabled: Boolean = System.getenv("POSTHOG_ENABLED")?.lowercase() != "false"
}

/** localStorage key for cookie consent preference. */
private const val COOKIE_CONSENT_KEY = "cookie_consent"

/**
 * PostHog analytics script for page tracking with cookie consent management.
 *
 * Outputs the PostHog JavaScript snippet for analytics tracking.
 * Should be included in the `<head>` section of all pages.
 *
 * Cookie consent flow:
 * - If consent not yet given: shows cookie banner, PostHog initialized in cookieless mode
 * - If consent accepted: PostHog with full tracking (cookies enabled)
 * - If consent rejected: PostHog with cookieless_mode: 'always' (no cookies)
 *
 * Can be disabled via the `POSTHOG_ENABLED=false` environment variable.
 */
internal fun HEAD.posthogScript() {
    if (!AnalyticsConfig.posthogEnabled) return
    script {
        unsafe {
            +
                """
                (function() {
                    var CONSENT_KEY = '$COOKIE_CONSENT_KEY';
                    var consent = localStorage.getItem(CONSENT_KEY);
                    
                    // PostHog loader
                    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group identify setPersonProperties setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags resetGroups onFeatureFlags addFeatureFlagsHandler onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
                    
                    // Initialize PostHog based on consent status
                    var config = {
                        api_host: 'https://eu.i.posthog.com',
                        defaults: '2025-11-30'
                    };
                    
                    if (consent === 'rejected' || consent === null) {
                        // No consent or rejected: use cookieless mode
                        config.persistence = 'memory';
                    }
                    
                    posthog.init('phc_SBn2sxfR87LLBLbf6z3WLjWUrqTxtec6cp7atY0nHoM', config);
                    
                    // Cookie consent functions (global)
                    window.acceptCookies = function() {
                        localStorage.setItem(CONSENT_KEY, 'accepted');
                        hideBanner();
                        // Reload to reinitialize PostHog with cookies
                        location.reload();
                    };
                    
                    window.rejectCookies = function() {
                        localStorage.setItem(CONSENT_KEY, 'rejected');
                        hideBanner();
                    };
                    
                    function hideBanner() {
                        var banner = document.getElementById('cookie-banner');
                        if (banner) banner.style.display = 'none';
                    }
                })();
                """.trimIndent()
        }
    }
}

/**
 * Cookie consent banner HTML/CSS.
 *
 * Renders a simple cookie consent banner at the bottom of the page.
 * Only shown if consent has not yet been given (checked via JavaScript).
 *
 * Not rendered when PostHog analytics is disabled via `POSTHOG_ENABLED=false`.
 *
 * @param lang The language code for translations.
 */
internal fun BODY.cookieConsentBanner(lang: String) {
    if (!AnalyticsConfig.posthogEnabled) return
    div {
        id = "cookie-banner"
        style =
            """
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(15, 15, 26, 0.98);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            padding: 16px 20px;
            padding-bottom: max(16px, env(safe-area-inset-bottom));
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            z-index: 1000;
            display: none;
            """.trimIndent().replace("\n", " ")
        div {
            style =
                "max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center;"
            p {
                style = "margin: 0; color: #a0a0b0; font-size: 0.9rem; line-height: 1.4;"
                +"cookie.message".t(lang)
            }
            div {
                style = "display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;"
                button {
                    style =
                        """
                        background: linear-gradient(135deg, #00d4ff 0%, #a855f7 100%);
                        color: white;
                        border: none;
                        padding: 10px 24px;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        font-size: 0.9rem;
                        """.trimIndent().replace("\n", " ")
                    attributes["onclick"] = "acceptCookies()"
                    +"cookie.accept".t(lang)
                }
                button {
                    style =
                        """
                        background: transparent;
                        color: #a0a0b0;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        padding: 10px 24px;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        font-size: 0.9rem;
                        """.trimIndent().replace("\n", " ")
                    attributes["onclick"] = "rejectCookies()"
                    +"cookie.reject".t(lang)
                }
            }
        }
    }
    // Show banner only if consent not yet given
    script {
        unsafe {
            +
                """
                (function() {
                    var consent = localStorage.getItem('$COOKIE_CONSENT_KEY');
                    if (consent === null) {
                        document.getElementById('cookie-banner').style.display = 'block';
                    }
                })();
                """.trimIndent()
        }
    }
}

/**
 * Renders the footer with links.
 *
 * @param lang The language code for translations.
 */
internal fun BODY.pageFooter(lang: String) {
    footer {
        id = "page-footer"
        div("footer-links") {
            a(href = "/games") { +"footer.allGames".t(lang) }
            span("separator") { +"•" }
            a(href = MARBLES) { +"footer.newGame".t(lang) }
            span("separator") { +"•" }
            a(href = "$MARBLES/imprint") { +"footer.imprint".t(lang) }
            span("separator") { +"•" }
            a(href = "$MARBLES/privacy") { +"footer.privacy".t(lang) }
        }
        a(href = "https://www.buymeacoffee.com/martinwie", target = "_blank", classes = "support-link") {
            img(src = "/static/marbles/svg/buymeacoffee.svg", alt = "Buy Me a Coffee") {
                attributes["width"] = "20"
                attributes["height"] = "20"
            }
            +"footer.support".t(lang)
        }
    }
}

/**
 * Base page template with common elements.
 *
 * Renders a complete HTML page with:
 * - Standard head elements (viewport, stylesheet, PostHog, favicon, PWA meta tags)
 * - Page wrapper structure
 * - Footer
 * - Cookie consent banner
 *
 * @param title The page title.
 * @param lang The language code for translations.
 * @param includeHtmx Whether to include the HTMX script (default: false).
 * @param extraHead Optional lambda to add extra head elements.
 * @param extraBodyContent Optional lambda to add content after the page-wrapper in body (scripts, etc.).
 * @param content Lambda to render the page content inside the container.
 */
internal fun HTML.basePage(
    title: String,
    lang: String,
    includeHtmx: Boolean = false,
    containerClasses: String = "container",
    extraHead: (HEAD.() -> Unit)? = null,
    extraBodyContent: (BODY.() -> Unit)? = null,
    content: DIV.() -> Unit,
) {
    head {
        title { +title }
        meta(name = "viewport", content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")

        // Favicon and app icons
        link(rel = "icon", href = "/static/marbles/favicon.ico", type = "image/x-icon")
        link(rel = "apple-touch-icon", href = "/static/marbles/apple-touch-icon.png")
        link(rel = "manifest", href = "/static/manifest.webmanifest")
        meta(name = "theme-color", content = "#4a90d9")
        meta(name = "apple-mobile-web-app-capable", content = "yes")
        meta(name = "apple-mobile-web-app-status-bar-style", content = "black-translucent")
        meta(name = "apple-mobile-web-app-title", content = "game.title".t(lang))

        if (includeHtmx) {
            script(src = asset("/static/marbles/htmx.min.js")) {}
        }
        link(rel = "stylesheet", href = asset("/static/marbles/style.css"))
        posthogScript()
        extraHead?.invoke(this)
    }
    body {
        div("page-wrapper") {
            div(containerClasses) {
                content()
            }
        }
        pageFooter(lang)
        cookieConsentBanner(lang)
        extraBodyContent?.invoke(this)
    }
}

/**
 * Renders the main game page HTML structure.
 *
 * This function generates the complete HTML page for the game, including:
 * - Page head with meta tags, HTMX script, and styles
 * - Game header with title, game code, and share button
 * - Initial game content (via [renderGameState])
 * - Client-side JavaScript for WebSocket handling, reconnection, and UI interactions
 *
 * The rendered page uses WebSockets to receive real-time updates
 * from the server. The JavaScript handles:
 * - WebSocket connection and reconnection on errors
 * - Ping timeout detection (reloads if no ping for 45 seconds)
 * - Tab visibility changes (reconnects when tab becomes visible)
 * - Countdown timers for disconnected players
 * - Marble picker UI for placing marbles
 *
 * @param game The current game state to render.
 * @param sessionId The session ID of the player viewing the page.
 * @param lang The language code for translations (e.g., "en", "de").
 *
 * @see renderGameState
 */
fun HTML.renderGamePage(
    game: Game,
    sessionId: String,
    lang: String,
) {
    basePage(
        title = "${"game.title".t(lang)} - ${game.id}",
        lang = lang,
        includeHtmx = true,
        extraBodyContent = {
            script(src = asset("/static/marbles/realtime.js")) {}
            script(src = asset("/static/marbles/ui-shared.js")) {}
            // Load game script and initialize with game ID
            script(src = asset("/static/marbles/game.js")) {}
            script {
                unsafe { +"initGame('${game.id}');" }
            }
        },
    ) {
        // Game page content
        div("header") {
            h1 { +"game.title".t(lang) }
            div("header-actions") {
                button(classes = "btn btn-secondary header-action-btn header-action-btn--icon") {
                    id = "share-btn"
                    attributes["type"] = "button"
                    attributes["data-share-url"] = "$MARBLES/game/${game.id}/join"
                    attributes["data-share-text"] = "button.share".t(lang)
                    attributes["data-copied-text"] = "button.copied".t(lang)
                    attributes["data-share-title"] = "game.title".t(lang)
                    attributes["data-share-message"] = "share.text".t(lang)
                    attributes["aria-label"] = "button.share".t(lang)
                    attributes["title"] = "button.share".t(lang)
                    span("share-icon") {
                        unsafe {
                            +
                                """
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-share-fill" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                  <path d="M11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.5 2.5 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5"/>
                                </svg>
                                """.trimIndent()
                        }
                    }
                }
                button(classes = "btn btn-secondary header-action-btn header-action-btn--icon") {
                    id = "qr-btn"
                    attributes["type"] = "button"
                    attributes["aria-label"] = "button.qr".t(lang)
                    attributes["title"] = "button.qr".t(lang)
                    attributes["aria-controls"] = "qr-modal"
                    attributes["aria-expanded"] = "false"
                    span("qr-icon") {
                        unsafe {
                            +
                                """
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-qr-code" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                  <path d="M2 2h2v2H2z"/>
                                  <path d="M6 0v6H0V0zM5 1H1v4h4zM4 12H2v2h2z"/>
                                  <path d="M6 10v6H0v-6zm-5 1v4h4v-4zm11-9h2v2h-2z"/>
                                  <path d="M10 0v6h6V0zm5 1v4h-4V1zM8 1V0h1v2H8v2H7V1zm0 5V4h1v2zM6 8V7h1V6h1v2h1V7h5v1h-4v1H7V8zm0 0v1H2V8H1v1H0V7h3v1zm10 1h-1V7h1zm-1 0h-1v2h2v-1h-1zm-4 0h2v1h-1v1h-1zm2 3v-1h-1v1h-1v1H9v1h3v-2zm0 0h3v1h-2v1h-1zm-4-1v1h1v-2H7v1z"/>
                                  <path d="M7 12h1v3h4v1H7zm9 2v2h-3v-1h2v-1z"/>
                                </svg>
                                """.trimIndent()
                        }
                    }
                }
                button(classes = "btn btn-secondary header-action-btn header-action-btn--icon") {
                    id = "sound-btn"
                    attributes["type"] = "button"
                    attributes["aria-label"] = "button.sound.on".t(lang)
                    attributes["title"] = "button.sound.on".t(lang)
                    attributes["data-sound-on"] = "button.sound.on".t(lang)
                    attributes["data-sound-off"] = "button.sound.off".t(lang)
                    span("sound-icon") {
                        unsafe {
                            +
                                """
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-volume-up" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                  <path d="M11.536 14.01A8.47 8.47 0 0 0 14.026 8a8.47 8.47 0 0 0-2.49-6.01l-.708.707A7.48 7.48 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303z"/>
                                  <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.48 5.48 0 0 1 11.025 8a5.48 5.48 0 0 1-1.61 3.89z"/>
                                  <path d="M10.025 8a4.5 4.5 0 0 1-1.318 3.182L8 10.475A3.5 3.5 0 0 0 9.025 8c0-.966-.392-1.841-1.025-2.475l.707-.707A4.5 4.5 0 0 1 10.025 8M7 4a.5.5 0 0 0-.812-.39L3.825 5.5H1.5A.5.5 0 0 0 1 6v4a.5.5 0 0 0 .5.5h2.325l2.363 1.89A.5.5 0 0 0 7 12zM4.312 6.39 6 5.04v5.92L4.312 9.61A.5.5 0 0 0 4 9.5H2v-3h2a.5.5 0 0 0 .312-.11"/>
                                </svg>
                                """.trimIndent()
                        }
                    }
                }
            }
            dialog(classes = "qr-modal") {
                id = "qr-modal"
                div("qr-modal-box") {
                    img(classes = "qr-image") {
                        id = "qr-image"
                        alt = "QR code"
                        loading = ImgLoading.lazy
                    }
                }
            }
        }

        div {
            id = "game-content"
            // Initial content
            unsafe { +renderGameState(game, sessionId, lang) }
        }
    }
}

fun renderGameState(
    game: Game,
    sessionId: String,
    lang: String = "en",
): String {
    val player = game.players[sessionId]
    val isCurrentPlayer = game.currentPlayer?.sessionId == sessionId
    val isCreator = game.creatorSessionId == sessionId

    return buildHTMLString {
        // Players list
        div("players-section") {
            h3 { +"players.title".t(lang) }
            div("players-list") {
                game.allPlayers.forEach { p ->
                    val statusClass =
                        buildString {
                            when {
                                p.sessionId == sessionId -> append("you")
                                p.isSpectator -> append("spectator")
                                game.currentPlayer?.sessionId == p.sessionId -> append("current")
                            }
                            if (!p.connected && p.sessionId != sessionId) {
                                append(" disconnected")
                            }
                        }
                    val gracePeriodRemaining = p.gracePeriodRemainingSeconds()
                    val markerText =
                        when {
                            p.sessionId == sessionId -> " ${"players.you".t(lang)}"
                            !p.connected && gracePeriodRemaining > 0 -> ""
                            !p.connected -> " ${"players.offline".t(lang)}"
                            game.currentPlayer?.sessionId == p.sessionId && game.phase != GamePhase.WAITING_FOR_PLAYERS -> " ${"players.current".t(
                                lang,
                            )}"
                            else -> ""
                        }
                    div("player-card $statusClass") {
                        div("player-name") { +("${p.name.escapeHtml()}$markerText") }
                        div("player-marbles") { +"${p.marbles} ${"players.marbles".t(lang)}" }
                        if (p.isSpectator) {
                            div("player-status") { +"players.spectator".t(lang) }
                        }
                        if (!p.connected && gracePeriodRemaining > 0 && p.sessionId != sessionId) {
                            div("player-countdown") {
                                attributes["data-seconds"] = gracePeriodRemaining.toString()
                                attributes["data-player"] = p.sessionId
                                +"${"players.reconnecting".t(lang)} "
                                span("countdown-timer") { +"${gracePeriodRemaining}s" }
                            }
                        } else if (!p.connected && p.sessionId != sessionId) {
                            div("player-disconnected") { +"players.disconnected".t(lang) }
                        }
                        if (game.phase == GamePhase.GUESSING && p.currentGuess != null && p.sessionId != game.currentPlayer?.sessionId) {
                            div("player-guessed") { +"players.guessed".t(lang) }
                        }
                    }
                }
                // Show pending players
                if (game.pendingPlayers.isNotEmpty()) {
                    div("pending-players") {
                        h4 { +"players.joiningNextRound".t(lang) }
                        game.pendingPlayers.forEach { p ->
                            val isYou = p.sessionId == sessionId
                            val statusClass = if (isYou) "you pending" else "pending"
                            div("player-card $statusClass") {
                                div("player-name") { +("${p.name.escapeHtml()}${if (isYou) " ${"players.you".t(lang)}" else ""}") }
                                div("player-status") { +"players.spectatorJoining".t(lang) }
                            }
                        }
                    }
                }
            }
        }

        // Game area
        div("game-area") {
            when (game.phase) {
                GamePhase.WAITING_FOR_PLAYERS -> {
                    val connectedCount = game.players.values.count { it.connected }
                    val totalPlayers = game.allPlayers.size
                    div("phase-info") {
                        h2 { +"phase.waiting.title".t(lang) }
                        p { +"phase.waiting.playerCount".t(lang, totalPlayers, connectedCount) }
                        if (isCreator && connectedCount >= 2) {
                            button(classes = "btn btn-primary") {
                                hxPost("$MARBLES/game/${game.id}/start")
                                hxSwap(HxSwapOption.NONE)
                                +"button.startGame".t(lang)
                            }
                        } else if (isCreator) {
                            p("hint") { +"phase.waiting.needPlayers".t(lang) }
                        } else {
                            val hostName = game.players[game.creatorSessionId]?.name?.escapeHtml() ?: "Host"
                            p("hint") { tr("phase.waiting.waitingHost", lang, hostName) }
                        }
                    }
                }

                GamePhase.PLACING_MARBLES -> {
                    if (isCurrentPlayer && player != null) {
                        div("phase-info") {
                            h2 { +"phase.placing.yourTurn".t(lang) }
                            p { +"phase.placing.instruction".t(lang) }
                            form(classes = "place-form") {
                                id = "place-form"
                                hxPost("$MARBLES/game/${game.id}/place")
                                hxSwap(HxSwapOption.NONE)
                                hiddenInput(name = "amount") {
                                    id = "marble-amount"
                                    value = "1"
                                }
                                div("marble-grid") {
                                    id = "marble-picker"
                                    for (i in 1..player.marbles) {
                                        val selectedClass = if (i == 1) "marble-btn selected" else "marble-btn"
                                        button(type = ButtonType.button, classes = selectedClass) {
                                            attributes["data-value"] = i.toString()
                                            +"$i"
                                        }
                                    }
                                }
                                p("marble-count") { tr("phase.placing.count", lang) }
                                button(type = ButtonType.submit, classes = "btn btn-primary") {
                                    +"button.placeMarbles".t(lang)
                                }
                            }
                        }
                    } else {
                        div("phase-info") {
                            h2 { +"phase.placing.waiting".t(lang) }
                            p { tr("phase.placing.deciding", lang, game.currentPlayer?.name?.escapeHtml() ?: "") }
                            div("waiting-animation") { +"..." }
                        }
                    }
                }

                GamePhase.GUESSING -> {
                    if (isCurrentPlayer) {
                        div("phase-info") {
                            h2 { +"phase.guessing.waitingGuesses".t(lang) }
                            p { tr("phase.guessing.youPlaced", lang, game.currentMarblesPlaced) }
                            val guessedCount = game.connectedActivePlayers.count { it.currentGuess != null && it.sessionId != sessionId }
                            val totalGuessers = game.connectedActivePlayers.count { it.sessionId != sessionId }
                            p { +"phase.guessing.guessCount".t(lang, guessedCount, totalGuessers) }
                        }
                    } else if (player?.isSpectator == true) {
                        div("phase-info") {
                            h2 { +"phase.guessing.spectating".t(lang) }
                            p { +"phase.guessing.outOfMarbles".t(lang) }
                        }
                    } else if (player?.currentGuess != null) {
                        div("phase-info") {
                            h2 { +"phase.guessing.waitingOthers".t(lang) }
                            p { tr("phase.guessing.youGuessed", lang, player.currentGuess.toString()) }
                        }
                    } else {
                        div("phase-info") {
                            h2 { +"phase.guessing.makeGuess".t(lang) }
                            p { tr("phase.guessing.prompt", lang, game.currentPlayer?.name?.escapeHtml() ?: "") }
                            div("guess-buttons") {
                                button(classes = "btn btn-even") {
                                    hxPost("$MARBLES/game/${game.id}/guess")
                                    hxVals("""{"guess":"EVEN"}""")
                                    hxSwap(HxSwapOption.NONE)
                                    +"guess.even".t(lang)
                                }
                                button(classes = "btn btn-odd") {
                                    hxPost("$MARBLES/game/${game.id}/guess")
                                    hxVals("""{"guess":"ODD"}""")
                                    hxSwap(HxSwapOption.NONE)
                                    +"guess.odd".t(lang)
                                }
                            }
                        }
                    }
                }

                GamePhase.ROUND_RESULT -> {
                    val result = game.lastRoundResult
                    div("phase-info result-phase") {
                        h2 { +"phase.result.title".t(lang) }
                        if (result != null) {
                            // Personalized result message for the current player
                            val isWinner = result.winnerSessionIds.contains(sessionId)
                            val isLoser = result.loserSessionIds.contains(sessionId)
                            val isPlacer = result.placerSessionId == sessionId

                            when {
                                isWinner -> {
                                    div("personal-result winner") {
                                        +"phase.result.youWon".t(lang, result.marblesWonPerWinner)
                                    }
                                }
                                isLoser -> {
                                    div("personal-result loser") {
                                        +"phase.result.youLost".t(lang, result.marblesPlaced)
                                    }
                                }
                                isPlacer -> {
                                    val netChange = -result.marblesLostByPlacer // Positive = gained, Negative = lost
                                    val placerClass = if (netChange >= 0) "winner" else "loser"
                                    div("personal-result $placerClass") {
                                        if (netChange > 0) {
                                            +"phase.result.youGained".t(lang, netChange)
                                        } else if (netChange < 0) {
                                            +"phase.result.youLostMarbles".t(lang, -netChange)
                                        } else {
                                            +"phase.result.youBrokeEven".t(lang)
                                        }
                                    }
                                }
                            }

                            div("result-card") {
                                p { tr("phase.result.placed", lang, result.placerName.escapeHtml(), result.marblesPlaced) }
                                p("result-answer") {
                                    tr(if (result.wasEven) "phase.result.wasEven" else "phase.result.wasOdd", lang)
                                }
                                if (result.winners.isNotEmpty()) {
                                    p("winners") {
                                        +"phase.result.winners".t(
                                            lang,
                                            result.winners.joinToString(", ") { it.escapeHtml() },
                                            result.marblesWonPerWinner,
                                        )
                                    }
                                }
                                if (result.losers.isNotEmpty()) {
                                    p("losers") {
                                        +"phase.result.losers".t(lang, result.losers.joinToString(", ") { it.escapeHtml() })
                                    }
                                }
                            }
                        }
                        // Countdown indicator instead of button
                        val remainingSeconds = game.roundResultCooldownRemaining()
                        div("result-countdown") {
                            attributes["data-seconds"] = remainingSeconds.toString()
                            +"phase.result.nextRoundIn".t(lang)
                            +" "
                            span("countdown-timer") { +"$remainingSeconds" }
                        }
                    }
                }

                GamePhase.GAME_OVER -> {
                    val winner = game.getWinner()
                    div("phase-info game-over") {
                        h2 { +"phase.gameOver.title".t(lang) }
                        if (winner != null) {
                            div("winner-announcement") {
                                p("winner-text") { +"phase.gameOver.winner".t(lang, winner.name.escapeHtml(), winner.marbles) }
                                if (winner.sessionId == sessionId) {
                                    p("you-won") { +"phase.gameOver.youWon".t(lang) }
                                } else {
                                    p("you-lost") { +"phase.gameOver.youLost".t(lang) }
                                }
                            }
                        }
                        // Only host can start a new game
                        if (isCreator) {
                            button(classes = "btn btn-primary") {
                                hxPost("$MARBLES/game/${game.id}/new-game")
                                hxSwap(HxSwapOption.NONE)
                                +"button.playAgain".t(lang)
                            }
                        } else {
                            val hostName = game.players[game.creatorSessionId]?.name?.escapeHtml() ?: "Host"
                            p("waiting-for-host") { +"phase.gameOver.waitingForHost".t(lang, hostName) }
                        }
                    }
                }
            }
        }

        // Your status
        val isPending = game.pendingPlayers.any { it.sessionId == sessionId }
        if (player != null) {
            div("your-status") {
                if (isPending) {
                    span { tr("status.watching", lang) }
                    span("pending-badge") { +"status.pending".t(lang) }
                } else {
                    span { tr("status.yourMarbles", lang, player.marbles) }
                    if (player.isSpectator) {
                        span("spectator-badge") { +"players.spectator".t(lang) }
                    }
                }
            }
        }
    }
}
