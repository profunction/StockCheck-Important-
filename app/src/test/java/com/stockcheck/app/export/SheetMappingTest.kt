package com.stockcheck.app.export

import com.stockcheck.app.export.SheetMapping.Role
import com.stockcheck.app.model.MovementType
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Quantity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

/**
 * Reading other people's till exports.
 *
 * The expensive mistakes here are quiet ones: ringgit read as units, the
 * third of April read as the fourth of March, a barcode column lost to a
 * column called "Code". Each case below is one of those.
 */
class SheetMappingTest {

    private val movementRoles = listOf(Role.BARCODE, Role.SKU, Role.NAME, Role.QUANTITY, Role.DATE, Role.UNIT)

    private fun guess(headers: List<String>, sample: List<List<String>> = emptyList()) =
        SheetMapping.guess(headers, sample, movementRoles).columns

    // ------------------------------------------------------------- headers

    @Test
    fun `a typical sales by item export`() {
        val columns = guess(listOf("Item", "SKU", "Category", "Items sold", "Gross sales", "Net sales"))
        assertEquals(0, columns[Role.NAME])
        assertEquals(1, columns[Role.SKU])
        assertEquals(3, columns[Role.QUANTITY])
    }

    @Test
    fun `money is never taken for a quantity`() {
        val columns = guess(listOf("Product", "Total", "Amount (RM)", "Unit price"))
        assertNull(columns[Role.QUANTITY])
        // "Unit price" is not the unit either.
        assertNull(columns[Role.UNIT])
    }

    @Test
    fun `barcode is not lost to a column merely containing code`() {
        val columns = guess(listOf("Item code", "Barcode", "Description", "Qty"))
        assertEquals(1, columns[Role.BARCODE])
        assertEquals(0, columns[Role.SKU])
        assertEquals(2, columns[Role.NAME])
        assertEquals(3, columns[Role.QUANTITY])
    }

    @Test
    fun `chinese and malay headers`() {
        val chinese = guess(listOf("条码", "品名", "数量", "日期"))
        assertEquals(0, chinese[Role.BARCODE])
        assertEquals(1, chinese[Role.NAME])
        assertEquals(2, chinese[Role.QUANTITY])
        assertEquals(3, chinese[Role.DATE])

        val malay = guess(listOf("Tarikh", "Kod Produk", "Nama Barang", "Kuantiti"))
        assertEquals(0, malay[Role.DATE])
        assertEquals(1, malay[Role.SKU])
        assertEquals(2, malay[Role.NAME])
        assertEquals(3, malay[Role.QUANTITY])
    }

    @Test
    fun `a column of barcodes is found by its values when its name says nothing`() {
        val columns = guess(
            listOf("Col A", "Col B", "Col C"),
            listOf(
                listOf("9555012345678", "Milo 1kg", "3"),
                listOf("9555012345685", "Milo 2kg", "1"),
                listOf("9555012345692", "Sugar", "12"),
            ),
        )
        assertEquals(0, columns[Role.BARCODE])
        assertEquals(2, columns[Role.QUANTITY])
    }

    @Test
    fun `each column is given at most one role`() {
        val columns = guess(listOf("Qty"))
        assertEquals(1, columns.size)
    }

    @Test
    fun `the header is found under a report title`() {
        val cells = listOf(
            listOf("Sales by item", "", ""),
            listOf("01/10/2026 - 05/10/2026", "", ""),
            listOf("", "", ""),
            listOf("Item", "SKU", "Items sold"),
            listOf("Milo", "M1", "3"),
        )
        assertEquals(3, SheetMapping.findHeader(cells))
    }

    // -------------------------------------------------------------- values

    @Test
    fun `quantities as tills write them`() {
        assertEquals(Quantity.of(1200), SheetMapping.parseQuantity("1,200"))
        assertEquals(1_500L, SheetMapping.parseQuantity("1,5"))
        assertEquals(1_250L, SheetMapping.parseQuantity("1.25"))
        assertEquals(Quantity.of(-3), SheetMapping.parseQuantity("(3)"))
        assertEquals(Quantity.of(-3), SheetMapping.parseQuantity("-3"))
        assertNull(SheetMapping.parseQuantity("Total"))
        assertNull(SheetMapping.parseQuantity(""))
    }

    @Test
    fun `dates are day first, as written here`() {
        assertEquals(LocalDate.of(2026, 4, 3), SheetMapping.parseDate("03/04/2026")?.date)
        assertEquals(LocalDate.of(2026, 4, 3), SheetMapping.parseDate("3/4/26")?.date)
        assertEquals(LocalDate.of(2026, 4, 3), SheetMapping.parseDate("2026-04-03")?.date)
        assertEquals(LocalDate.of(2026, 10, 5), SheetMapping.parseDate("5 Oct 2026")?.date)
        assertEquals(LocalDate.of(2026, 10, 5), SheetMapping.parseDate("20261005")?.date)
    }

    @Test
    fun `month first only when day first is impossible`() {
        assertEquals(LocalDate.of(2026, 4, 23), SheetMapping.parseDate("04/23/2026")?.date)
    }

    @Test
    fun `a date with a time keeps the time`() {
        val parsed = SheetMapping.parseDate("05/10/2026 14:22")
        assertEquals(LocalDate.of(2026, 10, 5), parsed?.date)
        assertEquals(LocalTime.of(14, 22), parsed?.time)
    }

