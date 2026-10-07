package com.stockcheck.app.pos

import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.model.MovementType
import com.stockcheck.app.model.Product
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToLong

/** The till's own stock figure for one product at one branch. */
data class PosLevel(
    val branchId: String = "",
    /** The product key, as [com.stockcheck.app.model.StockLedger.Level.key]. */
    val key: String = "",
    val name: String = "",
    val inStockMilli: Long = 0L,
    /** Where to write a corrected figure back: Loyverse's variant and store. */
    val variantId: String = "",
    val storeId: String = "",
    /**
     * How many Loyverse variant-and-store figures were added up into this
     * one. More than one -- two stores mapped to one branch -- cannot be
     * written back as a single number, so it is left alone.
     */
    val parts: Int = 1,
)

/** One correction to send to Loyverse after a count. */
data class WriteBack(
    val key: String,
    val name: String,
    val variantId: String,
    val storeId: String,
    /** What Loyverse says now. */
    val fromMilli: Long,
    /** What the count says, with what moved since. */
    val toMilli: Long,
)

/** The latest stock figures read from the till, at `integrations/loyverse_stock`. */
data class PosStock(
    val fetchedAt: Long = 0L,
    val levels: List<PosLevel> = emptyList(),
)

/**
 * Loyverse's API, read into what this app needs.
 *
 * Loyverse is a free till many small shops here run, and its API is open to
 * every account: the shop owner makes an access token in Back Office ->
 * Settings -> Access tokens and pastes it in. Endpoints used, all GET on
 * https://api.loyverse.com/v1.0 with `Authorization: Bearer <token>`:
 *
 * - /stores   -> { stores: [ { id, name } ] }
 * - /items    -> { items: [ { item_name, variants: [ { variant_id, sku, barcode } ] } ], cursor }
 * - /receipts -> { receipts: [ { receipt_number, receipt_type: SALE|REFUND,
 *                  cancelled_at, created_at, receipt_date, store_id,
 *                  line_items: [ { id, variant_id, item_name, sku, quantity } ] } ], cursor }
 * - /inventory -> { inventory_levels: [ { variant_id, store_id, in_stock, updated_at } ], cursor }
 *
 * Parsing is defensive: a field this build does not expect is ignored and a
 * missing one is blank, because a till's API changing a detail must cost one
 * product its name, not stop a shop's sync.
 */
object Loyverse {

    const val BASE = "https://api.loyverse.com/v1.0"

    data class Store(val id: String, val name: String)

    data class Variant(
        val variantId: String,
        val barcode: String,
        val sku: String,
        val itemName: String,
        /** "Large", "Chocolate / 1kg": what tells one variant of an item from another. */
        val options: String = "",
    ) {
        /** The name a product gets here: the item, and the variant if there are several. */
        val displayName: String get() = listOf(itemName, options).filter { it.isNotBlank() }.joinToString(" ")
    }

    data class ReceiptLine(
        val receiptNumber: String,
        val type: MovementType,
        val storeId: String,
        /** When the sale happened, which for an offline till is not when it synced. */
        val at: Instant,
        val variantId: String,
        val sku: String,
        val itemName: String,
        /** Thousandths, positive. */
        val quantity: Long,
    )

    data class Page<T>(val values: List<T>, val cursor: String?)

    /** What Loyverse's own stock count says one variant has at one store. */
    data class InventoryLevel(val variantId: String, val storeId: String, val inStock: Long)

    fun parseStores(body: String): List<Store> {
        val array = JSONObject(body).optJSONArray("stores") ?: return emptyList()
        return (0 until array.length()).mapNotNull { index ->
            val store = array.optJSONObject(index) ?: return@mapNotNull null
            val id = store.optString("id")
            if (id.isEmpty()) null else Store(id, store.optString("name").ifEmpty { id })
        }
    }

