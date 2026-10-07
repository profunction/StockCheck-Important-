package com.stockcheck.app.pos

import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.model.MovementType
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Quantity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

/**
 * Reading Loyverse's answers. The JSON below is shaped like the API's
 * documented responses; the cases are the ones that would quietly put a
 * shop's figures out: a cancelled receipt, a refund, a JSON null.
 */
class LoyverseTest {

    private val zone = ZoneId.of("Asia/Kuala_Lumpur")

    @Test
    fun `stores`() {
        val stores = Loyverse.parseStores("""{"stores":[{"id":"s1","name":"Ipoh"},{"id":"s2","name":""}]}""")
        assertEquals(listOf("Ipoh", "s2"), stores.map { it.name })
    }

    @Test
    fun `items give each variant its barcode and sku, and the cursor continues`() {
        val page = Loyverse.parseItems(
            """
            {"items":[{"id":"i1","item_name":"Milo 1kg","variants":[
                {"variant_id":"v1","sku":"M1","barcode":"9555"},
                {"variant_id":"v2","sku":"M2","barcode":null}
            ]}],"cursor":"next"}
            """,
        )
        assertEquals(2, page.values.size)
        assertEquals("9555", page.values[0].barcode)
        // A JSON null is blank, not the word "null".
        assertEquals("", page.values[1].barcode)
        assertEquals("Milo 1kg", page.values[1].itemName)
        assertEquals("next", page.cursor)
    }

    @Test
    fun `the last page has no cursor`() {
        assertNull(Loyverse.parseItems("""{"items":[]}""").cursor)
        assertNull(Loyverse.parseItems("""{"items":[],"cursor":null}""").cursor)
    }

    private val receipts = """
        {"receipts":[
          {"receipt_number":"1-1001","receipt_type":"SALE","cancelled_at":null,
           "created_at":"2026-10-05T02:00:00.000Z","receipt_date":"2026-10-05T02:00:00.000Z",
           "store_id":"s1","line_items":[
             {"id":"l1","variant_id":"v1","item_name":"Milo 1kg","sku":"M1","quantity":3},
             {"id":"l2","variant_id":"v9","item_name":"Loose rice","sku":"","quantity":1.25}
           ]},
          {"receipt_number":"1-1002","receipt_type":"REFUND","refund_for":"1-1001",
           "created_at":"2026-10-05T05:00:00.000Z","receipt_date":"2026-10-05T05:00:00.000Z",
           "store_id":"s1","line_items":[
             {"id":"l3","variant_id":"v1","item_name":"Milo 1kg","sku":"M1","quantity":1}
           ]},
          {"receipt_number":"1-1003","receipt_type":"SALE","cancelled_at":"2026-10-05T06:00:00.000Z",
           "created_at":"2026-10-05T05:30:00.000Z","receipt_date":"2026-10-05T05:30:00.000Z",
           "store_id":"s1","line_items":[
             {"id":"l4","variant_id":"v1","item_name":"Milo 1kg","sku":"M1","quantity":50}
           ]}
        ]}
    """

    @Test
    fun `receipts become lines, and a cancelled receipt is left out`() {
        val lines = Loyverse.parseReceipts(receipts).values
        assertEquals(3, lines.size)
        assertEquals(MovementType.SALE, lines[0].type)
        assertEquals(Quantity.of(3), lines[0].quantity)
        assertEquals(1_250L, lines[1].quantity)
        assertEquals(MovementType.REFUND, lines[2].type)
        assertFalse(lines.any { it.receiptNumber == "1-1003" })
    }

    @Test
    fun `lines add up per product per day, refunds netting off`() {
        val lines = Loyverse.parseReceipts(receipts).values
        val totals = Loyverse.totals(
            lines = lines,
            variants = mapOf("v1" to Loyverse.Variant("v1", "9555", "M1", "Milo 1kg")),
            storeBranches = mapOf("s1" to "ipoh"),
            matcher = MovementFile.Matcher(listOf(Product(barcode = "9555", name = "Milo"))),
            zone = zone,
        ).associateBy { it.planned.key }

        val milo = totals.getValue("9555")
        assertEquals("ipoh", milo.branchId)
        assertEquals(LocalDate.of(2026, 10, 5), milo.planned.date)
        assertEquals(Quantity.of(2), milo.planned.net)
        assertEquals(MovementType.SALE, milo.planned.type(MovementFile.Kind.SALES))
        assertTrue(milo.planned.matched)

        // Not in the product list and no barcode: kept under its name.
        val rice = totals.getValue("name:loose rice")
        assertFalse(rice.planned.matched)
        assertEquals(1_250L, rice.planned.quantity)
    }

