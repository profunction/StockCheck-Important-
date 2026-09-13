package com.stockcheck.app.scan

/**
 * What a spoken phrase was understood to mean.
 *
 * The parser never guesses silently: when it cannot find a quantity it says so,
 * and the caller shows the raw transcript for the operator to correct rather
 * than recording a number nobody said.
 */
sealed interface VoiceCommand {
    /** e.g. "Coca Cola twenty five" or "可乐 数量 25". */
    data class Count(
        val productName: String,
        val quantity: Int,
        val unit: String?,
        val transcript: String,
    ) : VoiceCommand

    /** A bare number: applies to the line currently selected. */
    data class QuantityOnly(val quantity: Int, val transcript: String) : VoiceCommand

    /** Spoken digits that look like a barcode. */
    data class Barcode(val barcode: String, val transcript: String) : VoiceCommand

    data class Unrecognised(val transcript: String, val reason: String) : VoiceCommand
}

/**
 * Turns a speech transcript into a stock-counting action.
 *
 * Deliberately a pure function of the transcript: no Android types, so the
 * whole grammar is unit-testable without a device, and so the same rules apply
 * whether the text arrives from speech recognition or is typed by hand.
 *
 * Handles English and Chinese, since that is what the warehouse floor this was
 * written for actually speaks — including mixed phrases like "可乐 25 boxes".
 */
object VoiceCommandParser {

    /** Words that introduce a quantity and are never part of a product name. */
    private val quantityMarkers = setOf(
        "数量", "共", "一共", "总共", "有",
        "quantity", "qty", "count", "total", "times",
    )

    /** Recognised units, mapped to the short form stored on the item. */
    private val unitWords: Map<String, String> = mapOf(
        "个" to "pcs", "件" to "pcs", "只" to "pcs", "支" to "pcs", "瓶" to "btl",
        "箱" to "ctn", "盒" to "box", "包" to "pack", "袋" to "bag", "打" to "dz",
        "公斤" to "kg", "千克" to "kg", "克" to "g", "斤" to "catty",
        "pcs" to "pcs", "piece" to "pcs", "pieces" to "pcs", "unit" to "pcs",
        "units" to "pcs", "box" to "box", "boxes" to "box", "carton" to "ctn",
        "cartons" to "ctn", "ctn" to "ctn", "pack" to "pack", "packs" to "pack",
        "bottle" to "btl", "bottles" to "btl", "bag" to "bag", "bags" to "bag",
        "dozen" to "dz", "kg" to "kg", "kilo" to "kg", "kilos" to "kg", "gram" to "g",
    )

    private val englishUnits = mapOf(
        "zero" to 0, "one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5,
        "six" to 6, "seven" to 7, "eight" to 8, "nine" to 9, "ten" to 10,
        "eleven" to 11, "twelve" to 12, "thirteen" to 13, "fourteen" to 14,
        "fifteen" to 15, "sixteen" to 16, "seventeen" to 17, "eighteen" to 18,
        "nineteen" to 19,
    )

    private val englishTens = mapOf(
        "twenty" to 20, "thirty" to 30, "forty" to 40, "fifty" to 50,
        "sixty" to 60, "seventy" to 70, "eighty" to 80, "ninety" to 90,
    )

    private val chineseDigits = mapOf(
        '零' to 0, '〇' to 0, '一' to 1, '二' to 2, '两' to 2, '兩' to 2, '三' to 3,
        '四' to 4, '五' to 5, '六' to 6, '七' to 7, '八' to 8, '九' to 9,
    )

    /** A run of digits at least this long is treated as a barcode, not a count. */
    private const val BARCODE_MIN_DIGITS = 8

