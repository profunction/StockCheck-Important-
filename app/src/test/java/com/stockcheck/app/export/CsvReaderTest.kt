package com.stockcheck.app.export

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The import reads a file this app did not write.
 *
 * It comes out of the customer's existing system, which means Excel on
 * Windows, which means a BOM, CRLF endings and a column called whatever the
 * person who built that report called it. Every case below is one that would
 * otherwise turn into "the import doesn't work" with no way to tell why.
 */
class CsvReaderTest {

    @Test
    fun `reads a plain file`() {
        val parsed = CsvReader.parse(
            "barcode,name,qty\n9556007960072,Coca Cola,24\n9556007960034,Sprite,12\n",
        )
        assertEquals(2, parsed.rows.size)
        assertEquals("9556007960072", parsed.rows[0].get(*CsvReader.BARCODE))
        assertEquals("Coca Cola", parsed.rows[0].get(*CsvReader.NAME))
        assertEquals(24, parsed.rows[0].int(*CsvReader.EXPECTED))
    }

    @Test
    fun `strips the byte order mark Excel writes`() {
        // Left in place it becomes part of the first header's name, and the
        // barcode column is never found again.
        val parsed = CsvReader.parse("﻿barcode,name\n9556007960072,Coca Cola\n")
        assertEquals("9556007960072", parsed.rows[0].get(*CsvReader.BARCODE))
    }

    @Test
    fun `handles windows line endings`() {
        val parsed = CsvReader.parse("barcode,name\r\n9556007960072,Coca Cola\r\n")
        assertEquals(1, parsed.rows.size)
        assertEquals("Coca Cola", parsed.rows[0].get(*CsvReader.NAME))
    }

    @Test
    fun `a quoted field may contain a comma`() {
        val parsed = CsvReader.parse("barcode,name,qty\n123,\"Cola, 1.5L\",6\n")
        assertEquals("Cola, 1.5L", parsed.rows[0].get(*CsvReader.NAME))
        assertEquals(6, parsed.rows[0].int(*CsvReader.EXPECTED))
    }

    @Test
    fun `a quoted field may contain a quote`() {
        val parsed = CsvReader.parse("barcode,name\n123,\"7\"\" plate\"\n")
        assertEquals("7\" plate", parsed.rows[0].get(*CsvReader.NAME))
    }

    @Test
    fun `a quoted field may contain a newline`() {
        // A description with a line break would otherwise shift every column
        // after it by one, silently.
        val parsed = CsvReader.parse("barcode,name\n123,\"line one\nline two\"\n456,Sprite\n")
        assertEquals(2, parsed.rows.size)
        assertEquals("line one\nline two", parsed.rows[0].get(*CsvReader.NAME))
        assertEquals("Sprite", parsed.rows[1].get(*CsvReader.NAME))
    }

    @Test
    fun `blank lines are skipped, including the one at the end`() {
        val parsed = CsvReader.parse("barcode,name\n123,Cola\n\n456,Sprite\n\n")
        assertEquals(2, parsed.rows.size)
    }

    @Test
    fun `header names are matched loosely`() {
        // The same column arrives called different things depending on who
        // exported it. Asking the customer to rename columns first loses them.
        listOf("Bar Code", "BARCODE", "bar-code", "Bar_Code").forEach { header ->
            val parsed = CsvReader.parse("$header,name\n9556007960072,Cola\n")
            assertEquals(
                "Header \"$header\" was not matched",
                "9556007960072",
                parsed.rows[0].get(*CsvReader.BARCODE),
            )
        }
    }

    @Test
    fun `alternative column names for the same thing`() {
        assertEquals(
            "9556007960072",
            CsvReader.parse("EAN,name\n9556007960072,Cola\n").rows[0].get(*CsvReader.BARCODE),
        )
        assertEquals(
            "Cola",
            CsvReader.parse("barcode,Description\n123,Cola\n").rows[0].get(*CsvReader.NAME),
        )
        assertEquals(
            40,
            CsvReader.parse("barcode,System Qty\n123,40\n").rows[0].int(*CsvReader.EXPECTED),
        )
    }

    @Test
    fun `chinese headers work`() {
        val parsed = CsvReader.parse("条码,品名,应盘\n9556007960072,汽水,24\n")
        assertEquals("9556007960072", parsed.rows[0].get(*CsvReader.BARCODE))
        assertEquals("汽水", parsed.rows[0].get(*CsvReader.NAME))
        assertEquals(24, parsed.rows[0].int(*CsvReader.EXPECTED))
    }

    @Test
    fun `thousands separators in a quantity are read, not refused`() {
        assertEquals(1200, CsvReader.parse("barcode,qty\n123,\"1,200\"\n").rows[0].int(*CsvReader.EXPECTED))
        assertEquals(1200, CsvReader.parse("barcode,qty\n123,1 200\n").rows[0].int(*CsvReader.EXPECTED))
    }

    @Test
    fun `a decimal quantity is truncated rather than rejected`() {
        // Some systems export 24.00 for a whole-number stock level.
        assertEquals(24, CsvReader.parse("barcode,qty\n123,24.00\n").rows[0].int(*CsvReader.EXPECTED))
    }

    @Test
    fun `a missing quantity is null, not zero`() {
        // Zero is a stock level someone stated. Null is one nobody did, and an
        // import that turns the second into the first invents a shortage.
        assertNull(CsvReader.parse("barcode,qty\n123,\n").rows[0].int(*CsvReader.EXPECTED))
        assertNull(CsvReader.parse("barcode,name\n123,Cola\n").rows[0].int(*CsvReader.EXPECTED))
    }

    @Test
    fun `a short row is not an error`() {
        val parsed = CsvReader.parse("barcode,name,qty\n123\n456,Sprite\n")
        assertEquals(2, parsed.rows.size)
        assertEquals("", parsed.rows[0].get(*CsvReader.NAME))
        assertEquals("Sprite", parsed.rows[1].get(*CsvReader.NAME))
    }

    @Test
    fun `an empty file yields nothing rather than failing`() {
        assertTrue(CsvReader.parse("").rows.isEmpty())
        assertTrue(CsvReader.parse("\n\n\n").rows.isEmpty())
    }

    @Test
    fun `line numbers point at the file so an error can be found`() {
        val parsed = CsvReader.parse("barcode,name\n123,Cola\n456,Sprite\n")
        assertEquals(2, parsed.rows[0].lineNumber)
        assertEquals(3, parsed.rows[1].lineNumber)
    }
}