    @Test
    fun `a sale is filed under the local day it happened`() {
        // 17:00 UTC on the 4th is 01:00 on the 5th in Malaysia.
        val body = """
            {"receipts":[{"receipt_number":"1","receipt_type":"SALE",
              "receipt_date":"2026-10-04T17:00:00Z","created_at":"2026-10-04T17:00:00Z",
              "store_id":"s","line_items":[{"variant_id":"v","item_name":"Tea","sku":"T","quantity":1}]}]}
        """
        val totals = Loyverse.totals(
            Loyverse.parseReceipts(body).values,
            emptyMap(),
            emptyMap(),
            MovementFile.Matcher(emptyList()),
            zone,
        )
        assertEquals(LocalDate.of(2026, 10, 5), totals.single().planned.date)
        assertEquals("", totals.single().branchId)
    }

    @Test
    fun `a re-sync of the same day gets the same id`() {
        val lines = Loyverse.parseReceipts(receipts).values
        val matcher = MovementFile.Matcher(emptyList())
        val first = Loyverse.totals(lines, emptyMap(), emptyMap(), matcher, zone)
        val again = Loyverse.totals(lines.take(1), emptyMap(), emptyMap(), matcher, zone)
        assertEquals(
            Loyverse.movementId(first.first { it.planned.key == "M1" }),
            Loyverse.movementId(again.first { it.planned.key == "M1" }),
        )
    }

    @Test
    fun `inventory levels, with a null and a minus kept as they are`() {
        val page = Loyverse.parseInventory(
            """
            {"inventory_levels":[
              {"variant_id":"v1","store_id":"s1","in_stock":20,"updated_at":"2026-10-07T00:00:00Z"},
              {"variant_id":"v2","store_id":"s1","in_stock":-2.5},
              {"variant_id":"v3","store_id":"s1","in_stock":null}
            ],"cursor":"more"}
            """,
        )
        assertEquals(listOf(Quantity.of(20), -2_500L), page.values.map { it.inStock })
        assertEquals("more", page.cursor)
    }

    @Test
    fun `till stock adds up per branch and matches by barcode, then sku`() {
        val catalogue = listOf(
            Product(barcode = "9555", name = "Milo 1kg"),
            Product(barcode = "8888", name = "Sugar", sku = "SG"),
        )
        val variants = listOf(
            Loyverse.Variant("v1", barcode = "9555", sku = "", itemName = "Milo"),
            // Loyverse has a different barcode on file, but the SKU is known.
            Loyverse.Variant("v2", barcode = "1234", sku = "SG", itemName = "Gula"),
            Loyverse.Variant("v3", barcode = "", sku = "", itemName = "Eggs"),
        ).associateBy { it.variantId }
        val levels = Loyverse.stockLevels(
            levels = listOf(
                Loyverse.InventoryLevel("v1", "s1", Quantity.of(20)),
                Loyverse.InventoryLevel("v1", "s2", Quantity.of(5)),
                Loyverse.InventoryLevel("v2", "s1", Quantity.of(7)),
                Loyverse.InventoryLevel("v3", "s1", Quantity.of(30)),
                Loyverse.InventoryLevel("gone", "s1", Quantity.of(1)),
            ),
            variants = variants,
            storeBranches = mapOf("s2" to "ipoh"),
            matcher = MovementFile.Matcher(catalogue),
        ).associateBy { it.branchId to it.key }

        assertEquals(Quantity.of(20), levels.getValue("" to "9555").inStockMilli)
        assertEquals(Quantity.of(5), levels.getValue("ipoh" to "9555").inStockMilli)
        assertEquals(Quantity.of(7), levels.getValue("" to "8888").inStockMilli)
        assertEquals(Quantity.of(30), levels.getValue("" to "name:eggs").inStockMilli)
        assertEquals(4, levels.size)
    }

    @Test
    fun `variant options become part of the name`() {
        val page = Loyverse.parseItems(
            """
            {"items":[{"item_name":"Milo","variants":[
                {"variant_id":"v1","barcode":"9555","option1_value":"1kg","option2_value":null},
                {"variant_id":"v2","barcode":"9556"}
            ]}]}
            """,
        )
        assertEquals(listOf("Milo 1kg", "Milo"), page.values.map { it.displayName })
    }

