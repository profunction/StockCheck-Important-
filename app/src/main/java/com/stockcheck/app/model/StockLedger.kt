package com.stockcheck.app.model

/**
 * What should be on the shelf now, and what went missing at the last count.
 *
 * Pure, like [StockComparison], whose rule for turning counts into a figure
 * it reuses: per area the latest count of a product wins, and areas add up.
 *
 * - **On hand** is the latest counted figure plus what came in and minus what
 *   went out since. A movement from before the count is already in the count.
 * - **Loss at count** is what that count found against what the previous
 *   count and the movements since said should be there. That is the number a
 *   shop owner buys this for: not "you have 92" but "you should have had 95".
 *
 * A product never counted has no baseline; its figure is only the movements,
 * and it says so rather than passing that off as stock on hand.
 *
 * Each branch is worked out on its own -- a sale in Ipoh says nothing about
 * the shelf in KL -- and [merge] adds them up for head office.
 */
object StockLedger {

    data class Level(
        val key: String,
        val barcode: String,
        val name: String,
        val unit: String,
        /** What the latest counts found, null if never counted. */
        val counted: Long?,
        /** When the latest count of it was taken, null if never counted. */
        val countedAt: Long?,
        /** Thousandths in since that count, positive. */
        val inSince: Long,
        /** Thousandths out since that count, positive. */
        val outSince: Long,
        val reorderLevel: Long?,
        /**
         * The latest count against what was expected: negative is missing,
         * positive is more than expected. Null when there was nothing to
         * expect -- the first count of a product.
         */
        val lossAtCount: Long?,
        /**
         * What the shop's till says it has, when the till keeps stock
         * (Loyverse does). Null when there is no till figure.
         */
        val pos: Long? = null,
    ) {
        val onHand: Long get() = (counted ?: 0L) + inSince - outSince

        /**
         * The figure to show. Once counted here, the count and what moved
         * since. Never counted, the till's own figure is a better guess than
         * movements from nothing -- the till already took its sales off it.
         */
        val shown: Long get() = if (counted == null && pos != null) pos else onHand

        /** True when the big number is the till's figure rather than this app's. */
        val shownFromPos: Boolean get() = counted == null && pos != null

        val isLow: Boolean get() = reorderLevel != null && shown <= reorderLevel
        val label: String get() = name.ifEmpty { barcode }
    }

    /**
     * One branch's levels.
     *
     * [checks] and [movements] must already be that branch's; unfinished
     * counts are ignored here, because a count still in progress says
     * nothing yet about any shelf.
     */
    fun levels(
        checks: List<StockCheck>,
        itemsOf: (StockCheck) -> List<StockItem>,
        movements: List<StockMovement>,
        catalogue: Map<String, Product> = emptyMap(),
    ): List<Level> {
        val finished = checks.filter(StockComparison::isFinished)
        val counted = StockComparison.snapshot(finished, itemsOf)
        val countedAt = latestTimes(finished, itemsOf)

        val movementsByKey = movements
            .filter { it.barcode.isNotBlank() && it.typeEnum != null }
            .groupBy { it.barcode }

        // The baseline before each count time, worked out once per time.
        val before = mutableMapOf<Long, Pair<Map<String, StockComparison.Holding>, Map<String, Long>>>()
        fun baselineBefore(time: Long) = before.getOrPut(time) {
            val earlier = finished.filter { StockComparison.takenAt(it) < time }
            StockComparison.snapshot(earlier, itemsOf) to latestTimes(earlier, itemsOf)
        }

        return (counted.keys + movementsByKey.keys).map { key ->
            val holding = counted[key]
            val at = countedAt[key]
            val moves = movementsByKey[key].orEmpty()
            val since = if (at == null) moves else moves.filter { it.at > at }

            val loss = at?.let { countTime ->
                val (prevHeld, prevTimes) = baselineBefore(countTime)
                val prev = prevHeld[key]?.quantity
                val prevAt = prevTimes[key]
                val between = moves.filter {
                    it.at <= countTime && (prevAt == null || it.at > prevAt)
                }
                if (prev == null && between.isEmpty()) {
                    null
                } else {
                    holding!!.quantity - ((prev ?: 0L) + between.sumOf { it.signed })
                }
            }

            val product = catalogue[key]
            val lastMove = moves.maxByOrNull { it.at }
            Level(
                key = key,
                barcode = holding?.barcode ?: product?.barcode ?: key.takeUnless { it.startsWith("name:") }.orEmpty(),
                name = product?.name?.ifBlank { null }
                    ?: holding?.name?.ifBlank { null }
                    ?: lastMove?.productName.orEmpty(),
                unit = holding?.unit?.ifBlank { null } ?: product?.unit ?: "",
                counted = holding?.quantity,
                countedAt = at,
                inSince = since.filter { it.signed > 0 }.sumOf { it.signed },
                outSince = since.filter { it.signed < 0 }.sumOf { -it.signed },
                reorderLevel = product?.reorderLevelMilli,
                lossAtCount = loss,
            )
        }.sortedBy { it.label.lowercase() }
    }

