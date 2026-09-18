package de.mw.blackjack.models

/**
 * Wall clock, in milliseconds. The game logic is shared with the browser, which has
 * no `System.currentTimeMillis`.
 */
expect fun nowMillis(): Long
