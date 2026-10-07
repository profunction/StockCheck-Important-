package com.stockcheck.app.scan

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.nfc.NfcAdapter
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext

/**
 * NFC tags and cards as codes.
 *
 * A tag's id is written the same way everywhere -- here, on the POS website
 * and in what the API accepts -- so a tag tapped on a phone finds the
 * product or member card it was bound to on the computer: upper-case hex,
 * no separators, e.g. 04A2B3C4D5E6F7.
 *
 * Pure, so it is tested on its own.
 */
object NfcIds {

    fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02X".format(it) }

    private val SEPARATED = Regex("""^([0-9A-Fa-f]{2}[:\- ]?){4,10}$""")

    /**
     * "04:a2:b3:c4" (how Chrome's Web NFC writes it) -> "04A2B3C4". Anything
     * that is not a run of hex byte pairs is left as it came.
     */
    fun normalize(raw: String): String {
        val text = raw.trim()
        return if (SEPARATED.matches(text)) text.replace(Regex("[:\\- ]"), "").uppercase() else text
    }
}

/**
 * Reads NFC tags while it is on screen, and hands each tag's id to [onTag].
 *
 * Reader mode rather than intent dispatch: the tap goes to this screen and
 * nowhere else -- no "open with" chooser, no browser opening a URL written on
 * the tag. A phone without NFC, or with it switched off, simply never calls.
 */
@Composable
fun NfcTagReader(enabled: Boolean = true, onTag: (String) -> Unit) {
    val context = LocalContext.current
    val current by rememberUpdatedState(onTag)
    DisposableEffect(enabled, context) {
        val activity = context.findActivity()
        val adapter = activity?.let { NfcAdapter.getDefaultAdapter(it) }
        if (!enabled || activity == null || adapter == null || !adapter.isEnabled) {
            return@DisposableEffect onDispose { }
        }
        val main = Handler(Looper.getMainLooper())
        var last = ""
        var lastAt = 0L
        adapter.enableReaderMode(
            activity,
            { tag ->
                val id = NfcIds.hex(tag.id ?: return@enableReaderMode)
                val now = System.currentTimeMillis()
                // A tag held to the phone can be read twice in a blink.
                if (id == last && now - lastAt < DEBOUNCE_MS) return@enableReaderMode
                last = id
                lastAt = now
                main.post { current(id) }
            },
            NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V,
            null,
        )
        onDispose { runCatching { adapter.disableReaderMode(activity) } }
    }
}

private const val DEBOUNCE_MS = 1500L

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
