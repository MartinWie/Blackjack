package de.mw.marbles

import qrcode.QRCode
import qrcode.color.Colors
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

object QRCodeService {
    private const val LOGO_SIZE = 96

    private fun resizedLogoBytes(
        originalBytes: ByteArray,
        size: Int,
    ): ByteArray {
        val input = ImageIO.read(ByteArrayInputStream(originalBytes)) ?: return originalBytes
        val output = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
        val g = output.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.drawImage(input, 0, 0, size, size, null)
        g.dispose()

        val baos = ByteArrayOutputStream()
        ImageIO.write(output, "png", baos)
        return baos.toByteArray()
    }

    fun create(link: String): ByteArray {
        val logoBytes =
            javaClass
                .getResourceAsStream("/static/marbles/icon-192.png")
                ?.readBytes()
                ?.let { resizedLogoBytes(it, LOGO_SIZE) }

        val qrCode =
            QRCode
                .ofRoundedSquares()
                .withSize(14)
                .withColor(Colors.css("#d6dbe6"))
                .withBackgroundColor(Colors.css("#161a26"))
                .withRadius(7)
                .withInnerSpacing(1)
                .withLogo(
                    logoBytes,
                    LOGO_SIZE,
                    LOGO_SIZE,
                    clearLogoArea = true,
                ).build(link)

        return qrCode.renderToBytes()
    }
}
