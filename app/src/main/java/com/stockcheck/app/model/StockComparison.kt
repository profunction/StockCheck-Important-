package com.stockcheck.app.model

import kotlin.math.abs

/**
 * What a set of counts says was on the shelves, and how two of those differ.
 *
 * Pure: it is handed the counts and their lines and touches nothing else, so
 * the rule that decides what a month-end figure is can be tested without a
 * phone or a database.
 *
 * The rule, which is the whole point of this file:
 *
 * - A company counts by area -- "Cold room", "Rack 7" -- and a branch is a
 *   separate building, so an area is a branch and a zone together.
 * - Within one area, the latest count of a product is what that area held.
 *   Counting the cold room twice in a month is a correction, not twice the
 *   stock.
 * - A later count only replaces the products it actually includes. A spot
 *   check of two items after a full count must not erase everything else in
 *   that area, and on a busy shop floor most counts are spot checks.
 * - Areas then add up: the cold room plus the dry store is the shop.
 */
object StockComparison {

    private val FINISHED = setOf(StockStatus.COMPLETED, StockStatus.REVIEWED, StockStatus.LOCKED)

    /** Only counts somebody said were done stand for what a shelf held. */
    fun isFinished(check: StockCheck): Boolean = check.statusEnum in FINISHED

    /** When a count describes the shelf: when it was finished, else when it began. */
    fun takenAt(check: StockCheck): Long = check.completedAt ?: check.createdAt

    /** One product's quantity across every area a set of counts covered. */
    data class Holding(
        val key: String,
        val barcode: String,
        val name: String,
        val unit: String,
        /** Thousandths of a unit. See [Quantity]. */
        val quantity: Long,
    )

    /**
     * Products are matched by barcode, or by name for a line that has none --
     * a spoken "five eggs" is filed under its name until someone scans it.
     * Null for a line that has neither, which says nothing about any product.
     */
    fun productKey(item: StockItem): String? {
        val barcode = item.barcode.trim()
        if (barcode.isNotEmpty()) return barcode
        val name = item.productName.trim().lowercase()
        return if (name.isEmpty()) null else "name:$name"
    }

    private fun areaKey(check: StockCheck): String =
        check.branchId + "\u0000" + check.zone.trim().lowercase()

    /** What [checks] together say was held. See the rule on [StockComparison]. */
    fun snapshot(
        checks: List<StockCheck>,
        itemsOf: (StockCheck) -> List<StockItem>,
    ): Map<String, Holding> {
        // (area, product) -> quantity from the latest count of it there.
        val latest = mutableMapOf<Pair<String, String>, Long>()
        val labels = mutableMapOf<String, Holding>()

        for (check in checks.sortedWith(compareBy<StockCheck>({ takenAt(it) }, { it.createdAt }))) {
            val area = areaKey(check)
            itemsOf(check)
                .mapNotNull { item -> productKey(item)?.let { it to item } }
                .groupBy({ it.first }, { it.second })
                .forEach { (key, lines) ->
                    // Two lines for one product in one count are both on the
                    // shelf; they add.
                    latest[area to key] = lines.sumOf { it.counted }
                    val line = lines.last()
                    val previous = labels[key]
                    labels[key] = Holding(
                        key = key,
                        barcode = line.barcode.trim(),
                        // The newest non-blank name, so a product named
                        // halfway through the month reads by its name.
                        name = line.productName.trim().ifEmpty { previous?.name.orEmpty() },
                        unit = line.unit.trim().ifEmpty { previous?.unit.orEmpty() },
                        quantity = 0L,
                    )
                }
        }

        return latest.entries
            .groupBy({ it.key.second }, { it.value })
            .mapValues { (key, quantities) -> labels.getValue(key).copy(quantity = quantities.sum()) }
    }

    enum class Kind { UP, DOWN, SAME, NEW, NOT_COUNTED }

    data class Row(
        val key: String,
        val barcode: String,
        val name: String,
        val unit: String,
        /** Null when the earlier counts did not include this product. */
        val before: Long?,
        /** Null when the later counts did not include it -- not counted, not zero. */
        val after: Long?,
    ) {
        /** Only defined when both sides counted it. */
        val change: Long? get() = if (before != null && after != null) after - before else null

        val kind: Kind
            get() = when {
                before == null -> Kind.NEW
                after == null -> Kind.NOT_COUNTED
                after > before -> Kind.UP
                after < before -> Kind.DOWN
                else -> Kind.SAME
            }

        /** What a person reads: the name, or the barcode when it has none. */
        val label: String get() = name.ifEmpty { barcode }
    }

    data class Summary(
        val beforeTotal: Long,
        val afterTotal: Long,
        val up: Int,
        val down: Int,
        val same: Int,
        val new: Int,
        val notCounted: Int,
    )

    /**
     * Every product either side counted, biggest movement first.
     *
     * Movers lead because they are what someone opens this to find. New
     * products and ones the later counts skipped come after, and unchanged
     * lines last.
     */
    fun compare(before: Map<String, Holding>, after: Map<String, Holding>): List<Row> =
        (before.keys + after.keys).map { key ->
            val b = before[key]
            val a = after[key]
            Row(
                key = key,
                barcode = (a ?: b)!!.barcode,
                name = a?.name?.ifEmpty { null } ?: b?.name.orEmpty(),
                unit = a?.unit?.ifEmpty { null } ?: b?.unit.orEmpty(),
                before = b?.quantity,
                after = a?.quantity,
            )
        }.sortedWith(
            compareBy<Row>(
                {
                    when (it.kind) {
                        Kind.UP, Kind.DOWN -> 0
                        Kind.NEW -> 1
                        Kind.NOT_COUNTED -> 2
                        Kind.SAME -> 3
                    }
                },
                { -abs(it.change ?: 0L) },
                { it.label.lowercase() },
            ),
        )

    fun summarise(rows: List<Row>): Summary = Summary(
        beforeTotal = rows.sumOf { it.before ?: 0L },
        afterTotal = rows.sumOf { it.after ?: 0L },
        up = rows.count { it.kind == Kind.UP },
        down = rows.count { it.kind == Kind.DOWN },
        same = rows.count { it.kind == Kind.SAME },
        new = rows.count { it.kind == Kind.NEW },
        notCounted = rows.count { it.kind == Kind.NOT_COUNTED },
    )
}