    @Test
    fun `loyverse items fill the product list without touching what only this app knows`() {
        val catalogue = listOf(
            // Scanned here before it was named.
            Product(barcode = "9555", name = "", unit = "tin", reorderLevelMilli = Quantity.of(5)),
            // Known by another of its barcodes.
            Product(barcode = "8888", name = "Gula", sku = "SG", altBarcodes = listOf("8889")),
            Product(barcode = "7777", name = "Same", sku = "S"),
        )
        val plan = Loyverse.planProducts(
            variants = listOf(
                Loyverse.Variant("v1", barcode = "9555", sku = "M1", itemName = "Milo", options = "1kg"),
                Loyverse.Variant("v2", barcode = "8889", sku = "SG", itemName = "Sugar"),
                Loyverse.Variant("v3", barcode = "7777", sku = "S", itemName = "Same"),
                Loyverse.Variant("v4", barcode = "1234", sku = "", itemName = "Eggs"),
                Loyverse.Variant("v5", barcode = "", sku = "X", itemName = "Loose rice", priceSen = 450, costSen = 300),
                Loyverse.Variant("v6", barcode = "", sku = "", itemName = "Nothing to find it by"),
            ),
            catalogue = catalogue,
            now = 1L,
            uid = "u",
        )
        assertEquals("Milo 1kg" to "M1", plan.update["9555"])
        // Updated under its own id, not the barcode Loyverse used.
        assertEquals("Sugar" to "SG", plan.update["8888"])
        // Nothing changed, nothing written.
        assertFalse("7777" in plan.update)
        // No barcode: filed under the SKU Loyverse gives every item, with its price and cost.
        assertEquals(listOf("1234", "X"), plan.create.map { it.barcode })
        assertEquals("Eggs", plan.create.first().name)
        assertEquals(450L, plan.create.last().priceSen)
        assertEquals(300L, plan.create.last().costSen)
        // Only one with neither.
        assertEquals(1, plan.noBarcode)
    }

    private fun level(key: String, counted: Long?, inSince: Long = 0, outSince: Long = 0) =
        com.stockcheck.app.model.StockLedger.Level(
            key = key, barcode = key, name = key, unit = "pcs", counted = counted, countedAt = if (counted == null) null else 1L,
            inSince = inSince, outSince = outSince, reorderLevel = null, lossAtCount = null,
        )

    @Test
    fun `write-back sends what the count says is there now, and only where it differs`() {
        val pos = listOf(
            PosLevel(branchId = "", key = "milo", inStockMilli = Quantity.of(20), variantId = "v1", storeId = "s1"),
            PosLevel(branchId = "", key = "sugar", inStockMilli = Quantity.of(7), variantId = "v2", storeId = "s1"),
            PosLevel(branchId = "", key = "rice", inStockMilli = Quantity.of(5), variantId = "v3", storeId = "s1"),
            // Two stores added into one branch: no single figure to overwrite.
            PosLevel(branchId = "", key = "eggs", inStockMilli = Quantity.of(9), variantId = "v4", storeId = "s1", parts = 2),
            PosLevel(branchId = "ipoh", key = "milo", inStockMilli = Quantity.of(3), variantId = "v1", storeId = "s2"),
        )
        val plan = Loyverse.planWriteBack(
            levels = listOf(
                // Counted 18, sold 2 since -> 16 on the shelf now.
                level("milo", Quantity.of(18), outSince = Quantity.of(2)),
                level("sugar", Quantity.of(7)),
                // Never counted here: nothing to say about it.
                level("rice", null, inSince = Quantity.of(4)),
                level("eggs", Quantity.of(1)),
            ),
            pos = pos,
            branchId = "",
        )
        assertEquals(listOf("milo"), plan.map { it.key })
        assertEquals(Quantity.of(20), plan.single().fromMilli)
        assertEquals(Quantity.of(16), plan.single().toMilli)
        assertEquals("s1", plan.single().storeId)
    }

    @Test
    fun `write-back body is what Loyverse's POST inventory takes`() {
        val body = org.json.JSONObject(
            Loyverse.writeBackBody(listOf(WriteBack("k", "Rice", "v1", "s1", 0, 1_250))),
        )
        val level = body.getJSONArray("inventory_levels").getJSONObject(0)
        assertEquals("v1", level.getString("variant_id"))
        assertEquals("s1", level.getString("store_id"))
        assertEquals(1.25, level.getDouble("stock_after"), 0.0)
    }

    @Test
    fun `an item with no barcode is found again by its sku`() {
        val catalogue = listOf(Product(barcode = "10001", name = "Old name", sku = "10001"))
        val plan = Loyverse.planProducts(
            variants = listOf(Loyverse.Variant("v1", barcode = "", sku = "10001", itemName = "Teh Tarik")),
            catalogue = catalogue,
            now = 1L,
            uid = "u",
        )
        assertTrue(plan.create.isEmpty())
        assertEquals("Teh Tarik" to "10001", plan.update["10001"])
    }

    @Test
    fun `items carry the price and cost in sen`() {
        val page = Loyverse.parseItems(
            """{"items":[{"item_name":"Kopi","variants":[{"variant_id":"a","sku":"10002","barcode":null,"default_price":3.5,"cost":1.2}]},
            {"item_name":"Ikan","variants":[{"variant_id":"b","sku":"10003","default_price":null}]}]}""",
        )
        assertEquals(350L, page.values[0].priceSen)
        assertEquals(120L, page.values[0].costSen)
        assertEquals("10002", page.values[0].code)
        assertEquals(null, page.values[1].priceSen)
    }
}
