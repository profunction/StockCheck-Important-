package com.stockcheck.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Dates printed on tins.
 *
 * A count that balances perfectly while a third of the shelf is out of date
 * answered the wrong question, so these have to be read exactly as written.
 * The failure that matters is a silent one: a date read a month out puts
 * stock on a shelf that should have been pulled, and nothing on screen says
 * anything is wrong.
 */
class ExpiryDateTest {

    private fun at(date: String): Long = ExpiryDate.parse(date)!!

    @Test
    fun `reads the form a date is written in here`() {
        assertEquals("03/04/2027", ExpiryDate.format(ExpiryDate.parse("03/04/2027")))
    }

    @Test
    fun `reads a date without leading zeroes`() {
        assertEquals("03/04/2027", ExpiryDate.format(ExpiryDate.parse("3/4/2027")))
    }

    @Test
    fun `takes the separators a spreadsheet produces`() {
        assertEquals("03/04/2027", ExpiryDate.format(ExpiryDate.parse("03-04-2027")))
        assertEquals("03/04/2027", ExpiryDate.format(ExpiryDate.parse("03.04.2027")))
    }

    @Test
    fun `a two-digit year is this century`() {
        // A best-before date in 1927 is not something a shop is holding, and
        // the other reading loses a hundred years.
        assertEquals("03/04/2027", ExpiryDate.format(ExpiryDate.parse("03/04/27")))
    }

    @Test
    fun `knows a leap year`() {
        assertEquals("29/02/2028", ExpiryDate.format(ExpiryDate.parse("29/02/2028")))
    }

    @Test
    fun `refuses a day that does not exist rather than rolling it forward`() {
        // Lenient parsing turns the 31st of February into the 3rd of March --
        // a date the person did not type and cannot see is wrong.
        assertNull(ExpiryDate.parse("31/02/2027"))
        assertNull(ExpiryDate.parse("32/01/2027"))
        assertNull(ExpiryDate.parse("29/02/2027"))
    }

    @Test
    fun `refuses what is not a date`() {
        assertNull(ExpiryDate.parse(""))
        assertNull(ExpiryDate.parse("abc"))
        assertNull(ExpiryDate.parse("03/04"))
        assertNull(ExpiryDate.parse("03/13/2027"))
    }

    @Test
    fun `formats nothing as nothing`() {
        // Not as the epoch, which would read as 01/01/1970 on the line of
        // somebody who never entered a date.
        assertEquals("", ExpiryDate.format(null))
    }

    @Test
    fun `the time of day does not change how many days are left`() {
        // Two phones in one shop with clocks minutes apart must agree on
        // whether something has gone off. Counting from the moment rather
        // than the day would have them disagree for part of every day.
        val morning = at("15/09/2026") + 2 * 3_600_000L
        val evening = at("15/09/2026") + 22 * 3_600_000L
        assertEquals(0, ExpiryDate.daysUntil(at("15/09/2026"), morning))
        assertEquals(0, ExpiryDate.daysUntil(at("15/09/2026"), evening))
        assertEquals(1, ExpiryDate.daysUntil(at("16/09/2026"), evening))
    }

    @Test
    fun `a date already passed counts backwards`() {
        val now = at("15/09/2026") + 12 * 3_600_000L
        assertEquals(-1, ExpiryDate.daysUntil(at("14/09/2026"), now))
        assertEquals(-30, ExpiryDate.daysUntil(at("16/08/2026"), now))
    }

    // ------------------------------------------------------- on a stock line

    private fun line(expiry: String?) = StockItem(
        barcode = "955",
        quantityMilli = Quantity.of(24),
        expiresAt = expiry?.let { at(it) },
    )

    @Test
    fun `a line with no date is neither expired nor expiring`() {
        // Null is "nobody said", not "fine" and not "today". Reading it as
        // either invents a fact about somebody's stock.
        val now = at("15/09/2026")
        assertNull(line(null).daysToExpiry(now))
        assertFalse(line(null).isExpired(now))
        assertFalse(line(null).isExpiringSoon(now))
    }

    @Test
    fun `stock past its date is expired`() {
        val now = at("15/09/2026")
        assertTrue(line("14/09/2026").isExpired(now))
        assertFalse(line("15/09/2026").isExpired(now))
        assertFalse(line("16/09/2026").isExpired(now))
    }

    @Test
    fun `expiring today counts as expiring, not as expired`() {
        // It can still be sold today, and it must still be flagged today.
        val now = at("15/09/2026")
        assertFalse(line("15/09/2026").isExpired(now))
        assertTrue(line("15/09/2026").isExpiringSoon(now))
    }

    @Test
    fun `already expired is not also expiring soon`() {
        // They are different findings and want different actions: one is
        // pull it off the shelf, the other is sell it first.
        val now = at("15/09/2026")
        assertFalse(line("01/09/2026").isExpiringSoon(now))
    }

    @Test
    fun `the far edge of the window is in, the day past it is out`() {
        val now = at("15/09/2026")
        assertTrue(line("15/10/2026").isExpiringSoon(now))
        assertFalse(line("16/10/2026").isExpiringSoon(now))
    }
}
