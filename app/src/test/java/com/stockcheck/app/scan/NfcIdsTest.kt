package com.stockcheck.app.scan

import org.junit.Assert.assertEquals
import org.junit.Test

/** A tag must read as the same code on a phone, on the website and through a reader. */
class NfcIdsTest {

    @Test
    fun `bytes become upper-case hex`() {
        assertEquals("04A2B30F", NfcIds.hex(byteArrayOf(0x04, 0xA2.toByte(), 0xB3.toByte(), 0x0F)))
    }

    @Test
    fun `the website's colon form reads the same as the phone's`() {
        assertEquals("04A2B3C4D5E6F7", NfcIds.normalize("04:a2:b3:c4:d5:e6:f7"))
        assertEquals("04A2B3C4", NfcIds.normalize("04-A2-B3-C4"))
    }

    @Test
    fun `an ordinary barcode is left alone`() {
        assertEquals("9555012345678", NfcIds.normalize("9555012345678"))
        assertEquals("abc-123", NfcIds.normalize("abc-123"))
    }
}
