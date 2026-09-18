package de.mw.blackjack.models

actual fun nowMillis(): Long = kotlin.js.Date.now().toLong()
