package com.stockcheck.app.model

/** One point of a signature stroke, in a 0..1 square. */
data class InkPoint(val x: Float, val y: Float)

/**
 * A drawn signature, stored as strokes rather than as an image.
 *
 * The obvious implementation saves a PNG next to the photos. That would put
 * the one thing a signature exists to prove — that a named person approved
 * this count — on a single warehouse phone, where it dies with the phone, the
 * same way the photos already do. Strokes are text: a full signature is one or
 * two kilobytes, small enough to live in the stock item itself, which means it
 * syncs, an admin can see it in History, and a lost phone loses nothing.
 *
 * Coordinates are normalised to 0..1 and written as integers per mille, so the
 * signature redraws at whatever size it is shown at and the encoding does not
 * depend on the screen it was captured on.
 *
 * Format: strokes separated by `;`, points by ` `, each point `x,y`.
 * Deliberately free of Android types so the round trip can be tested.
 */
object SignatureInk {

    private const val SCALE = 1000f

    fun encode(strokes: List<List<InkPoint>>): String =
        strokes
            .filter { it.isNotEmpty() }
            .joinToString(";") { stroke ->
                stroke.joinToString(" ") { point ->
                    "${quantise(point.x)},${quantise(point.y)}"
                }
            }

    fun decode(raw: String): List<List<InkPoint>> {
        if (raw.isBlank()) return emptyList()
        return raw.split(';').mapNotNull { strokeText ->
            val points = strokeText.trim().split(' ').mapNotNull { pointText ->
                val parts = pointText.split(',')
                if (parts.size != 2) return@mapNotNull null
                val x = parts[0].toIntOrNull() ?: return@mapNotNull null
                val y = parts[1].toIntOrNull() ?: return@mapNotNull null
                InkPoint(x / SCALE, y / SCALE)
            }
            points.ifEmpty { null }
        }
    }

    /** True when there is enough ink to be a signature rather than a stray tap. */
    fun isSigned(raw: String): Boolean = decode(raw).sumOf { it.size } >= MIN_POINTS

    /**
     * Drops points too close to the previous one.
     *
     * A drag delivers a point per frame; at sixty a second a three-second
     * signature is nearly two hundred points of which most sit on top of each
     * other. Thinning keeps the shape and roughly halves the stored size.
     */
    fun thin(stroke: List<InkPoint>, minStep: Float = 0.004f): List<InkPoint> {
        if (stroke.size < 3) return stroke
        val kept = mutableListOf(stroke.first())
        stroke.drop(1).forEach { point ->
            val last = kept.last()
            val dx = point.x - last.x
            val dy = point.y - last.y
            if (dx * dx + dy * dy >= minStep * minStep) kept += point
        }
        // The final point ends the stroke where the finger actually lifted.
        if (kept.last() != stroke.last()) kept += stroke.last()
        return kept
    }

    private fun quantise(value: Float): Int =
        (value.coerceIn(0f, 1f) * SCALE).toInt()

    private const val MIN_POINTS = 4

    /**
     * The key under which a field's drawn strokes are stored.
     *
     * The field's own value stays human-readable — a name and a timestamp —
     * because that is what a CSV column can carry. The ink rides alongside it
     * under a key no template field can produce, since `#` is not allowed in a
     * field key.
     */
    fun inkKeyFor(fieldKey: String): String = "$INK_PREFIX$fieldKey"

    fun isInkKey(key: String): Boolean = key.startsWith(INK_PREFIX)

    private const val INK_PREFIX = "ink#"
}
