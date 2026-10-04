package com.stockcheck.app.model

import com.stockcheck.app.model.StockComparison.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * What a month-end figure is.
 *
 * A report that is wrong about this is worse than no report: a shop owner
 * acts on "rice is down 40" without opening a single count to check it.
 */
class StockComparisonTest {

    private var nextId = 0

    private fun count(
        at: Long,
        zone: String = "",
        branch: String = "",
        status: StockStatus = StockStatus.COMPLETED,
    ) = StockCheck(
        id = "c${nextId++}",
        createdAt = at,
        completedAt = at,
        zone = zone,
        branchId = branch,
        status = status.name,
    )

    private fun line(barcode: String, units: Int, name: String = "", unit: String = "pcs") =
        StockItem(barcode = barcode, productName = name, quantityMilli = Quantity.of(units), unit = unit)

    private fun snapshot(vararg counts: Pair<StockCheck, List<StockItem>>) =
        counts.toMap().let { byCheck -> StockComparison.snapshot(byCheck.keys.toList()) { byCheck.getValue(it) } }

    private fun Map<String, StockComparison.Holding>.units(key: String) =
        get(key)?.quantity?.let { it / Quantity.UNIT }

    // --------------------------------------------------------------- snapshot

    @Test
    fun `counting the same area twice is a correction, not double the stock`() {
        val held = snapshot(
            count(at = 1, zone = "Cold room") to listOf(line("rice", 10)),
            count(at = 2, zone = "Cold room") to listOf(line("rice", 7)),
        )
        assertEquals(7L, held.units("rice"))
    }

    @Test
    fun `the later count wins even when listed first`() {
        val held = snapshot(
            count(at = 2, zone = "A") to listOf(line("rice", 7)),
            count(at = 1, zone = "A") to listOf(line("rice", 10)),
        )
        assertEquals(7L, held.units("rice"))
    }

    @Test
    fun `different areas add up to the shop`() {
        val held = snapshot(
            count(at = 1, zone = "Cold room") to listOf(line("rice", 10)),
            count(at = 2, zone = "Dry store") to listOf(line("rice", 5)),
        )
        assertEquals(15L, held.units("rice"))
    }

    @Test
    fun `a spot check replaces only what it counted`() {
        // The case that makes this rule worth having: most counts on a shop
        // floor are partial, and treating a two-item spot check as the whole
        // area would report everything else in it as gone.
        val held = snapshot(
            count(at = 1, zone = "A") to listOf(line("rice", 10), line("oil", 5)),
            count(at = 2, zone = "A") to listOf(line("rice", 8)),
        )
        assertEquals(8L, held.units("rice"))
        assertEquals(5L, held.units("oil"))
    }

    @Test
    fun `the same zone name in two branches is two places`() {
        val held = snapshot(
            count(at = 1, zone = "A", branch = "ipoh") to listOf(line("rice", 10)),
            count(at = 2, zone = "A", branch = "kl") to listOf(line("rice", 4)),
        )
        assertEquals(14L, held.units("rice"))
    }

    @Test
    fun `zone names match regardless of case and spacing`() {
        val held = snapshot(
            count(at = 1, zone = "Cold room") to listOf(line("rice", 10)),
            count(at = 2, zone = " cold ROOM ") to listOf(line("rice", 3)),
        )
        assertEquals(3L, held.units("rice"))
    }

    @Test
    fun `two lines for one product in one count add`() {
        val held = snapshot(count(at = 1) to listOf(line("rice", 4), line("rice", 6)))
        assertEquals(10L, held.units("rice"))
    }

    @Test
    fun `a line with no barcode is matched by its name`() {
        val held = snapshot(
            count(at = 1, zone = "A") to listOf(line("", 5, name = "Eggs")),
            count(at = 2, zone = "A") to listOf(line("", 2, name = " eggs ")),
        )
        assertEquals(2L, held.units("name:eggs"))
    }

