package de.mw.marbles

internal object RealtimeConfig {
    private const val ENV_ALLOWED_ORIGINS = "REALTIME_ALLOWED_ORIGINS"
    private const val ENV_ALLOW_NULL_ORIGIN = "REALTIME_ALLOW_NULL_ORIGIN"
    private const val PROP_ALLOWED_ORIGINS = "realtime.allowed.origins"
    private const val PROP_ALLOW_NULL_ORIGIN = "realtime.allow.null.origin"

    val allowedOrigins: Set<String>
        get() = parseAllowedOrigins(rawAllowedOrigins())

    val allowNullOrigin: Boolean
        get() = parseBoolean(rawAllowNullOrigin(), default = false)

    private fun rawAllowedOrigins(): String = System.getProperty(PROP_ALLOWED_ORIGINS) ?: System.getenv(ENV_ALLOWED_ORIGINS) ?: ""

    private fun rawAllowNullOrigin(): String = System.getProperty(PROP_ALLOW_NULL_ORIGIN) ?: System.getenv(ENV_ALLOW_NULL_ORIGIN) ?: ""

    internal fun parseAllowedOrigins(raw: String): Set<String> =
        raw
            .split(',')
            .asSequence()
            .map { it.trim().removeSuffix("/").lowercase() }
            .filter { it.isNotBlank() }
            .toSet()

    internal fun parseBoolean(
        raw: String,
        default: Boolean,
    ): Boolean =
        when (raw.trim().lowercase()) {
            "1", "true", "yes", "on" -> true
            "0", "false", "no", "off" -> false
            else -> default
        }
}
