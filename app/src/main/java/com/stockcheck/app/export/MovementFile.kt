package com.stockcheck.app.export

import com.stockcheck.app.export.SheetMapping.Role
import com.stockcheck.app.model.MovementType
import com.stockcheck.app.model.Product
import java.security.MessageDigest
import java.time.LocalDate

/**
 * A sales report or a delivery list, turned into stock movements.
 *
 * Whatever the till exported -- one row per receipt line or one row per
 * product for the day -- it becomes one movement per product per day. That is
 * what makes importing safe to repeat: the movement's id comes from the
 * product, the day, the branch and the kind of file, so importing the same
 * day again replaces that day rather than counting it twice.
 */
object MovementFile {

    /** What the file is a list of. */
    enum class Kind(val positive: MovementType, val negative: MovementType) {
        /** A minus line in a sales report is a refund. */
        SALES(MovementType.SALE, MovementType.REFUND),
        /** A minus line on a delivery list went back to the supplier. */
        RECEIVING(MovementType.RECEIVE, MovementType.WRITE_OFF),
    }

    data class Line(
        val code: String,
        val name: String,
        val unit: String,
        /** Thousandths, as written: minus is a refund or a return. */
        val quantity: Long,
        val date: LocalDate?,
        val lineNumber: Int,
    )

    /**
     * Reads the mapped columns out of [rows], which exclude the header.
     *
     * A row with no product, or no readable quantity, is reported with its
     * line number rather than dropped quietly -- "imported 180 of 200" has to
     * be able to say which twenty and why.
     */
    fun read(
        rows: List<List<String>>,
        columns: Map<Role, Int>,
        firstLineNumber: Int,
    ): Pair<List<Line>, List<String>> {
        val lines = mutableListOf<Line>()
        val problems = mutableListOf<String>()
        fun cell(row: List<String>, role: Role) =
            columns[role]?.let { row.getOrNull(it) }?.trim().orEmpty()

        rows.forEachIndexed { index, row ->
            if (row.all { it.isBlank() }) return@forEachIndexed
            val lineNumber = firstLineNumber + index
            val code = cell(row, Role.BARCODE).ifEmpty { cell(row, Role.SKU) }
            val name = cell(row, Role.NAME)
            if (code.isEmpty() && name.isEmpty()) {
                problems += "Line $lineNumber: no product"
                return@forEachIndexed
            }
            val rawQuantity = cell(row, Role.QUANTITY)
            val quantity = SheetMapping.parseQuantity(rawQuantity)
            if (quantity == null) {
                // A total row at the bottom ("Total", blank code) lands here
                // too, which is the right place for it.
                problems += "Line $lineNumber: ${code.ifEmpty { name }} has no quantity" +
                    if (rawQuantity.isNotEmpty()) " (\"$rawQuantity\")" else ""
                return@forEachIndexed
            }
            val rawDate = cell(row, Role.DATE)
            val date = if (rawDate.isEmpty()) null else SheetMapping.parseDate(rawDate)?.date
            if (rawDate.isNotEmpty() && date == null) {
                problems += "Line $lineNumber: could not read the date \"$rawDate\""
                return@forEachIndexed
            }
            lines += Line(
                code = code,
                name = name,
                unit = cell(row, Role.UNIT),
                quantity = quantity,
                date = date,
                lineNumber = lineNumber,
            )
        }
        return lines to problems
    }

    /** A line matched to the product list, or kept under its own code. */
    data class Resolved(
        val key: String,
        val name: String,
        /** True when the product list knew it. */
        val matched: Boolean,
    )

    /**
     * Finds each line's product: by barcode (any of a product's barcodes),
     * then by SKU, then by an exact name. A till usually exports its own
     * item code rather than the barcode, which is why SKU matters as much.
     *
     * A code nobody knows is still kept, under itself, so the stock levels
     * screen can show it and somebody can add it to the product list.
     */
    class Matcher(catalogue: List<Product>) {
        private val byBarcode = catalogue
            .flatMap { product -> product.allBarcodes.map { it.lowercase() to product } }
            .toMap()
        private val bySku = unique(catalogue.filter { it.sku.isNotBlank() }) { it.sku.trim().lowercase() }
        private val byName = unique(catalogue.filter { it.name.isNotBlank() }) { it.name.trim().lowercase() }

        fun resolve(code: String, name: String): Resolved {
            val c = code.trim().lowercase()
            val n = name.trim().lowercase()
            val product = (if (c.isNotEmpty()) byBarcode[c] ?: bySku[c] else null)
                ?: (if (n.isNotEmpty()) byName[n] else null)
            return when {
                product != null -> Resolved(product.barcode, product.name, matched = true)
                code.isNotBlank() -> Resolved(code.trim(), name.trim(), matched = false)
                else -> Resolved("name:$n", name.trim(), matched = false)
            }
        }

        /** Two products sharing a SKU or a name match neither, rather than the wrong one. */
        private fun unique(products: List<Product>, keyOf: (Product) -> String): Map<String, Product> =
            products.groupBy(keyOf).filterValues { it.size == 1 }.mapValues { it.value.single() }
    }

    /** One movement-to-be: a product's net quantity on one day. */
    data class Planned(
        val key: String,
        val name: String,
        val date: LocalDate,
        /** Net thousandths; the sign picks the movement type. */
        val net: Long,
        val matched: Boolean,
        val lineCount: Int,
    ) {
        fun type(kind: Kind): MovementType = if (net >= 0) kind.positive else kind.negative
        val quantity: Long get() = kotlin.math.abs(net)
    }

    /**
     * Adds lines up per product per day. A day with nothing left once sales
     * and refunds net off has nothing to record, and is left out.
     */
    fun plan(lines: List<Line>, defaultDate: LocalDate, matcher: Matcher): List<Planned> =
        lines.map { line -> matcher.resolve(line.code, line.name) to line }
            .groupBy { (resolved, line) -> resolved.key to (line.date ?: defaultDate) }
            .map { (key, group) ->
                val resolved = group.first().first
                Planned(
                    key = key.first,
                    name = resolved.name.ifEmpty { group.firstNotNullOfOrNull { it.second.name.ifEmpty { null } }.orEmpty() },
                    date = key.second,
                    net = group.sumOf { it.second.quantity },
                    matched = resolved.matched,
                    lineCount = group.size,
                )
            }
            .filter { it.net != 0L }
            .sortedWith(compareBy({ it.date }, { it.name.lowercase() }))

    /**
     * The movement's id. The same product on the same day from the same kind
     * of file for the same branch always gets the same id, so importing it
     * again replaces it. Hashed so whatever is in a barcode -- a slash, a
     * space -- can never make an invalid document path.
     */
    fun movementId(kind: Kind, branchId: String, planned: Planned): String =
        "file-" + sha1("${kind.name}|$branchId|${planned.date}|${planned.key}")

    internal fun sha1(text: String): String =
        MessageDigest.getInstance("SHA-1").digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
