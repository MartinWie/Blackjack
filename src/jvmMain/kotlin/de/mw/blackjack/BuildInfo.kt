package de.mw.blackjack

import java.io.File
import java.util.zip.CRC32

/**
 * Cache-busting for static assets. A build id in the query string means a deploy is
 * visible immediately even though the service worker caches aggressively.
 *
 * BJ_BUILD_ID wins when it is a real value. Otherwise the id is a checksum of the
 * running jar: the same across restarts of one build, new with every build. (Dokploy
 * passes no build args, so the Dockerfile's placeholder "docker" used to stay the same
 * forever and phones kept running old scripts.)
 */
object BuildInfo {
    val id: String = System.getenv("BJ_BUILD_ID")?.takeIf { it.isNotBlank() && it != "docker" }
        ?: jarChecksum()
        ?: System.currentTimeMillis().toString(36)

    fun asset(path: String): String = "$path?v=$id"

    private fun jarChecksum(): String? = runCatching {
        val file = File(BuildInfo::class.java.protectionDomain.codeSource.location.toURI())
        if (!file.isFile) return null
        val crc = CRC32()
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(1 shl 16)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                crc.update(buffer, 0, n)
            }
        }
        crc.value.toString(36)
    }.getOrNull()
}
