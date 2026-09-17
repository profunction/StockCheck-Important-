package com.stockcheck.app.export

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * What a cell looks like by the time Excel reads it.
 *
 * Two jobs pull against each other here: a scanned barcode must never be
 * executed as a formula, and a counted figure must still be a figure. The
 * guard used to win both arguments, which is how the Variance column stopped
 * adding up.
 */
class CsvFieldTest {

    @Test
    fun `a negative number stays a number`() {
        // The case the column exists for. Guarding this produced "'-32",
        // which Excel shows as -32 and refuses to sum.
        assertEquals("-32", csvField("-32"))
        assertEquals("-2", csvField("-2"))
        assertEquals("-2.5", csvField("-2.5"))
    }

    @Test
    fun `an ordinary number is untouched`() {
        assertEquals("0", csvField("0"))
        assertEquals("120", csvField("120"))
    }

    @Test
    fun `a formula is still defused`() {
        assertEquals("\"'=SUM(A1:A9)\"", csvField("=SUM(A1:A9)"))
        assertEquals("\"'@cmd\"", csvField("@cmd"))
        assertEquals("\"'+1+1\"", csvField("+1+1"))
    }

    @Test
    fun `something that only starts like a number is still defused`() {
        // Does not parse as a number, so the guard keeps it.
        assertEquals("\"'-1+cmd|'/c calc'!A0\"", csvField("-1+cmd|'/c calc'!A0"))
    }

    @Test
    fun `a comma forces quoting`() {
        assertEquals("\"Rice, Jasmine 5kg\"", csvField("Rice, Jasmine 5kg"))
    }

    @Test
    fun `a quote inside a field is doubled`() {
        assertEquals("\"He said \"\"take 5\"\"\"", csvField("He said \"take 5\""))
    }

    @Test
    fun `plain text needs nothing`() {
        assertEquals("Coca Cola 1.5L", csvField("Coca Cola 1.5L"))
        assertEquals("冷库", csvField("冷库"))
        assertEquals("", csvField(""))
    }
}