    @Test
    fun `an excel date cell is a serial number`() {
        // 46000 is 9 December 2025 in Excel's calendar.
        assertEquals(LocalDate.of(2025, 12, 9), SheetMapping.parseDate("46000")?.date)
        assertNull(SheetMapping.parseDate("12"))
    }

    // ------------------------------------------------------- into movements

    private val columns = mapOf(Role.SKU to 0, Role.NAME to 1, Role.QUANTITY to 2, Role.DATE to 3)

    @Test
    fun `rows become lines, and bad rows say which line and why`() {
        val (lines, problems) = MovementFile.read(
            rows = listOf(
                listOf("M1", "Milo", "3", "05/10/2026"),
                listOf("", "", "", ""),
                listOf("", "Total", "", ""),
                listOf("S1", "Sugar", "two", "05/10/2026"),
                listOf("S2", "Salt", "1", "someday"),
            ),
            columns = columns,
            firstLineNumber = 2,
        )
        assertEquals(1, lines.size)
        assertEquals(Quantity.of(3), lines.single().quantity)
        assertEquals(3, problems.size)
        assertTrue(problems[0].startsWith("Line 4"))
        assertTrue(problems[1].startsWith("Line 5"))
        assertTrue(problems[2].startsWith("Line 6"))
    }

    private val catalogue = listOf(
        Product(barcode = "9555", name = "Milo 1kg", sku = "M1", altBarcodes = listOf("9556")),
        Product(barcode = "8888", name = "Sugar"),
        Product(barcode = "7777", name = "Twin", sku = "DUP"),
        Product(barcode = "6666", name = "Twin", sku = "DUP"),
    )

    @Test
    fun `lines match the product list by barcode, alternate barcode, sku or name`() {
        val matcher = MovementFile.Matcher(catalogue)
        assertEquals("9555", matcher.resolve("9555", "").key)
        assertEquals("9555", matcher.resolve("9556", "").key)
        assertEquals("9555", matcher.resolve("m1", "").key)
        assertEquals("8888", matcher.resolve("", "sugar").key)
        assertTrue(matcher.resolve("", "Sugar").matched)
    }

    @Test
    fun `an ambiguous sku or name matches nothing rather than the wrong product`() {
        val matcher = MovementFile.Matcher(catalogue)
        val resolved = matcher.resolve("DUP", "Twin")
        assertFalse(resolved.matched)
        assertEquals("DUP", resolved.key)
    }

    @Test
    fun `an unknown product is kept under its own code`() {
        val resolved = MovementFile.Matcher(catalogue).resolve("X9", "Mystery")
        assertFalse(resolved.matched)
        assertEquals("X9", resolved.key)
        assertEquals("name:eggs", MovementFile.Matcher(catalogue).resolve("", "Eggs").key)
    }

    private fun line(code: String, units: Int, date: LocalDate? = null) =
        MovementFile.Line(code, "", "", Quantity.of(units), date, 0)

    @Test
    fun `lines add up per product per day, and refunds net off`() {
        val day = LocalDate.of(2026, 10, 5)
        val planned = MovementFile.plan(
            lines = listOf(line("M1", 3, day), line("9555", 2, day), line("M1", -1, day), line("M1", 4, day.plusDays(1))),
            defaultDate = day,
            matcher = MovementFile.Matcher(catalogue),
        )
        assertEquals(2, planned.size)
        assertEquals(Quantity.of(4), planned[0].net)
        assertEquals(3, planned[0].lineCount)
        assertEquals(MovementType.SALE, planned[0].type(MovementFile.Kind.SALES))
    }

    @Test
    fun `a net minus is a refund for sales and a return for deliveries`() {
        val planned = MovementFile.plan(
            listOf(line("M1", -2)),
            LocalDate.of(2026, 10, 5),
            MovementFile.Matcher(catalogue),
        ).single()
        assertEquals(MovementType.REFUND, planned.type(MovementFile.Kind.SALES))
        assertEquals(MovementType.WRITE_OFF, planned.type(MovementFile.Kind.RECEIVING))
        assertEquals(Quantity.of(2), planned.quantity)
    }

    @Test
    fun `lines with no date take the date chosen for the file`() {
        val chosen = LocalDate.of(2026, 9, 30)
        val planned = MovementFile.plan(listOf(line("M1", 1)), chosen, MovementFile.Matcher(catalogue))
        assertEquals(chosen, planned.single().date)
    }

    @Test
    fun `a day that nets to nothing records nothing`() {
        val planned = MovementFile.plan(
            listOf(line("M1", 2), line("M1", -2)),
            LocalDate.of(2026, 10, 5),
            MovementFile.Matcher(catalogue),
        )
        assertTrue(planned.isEmpty())
    }

    @Test
    fun `the same product on the same day always gets the same id`() {
        val matcher = MovementFile.Matcher(catalogue)
        val day = LocalDate.of(2026, 10, 5)
        val first = MovementFile.plan(listOf(line("M1", 3, day)), day, matcher).single()
        val again = MovementFile.plan(listOf(line("9555", 5, day)), day, matcher).single()
        val kind = MovementFile.Kind.SALES
        assertEquals(MovementFile.movementId(kind, "", first), MovementFile.movementId(kind, "", again))
        assertNotEquals(
            MovementFile.movementId(kind, "", first),
            MovementFile.movementId(MovementFile.Kind.RECEIVING, "", first),
        )
        assertNotEquals(
            MovementFile.movementId(kind, "", first),
            MovementFile.movementId(kind, "ipoh", first),
        )
        assertFalse(MovementFile.movementId(kind, "", first).contains('/'))
    }
}