    fun parseItems(body: String): Page<Variant> {
        val json = JSONObject(body)
        val items = json.optJSONArray("items")
        val variants = mutableListOf<Variant>()
        if (items != null) {
            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                val name = item.optString("item_name")
                val list = item.optJSONArray("variants") ?: continue
                for (j in 0 until list.length()) {
                    val variant = list.optJSONObject(j) ?: continue
                    val id = variant.optString("variant_id")
                    if (id.isEmpty()) continue
                    variants += Variant(
                        variantId = id,
                        barcode = variant.nonNullString("barcode").trim(),
                        sku = variant.nonNullString("sku").trim(),
                        itemName = name.trim(),
                        options = listOf("option1_value", "option2_value", "option3_value")
                            .map { variant.nonNullString(it).trim() }
                            .filter { it.isNotEmpty() }
                            .joinToString(" / "),
                    )
                }
            }
        }
        return Page(variants, json.cursor())
    }

    /**
     * Sales and refunds, one entry per line sold. A cancelled receipt never
     * happened, so its lines are left out.
     */
    fun parseReceipts(body: String): Page<ReceiptLine> {
        val json = JSONObject(body)
        val receipts = json.optJSONArray("receipts")
        val lines = mutableListOf<ReceiptLine>()
        if (receipts != null) {
            for (i in 0 until receipts.length()) {
                val receipt = receipts.optJSONObject(i) ?: continue
                if (receipt.nonNullString("cancelled_at").isNotEmpty()) continue
                val type = when (receipt.optString("receipt_type").uppercase()) {
                    "SALE" -> MovementType.SALE
                    "REFUND" -> MovementType.REFUND
                    else -> continue
                }
                val at = parseInstant(receipt.nonNullString("receipt_date"))
                    ?: parseInstant(receipt.nonNullString("created_at"))
                    ?: continue
                val items = receipt.optJSONArray("line_items") ?: continue
                for (j in 0 until items.length()) {
                    val item = items.optJSONObject(j) ?: continue
                    val quantity = (kotlin.math.abs(item.optDouble("quantity", 0.0)) * 1000).roundToLong()
                    if (quantity == 0L) continue
                    lines += ReceiptLine(
                        receiptNumber = receipt.optString("receipt_number"),
                        type = type,
                        storeId = receipt.nonNullString("store_id"),
                        at = at,
                        variantId = item.nonNullString("variant_id"),
                        sku = item.nonNullString("sku"),
                        itemName = item.nonNullString("item_name"),
                        quantity = quantity,
                    )
                }
            }
        }
        return Page(lines, json.cursor())
    }

    /** What a sync does to the product list. */
    data class ProductPlan(
        /** Items Loyverse has and the product list does not. */
        val create: List<Product>,
        /** Existing products whose name or SKU Loyverse now says differently: id -> (name, sku). */
        val update: Map<String, Pair<String, String>>,
        /** Items with no barcode, which a scanner could never find. */
        val noBarcode: Int,
    )

    /**
     * Brings the product list in line with Loyverse's items.
     *
     * Loyverse is where the shop names things, so its name and SKU win. What
     * only this app knows -- other barcodes, the unit, the reorder level, a
     * product switched off -- is left alone. An item is matched by any of a
     * product's barcodes; one with no barcode is skipped, because a product
     * here is the thing a scan finds.
     */
    fun planProducts(variants: List<Variant>, catalogue: List<Product>, now: Long, uid: String): ProductPlan {
        val byCode = catalogue
            .flatMap { product -> product.allBarcodes.map { it.lowercase() to product } }
            .toMap()
        val create = mutableMapOf<String, Product>()
        val update = mutableMapOf<String, Pair<String, String>>()
        var noBarcode = 0
        variants.forEach { variant ->
            val name = variant.displayName
            if (variant.barcode.isEmpty()) {
                noBarcode++
                return@forEach
            }
            val existing = byCode[variant.barcode.lowercase()]
            when {
                existing != null -> {
                    val newName = name.ifEmpty { existing.name }
                    val newSku = variant.sku.ifEmpty { existing.sku }
                    if (newName != existing.name || newSku != existing.sku) {
                        update[existing.barcode] = newName to newSku
                    }
                }
                variant.barcode.lowercase() !in create.keys.map { it.lowercase() } -> {
                    create[variant.barcode] = Product(
                        barcode = variant.barcode,
                        name = name.ifEmpty { variant.barcode },
                        sku = variant.sku,
                        active = true,
                        createdAt = now,
                        createdByUid = uid,
                        updatedAt = now,
                    )
                }
            }
        }
        return ProductPlan(create.values.toList(), update, noBarcode)
    }

    /**
     * Loyverse's own stock figures -- what the owner typed in, less what the
     * till has sold since. Only items with stock tracking switched on in
     * Loyverse are listed.
     */
    fun parseInventory(body: String): Page<InventoryLevel> {
        val json = JSONObject(body)
        val array = json.optJSONArray("inventory_levels")
        val levels = mutableListOf<InventoryLevel>()
        if (array != null) {
            for (i in 0 until array.length()) {
                val level = array.optJSONObject(i) ?: continue
                val variantId = level.nonNullString("variant_id")
                if (variantId.isEmpty() || level.isNull("in_stock")) continue
                levels += InventoryLevel(
                    variantId = variantId,
                    storeId = level.nonNullString("store_id"),
                    // Can be negative: a till sells what it was never told it had.
                    inStock = (level.optDouble("in_stock", 0.0) * 1000).roundToLong(),
                )
            }
        }
        return Page(levels, json.cursor())
    }

    /**
     * Loyverse's stock added up per branch and product, products matched to
     * the product list the same way sales are.
     */
    fun stockLevels(
        levels: List<InventoryLevel>,
        variants: Map<String, Variant>,
        storeBranches: Map<String, String>,
        matcher: MovementFile.Matcher,
    ): List<PosLevel> =
        levels.mapNotNull { level ->
            val variant = variants[level.variantId] ?: return@mapNotNull null
            // Barcode first; a variant whose barcode the product list does
            // not know may still be known by its SKU.
            val byBarcode = matcher.resolve(variant.barcode, variant.displayName)
            val product = if (byBarcode.matched || variant.sku.isEmpty()) {
                byBarcode
            } else {
                matcher.resolve(variant.sku, variant.displayName).takeIf { it.matched } ?: byBarcode
            }
            Triple(storeBranches[level.storeId].orEmpty(), product, level)
        }
            .groupBy { (branch, product, _) -> branch to product.key }
            .map { (key, group) ->
                PosLevel(
                    branchId = key.first,
                    key = key.second,
                    name = group.first().second.name,
                    inStockMilli = group.sumOf { it.third.inStock },
                    variantId = group.first().third.variantId,
                    storeId = group.first().third.storeId,
                    parts = group.size,
                )
            }

    /**
     * What to correct in Loyverse after a count: every product counted here
     * whose Loyverse figure is different from what the count says is there
     * now. Only products Loyverse keeps stock for, at a branch that is one
     * Loyverse store -- anything else has no single number to overwrite.
     *
     * [levels] must be [branchId]'s own, synced from Loyverse first, so the
     * sales since the count are in them and are not written over.
     */
    fun planWriteBack(levels: List<com.stockcheck.app.model.StockLedger.Level>, pos: List<PosLevel>, branchId: String): List<WriteBack> {
        val till = pos.filter { it.branchId == branchId && it.parts == 1 && it.variantId.isNotEmpty() }.associateBy { it.key }
        return levels.mapNotNull { level ->
            if (level.counted == null) return@mapNotNull null
            val target = till[level.key] ?: return@mapNotNull null
            if (target.inStockMilli == level.onHand) return@mapNotNull null
            WriteBack(level.key, level.label, target.variantId, target.storeId, target.inStockMilli, level.onHand)
        }.sortedBy { it.name.lowercase() }
    }

    /** The body of POST /inventory for [updates]. Loyverse takes stock as a plain number. */
    fun writeBackBody(updates: List<WriteBack>): String {
        val array = org.json.JSONArray()
        updates.forEach { u ->
            array.put(
                JSONObject()
                    .put("variant_id", u.variantId)
                    .put("store_id", u.storeId)
                    .put("stock_after", u.toMilli / 1000.0),
            )
        }
        return JSONObject().put("inventory_levels", array).toString()
    }

    /** One movement-to-be per branch, day and product -- the same shape a file import makes. */
    data class DayTotal(
        val branchId: String,
        val planned: MovementFile.Planned,
    )

    /**
     * Receipt lines added up per branch, per local day, per product.
     *
     * Products are matched to the product list the way a file import does
     * it: the variant's barcode first, then its SKU, then its name.
     */
    fun totals(
        lines: List<ReceiptLine>,
        variants: Map<String, Variant>,
        storeBranches: Map<String, String>,
        matcher: MovementFile.Matcher,
        zone: ZoneId,
    ): List<DayTotal> {
        val resolved = lines.map { line ->
            val variant = variants[line.variantId]
            val code = variant?.barcode?.ifEmpty { null } ?: line.sku.ifEmpty { null } ?: variant?.sku.orEmpty()
            line to matcher.resolve(code, line.itemName.ifEmpty { variant?.itemName.orEmpty() })
        }
        return resolved
            .groupBy { (line, product) ->
                Triple(storeBranches[line.storeId].orEmpty(), line.at.atZone(zone).toLocalDate(), product.key)
            }
            .map { (key, group) ->
                val (branch, day, productKey) = key
                val product = group.first().second
                DayTotal(
                    branchId = branch,
                    planned = MovementFile.Planned(
                        key = productKey,
                        name = product.name,
                        date = day,
                        // Sold is positive here, as in a sales file; a refund
                        // takes it back.
                        net = group.sumOf { (line, _) ->
                            if (line.type == MovementType.SALE) line.quantity else -line.quantity
                        },
                        matched = product.matched,
                        lineCount = group.size,
                    ),
                )
            }
            .filter { it.planned.net != 0L }
    }

    /** The id a day's total is stored under, so a re-sync replaces it. */
    fun movementId(total: DayTotal): String =
        "loyverse-" + MovementFile.sha1("${total.branchId}|${total.planned.date}|${total.planned.key}")

    internal fun parseInstant(raw: String): Instant? =
        if (raw.isEmpty()) null else runCatching { Instant.parse(raw) }.getOrNull()

    /** The start of [day] in [zone], as Loyverse wants it: UTC ISO-8601. */
    fun isoStartOf(day: LocalDate, zone: ZoneId): String = day.atStartOfDay(zone).toInstant().toString()

    private fun JSONObject.cursor(): String? = nonNullString("cursor").ifEmpty { null }

    /** optString turns a JSON null into the text "null"; this does not. */
    private fun JSONObject.nonNullString(name: String): String =
        if (isNull(name)) "" else optString(name)
}
