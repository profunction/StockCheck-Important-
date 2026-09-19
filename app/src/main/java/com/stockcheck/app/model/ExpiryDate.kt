package com.stockcheck.app.model

import java.util.Calendar
import java.util.TimeZone

/**
 * The date printed on a tin, as this app stores and reads it.
 *
 * A day, not a moment. Stock expires on a date and the time of day it was
 * counted has nothing to do with it, so everything here is pinned to midnight
 * UTC: two phones in the same shop with different clocks must agree on whether
 * something has gone off, and a timestamp taken at the moment of counting
 * would have them disagree for part of every day.
 *
 * dd/MM/yyyy because that is how a date is written and said here, and it is
 * the form the reference number already uses -- see [RefNoAllocator]. A field
 * that reads 03/04/2027 has to mean the same thing everywhere in the app.
 */
object ExpiryDate {

    /** How near is near enough to be worth flagging on a count. */
    const val SOON_DAYS = 30

    private const val DAY_MILLIS = 86_400_000L

    /**
     * Reads a typed or imported date, or null when it is not one.
     *
     * Accepts dd/MM/yyyy and dd-MM-yyyy, and the two-digit year a spreadsheet
     * often produces. Refuses a date it cannot read rather than guessing:
     * 03/04 could be March or April depending on who exported it, and picking
     * one silently would put stock a month either side of when it expires.
     */
    fun parse(text: String): Long? {
        val parts = text.trim().split('/', '-', '.').map { it.trim() }
        if (parts.size != 3) return null

        val day = parts[0].toIntOrNull() ?: return null
        val month = parts[1].toIntOrNull() ?: return null
        val rawYear = parts[2].toIntOrNull() ?: return null
        if (day !in 1..31 || month !in 1..12) return null

        // "27" is this century. A best-before date in 1927 is not a thing a
        // shop is holding, and the alternative reading loses a hundred years.
        val year = when {
            parts[2].length <= 2 -> 2000 + rawYear
            else -> rawYear
        }
        if (year !in 1970..9999) return null

        val calendar = utcCalendar().apply {
            isLenient = false
            clear()
            set(year, month - 1, day)
        }
        // Lenient parsing would turn the 31st of February into the 3rd of
        // March, which is a date the person did not type and cannot see is
        // wrong.
        return runCatching { calendar.timeInMillis }.getOrNull()
    }

    /** `03/04/2027`, the form the rest of the app writes a date in. */
    fun format(millis: Long?): String {
        if (millis == null) return ""
        val calendar = utcCalendar().apply { timeInMillis = millis }
        val day = calendar.get(Calendar.DAY_OF_MONTH)
        val month = calendar.get(Calendar.MONTH) + 1
        val year = calendar.get(Calendar.YEAR)
        return "%02d/%02d/%04d".format(day, month, year)
    }

    /**
     * Whole days from [now] until [expiresAt]: negative once it has passed.
     *
     * Both ends are pinned to a day boundary first, so something expiring
     * today reads as zero all day rather than as one until the afternoon.
     */
    fun daysUntil(expiresAt: Long, now: Long): Int =
        ((startOfDay(expiresAt) - startOfDay(now)) / DAY_MILLIS).toInt()

    /** Midnight UTC of whatever day [millis] falls in. */
    fun startOfDay(millis: Long): Long = Math.floorDiv(millis, DAY_MILLIS) * DAY_MILLIS

    private fun utcCalendar(): Calendar =
        Calendar.getInstance(TimeZone.getTimeZone("UTC"))
}
