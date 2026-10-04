package com.stockcheck.app.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.ItemSource
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Quantity
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.SignatureInk
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.model.Template
import com.stockcheck.app.model.WorkspaceConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

/** What happened when a barcode was scanned, so the UI can react appropriately. */
sealed interface ScanOutcome {
    /** The barcode was not in this stock check, so a new line was created. */
    data class Added(val item: StockItem) : ScanOutcome

    /**
     * The barcode already exists in this stock check. The caller shows the
     * current quantity and offers to add to it rather than silently creating a
     * second line — this is the duplicate-barcode protection.
     */
    data class AlreadyPresent(val item: StockItem) : ScanOutcome
}

class StockRepository(
    private val audit: AuditRepository,
    private val products: ProductRepository,
    private val refNos: RefNoAllocator,
) {

    // --------------------------------------------------------- stock checks

    /**
     * The stock checks this account may see, newest first.
     *
     * Which queries that takes depends on the account -- see
     * [stockCheckQueries]. Only head office's can be ordered and limited by
     * the server; the rest are filtered by author or branch, and ordering
     * those by date too needs a composite index, without which Firestore
     * fails the query outright (an empty History tab, not an error). So
     * ordering is done here, and the limit after it, so it still means "the
     * most recent N".
     */
    fun observeStockChecks(session: Session, limit: Long = 200): Flow<List<StockCheck>> {
        val flows = session.stockCheckQueries(limit).map { it.asFlow<StockCheck>() }
        val merged: Flow<List<StockCheck>> = if (flows.size == 1) {
            flows.single()
        } else {
            // A branch account's own count can sit under one of its branches
            // and so come back from two queries.
            combine(flows) { lists -> lists.flatMap { it }.distinctBy { it.id } }
        }
        return merged.map { checks ->
            checks.filter { session.maySee(it) }
                .sortedByDescending { it.createdAt }
                .take(limit.toInt())
        }
    }

    fun observeStockCheck(id: String): Flow<StockCheck?> = Db.stockCheck(id).asFlow()

    suspend fun createStockCheck(
        session: Session,
        template: Template,
        zone: String = "",
        note: String = "",
        branch: Branch? = null,
    ): String {
        session.require(Permission.CREATE_STOCK_CHECK)
        val id = Db.stockChecks().document().id
        val now = System.currentTimeMillis()
        val check = StockCheck(
            id = id,
            refNo = refNos.next(),
            templateId = template.id,
            templateName = template.name,
            status = StockStatus.IN_PROGRESS.name,
            createdByUid = session.uid,
            createdByName = session.profile.displayName,
            createdAt = now,
            updatedAt = now,
            zone = zone.trim(),
            branchId = branch?.id.orEmpty(),
            // Copied, not looked up later. A count is a record of what was
            // true that day, and that includes what the place was called
            // before somebody renamed it.
            branchName = branch?.name.orEmpty(),
            note = note,
        )
        Db.stockCheck(id).set(check).awaitAck()

        // A zone typed for the first time joins the list, so the next person
        // taps it instead of retyping it and inventing "Cold Room" beside
        // "cold room".
        if (zone.isNotBlank()) rememberZone(session, zone.trim())
        audit.record(
            session = session,
            entity = "StockCheck",
            entityId = id,
            entityLabel = check.refNo,
            action = AuditAction.CREATE,
            stockCheckId = id,
        )
        // Draw more numbers while there is evidently a connection to draw
        // them over. Waiting until the roll is empty means discovering it is
        // empty in the one place there is no signal to fill it.
        refNos.topUpQuietly()
        return id
    }

    /**
     * Drops an area from the company's list.
     *
     * The list is a row of shortcuts, not a record: removing one takes the
     * button away and leaves every count ever made in that area exactly as it
     * was. Best effort for the same reason as [rememberZone] -- the rules let
     * an admin write the config and nobody else, and a worker tapping this
     * should get nothing rather than an error about permissions.
     */
    suspend fun forgetZone(session: Session, zone: String) {
        session.require(Permission.CREATE_STOCK_CHECK)
        runCatching {
            val config = Db.config().getAs<WorkspaceConfig>() ?: return
            val kept = config.zones.filterNot { it.equals(zone, ignoreCase = true) }
            if (kept.size == config.zones.size) return
            Db.config().update("zones", kept).awaitAck()
        }
    }

    /**
     * Adds a newly used zone to the company's list.
     *
     * Best effort on purpose: a worker who may not write the config must still
     * be able to start a count in a new area. Failing here would block the
     * count over a convenience.
     */
    private suspend fun rememberZone(session: Session, zone: String) {
        runCatching {
            val config = Db.config().getAs<WorkspaceConfig>() ?: return
            val known = config.zones
            if (known.any { it.equals(zone, ignoreCase = true) }) return
            Db.config().update("zones", known + zone).awaitAck()
        }
    }

    suspend fun updateStatus(session: Session, check: StockCheck, target: StockStatus) {
        val permission = when (target) {
            StockStatus.COMPLETED -> Permission.MARK_COMPLETED
            StockStatus.REVIEWED -> Permission.MARK_REVIEWED
            StockStatus.LOCKED -> Permission.LOCK_STOCK
            StockStatus.DRAFT, StockStatus.IN_PROGRESS ->
                if (check.statusEnum.isFrozen) Permission.UNLOCK_STOCK else Permission.EDIT_OWN_STOCK
        }
        session.require(permission)

        val updates = mutableMapOf<String, Any?>(
            "status" to target.name,
            "updatedAt" to System.currentTimeMillis(),
        )
        when (target) {
            StockStatus.COMPLETED -> updates["completedAt"] = System.currentTimeMillis()
            StockStatus.REVIEWED -> {
                updates["reviewedByUid"] = session.uid
                updates["reviewedByName"] = session.profile.displayName
            }
            StockStatus.LOCKED -> updates["lockedByUid"] = session.uid
            else -> updates["lockedByUid"] = null
        }
        Db.stockCheck(check.id).update(updates).awaitAck()
        audit.record(
            session = session,
            entity = "StockCheck",
            entityId = check.id,
            entityLabel = check.refNo,
            action = AuditAction.STATUS_CHANGE,
            field = "status",
            oldValue = check.statusEnum.label,
            newValue = target.label,
            stockCheckId = check.id,
        )
    }

    suspend fun deleteStockCheck(session: Session, check: StockCheck) {
        require(session.effectivePermissions.canDeleteRecordBy(check.createdByUid, session.uid)) {
            "You are not allowed to delete this stock check."
        }
        require(!check.statusEnum.isFrozen || session.can(Permission.UNLOCK_STOCK)) {
            "This stock check is locked."
        }
        // Deleting a document does not delete its subcollections, so items and
        // photos are cleared first; otherwise they linger as unreachable
        // orphans that still count against the project's storage quota.
        deleteAllIn(Db.items(check.id))
        deleteAllIn(Db.photos(check.id))
        Db.stockCheck(check.id).delete().awaitAck()
        audit.record(
            session = session,
            entity = "StockCheck",
            entityId = check.id,
            entityLabel = check.refNo,
            action = AuditAction.DELETE,
            stockCheckId = check.id,
        )
    }

    private suspend fun deleteAllIn(collection: com.google.firebase.firestore.CollectionReference) {
        // Batches cap at 500 operations, so the documents are removed in chunks.
        collection.get().await().documents.chunked(400).forEach { chunk ->
            val batch = Db.batch()
            chunk.forEach { batch.delete(it.reference) }
            batch.commit().awaitAck()
        }
    }

    suspend fun duplicateStockCheck(session: Session, source: StockCheck): String {
        session.require(Permission.DUPLICATE_STOCK)
        val template = Db.template(source.templateId).getAs<Template>()
            ?: Template(id = source.templateId, name = source.templateName)
        val newId = createStockCheck(session, template, note = "Duplicated from ${source.refNo}")

        // Quantities are deliberately reset to zero: duplicating reuses the
        // product list for a fresh count, it does not copy last week's numbers
        // into today's record.
        val items = Db.items(source.id).get().await().toObjects(StockItem::class.java)
        items.chunked(400).forEach { chunk ->
            val batch = Db.batch()
            chunk.forEach { item ->
                val doc = Db.items(newId).document()
                batch.set(
                    doc,
                    item.copy(
                        id = doc.id,
                        quantity = 0,
                        quantityMilli = 0L,
                        createdByUid = session.uid,
                        createdAt = System.currentTimeMillis(),
                        updatedAt = System.currentTimeMillis(),
                    ),
                )
            }
            batch.commit().awaitAck()
        }
        Db.stockCheck(newId).update(
            mapOf("itemCount" to items.size, "totalQuantityMilli" to 0L),
        ).awaitAck()
        return newId
    }

    // ---------------------------------------------------------------- items

    /**
     * Whether edits to this check's items belong in the audit trail yet.
     *
     * While a count is in progress its lines are working notes: a mis-scan
     * removed three seconds later, a quantity tapped up to the right number.
     * Recording each of those buries the entries that matter under noise
     * nobody will read, and makes correcting your own unfinished work feel
     * like something being held against you.
     *
     * Once the count is declared finished, every touch is recorded. That is
     * the line: changing what you are still counting is not the same act as
     * changing what you already said you counted.
     */
    private suspend fun isAuditable(stockCheckId: String): Boolean {
        val status = Db.stockCheck(stockCheckId).getAs<StockCheck>()?.statusEnum
        return status != null &&
            status != StockStatus.IN_PROGRESS &&
            status != StockStatus.DRAFT
    }

    fun observeItems(stockCheckId: String): Flow<List<StockItem>> =
        Db.items(stockCheckId).orderBy("createdAt", Query.Direction.ASCENDING).asFlow()

    /** Every line of one count, read once rather than watched. */
    suspend fun fetchItems(stockCheckId: String): List<StockItem> =
        Db.items(stockCheckId).get().await().toObjects(StockItem::class.java)

    /**
     * Handles a scanned, spoken or typed barcode.
     *
     * Returns [ScanOutcome.AlreadyPresent] instead of creating a second line
     * when the barcode is already in this stock check, leaving the decision of
     * how much to add with the operator.
     */
    suspend fun scanBarcode(
        session: Session,
        stockCheckId: String,
        barcode: String,
        productName: String = "",
        /** Thousandths of a unit. See [Quantity]. */
        quantity: Long = Quantity.UNIT,
        unit: String = "pcs",
        source: ItemSource = ItemSource.SCAN,
    ): ScanOutcome {
        session.require(
            when (source) {
                ItemSource.VOICE -> Permission.VOICE_INPUT
                ItemSource.SCAN -> Permission.SCAN_BARCODE
                ItemSource.MANUAL -> Permission.CREATE_STOCK_CHECK
            },
        )
        val trimmed = barcode.trim()
        require(trimmed.isNotEmpty()) { "Barcode cannot be empty." }

        // Resolved first, because which line this scan belongs to depends on
        // it. A known barcode also names itself: without that, every counted
        // line is a row of digits nobody can check against the shelf it came
        // from.
        val known = if (productName.isBlank()) products.find(trimmed) else null

        // Any code the product answers to, not only the one just scanned.
        // A tin and its carton carry different numbers; matching on the
        // scanned code alone opens a second line for the same product, and
        // the count then reports one stock item twice under two names with
        // nothing on screen to say so.
        //
        // Firestore caps whereIn, so a product carrying more codes than that
        // is matched on its first few. Degrading beats the alternative: over
        // the cap the query fails outright, which would stop the scan rather
        // than merely make it miss an unusual code.
        val codes = (known?.allBarcodes ?: listOf(trimmed)).take(IN_QUERY_LIMIT)
        val existing = Db.items(stockCheckId)
            .whereIn("barcode", codes)
            .limit(1)
            .get().await()
            .toObjects(StockItem::class.java)
            .firstOrNull()
        if (existing != null) return ScanOutcome.AlreadyPresent(existing)

        val now = System.currentTimeMillis()
        val doc = Db.items(stockCheckId).document()
        val item = StockItem(
            // Filed under the product's own code rather than whichever of its
            // codes happened to be scanned, so two people scanning the tin and
            // the carton produce one line and the export reads consistently.
            barcode = known?.barcode ?: trimmed,
            id = doc.id,
            productName = productName.ifBlank { known?.name.orEmpty() },
            sku = known?.sku.orEmpty(),
            quantityMilli = quantity,
            // The catalogue's unit only wins when the caller did not state one,
            // so a spoken "25 cartons" is not overridden by the default.
            unit = if (unit == "pcs") known?.unit ?: unit else unit,
            source = source.name,
            createdByUid = session.uid,
            createdAt = now,
            updatedAt = now,
        )
        // Written before the totals are bumped so the line is durable even if
        // the process dies between the two writes; the counters are rebuildable
        // from the items, the items are not rebuildable from the counters.
        doc.set(item).awaitAck()
        bumpTotals(stockCheckId, itemDelta = 1, qtyDelta = quantity)
        if (isAuditable(stockCheckId)) audit.record(
            session = session,
            entity = "StockItem",
            entityId = doc.id,
            entityLabel = productName.ifEmpty { trimmed },
            action = AuditAction.CREATE,
            field = "quantity",
            newValue = Quantity.format(quantity),
            stockCheckId = stockCheckId,
        )
        return ScanOutcome.Added(item)
    }

    /** Adds [delta] to an existing line, keeping the before/after in the trail. */
    suspend fun adjustQuantity(
        session: Session,
        stockCheckId: String,
        item: StockItem,
        /** Thousandths of a unit, positive or negative. See [Quantity]. */
        delta: Long,
        /** Who created the stock check this line belongs to. See [updateItem]. */
        checkCreatedByUid: String,
    ) {
        require(session.effectivePermissions.canEditRecordBy(checkCreatedByUid, session.uid)) {
            "You are not allowed to edit this stock check."
        }
        val newQty = (item.counted + delta).coerceAtLeast(0L)
        if (newQty == item.counted) return
        val applied = newQty - item.counted
        // An atomic increment, not the computed total. Two phones counting the
        // same check each hold their own snapshot of the quantity; writing a
        // total means the second write silently erases the first one's work,
        // and the count comes out short with nothing to show why. The increment
        // also survives being queued offline and replayed later, which is the
        // normal case in a warehouse.
        // An increment treats a field that is not there as zero, and a line
        // recorded before weighing has no quantityMilli at all -- so
        // incrementing one would drop everything counted so far and leave
        // only this edit. The first edit to such a line writes the total
        // instead, which converts it; every edit after that increments as
        // normal because the field now exists.
        val write: Any =
            if (item.quantityMilli == null) newQty else FieldValue.increment(applied)
        Db.item(stockCheckId, item.id).update(
            mapOf(
                "quantityMilli" to write,
                "updatedAt" to System.currentTimeMillis(),
            ),
        ).awaitAck()
        bumpTotals(stockCheckId, itemDelta = 0, qtyDelta = applied)
        if (isAuditable(stockCheckId)) audit.record(
            session = session,
            entity = "StockItem",
            entityId = item.id,
            entityLabel = item.productName.ifEmpty { item.barcode },
            action = AuditAction.UPDATE,
            field = "quantity",
            // What was written, not only what this phone expected to see.
            // The write is an increment against whatever the server holds, so
            // when two phones edit one line from the same stale snapshot the
            // totals they each predicted are both wrong -- but the increments
            // they applied still add up to the number now stored. Recording
            // the increment is what keeps the trail reconcilable; recording
            // only the predicted total makes it assert something that never
            // happened.
            oldValue = Quantity.format(item.counted),
            newValue = Quantity.format(newQty) +
                " (applied as " +
                (if (applied > 0) "+" else "") + Quantity.format(applied) + ")",
            stockCheckId = stockCheckId,
        )
    }

    suspend fun updateItem(
        session: Session,
        stockCheckId: String,
        before: StockItem,
        after: StockItem,
        /**
         * Who created the stock check this line belongs to, not who scanned
         * this particular line -- editing is granted per check, the same way
         * the screen that offers the edit button decides whether to show it.
         * A blanket [Permission.EDIT_OWN_STOCK] check here would refuse a
         * supervisor who has [Permission.EDIT_ANY_STOCK] but, reasonably,
         * never ticked "edit own" because they do not count stock themselves.
         */
        checkCreatedByUid: String,
    ) {
        require(session.effectivePermissions.canEditRecordBy(checkCreatedByUid, session.uid)) {
            "You are not allowed to edit this stock check."
        }
        Db.item(stockCheckId, before.id)
            .set(after.copy(id = before.id, updatedAt = System.currentTimeMillis()))
            .awaitAck()
        if (isAuditable(stockCheckId)) audit.recordChanges(
            session = session,
            entity = "StockItem",
            entityId = before.id,
            entityLabel = after.productName.ifEmpty { after.barcode },
            stockCheckId = stockCheckId,
            changes = changesOf {
                compare("Barcode", before.barcode, after.barcode)
                compare("Product", before.productName, after.productName)
                compare(
                    "Quantity",
                    Quantity.format(before.counted),
                    Quantity.format(after.counted),
                )
                compare("Unit", before.unit, after.unit)
                compare("Remark", before.remark, after.remark)
                after.fieldValues.keys.plus(before.fieldValues.keys).forEach { key ->
                    if (SignatureInk.isInkKey(key)) {
                        // Thousands of coordinates say nothing a reader can
                        // use; whether it is now signed is the whole point.
                        compare(
                            "Signature",
                            before.fieldValues[key]?.let { signedLabel(it) },
                            after.fieldValues[key]?.let { signedLabel(it) },
                        )
                    } else {
                        compare(key, before.fieldValues[key], after.fieldValues[key])
                    }
                }
            },
        )
    }

    suspend fun deleteItem(
        session: Session,
        stockCheckId: String,
        item: StockItem,
        /** Who created the stock check this line belongs to. See [updateItem]. */
        checkCreatedByUid: String,
    ) {
        require(session.effectivePermissions.canEditRecordBy(checkCreatedByUid, session.uid)) {
            "You are not allowed to edit this stock check."
        }
        Db.item(stockCheckId, item.id).delete().awaitAck()
        bumpTotals(stockCheckId, itemDelta = -1, qtyDelta = -item.counted)
        // A line removed while still counting leaves no trace: it was a
        // mis-scan being corrected, not a record being altered.
        if (isAuditable(stockCheckId)) audit.record(
            session = session,
            entity = "StockItem",
            entityId = item.id,
            entityLabel = item.productName.ifEmpty { item.barcode },
            action = AuditAction.DELETE,
            oldValue = Quantity.format(item.counted),
            stockCheckId = stockCheckId,
        )
    }

    /**
     * Keeps the parent's counters in step with its items.
     *
     * The updates are atomic increments rather than read-modify-write so two
     * phones counting the same stock check cannot clobber each other's totals,
     * and so the arithmetic still resolves correctly when several increments
     * are queued offline and replayed together.
     */
    /** Reduces a stroke blob to the only thing an audit reader needs. */
    private fun signedLabel(ink: String): String =
        if (SignatureInk.isSigned(ink)) "signed" else "not signed"

    /** [qtyDelta] is in thousandths of a unit, as every quantity here is. */
    private suspend fun bumpTotals(stockCheckId: String, itemDelta: Int, qtyDelta: Long) {
        val updates = mutableMapOf<String, Any>("updatedAt" to System.currentTimeMillis())
        if (itemDelta != 0) updates["itemCount"] = FieldValue.increment(itemDelta.toLong())
        if (qtyDelta != 0L) {
            // Its own field rather than the old totalQuantity: that one holds
            // whole units for every check counted so far, and adding
            // thousandths to it would produce a number a thousand times too
            // large with nothing to say which scale any given check is on.
            updates["totalQuantityMilli"] = FieldValue.increment(qtyDelta)
        }
        // A counter that fails to update is a cosmetic problem, not a data-loss
        // one, so it must never surface as a failure of the scan itself.
        runCatching { Db.stockCheck(stockCheckId).update(updates).awaitAck() }
    }

    private companion object {
        /**
         * How many values Firestore accepts in a whereIn.
         *
         * Going over it fails the query rather than truncating, which would
         * stop a scan dead. A product with more codes than this is matched on
         * its first few instead.
         */
        const val IN_QUERY_LIMIT = 10
    }
}