    /** Head office's view: every branch added up, product by product. */
    fun merge(branches: List<List<Level>>): List<Level> =
        branches.flatten()
            .groupBy { it.key }
            .map { (_, levels) ->
                val first = levels.first()
                val counts = levels.mapNotNull { it.counted }
                val losses = levels.mapNotNull { it.lossAtCount }
                val tills = levels.mapNotNull { it.pos }
                first.copy(
                    name = levels.firstOrNull { it.name.isNotEmpty() }?.name.orEmpty(),
                    counted = if (counts.isEmpty()) null else counts.sum(),
                    countedAt = levels.mapNotNull { it.countedAt }.maxOrNull(),
                    inSince = levels.sumOf { it.inSince },
                    outSince = levels.sumOf { it.outSince },
                    lossAtCount = if (losses.isEmpty()) null else losses.sum(),
                    pos = if (tills.isEmpty()) null else tills.sum(),
                )
            }
            .sortedBy { it.label.lowercase() }

    /**
     * Puts the till's stock figures beside [levels]. A product the till
     * keeps stock of but nothing here has touched yet gets a line of its
     * own, so stock entered in the till shows up before the first count.
     */
    fun withPos(
        levels: List<Level>,
        pos: Map<String, Pair<String, Long>>,
        catalogue: Map<String, Product> = emptyMap(),
    ): List<Level> {
        if (pos.isEmpty()) return levels
        val known = levels.map { it.key }.toSet()
        val merged = levels.map { level -> pos[level.key]?.let { level.copy(pos = it.second) } ?: level }
        val added = pos.filterKeys { it !in known }.map { (key, value) ->
            val product = catalogue[key]
            Level(
                key = key,
                barcode = product?.barcode ?: key.takeUnless { it.startsWith("name:") }.orEmpty(),
                name = product?.name?.ifBlank { null } ?: value.first,
                unit = product?.unit.orEmpty(),
                counted = null,
                countedAt = null,
                inSince = 0L,
                outSince = 0L,
                reorderLevel = product?.reorderLevelMilli,
                lossAtCount = null,
                pos = value.second,
            )
        }
        return (merged + added).sortedBy { it.label.lowercase() }
    }

    /** When each product was last counted, in any area. */
    private fun latestTimes(
        checks: List<StockCheck>,
        itemsOf: (StockCheck) -> List<StockItem>,
    ): Map<String, Long> {
        val times = mutableMapOf<String, Long>()
        checks.forEach { check ->
            val at = StockComparison.takenAt(check)
            itemsOf(check).mapNotNull(StockComparison::productKey).forEach { key ->
                times[key] = maxOf(times[key] ?: Long.MIN_VALUE, at)
            }
        }
        return times
    }
}
