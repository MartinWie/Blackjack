package de.mw.marbles

import kotlinx.html.HTMLTag
import kotlinx.html.TagConsumer
import kotlinx.html.stream.appendHTML

internal enum class HxSwapOption(val value: String) { NONE("none") }

internal fun HTMLTag.hxPost(url: String) { attributes["hx-post"] = url }

internal fun HTMLTag.hxTarget(target: String) { attributes["hx-target"] = target }

internal fun HTMLTag.hxSwap(option: HxSwapOption) { attributes["hx-swap"] = option.value }

internal fun HTMLTag.hxVals(json: String) { attributes["hx-vals"] = json }

internal fun buildHTMLString(builderAction: TagConsumer<StringBuilder>.() -> Unit): String =
    buildString { appendHTML().builderAction() }
