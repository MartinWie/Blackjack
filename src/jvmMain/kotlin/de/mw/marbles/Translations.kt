package de.mw.marbles

import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.header

/**
 * Internationalization (i18n) support for the Marble Game.
 */
object Translations {
    private val strings =
        mapOf(
            "en" to
                mapOf(
                    "game.title" to "Marble Game",
                    "button.share" to "Share",
                    "button.qr" to "QR",
                    "button.sound.on" to "Sound On",
                    "button.sound.off" to "Sound Off",
                    "button.copied" to "Copied!",
                    "share.text" to "Join my game!",
                    "home.title" to "Marbles",
                    "home.createGame" to "Start Game",
                    "home.createGameHint" to "Quick marble rounds with friends.",
                    "home.yourName" to "Your Name:",
                    "home.namePlaceholder" to "Enter your name",
                    "button.create" to "Start Game",
                    "error.gameNotFound" to "Game not found. It may have ended or the URL is invalid.",
                    "join.title" to "Join Game",
                    "join.spectatorHint" to "Game in progress - you'll join as a spectator and play in the next round!",
                    "button.join" to "Join Game",
                    "button.joinSpectator" to "Join as Spectator",
                    "button.goBack" to "Go back",
                    "players.title" to "Players",
                    "players.you" to "(You)",
                    "players.current" to "(Current)",
                    "players.offline" to "(Offline)",
                    "players.marbles" to "marbles",
                    "players.spectator" to "Spectator",
                    "players.guessed" to "Guessed!",
                    "players.reconnecting" to "Reconnecting...",
                    "players.disconnected" to "Disconnected",
                    "players.joiningNextRound" to "Joining Next Round",
                    "players.spectatorJoining" to "Spectator - Joining next round",
                    "phase.waiting.title" to "Waiting for Players",
                    "phase.waiting.playerCount" to "Players: %d (%d connected)",
                    "button.startGame" to "Start Game",
                    "phase.waiting.needPlayers" to "Need at least 2 connected players to start",
                    "phase.waiting.waitingHost" to "Waiting for <strong>%s</strong> to start the game...",
                    "phase.placing.yourTurn" to "Your Turn",
                    "phase.placing.instruction" to "How many marbles do you play?",
                    "phase.placing.count" to "<span id=\"selected-count\">1</span> marble(s)",
                    "button.placeMarbles" to "Play",
                    "phase.placing.waiting" to "Waiting...",
                    "phase.placing.deciding" to "<strong>%s</strong> is playing...",
                    "phase.guessing.waitingGuesses" to "Waiting for Guesses",
                    "phase.guessing.youPlaced" to "You played <strong>%d</strong> marble(s). Waiting for guesses...",
                    "phase.guessing.guessCount" to "Guesses: %d / %d",
                    "phase.guessing.spectating" to "Spectating",
                    "phase.guessing.outOfMarbles" to "You're out of marbles! Watch and wait for the next round.",
                    "phase.guessing.waitingOthers" to "Waiting for Others",
                    "phase.guessing.youGuessed" to "You guessed <strong>%s</strong>. Waiting for others...",
                    "phase.guessing.makeGuess" to "Your Guess!",
                    "phase.guessing.prompt" to "<strong>%s</strong> played marbles. Even or odd?",
                    "guess.even" to "EVEN",
                    "guess.odd" to "ODD",
                    "phase.result.title" to "Result",
                    "phase.result.placed" to "<strong>%s</strong> played <strong>%d</strong> marble(s)",
                    "phase.result.wasEven" to "It was <strong>EVEN</strong>!",
                    "phase.result.wasOdd" to "It was <strong>ODD</strong>!",
                    "phase.result.winners" to "Winners: %s (+%d each)",
                    "phase.result.losers" to "Lost their bet: %s",
                    "phase.result.youWon" to "You won! +%d marbles",
                    "phase.result.youLost" to "You lost! -%d marbles",
                    "phase.result.youGained" to "You gained +%d marbles",
                    "phase.result.youLostMarbles" to "You lost -%d marbles",
                    "phase.result.youBrokeEven" to "You broke even",
                    "phase.result.nextRoundIn" to "Next round in",
                    "button.continue" to "Continue",
                    "phase.gameOver.title" to "Game Over!",
                    "phase.gameOver.winner" to "%s wins with %d marbles!",
                    "phase.gameOver.youWon" to "Congratulations! You won!",
                    "phase.gameOver.youLost" to "Better luck next time!",
                    "phase.gameOver.waitingForHost" to "Waiting for %s to start a new game...",
                    "button.playAgain" to "Play Again",
                    "status.watching" to "Watching - <strong>You'll join next round!</strong>",
                    "status.pending" to "Pending",
                    "status.yourMarbles" to "Your marbles: <strong>%d</strong>",
                    "cookie.message" to "We use cookies to analyze site usage and improve your experience.",
                    "cookie.accept" to "Accept",
                    "cookie.reject" to "Reject",
                    "footer.allGames" to "All games",
                    "footer.newGame" to "New Game",
                    "footer.imprint" to "Imprint",
                    "footer.privacy" to "Privacy Policy",
                    "footer.support" to "Support",
                    "imprint.headline" to "Information according to § 5 TMG",
                    "imprint.hobbyProject" to "This is a private, non-commercial hobby project.",
                    "imprint.contact" to "Contact",
                    "imprint.email" to "Email: info-7mw@googlegroups.com",
                    "imprint.liabilityContent" to "Liability for Content",
                    "imprint.liabilityContentText" to
                        "As a service provider, we are responsible for our own content on these pages in accordance with § 7 para.1 TMG. The contents have been created with the utmost care. However, no guarantee can be given for the accuracy, completeness and timeliness of the content.",
                    "imprint.liabilityLinks" to "Liability for Links",
                    "imprint.liabilityLinksText" to
                        "This website contains links to external third-party websites over whose content we have no influence. The respective provider is always responsible for the content of the linked pages.",
                    "privacy.headline" to "Privacy Policy",
                    "privacy.controller" to "1. Data Controller",
                    "privacy.controllerText" to "Responsible for data processing on this website:",
                    "privacy.controllerEmail" to "Email: info-7mw@googlegroups.com",
                    "privacy.hobbyProject" to "This is a private, non-commercial hobby project.",
                    "privacy.dataCollected" to "2. Data Collected",
                    "privacy.dataCollectedText" to "This website processes the following data:",
                    "privacy.dataSession" to
                        "Session cookies: Technically necessary for game functionality. Deleted when browser is closed.",
                    "privacy.dataPlayer" to "Player name: Only stored temporärily in memory during gameplay, not persisted.",
                    "privacy.dataAnalytics" to "Usage statistics: Only with your explicit consent via PostHog (servers in the EU).",
                    "privacy.legalBasis" to "3. Legal Basis",
                    "privacy.legalBasisText" to "Processing is based on:",
                    "privacy.legalBasisNecessary" to "Art. 6(1)(f) GDPR (legitimate interest) for technically necessary cookies",
                    "privacy.legalBasisConsent" to "Art. 6(1)(a) GDPR (consent) for analytics cookies",
                    "privacy.retention" to "4. Retention Period",
                    "privacy.retentionText" to
                        "Session data is deleted when you close the browser. Player names are deleted when the game ends. Analytics data is stored according to PostHog policies.",
                    "privacy.rights" to "5. Your Rights",
                    "privacy.rightsText" to "You have the following rights:",
                    "privacy.rightsAccess" to "Access to your stored data (Art. 15 GDPR)",
                    "privacy.rightsRectification" to "Rectification of inaccurate data (Art. 16 GDPR)",
                    "privacy.rightsErasure" to "Erasure of your data (Art. 17 GDPR)",
                    "privacy.rightsRestriction" to "Restriction of processing (Art. 18 GDPR)",
                    "privacy.rightsWithdraw" to "Withdraw consent at any time (Art. 7 GDPR)",
                    "privacy.rightsComplaint" to "Lodge a complaint with a supervisory authority (Art. 77 GDPR)",
                    "privacy.cookies" to "6. Cookies",
                    "privacy.cookiesText" to
                        "We use technically necessary session cookies for game functionality. Analytics cookies (PostHog) are only set with your explicit consent. You can withdraw your consent at any time.",
                    "privacy.thirdParties" to "7. Third Parties",
                    "privacy.thirdPartiesText" to
                        "PostHog (Analytics): Data is processed on servers in the European Union. More information: posthog.com/privacy",
                ),
            "de" to
                mapOf(
                    "game.title" to "Murmelspiel",
                    "button.share" to "Teilen",
                    "button.qr" to "QR",
                    "button.sound.on" to "Sound an",
                    "button.sound.off" to "Sound aus",
                    "button.copied" to "Kopiert!",
                    "share.text" to "Spiel mit mir!",
                    "home.title" to "Marbles",
                    "home.createGame" to "Spiel starten",
                    "home.createGameHint" to "Schnelle Murmelrunden mit Freunden.",
                    "home.yourName" to "Dein Name:",
                    "home.namePlaceholder" to "Name eingeben",
                    "button.create" to "Spiel starten",
                    "error.gameNotFound" to "Spiel nicht gefunden.",
                    "join.title" to "Spiel beitreten",
                    "join.spectatorHint" to "Spiel läuft - du spielst nächste Runde mit!",
                    "button.join" to "Beitreten",
                    "button.joinSpectator" to "Als Zuschauer beitreten",
                    "button.goBack" to "Zurück",
                    "players.title" to "Spieler",
                    "players.you" to "(Du)",
                    "players.current" to "(Am Zug)",
                    "players.offline" to "(Offline)",
                    "players.marbles" to "Murmeln",
                    "players.spectator" to "Zuschauer",
                    "players.guessed" to "Geraten!",
                    "players.reconnecting" to "Verbindet...",
                    "players.disconnected" to "Getrennt",
                    "players.joiningNextRound" to "Nachste Runde dabei",
                    "players.spectatorJoining" to "Zuschauer - Spielt nächste Runde mit",
                    "phase.waiting.title" to "Warte auf Spieler",
                    "phase.waiting.playerCount" to "Spieler: %d (%d verbunden)",
                    "button.startGame" to "Spiel starten",
                    "phase.waiting.needPlayers" to "Mindestens 2 verbundene Spieler benötigt",
                    "phase.waiting.waitingHost" to "Warte auf <strong>%s</strong>...",
                    "phase.placing.yourTurn" to "Du bist dran",
                    "phase.placing.instruction" to "Wie viele Murmeln spielst du?",
                    "phase.placing.count" to "<span id=\"selected-count\">1</span> Murmel(n)",
                    "button.placeMarbles" to "Spielen",
                    "phase.placing.waiting" to "Warten...",
                    "phase.placing.deciding" to "<strong>%s</strong> spielt...",
                    "phase.guessing.waitingGuesses" to "Warte auf Antworten",
                    "phase.guessing.youPlaced" to "Du hast <strong>%d</strong> Murmel(n) gespielt. Warte auf die anderen...",
                    "phase.guessing.guessCount" to "Antworten: %d / %d",
                    "phase.guessing.spectating" to "Zuschauen",
                    "phase.guessing.outOfMarbles" to "Keine Murmeln mehr! Warte auf die nächste Runde.",
                    "phase.guessing.waitingOthers" to "Warte auf andere",
                    "phase.guessing.youGuessed" to "Du hast <strong>%s</strong> getippt. Warte auf die anderen...",
                    "phase.guessing.makeGuess" to "Dein Tipp!",
                    "phase.guessing.prompt" to "<strong>%s</strong> hat gespielt. Gerade oder ungerade?",
                    "guess.even" to "GERADE",
                    "guess.odd" to "UNGERADE",
                    "phase.result.title" to "Ergebnis",
                    "phase.result.placed" to "<strong>%s</strong> hatte <strong>%d</strong> Murmel(n)",
                    "phase.result.wasEven" to "Es war <strong>GERADE</strong>!",
                    "phase.result.wasOdd" to "Es war <strong>UNGERADE</strong>!",
                    "phase.result.winners" to "Gewinner: %s (+%d pro Person)",
                    "phase.result.losers" to "Verloren: %s",
                    "phase.result.youWon" to "Gewonnen! +%d Murmeln",
                    "phase.result.youLost" to "Verloren! -%d Murmeln",
                    "phase.result.youGained" to "Du hast +%d Murmeln gewonnen",
                    "phase.result.youLostMarbles" to "Du hast -%d Murmeln verloren",
                    "phase.result.youBrokeEven" to "Unentschieden",
                    "phase.result.nextRoundIn" to "Nachste Runde in",
                    "button.continue" to "Weiter",
                    "phase.gameOver.title" to "Spiel vorbei!",
                    "phase.gameOver.winner" to "%s gewinnt mit %d Murmeln!",
                    "phase.gameOver.youWon" to "Du hast gewonnen!",
                    "phase.gameOver.youLost" to "Vielleicht beim nächsten Mal!",
                    "phase.gameOver.waitingForHost" to "Warte auf %s für ein neues Spiel...",
                    "button.playAgain" to "Nochmal spielen",
                    "status.watching" to "Zuschauer - <strong>Du spielst nächste Runde mit!</strong>",
                    "status.pending" to "Wartend",
                    "status.yourMarbles" to "Deine Murmeln: <strong>%d</strong>",
                    "cookie.message" to "Wir nutzen Cookies zur Analyse und Verbesserung der Website.",
                    "cookie.accept" to "Akzeptieren",
                    "cookie.reject" to "Ablehnen",
                    "footer.allGames" to "Alle Spiele",
                    "footer.newGame" to "Neues Spiel",
                    "footer.imprint" to "Impressum",
                    "footer.privacy" to "Datenschutz",
                    "footer.support" to "Unterstützen",
                    "imprint.headline" to "Angaben gemäß § 5 TMG",
                    "imprint.hobbyProject" to "Dies ist ein privates, nicht-kommerzielles Hobbyprojekt.",
                    "imprint.contact" to "Kontakt",
                    "imprint.email" to "E-Mail: info-7mw@googlegroups.com",
                    "imprint.liabilityContent" to "Haftung für Inhalte",
                    "imprint.liabilityContentText" to
                        "Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Die Inhalte wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte kann jedoch keine Gewähr übernommen werden.",
                    "imprint.liabilityLinks" to "Haftung für Links",
                    "imprint.liabilityLinksText" to
                        "Diese Website enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter verantwortlich.",
                    "privacy.headline" to "Datenschutzerklärung",
                    "privacy.controller" to "1. Verantwortlicher",
                    "privacy.controllerText" to "Verantwortlich für die Datenverarbeitung auf dieser Website:",
                    "privacy.controllerEmail" to "E-Mail: info-7mw@googlegroups.com",
                    "privacy.hobbyProject" to "Dies ist ein privates, nicht-kommerzielles Hobbyprojekt.",
                    "privacy.dataCollected" to "2. Erhobene Daten",
                    "privacy.dataCollectedText" to "Diese Website verarbeitet folgende Daten:",
                    "privacy.dataSession" to
                        "Session-Cookies: Technisch notwendig für die Spielfunktion. Werden nach Schließen des Browsers gelöscht.",
                    "privacy.dataPlayer" to
                        "Spielername: Wird nur temporär während des Spiels im Arbeitsspeicher gespeichert, nicht dauerhaft.",
                    "privacy.dataAnalytics" to
                        "Nutzungsstatistiken: Nur mit Ihrer ausdrücklichen Zustimmung via PostHog (Server in der EU).",
                    "privacy.legalBasis" to "3. Rechtsgrundlage",
                    "privacy.legalBasisText" to "Die Verarbeitung erfolgt auf Basis von:",
                    "privacy.legalBasisNecessary" to "Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse) für technisch notwendige Cookies",
                    "privacy.legalBasisConsent" to "Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) für Analyse-Cookies",
                    "privacy.retention" to "4. Speicherdauer",
                    "privacy.retentionText" to
                        "Session-Daten werden gelöscht, wenn Sie den Browser schliessen. Spielnamen werden gelöscht, wenn das Spiel endet. Analyse-Daten werden gemäß PostHog-Richtlinien gespeichert.",
                    "privacy.rights" to "5. Ihre Rechte",
                    "privacy.rightsText" to "Sie haben folgende Rechte:",
                    "privacy.rightsAccess" to "Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)",
                    "privacy.rightsRectification" to "Berichtigung unrichtiger Daten (Art. 16 DSGVO)",
                    "privacy.rightsErasure" to "Loschung Ihrer Daten (Art. 17 DSGVO)",
                    "privacy.rightsRestriction" to "Einschränkung der Verarbeitung (Art. 18 DSGVO)",
                    "privacy.rightsWithdraw" to "Widerruf Ihrer Einwilligung jederzeit (Art. 7 DSGVO)",
                    "privacy.rightsComplaint" to "Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)",
                    "privacy.cookies" to "6. Cookies",
                    "privacy.cookiesText" to
                        "Wir verwenden technisch notwendige Session-Cookies für die Spielfunktion. Analyse-Cookies (PostHog) werden nur mit Ihrer ausdrücklichen Zustimmung gesetzt. Sie können Ihre Einwilligung jederzeit widerrufen.",
                    "privacy.thirdParties" to "7. Drittanbieter",
                    "privacy.thirdPartiesText" to
                        "PostHog (Analyse): Daten werden auf Servern in der Europäischen Union verarbeitet. Mehr Informationen: posthog.com/privacy",
                ),
        )

    fun get(
        lang: String,
        key: String,
        vararg args: Any,
    ): String {
        val template =
            strings[lang]?.get(key)
                ?: strings["en"]?.get(key)
                ?: return key
        return if (args.isEmpty()) template else template.format(*args)
    }
}

fun ApplicationCall.getLanguage(): String {
    val acceptLanguage = request.header("Accept-Language") ?: return "en"
    return acceptLanguage
        .split(",")
        .firstOrNull()
        ?.split("-")
        ?.firstOrNull()
        ?.split(";")
        ?.firstOrNull()
        ?.lowercase()
        ?.takeIf { it.length == 2 }
        ?: "en"
}

fun String.t(
    lang: String,
    vararg args: Any,
): String = Translations.get(lang, this, *args)

fun kotlinx.html.FlowOrPhrasingContent.tr(
    key: String,
    lang: String,
    vararg args: Any,
) {
    consumer.onTagContentUnsafe { +key.t(lang, *args) }
}
