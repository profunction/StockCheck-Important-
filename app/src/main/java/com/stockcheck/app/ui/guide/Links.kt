package com.stockcheck.app.ui.guide

/**
 * The family's websites. One place, so a new domain is one change here (and
 * SITE in site/content.mjs on the web side).
 */
object Links {
    const val SITE = "https://stockcheck-fb58e.web.app"
    const val POS = "$SITE/pos/"
    const val WAREHOUSE = "$SITE/warehouse/"
    const val GUIDE = "$SITE/guide/"

    /** A guide video, filmed by tools/videos/record.mjs and served from web/videos/. */
    fun video(name: String) = "$SITE/videos/$name.webm"
}
