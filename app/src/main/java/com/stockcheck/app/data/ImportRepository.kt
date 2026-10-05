package com.stockcheck.app.data

import com.google.firebase.firestore.SetOptions
import com.stockcheck.app.export.SheetMapping
import com.stockcheck.app.export.SheetMapping.Role
import com.stockcheck.app.export.SheetReader
import com.stockcheck.app.model.ExpiryDate
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
    /** Thousandths of a unit, so a sheet saying 0.5 imports as half. */
    val expected: Long? = null,
    /** The date printed on the tin, where the sheet carries one. */
    val expiresAt: Long? = null,
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
        val sheet = runCatching { mapSheet(bytes, listOf(Role.BARCODE, Role.SKU, Role.NAME, Role.UNIT)) }
            .getOrElse { return emptyList<ImportRow>() to listOf(it.message ?: "That file could not be read.") }
        val codeColumn = sheet.barcodeColumn()
            ?: return emptyList<ImportRow>() to listOf(sheet.missing("barcode"))
        val rows = mutableListOf<ImportRow>()
        val problems = mutableListOf<String>()
        sheet.rows.forEachIndexed { index, row ->
            if (row.all { it.isBlank() }) return@forEachIndexed
            val lineNumber = sheet.firstLine + index
            val barcode = row.cell(codeColumn)
            if (barcode.isEmpty()) {
                problems += "Line $lineNumber: no barcode"
                return@forEachIndexed
            }
            rows += ImportRow(
                barcode = barcode,
                name = row.cell(sheet.columns[Role.NAME]),
                sku = row.cell(sheet.columns[Role.SKU]),
                unit = row.cell(sheet.columns[Role.UNIT]),
                lineNumber = lineNumber,
            )
        }
        return rows to problems
    }

    suspend fun importProducts(
        session: Session,
        rows: List<ImportRow>,
    ): ImportSummary = withContext(Dispatchers.IO) {
        session.require(Permission.IMPORT_PRODUCTS)

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
                if (isNew) {
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
                    created++
                } else {
                    // Only the fields the spreadsheet actually carries. Writing
                    // the whole document again would stamp this import's time
                    // and this importer's name over the product's real origin,
                    // and would silently switch a deactivated product back on
                    // -- an import is not supposed to rewrite history or undo
                    // an admin's decision.
                    batch.set(
                        Db.product(row.barcode),
                        mapOf(
                            "name" to row.name,
                            "sku" to row.sku,
                            "unit" to row.unit.ifBlank { "pcs" },
                            "updatedAt" to now,
                        ),
                        SetOptions.merge(),
                    )
                    updated++
                }
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
        val sheet = runCatching {
            mapSheet(bytes, listOf(Role.BARCODE, Role.SKU, Role.NAME, Role.UNIT, Role.EXPECTED, Role.EXPIRY))
        }.getOrElse { return emptyList<ImportRow>() to listOf(it.message ?: "That file could not be read.") }
        val codeColumn = sheet.barcodeColumn()
            ?: return emptyList<ImportRow>() to listOf(sheet.missing("barcode"))
        val expectedColumn = sheet.columns[Role.EXPECTED]
            ?: return emptyList<ImportRow>() to listOf(sheet.missing("expected quantity"))
        val rows = mutableListOf<ImportRow>()
        val problems = mutableListOf<String>()
        sheet.rows.forEachIndexed { index, row ->
            if (row.all { it.isBlank() }) return@forEachIndexed
            val lineNumber = sheet.firstLine + index
            val barcode = row.cell(codeColumn)
            if (barcode.isEmpty()) {
                problems += "Line $lineNumber: no barcode"
                return@forEachIndexed
            }
            val expected = SheetMapping.parseQuantity(row.cell(expectedColumn))
            if (expected == null) {
                // A missing figure is not zero. Zero is a stock level someone
                // stated; blank is one nobody did, and treating them alike
                // invents a shortage that never existed.
                problems += "Line $lineNumber: $barcode has no expected quantity"
                return@forEachIndexed
            }
            rows += ImportRow(
                barcode = barcode,
                name = row.cell(sheet.columns[Role.NAME]),
                sku = row.cell(sheet.columns[Role.SKU]),
                unit = row.cell(sheet.columns[Role.UNIT]),
                expected = expected,
                // Not a problem when absent or unreadable: most sheets carry
                // no such column, and refusing the line over it would throw
                // away a count over a field nobody asked for.
                expiresAt = ExpiryDate.parse(row.cell(sheet.columns[Role.EXPIRY])),
                lineNumber = lineNumber,
            )
        }
        return rows to problems
    }

    /** A file once its header is found and its columns are guessed. */
    private class MappedSheet(
        val headers: List<String>,
        val rows: List<List<String>>,
        val columns: Map<Role, Int>,
        /** The line number of the first row under the header. */
        val firstLine: Int,
    ) {
        /**
         * The barcode column, or the item-code column when the file has no
         * barcode one -- which is how these imports read an "Item code"
         * column before columns were guessed, and a catalogue keyed by the
         * shop's own codes still works for searching and import.
         */
        fun barcodeColumn(): Int? = columns[Role.BARCODE] ?: columns[Role.SKU]

        /** Says what is missing and what the file does have, so it can be fixed. */
        fun missing(what: String): String =
            "No $what column was found. The columns in this file are: " +
                headers.filter { it.isNotBlank() }.joinToString(", ").ifEmpty { "(none)" }
    }

    /**
     * Same detection as the sales import: the header may sit under a report
     * title, columns are recognised by English, Chinese or Malay names, and a
     * column of barcodes is found by its values when its name says nothing.
     */
    private fun mapSheet(bytes: ByteArray, wanted: List<Role>): MappedSheet {
        val cells = SheetReader.readCells(bytes)
        val headerIndex = SheetMapping.findHeader(cells)
            ?: throw IllegalArgumentException("The file has no header row.")
        val headers = cells[headerIndex].map { it.trim() }
        val rows = cells.drop(headerIndex + 1)
        return MappedSheet(
            headers = headers,
            rows = rows,
            columns = SheetMapping.guess(headers, rows.take(30), wanted).columns,
            // 1-based, and the first data row is the line after the header.
            firstLine = headerIndex + 2,
        )
    }

    private fun List<String>.cell(index: Int?): String =
        index?.let { getOrNull(it) }?.trim().orEmpty()

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
        session.require(Permission.IMPORT_COUNT_SHEET)

        val existing = Db.items(stockCheckId).get().await()
            .toObjects(StockItem::class.java)
            .associateBy { it.barcode }
        val catalogue = Db.products().get().await()
            .toObjects(Product::class.java)
            .associateBy { it.barcode }

        val skipped = mutableListOf<String>()
        var created = 0
        var updated = 0
        // Thousandths, matching every other quantity here.
        var addedQuantity = 0L
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
                            "expectedMilli" to (row.expected ?: 0L),
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
                            quantityMilli = 0L,
                            expectedMilli = row.expected ?: 0L,
                            expiresAt = row.expiresAt,
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
                    "totalQuantityMilli" to
                        com.google.firebase.firestore.FieldValue.increment(addedQuantity),
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
