package com.stockcheck.app.data

import android.content.Context
import com.google.firebase.firestore.SetOptions
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Hands out the reference number a stock check is known by.
 *
 * `RC-260916-007` — opened on 16 September 2026, the seventh check of that
 * month. The date is what somebody looks for in a folder; the running number
 * is what they write on the sheet and say out loud.
 *
 * Three things cannot all be true at once: numbers run 1, 2, 3 with no gaps;
 * no two checks ever share one; and a check can be opened with no signal. A
 * counter read from the server at the moment of creation gives the first two
 * and loses the third, which is the one a warehouse actually needs.
 *
 * So the phone draws numbers in advance, the way a ticket machine is loaded
 * with a roll. While there is a connection it claims a block from the shared
 * counter — those numbers are now spent as far as every other phone is
 * concerned — and hands them out from local storage afterwards, signal or
 * not. Two people in a dead zone cannot collide, because they are holding
 * different rolls.
 *
 * The cost is a gap: a block that is only half used leaves the rest behind,
 * so a month's numbers may read 007, 008, 011. That is the right trade for a
 * record book. A gap is visible and harmless; two checks numbered 007 is an
 * account nobody can reconcile.
 */
class RefNoAllocator(appContext: Context) {

    private val prefs = appContext.getSharedPreferences("ref_no", Context.MODE_PRIVATE)

    /**
     * The next reference, claiming a block first if the roll is empty.
     *
     * @throws IllegalStateException when the roll is empty and the counter
     *   cannot be reached — the one case this design cannot cover, and the
     *   message says plainly what to do about it.
     */
    suspend fun next(): String {
        val period = periodOf(System.currentTimeMillis())
        var remaining = remainingFor(period)

        if (remaining.isEmpty()) {
            remaining = runCatching { claim(period) }.getOrElse { cause ->
                throw IllegalStateException(
                    "No reference numbers left on this phone. Connect to the " +
                        "internet once to collect more — counting itself does " +
                        "not need a connection.",
                    cause,
                )
            }
        }

        val seq = remaining.first()
        store(period, remaining.drop(1))
        return format(System.currentTimeMillis(), seq)
    }

    /**
     * Claims more numbers if the roll is low and a connection is available.
     *
     * Best effort by design: called when the app has a moment, and a failure
     * here only means the phone carries on with the numbers it already has.
     */
    suspend fun topUpQuietly() {
        val period = periodOf(System.currentTimeMillis())
        if (remainingFor(period).size > TOP_UP_AT) return
        runCatching { claim(period) }
    }

    /** How many numbers this phone can still hand out without a connection. */
    fun remainingCount(): Int = remainingFor(periodOf(System.currentTimeMillis())).size

    // ------------------------------------------------------------- claiming

    /**
     * Takes the next [BLOCK] numbers for [period] from the shared counter.
     *
     * A transaction, so two phones claiming at the same moment get different
     * blocks rather than the same one. Transactions need the server, which is
     * exactly right here: this is the step that must not be guessed at, and
     * failing offline is what sends the caller to its stored numbers instead.
     */
    private suspend fun claim(period: String): List<Int> = withContext(Dispatchers.IO) {
        val counters = Db.counters()
        val first = Db.transaction { tx ->
            val taken = runCatching { tx.get(counters).getLong(period) }.getOrNull() ?: 0L
            tx.set(counters, mapOf<String, Any>(period to taken + BLOCK), SetOptions.merge())
            taken + 1
        }.await()

        val block = (first.toInt() until first.toInt() + BLOCK).toList()
        store(period, remainingFor(period) + block)
        block
    }

    // -------------------------------------------------------------- storage

    private fun remainingFor(period: String): List<Int> {
        // A stored roll belongs to the month it was drawn for. September's
        // numbers are meaningless in October, when counting restarts at one.
        if (prefs.getString(KEY_PERIOD, null) != period) return emptyList()
        return prefs.getString(KEY_REMAINING, "")
            .orEmpty()
            .split(',')
            .mapNotNull { it.trim().toIntOrNull() }
            .sorted()
    }

    private fun store(period: String, numbers: List<Int>) {
        prefs.edit()
            .putString(KEY_PERIOD, period)
            .putString(KEY_REMAINING, numbers.sorted().joinToString(","))
            .apply()
    }

    // --------------------------------------------------------- the format

    companion object {
        /**
         * How many numbers a claim takes.
         *
         * Every unused number in a block is a gap, and every block is a round
         * trip, so this trades one against the other. Five covers a shift in a
         * dead zone without leaving a hole anyone would ask about.
         */
        private const val BLOCK = 5

        /** Claim more once the roll runs this low, rather than when it is empty. */
        private const val TOP_UP_AT = 2

        private const val KEY_PERIOD = "period"
        private const val KEY_REMAINING = "remaining"

        /** Which counter a moment belongs to: one per calendar month. */
        fun periodOf(millis: Long): String =
            SimpleDateFormat("yyMM", Locale.US).format(Date(millis))

        /**
         * `RC-16/09/2026-007` — the day it was opened, and the month's
         * running number.
         *
         * Day first, the way a date is written and said here. The slashes are
         * what make it read as a date rather than a serial, which is the
         * whole point of putting one in: somebody looking through a folder is
         * looking for a day, not for six digits they have to decode.
         *
         * Slashes are also path separators, so anything building a filename
         * out of a reference has to go through [forFilename] first.
         */
        fun format(millis: Long, seq: Int): String {
            val day = SimpleDateFormat("dd/MM/yyyy", Locale.US).format(Date(millis))
            return "RC-$day-" + seq.toString().padStart(3, '0')
        }

        /**
         * The reference with nothing in it a file system would object to.
         *
         * `RC-16/09/2026-007` names three directories and a file on the way to
         * an export that was meant to be one spreadsheet.
         */
        fun forFilename(refNo: String): String =
            refNo.replace('/', '-').replace('\\', '-')

        /**
         * The month part of a reference, for finding last month's records.
         *
         * Returns null for anything that is not one of these — including the
         * `SC-` references issued before this scheme, which stay as they were
         * rather than being rewritten into numbers they never had.
         */
        fun periodIn(refNo: String): String? {
            val match = Regex("""^RC-\d{2}/(\d{2})/\d{2}(\d{2})-\d+$""")
                .find(refNo.trim()) ?: return null
            val (month, year) = match.destructured
            return year + month
        }
    }
}
