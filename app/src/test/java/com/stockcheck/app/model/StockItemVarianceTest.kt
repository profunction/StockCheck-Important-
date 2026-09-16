package com.stockcheck.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which lines a supervisor is asked to look at.
 *
 * The flag is only worth having if the list it produces is short enough to
 * read. These cases are mostly about what must NOT be flagged: a rule that
 * fires on every line that differs at all has the same effect as no rule.
 */
class StockItemVarianceTest {

    private fun line(expected: Int, counted: Int, onList: Boolean = true) =
        StockItem(barcode = "955", quantity = counted, expected = expected, onList = onList)

    // ------------------------------------------------------------ percentage

    @Test
    fun `variance percent is the share of what was expected`() {
        assertEquals(-92.0, line(expected = 100, counted = 8).variancePercent!!, 0.001)
        assertEquals(25.0, line(expected = 80, counted = 100).variancePercent!!, 0.001)
        assertEquals(0.0, line(expected = 50, counted = 50).variancePercent!!, 0.001)
    }

    @Test
    fun `a percentage of nothing is no percentage at all`() {
        // Not a zero variance -- an undefined one. The caller shows the
        // absolute figures instead.
        assertNull(line(expected = 0, counted = 7).variancePercent)
    }

    @Test
    fun `a line nobody put on the sheet has no baseline to be a share of`() {
        assertNull(line(expected = 0, counted = 7, onList = false).variancePercent)
    }

    // ----------------------------------------------------------------- flag

    @Test
    fun `a large swing against a real baseline is flagged`() {
        assertTrue(line(expected = 100, counted = 8).isLargeVariance)
        assertTrue(line(expected = 100, counted = 79).isLargeVariance)
        assertTrue(line(expected = 40, counted = 60).isLargeVariance)
    }

    @Test
    fun `the threshold itself counts as large`() {
        // 20% exactly: at the line, not over it, and still flagged.
        assertTrue(line(expected = 100, counted = 80).isLargeVariance)
    }

    @Test
    fun `an ordinary discrepancy is left alone`() {
        assertFalse(line(expected = 100, counted = 95).isLargeVariance)
        assertFalse(line(expected = 100, counted = 100).isLargeVariance)
        assertFalse(line(expected = 100, counted = 119).isLargeVariance)
    }

    @Test
    fun `small counts are not flagged on percentages alone`() {
        // One against two is a 50% swing and means nothing. Flagging it is how
        // the list becomes too long to read.
        assertFalse(line(expected = 2, counted = 1).isLargeVariance)
        assertFalse(line(expected = 4, counted = 3).isLargeVariance)
    }

    @Test
    fun `finding none of what was expected is always worth a look`() {
        // Even where the numbers are too small for a percentage to mean much.
        assertTrue(line(expected = 2, counted = 0).isLargeVariance)
        assertTrue(line(expected = 500, counted = 0).isLargeVariance)
    }

    @Test
    fun `stock nobody expected is its own finding`() {
        assertTrue(line(expected = 0, counted = 3).isLargeVariance)
    }

    @Test
    fun `an unlisted line is not a variance`() {
        // It is reported as unlisted instead: a different question, asked of
        // the sheet rather than of the shelf.
        val item = line(expected = 0, counted = 9, onList = false)
        assertFalse(item.isLargeVariance)
        assertTrue(item.isUnlisted)
    }

    @Test
    fun `nothing expected and nothing found is nothing at all`() {
        assertFalse(line(expected = 0, counted = 0).isLargeVariance)
    }
}
