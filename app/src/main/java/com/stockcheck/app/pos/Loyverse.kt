package com.stockcheck.app.pos

import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.model.MovementType
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToLong

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
 *
 * Parsing is defensive: a field this build does not expect is ignored and a
 * missing one is blank, because a till's API changing a detail must cost one
 * product its name, not stop a shop's sync.
 */
object Loyverse {

    const val BASE = "https://api.loyverse.com/v1.0"

    data class Store(val id: String, val name: String)

    data class Variant(val variantId: String, val barcode: String, val sku: String, val itemName: String)

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
                        barcode = variant.nonNullString("barcode"),
                        sku = variant.nonNullString("sku"),
                        itemName = name,
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
