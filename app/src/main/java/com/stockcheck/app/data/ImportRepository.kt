package com.stockcheck.app.data

import com.stockcheck.app.export.CsvReader
import com.stockcheck.app.export.SheetReader
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.ItemSource
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/** One line of an import file, once it has been understood. */
data class ImportRow(
    val barcode: String,
    val name: String = "",
    val sku: String = "",
    val unit: String = "",
    val expected: Int? = null,
    val lineNumber: Int = 0,
)

/**
 * What an import did, in the terms someone would check it in.
 *
 * Skipped rows carry their line number and a reason. An import that reports
 * "imported 1,847 of 2,000" and cannot say which 153 or why is an import
 * nobody can trust enough to use on real stock.
 */
data class ImportSummary(
    val created: Int = 0,
    val updated: Int = 0,
    val skipped: List<String> = emptyList(),
) {
    val total: Int get() = created + updated
}

/**
 * Loads a customer's existing data in.
 *
 * Two files, for the two things this app could not do without them:
 *
 * A **product list** turns scans into names. Nobody types two thousand SKUs
 * into a phone, so without an import the catalogue stays empty and every
 * counted line is a row of digits.
 *
 * A **count sheet** is what makes this a stock check rather than a tally. The
 * question a stock take answers is not "how many are here" but "how many are
 * missing", and that needs the number the system thinks it has.
 */
