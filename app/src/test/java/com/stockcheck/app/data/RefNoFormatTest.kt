package com.stockcheck.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The reference is what somebody writes on a sheet and reads back a month
 * later, so its shape is a promise: the same number of digits every time, the
 * date where the eye expects it, and a month that can be searched for.
 */
class RefNoFormatTest {

    private val now = System.currentTimeMillis()

    @Test
    fun `a reference carries the day and a padded running number`() {
        val ref = RefNoAllocator.format(now, 7)
        assertTrue("Unexpected shape: $ref", Regex("""^RC-\d{6}-007$""").matches(ref))
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
        assertEquals("2609", RefNoAllocator.periodIn("RC-260916-007"))
        assertEquals("2610", RefNoAllocator.periodIn("RC-261001-001"))
    }

    @Test
    fun `a reference round-trips to the period it was drawn from`() {
        // What makes "find last month's checks" a search rather than a query.
        val ref = RefNoAllocator.format(now, 12)
        assertEquals(RefNoAllocator.periodOf(now), RefNoAllocator.periodIn(ref))
    }

    @Test
    fun `references from the old scheme are left alone`() {
        // SC- numbers were a device clock, never a sequence. They stay as
        // issued rather than being rewritten into a month they never had.
        assertNull(RefNoAllocator.periodIn("SC-536771"))
        assertNull(RefNoAllocator.periodIn(""))
        assertNull(RefNoAllocator.periodIn("RC-2609-007"))
    }

    @Test
    fun `surrounding whitespace does not hide the month`() {
        assertEquals("2609", RefNoAllocator.periodIn("  RC-260916-007  "))
    }
}
