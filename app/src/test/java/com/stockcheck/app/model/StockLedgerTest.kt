package com.stockcheck.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Stock on hand, and the loss a count reveals.
 *
 * The loss figure is what this feature is sold on, so the cases here are
 * mostly about what must not be counted as loss: movements already inside a
 * count, a first count with nothing to compare against, another branch's sales.
 */
class StockLedgerTest {

    private var nextId = 0

    private fun count(at: Long, zone: String = "", status: StockStatus = StockStatus.COMPLETED) =
        StockCheck(id = "c${nextId++}", createdAt = at, completedAt = at, zone = zone, status = status.name)

    private fun line(barcode: String, units: Int, name: String = "") =
        StockItem(barcode = barcode, productName = name, quantityMilli = Quantity.of(units))

    private fun move(barcode: String, type: MovementType, units: Int, at: Long) =
        StockMovement(barcode = barcode, type = type.name, quantityMilli = Quantity.of(units), at = at)

    private fun ledger(
        counts: List<Pair<StockCheck, List<StockItem>>>,
        movements: List<StockMovement> = emptyList(),
        catalogue: Map<String, Product> = emptyMap(),
    ): Map<String, StockLedger.Level> {
        val byCheck = counts.toMap()
        return StockLedger.levels(byCheck.keys.toList(), { byCheck.getValue(it) }, movements, catalogue)
            .associateBy { it.key }
    }

    private fun units(milli: Long?) = milli?.div(Quantity.UNIT)

    @Test
    fun `on hand is the count plus what came in minus what went out since`() {
        val levels = ledger(
            counts = listOf(count(at = 10) to listOf(line("rice", 100))),
            movements = listOf(
                move("rice", MovementType.SALE, 12, at = 20),
                move("rice", MovementType.RECEIVE, 50, at = 30),
                move("rice", MovementType.REFUND, 1, at = 40),
                move("rice", MovementType.WRITE_OFF, 3, at = 50),
            ),
        )
        val rice = levels.getValue("rice")
        assertEquals(100L, units(rice.counted))
        assertEquals(51L, units(rice.inSince))
        assertEquals(15L, units(rice.outSince))
        assertEquals(136L, units(rice.onHand))
    }

    @Test
    fun `a movement from before the count is already inside it`() {
        val levels = ledger(
            counts = listOf(count(at = 10) to listOf(line("rice", 100))),
            movements = listOf(move("rice", MovementType.SALE, 30, at = 5)),
        )
        assertEquals(100L, units(levels.getValue("rice").onHand))
    }

    @Test
    fun `a product never counted shows its movements and no count`() {
        val levels = ledger(
            counts = emptyList(),
            movements = listOf(move("oil", MovementType.RECEIVE, 24, at = 1)),
        )
        val oil = levels.getValue("oil")
        assertNull(oil.counted)
        assertEquals(24L, units(oil.onHand))
        assertNull(oil.lossAtCount)
    }

    @Test
    fun `an unfinished count is not a baseline`() {
        val levels = ledger(
            counts = listOf(
                count(at = 10) to listOf(line("rice", 100)),
                count(at = 20, status = StockStatus.IN_PROGRESS) to listOf(line("rice", 3)),
            ),
        )
        assertEquals(100L, units(levels.getValue("rice").onHand))
    }

    // ---------------------------------------------------------------- loss

    @Test
    fun `the loss is what the count found against what should have been there`() {
        val levels = ledger(
            counts = listOf(
                count(at = 10) to listOf(line("rice", 100)),
                count(at = 40) to listOf(line("rice", 92)),
            ),
            movements = listOf(
                move("rice", MovementType.SALE, 10, at = 20),
                move("rice", MovementType.RECEIVE, 5, at = 30),
            ),
        )
        // Expected 100 - 10 + 5 = 95, found 92.
        assertEquals(-3L, units(levels.getValue("rice").lossAtCount))
        assertEquals(92L, units(levels.getValue("rice").onHand))
    }

    @Test
    fun `finding more than expected is a positive figure, not a loss`() {
        val levels = ledger(
            counts = listOf(
                count(at = 10) to listOf(line("rice", 100)),
                count(at = 40) to listOf(line("rice", 98)),
            ),
            movements = listOf(move("rice", MovementType.SALE, 5, at = 20)),
        )
        assertEquals(3L, units(levels.getValue("rice").lossAtCount))
    }

    @Test
    fun `a first count has nothing to compare against`() {
        val levels = ledger(counts = listOf(count(at = 10) to listOf(line("rice", 100))))
        assertNull(levels.getValue("rice").lossAtCount)
    }

    @Test
    fun `a first count after deliveries is judged against the deliveries`() {
        val levels = ledger(
            counts = listOf(count(at = 10) to listOf(line("oil", 22))),
            movements = listOf(move("oil", MovementType.RECEIVE, 24, at = 5)),
        )
        assertEquals(-2L, units(levels.getValue("oil").lossAtCount))
    }

    @Test
    fun `movements after the latest count are not part of its loss`() {
        val levels = ledger(
            counts = listOf(
                count(at = 10) to listOf(line("rice", 100)),
                count(at = 40) to listOf(line("rice", 100)),
            ),
            movements = listOf(move("rice", MovementType.SALE, 50, at = 60)),
        )
        val rice = levels.getValue("rice")
        assertEquals(0L, units(rice.lossAtCount))
        assertEquals(50L, units(rice.onHand))
    }

    @Test
    fun `a spot check of one product does not judge the others`() {
        val levels = ledger(
            counts = listOf(
                count(at = 10, zone = "A") to listOf(line("rice", 100), line("oil", 20)),
                count(at = 40, zone = "A") to listOf(line("rice", 90)),
            ),
            movements = listOf(move("rice", MovementType.SALE, 10, at = 20)),
        )
        assertEquals(0L, units(levels.getValue("rice").lossAtCount))
        assertNull(levels.getValue("oil").lossAtCount)
        assertEquals(20L, units(levels.getValue("oil").onHand))
    }

    // ------------------------------------------------------------- low stock

    @Test
    fun `low means at or below the reorder level`() {
        val catalogue = mapOf(
            "rice" to Product(barcode = "rice", name = "Rice", reorderLevelMilli = Quantity.of(10)),
            "oil" to Product(barcode = "oil", name = "Oil", reorderLevelMilli = Quantity.of(10)),
            "salt" to Product(barcode = "salt", name = "Salt"),
        )
        val levels = ledger(
            counts = listOf(count(at = 1) to listOf(line("rice", 10), line("oil", 11), line("salt", 0))),
            catalogue = catalogue,
        )
        assertTrue(levels.getValue("rice").isLow)
        assertFalse(levels.getValue("oil").isLow)
        // No level set: never "low", even at nothing.
        assertFalse(levels.getValue("salt").isLow)
        assertEquals("Rice", levels.getValue("rice").name)
    }

    // -------------------------------------------------------------- branches

    @Test
    fun `head office adds the branches up`() {
        val ipoh = ledger(
            counts = listOf(count(at = 10) to listOf(line("rice", 100))),
            movements = listOf(move("rice", MovementType.SALE, 10, at = 20)),
        ).values.toList()
        val kl = ledger(
            counts = listOf(count(at = 10) to listOf(line("rice", 50), line("oil", 5))),
        ).values.toList()
        val all = StockLedger.merge(listOf(ipoh, kl)).associateBy { it.key }
        assertEquals(140L, units(all.getValue("rice").onHand))
        assertEquals(5L, units(all.getValue("oil").onHand))
    }
}
