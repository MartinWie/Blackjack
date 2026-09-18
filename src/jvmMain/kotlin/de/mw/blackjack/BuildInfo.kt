package de.mw.blackjack

/**
 * Cache-busting for static assets. A build id in the query string means a deploy is
 * visible immediately even though the service worker caches aggressively.
 */
object BuildInfo {
    val id: String = System.getenv("BJ_BUILD_ID") ?: System.currentTimeMillis().toString(36)

    fun asset(path: String): String = "$path?v=$id"
}
