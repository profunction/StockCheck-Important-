package com.stockcheck.app.model

import kotlin.math.abs

/**
 * A counted amount, held as thousandths of a unit.
 *
 * Half a kilo of vegetables is 500. Twenty-four tins is 24_000. The app used
 * to hold a whole number of pieces, which is fine until somebody weighs
 * something, and a supermarket weighs a great deal.
 *
 * Not a Double, for the same reason money here is not one: 0.1 + 0.2 is
 * 0.30000000000000004, and a count that adds three weighed trays and reports
 * a variance of 0.0000000000000004 against a sheet that says 0.6 is a count
 * nobody will trust again. Three decimal places is grams against a kilogram
 * and millilitres against a litre, which is finer than any shop scale in the
 * country reads.
 *
 * Everything here is Long arithmetic, which is exact, and the only division
 * is in [format] where the answer is a string for a human rather than a value
 * anything downstream does arithmetic on.
 */
object Quantity {

    /** One whole unit: one tin, one kilogram, one litre. */
    const val UNIT = 1_000L

    /** How many decimal places [UNIT] affords. */
    private const val PLACES = 3

    /**
     * Reads what somebody typed, or null when it is not a quantity.
     *
     * Accepts "24", "0.5", ".5", "1,5" -- the comma because half of Malaysia
     * writes a decimal that way and a keyboard offers whichever the phone's
     * locale prefers. Refuses anything with more than [PLACES] decimals
     * rather than rounding it silently: somebody typing 0.3333 means a third
     * of something, and quietly storing 0.333 makes three of them fail to add
     * up to one in a way nobody can see.
     */
    fun parse(text: String): Long? {
        val cleaned = text.trim().replace(',', '.')
        if (cleaned.isEmpty()) return null
        if (!cleaned.matches(Regex("""-?\d*\.?\d*"""))) return null

        val negative = cleaned.startsWith('-')
        val body = cleaned.removePrefix("-")
        if (body.isEmpty() || body == ".") return null

        val whole = body.substringBefore('.').ifEmpty { "0" }
        val fraction = body.substringAfter('.', "")
        if (fraction.length > PLACES) return null

        val wholePart = whole.toLongOrNull() ?: return null
        // Pad rather than parse-and-scale: "5" after the point is 500
        // thousandths, not 5, and the difference is a factor of a hundred.
        val fractionPart = fraction.padEnd(PLACES, '0').toLongOrNull() ?: return null

        // A count of a billion tins is not a count, it is a typo, and letting
        // it through overflows the multiplication below on the way in.
        if (wholePart > MAX_WHOLE) return null

        val total = wholePart * UNIT + fractionPart
        return if (negative) -total else total
    }

    /**
     * The form a person reads, with no more decimals than the value needs.
     *
     * 24_000 is "24", not "24.000" -- a shop counting tins should never be
     * shown three decimal places it did not ask for. 500 is "0.5". 1_250 is
     * "1.25".
     */
    fun format(milli: Long): String {
        val negative = milli < 0
        val size = abs(milli)
        val whole = size / UNIT
        val fraction = size % UNIT
        val sign = if (negative) "-" else ""
        if (fraction == 0L) return "$sign$whole"
        return "$sign$whole." + fraction.toString().padStart(PLACES, '0').trimEnd('0')
    }

    /** Same as [format], with the unit after it: "0.5 kg". */
    fun formatWith(milli: Long, unit: String): String =
        if (unit.isBlank()) format(milli) else "${format(milli)} $unit"

    /** A whole number of units, for the many places that still count pieces. */
    fun of(units: Int): Long = units * UNIT

    /**
     * What a quantity field should keep of what was typed.
     *
     * Called on every keystroke, so it returns text rather than a number: a
     * half-typed "1." is not a quantity yet and must still be allowed to sit
     * in the box. Filtering to digits alone — which is what these fields did
     * before — makes the decimal point unreachable, and a decimal point
     * nobody can type is a weighing feature nobody can use.
     *
     * A second separator is dropped rather than the input rejected, because
     * on a phone keyboard it is a slip rather than an intention.
     */
    fun filterInput(text: String, maxWhole: Int = 7): String {
        val whole = StringBuilder()
        val fraction = StringBuilder()
        var afterPoint = false
        text.forEach { ch ->
            when {
                ch == '.' || ch == ',' -> if (!afterPoint) afterPoint = true
                !ch.isDigit() -> Unit
                afterPoint -> if (fraction.length < PLACES) fraction.append(ch)
                else -> if (whole.length < maxWhole) whole.append(ch)
            }
        }
        return if (afterPoint) "$whole.$fraction" else whole.toString()
    }

    /**
     * The nearest whole unit, for the legacy `quantity` field only.
     *
     * Kept in step so that a copy of the app too old to know about
     * thousandths still shows roughly the right number instead of zero. It is
     * never read back by anything current.
     */
    fun toWholeUnits(milli: Long): Int =
        Math.floorDiv(milli + UNIT / 2, UNIT).toInt()

    /** Beyond this a count is a typo, and the scaling below would overflow. */
    private const val MAX_WHOLE = 9_000_000_000_000L
}