class ImportRepository(
    private val products: ProductRepository,
    private val audit: AuditRepository,
) {

    /** Firestore refuses a batch larger than this. */
    private val batchLimit = 400

    // ------------------------------------------------------------ products

    /**
     * Reads a product list out of a spreadsheet.
     *
     * Takes bytes, not text, so a real .xlsx works. The alternative -- telling
     * a customer to save their file as CSV first -- is a step they will forget,
     * get wrong, or do with an encoding that turns every Chinese name into
     * question marks.
     */
    fun readProducts(bytes: ByteArray): Pair<List<ImportRow>, List<String>> {
        val parsed = runCatching { SheetReader.read(bytes) }.getOrElse { error ->
            return emptyList<ImportRow>() to listOf(error.message ?: "That file could not be read.")
        }
        if (parsed.headers.isEmpty()) {
            return emptyList<ImportRow>() to listOf("The file has no header row.")
        }
        val rows = mutableListOf<ImportRow>()
        val problems = mutableListOf<String>()
        parsed.rows.forEach { row ->
            val barcode = row.get(*CsvReader.BARCODE)
            if (barcode.isEmpty()) {
                problems += "Line ${row.lineNumber}: no barcode"
                return@forEach
            }
            rows += ImportRow(
                barcode = barcode,
                name = row.get(*CsvReader.NAME),
                sku = row.get(*CsvReader.SKU),
                unit = row.get(*CsvReader.UNIT),
                lineNumber = row.lineNumber,
            )
        }
        return rows to problems
    }

    suspend fun importProducts(
        session: Session,
        rows: List<ImportRow>,
    ): ImportSummary = withContext(Dispatchers.IO) {
        session.require(Permission.CREATE_STOCK_CHECK)

        val existing = Db.products().get().await().documents.map { it.id }.toSet()
        val skipped = mutableListOf<String>()
        var created = 0
        var updated = 0
        val now = System.currentTimeMillis()

        rows.chunked(batchLimit).forEach { chunk ->
            val batch = Db.batch()
            chunk.forEach { row ->
                if (row.name.isBlank()) {
                    skipped += "Line ${row.lineNumber}: ${row.barcode} has no name"
                    return@forEach
                }
                val isNew = row.barcode !in existing
                batch.set(
                    Db.product(row.barcode),
                    Product(
                        barcode = row.barcode,
                        name = row.name,
                        sku = row.sku,
                        unit = row.unit.ifBlank { "pcs" },
                        active = true,
                        createdAt = now,
                        createdByUid = session.uid,
                        updatedAt = now,
                    ),
                )
                if (isNew) created++ else updated++
            }
            batch.commit().awaitAck()
        }

        // One audit entry for the import, not one per product: two thousand
        // entries would bury every other change in the log for weeks.
        audit.record(
            session = session,
            entity = "Product",
            entityId = "import",
            entityLabel = "Product list import",
            action = AuditAction.CREATE,
            field = "rows",
            newValue = "$created new, $updated updated, ${skipped.size} skipped",
        )

        ImportSummary(created, updated, skipped)
    }

    // --------------------------------------------------------- count sheet

    fun readCountSheet(bytes: ByteArray): Pair<List<ImportRow>, List<String>> {
        val parsed = runCatching { SheetReader.read(bytes) }.getOrElse { error ->
            return emptyList<ImportRow>() to listOf(error.message ?: "That file could not be read.")
        }
        if (parsed.headers.isEmpty()) {
            return emptyList<ImportRow>() to listOf("The file has no header row.")
        }
        val rows = mutableListOf<ImportRow>()
        val problems = mutableListOf<String>()
        parsed.rows.forEach { row ->
            val barcode = row.get(*CsvReader.BARCODE)
            if (barcode.isEmpty()) {
                problems += "Line ${row.lineNumber}: no barcode"
                return@forEach
            }
            val expected = row.int(*CsvReader.EXPECTED)
            if (expected == null) {
                // A missing figure is not zero. Zero is a stock level someone
                // stated; blank is one nobody did, and treating them alike
                // invents a shortage that never existed.
                problems += "Line ${row.lineNumber}: $barcode has no expected quantity"
                return@forEach
            }
            rows += ImportRow(
                barcode = barcode,
                name = row.get(*CsvReader.NAME),
                sku = row.get(*CsvReader.SKU),
                unit = row.get(*CsvReader.UNIT),
                expected = expected,
                lineNumber = row.lineNumber,
            )
        }
        return rows to problems
    }

    /**
     * Seeds a stock check with what the system says should be there.
     *
     * Lines arrive at quantity zero: nothing has been counted yet, and a
     * count sheet that pre-fills the answer is a count sheet that gets signed
     * without anyone walking the aisle.
     *
     * A barcode already scanned into this check keeps its counted quantity
     * and only gains the expected figure, so importing halfway through a
     * count does not throw away the morning's work.
     */
    suspend fun importCountSheet(
        session: Session,
        stockCheckId: String,
        rows: List<ImportRow>,
    ): ImportSummary = withContext(Dispatchers.IO) {
        session.require(Permission.EDIT_OWN_STOCK)

        val existing = Db.items(stockCheckId).get().await()
            .toObjects(StockItem::class.java)
            .associateBy { it.barcode }
        val catalogue = Db.products().get().await()
            .toObjects(Product::class.java)
            .associateBy { it.barcode }

        val skipped = mutableListOf<String>()
        var created = 0
        var updated = 0
        var addedQuantity = 0
        val now = System.currentTimeMillis()

        rows.chunked(batchLimit).forEach { chunk ->
            val batch = Db.batch()
            chunk.forEach { row ->
                val known = catalogue[row.barcode]
                val current = existing[row.barcode]
                if (current != null) {
                    batch.update(
                        Db.item(stockCheckId, current.id),
                        mapOf(
                            "expected" to (row.expected ?: 0),
                            "onList" to true,
                            "updatedAt" to now,
                        ),
                    )
                    updated++
                } else {
                    val doc = Db.items(stockCheckId).document()
                    batch.set(
                        doc,
                        StockItem(
                            id = doc.id,
                            barcode = row.barcode,
                            productName = row.name.ifBlank { known?.name.orEmpty() },
                            sku = row.sku.ifBlank { known?.sku.orEmpty() },
                            quantity = 0,
                            expected = row.expected ?: 0,
                            onList = true,
                            unit = row.unit.ifBlank { known?.unit ?: "pcs" },
                            source = ItemSource.MANUAL.name,
                            createdByUid = session.uid,
                            createdAt = now,
                            updatedAt = now,
                        ),
                    )
                    created++
                }
            }
            batch.commit().awaitAck()
        }

        if (created > 0) {
            // The check's own counters are what the list screen shows; leaving
            // them stale makes an imported sheet look empty until something is
            // scanned.
            Db.stockCheck(stockCheckId).update(
                mapOf(
                    "itemCount" to com.google.firebase.firestore.FieldValue.increment(created.toLong()),
                    "totalQuantity" to com.google.firebase.firestore.FieldValue.increment(addedQuantity.toLong()),
                    "updatedAt" to now,
                ),
            ).awaitAck()
        }

        audit.record(
            session = session,
            entity = "StockCheck",
            entityId = stockCheckId,
            entityLabel = "Count sheet import",
            action = AuditAction.UPDATE,
            field = "expected",
            newValue = "$created lines added, $updated matched, ${skipped.size} skipped",
            stockCheckId = stockCheckId,
        )

        ImportSummary(created, updated, skipped)
    }
}
