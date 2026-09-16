package com.stockcheck.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The reference is what somebody writes on a sheet and reads back a month
 * later, so its shape is a promise: the date written the way it is spoken
 * here, the same number of digits every time, and a month that can be
 * searched for.
 */
class RefNoFormatTest {

    private val now = System.currentTimeMillis()

    @Test
    fun `a reference carries the date day-first and a padded running number`() {
        val ref = RefNoAllocator.format(now, 7)
        assertTrue("Unexpected shape: $ref", Regex("""^RC-\d{2}/\d{2}/\d{4}-007$""").matches(ref))
    }

    @Test
    fun `numbers past the padding width are not truncated`() {
        // A hundred checks a month is the stated ceiling, but a busy month
        // must not start renaming itself.
        assertTrue(RefNoAllocator.format(now, 123).endsWith("-123"))
        assertTrue(RefNoAllocator.format(now, 1024).endsWith("-1024"))
    }

    @Test
    fun `the month can be read back out of a reference`() {
        assertEquals("2609", RefNoAllocator.periodIn("RC-16/09/2026-007"))
        assertEquals("2610", RefNoAllocator.periodIn("RC-01/10/2026-001"))
        assertEquals("2701", RefNoAllocator.periodIn("RC-31/01/2027-042"))
    }

    @Test
    fun `a reference round-trips to the period it was drawn from`() {
        // What makes "find last month's checks" a search rather than a query.
        val ref = RefNoAllocator.format(now, 12)
        assertEquals(RefNoAllocator.periodOf(now), RefNoAllocator.periodIn(ref))
    }

    @Test
    fun `references from the old schemes are left alone`() {
        // SC- numbers were a device clock, never a sequence, and the first
        // shape of RC- had no slashes. Neither is rewritten into a month it
        // never had.
        assertNull(RefNoAllocator.periodIn("SC-536771"))
        assertNull(RefNoAllocator.periodIn("RC-260916-007"))
        assertNull(RefNoAllocator.periodIn(""))
    }

    @Test
    fun `surrounding whitespace does not hide the month`() {
        assertEquals("2609", RefNoAllocator.periodIn("  RC-16/09/2026-007  "))
    }

    @Test
    fun `a reference is stripped of slashes before it names a file`() {
        // RC-16/09/2026-007 otherwise names three directories on the way to
        // an export that was meant to be one spreadsheet.
        val safe = RefNoAllocator.forFilename("RC-16/09/2026-007")
        assertEquals("RC-16-09-2026-007", safe)
        assertFalse(safe.contains('/'))
    }

    @Test
    fun `a filename-safe reference is built from the real one`() {
        val safe = RefNoAllocator.forFilename(RefNoAllocator.format(now, 3))
        assertFalse(safe.contains('/'))
        assertTrue(safe.endsWith("-003"))
    }
}
