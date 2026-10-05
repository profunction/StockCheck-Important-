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
}