    fun parse(transcript: String): VoiceCommand {
        val text = transcript.trim()
        if (text.isEmpty()) return VoiceCommand.Unrecognised(transcript, "Nothing was heard.")

        // Punctuation from the recogniser separates clauses but is never part of
        // a barcode or a number, so it is normalised to spaces up front.
        val normalised = text.replace(Regex("[,，。、;；:：!！?？]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

        longDigitRun(normalised)?.let { digits ->
            return VoiceCommand.Barcode(digits, transcript)
        }

        val quantity = findQuantity(normalised)
            ?: return VoiceCommand.Unrecognised(
                transcript,
                "No quantity was recognised in what was said.",
            )

        val unit = findUnit(normalised)
        val name = extractProductName(normalised, quantity.matchedText, unit)

        return if (name.isEmpty()) {
            VoiceCommand.QuantityOnly(quantity.value, transcript)
        } else {
            VoiceCommand.Count(name, quantity.value, unit, transcript)
        }
    }

    private data class Quantity(val value: Int, val matchedText: String)

    private fun longDigitRun(text: String): String? {
        // Speech recognisers often insert spaces between spoken digit groups,
        // so they are stripped before measuring the run.
        val compact = text.replace(" ", "")
        val match = Regex("\\d{$BARCODE_MIN_DIGITS,}").find(compact) ?: return null
        return match.value
    }

    private fun findQuantity(text: String): Quantity? {
        // An explicit marker wins: in "可乐 3 箱 数量 25" the operator's stated
        // quantity is 25, not the 3 that happened to come first.
        markerQuantity(text)?.let { return it }

        Regex("\\d{1,7}").find(text)?.let { match ->
            return Quantity(match.value.toInt(), match.value)
        }

        chineseNumber(text)?.let { return it }
        englishNumber(text)?.let { return it }
        return null
    }

    private fun markerQuantity(text: String): Quantity? {
        val lower = text.lowercase()
        for (marker in quantityMarkers) {
            val at = lower.indexOf(marker)
            if (at < 0) continue
            val tail = text.substring(at + marker.length).trim()
            if (tail.isEmpty()) continue
            Regex("^\\D{0,3}(\\d{1,7})").find(tail)?.let { match ->
                val digits = match.groupValues[1]
                return Quantity(digits.toInt(), digits)
            }
            chineseNumber(tail)?.let { return it }
            englishNumber(tail)?.let { return it }
        }
        return null
    }

    /**
     * Reads Chinese numerals up to 9999, covering the spoken forms that occur
     * in counting: 二十五, 三十, 一百二十, 两百.
     */
    private fun chineseNumber(text: String): Quantity? {
        val match = Regex("[零〇一二两兩三四五六七八九十百千]+").find(text) ?: return null
        val token = match.value
        var total = 0
        var section = 0
        var current = 0
        var sawAny = false

        for (ch in token) {
            when (ch) {
                '十' -> {
                    // Bare 十 means ten, as in 十箱.
                    section += if (current == 0) 10 else current * 10
                    current = 0
                    sawAny = true
                }
                '百' -> {
                    section += if (current == 0) 100 else current * 100
                    current = 0
                    sawAny = true
                }
                '千' -> {
                    total += (section + if (current == 0) 1000 else current * 1000)
                    section = 0
                    current = 0
                    sawAny = true
                }
                else -> {
                    val digit = chineseDigits[ch] ?: return null
                    current = digit
                    sawAny = true
                }
            }
        }
        val value = total + section + current
        return if (sawAny && value > 0) Quantity(value, token) else null
    }

    /** Reads English number words up to 999, e.g. "twenty five", "a hundred". */
    private fun englishNumber(text: String): Quantity? {
        val words = text.lowercase().split(' ').filter { it.isNotBlank() }
        var total = 0
        var current = 0
        var sawAny = false
        val matched = mutableListOf<String>()

        for (word in words) {
            val clean = word.trim('-', '.', '\'')
            when {
                clean in englishUnits -> {
                    current += englishUnits.getValue(clean); sawAny = true; matched += clean
                }
                clean in englishTens -> {
                    current += englishTens.getValue(clean); sawAny = true; matched += clean
                }
                clean == "hundred" -> {
                    current = (if (current == 0) 1 else current) * 100; sawAny = true
                    matched += clean
                }
                clean == "thousand" -> {
                    total += (if (current == 0) 1 else current) * 1000; current = 0
                    sawAny = true; matched += clean
                }
                clean == "and" && sawAny -> matched += clean
                // Any other word ends the number: "twenty five boxes of cola"
                // must not absorb "cola" into the count.
                sawAny -> break
            }
        }
        val value = total + current
        return if (sawAny && value > 0) Quantity(value, matched.joinToString(" ")) else null
    }

    private fun findUnit(text: String): String? {
        val lower = text.lowercase()
        // Longest first, so 公斤 is not matched as 斤.
        return unitWords.keys
            .sortedByDescending { it.length }
            .firstOrNull { key ->
                if (key.first().code < 128) {
                    Regex("\\b${Regex.escape(key)}\\b").containsMatchIn(lower)
                } else {
                    lower.contains(key)
                }
            }
            ?.let { unitWords[it] }
    }

    /**
     * Whatever is left once the number, its marker and the unit are removed.
     *
     * Returning an empty name is meaningful — it signals a bare quantity that
     * should be applied to the currently selected line.
     */
    private fun extractProductName(text: String, matchedNumber: String, unit: String?): String {
        var remaining = text
        if (matchedNumber.isNotEmpty()) {
            remaining = remaining.replace(matchedNumber, " ", ignoreCase = true)
        }
        quantityMarkers.forEach { marker ->
            remaining = remaining.replace(marker, " ", ignoreCase = true)
        }
        if (unit != null) {
            unitWords.filterValues { it == unit }.keys.forEach { spoken ->
                remaining = remaining.replace(spoken, " ", ignoreCase = true)
            }
        }
        return remaining
            .replace(Regex("\\b(of|the|a|an|is|are|and)\\b", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("[\\s]+"), " ")
            .trim()
    }
}