    @Test
    fun `a line with neither barcode nor name is ignored`() {
        val held = snapshot(count(at = 1) to listOf(line("", 5)))
        assertEquals(emptyMap<String, StockComparison.Holding>(), held)
    }

    @Test
    fun `a product named later in the month reads by its name`() {
        val held = snapshot(
            count(at = 1, zone = "A") to listOf(line("955", 1, name = "")),
            count(at = 2, zone = "B") to listOf(line("955", 1, name = "Rice 5kg")),
            count(at = 3, zone = "C") to listOf(line("955", 1, name = "")),
        )
        assertEquals("Rice 5kg", held.getValue("955").name)
    }

    @Test
    fun `weighed quantities keep their thousandths`() {
        val held = snapshot(
            count(at = 1) to listOf(StockItem(barcode = "veg", quantityMilli = 1_250L, unit = "kg")),
        )
        assertEquals(1_250L, held.getValue("veg").quantity)
    }

    // ---------------------------------------------------------------- compare

    private fun holding(key: String, units: Int, name: String = key) =
        key to StockComparison.Holding(key, key, name, "pcs", Quantity.of(units))

    @Test
    fun `each kind of difference is named`() {
        val before = mapOf(holding("up", 5), holding("down", 9), holding("same", 3), holding("gone", 4))
        val after = mapOf(holding("up", 8), holding("down", 2), holding("same", 3), holding("new", 6))
        val rows = StockComparison.compare(before, after).associateBy { it.key }

        assertEquals(Kind.UP, rows.getValue("up").kind)
        assertEquals(Quantity.of(3), rows.getValue("up").change)
        assertEquals(Kind.DOWN, rows.getValue("down").kind)
        assertEquals(Quantity.of(-7), rows.getValue("down").change)
        assertEquals(Kind.SAME, rows.getValue("same").kind)
        assertEquals(Kind.NEW, rows.getValue("new").kind)
        assertEquals(Kind.NOT_COUNTED, rows.getValue("gone").kind)
    }

    @Test
    fun `a product the later counts skipped has no change, not a fall to zero`() {
        val rows = StockComparison.compare(mapOf(holding("rice", 40)), emptyMap())
        assertNull(rows.single().after)
        assertNull(rows.single().change)
    }

    @Test
    fun `biggest movement comes first, then new, then not counted, then unchanged`() {
        val before = mapOf(holding("small", 10), holding("big", 10), holding("same", 1), holding("gone", 1))
        val after = mapOf(holding("small", 11), holding("big", 30), holding("same", 1), holding("new", 1))
        assertEquals(
            listOf("big", "small", "new", "gone", "same"),
            StockComparison.compare(before, after).map { it.key },
        )
    }

    @Test
    fun `the summary counts each kind and totals both sides`() {
        val before = mapOf(holding("a", 5), holding("b", 5), holding("c", 2))
        val after = mapOf(holding("a", 7), holding("b", 1), holding("d", 4))
        val summary = StockComparison.summarise(StockComparison.compare(before, after))
        assertEquals(Quantity.of(12), summary.beforeTotal)
        assertEquals(Quantity.of(12), summary.afterTotal)
        assertEquals(1, summary.up)
        assertEquals(1, summary.down)
        assertEquals(0, summary.same)
        assertEquals(1, summary.new)
        assertEquals(1, summary.notCounted)
    }

    // ------------------------------------------------------------ finishing

    @Test
    fun `only finished counts stand for a shelf`() {
        assertEquals(false, StockComparison.isFinished(count(at = 1, status = StockStatus.IN_PROGRESS)))
        assertEquals(false, StockComparison.isFinished(count(at = 1, status = StockStatus.DRAFT)))
        assertEquals(true, StockComparison.isFinished(count(at = 1, status = StockStatus.COMPLETED)))
        assertEquals(true, StockComparison.isFinished(count(at = 1, status = StockStatus.REVIEWED)))
        assertEquals(true, StockComparison.isFinished(count(at = 1, status = StockStatus.LOCKED)))
    }
}
