package com.stockcheck.app.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.ItemSource
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.model.Template
import kotlinx.coroutines.flow.Flow
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

class StockRepository(private val audit: AuditRepository) {

    // --------------------------------------------------------- stock checks

    fun observeStockChecks(session: Session, limit: Long = 200): Flow<List<StockCheck>> {
        // A user without VIEW_ALL_HISTORY may only see their own rows. The same
        // restriction lives in the Firestore rules; narrowing the query here
        // stops the client asking for documents it would be denied, which would
        // otherwise fail the entire listener rather than filtering it.
        val query = if (session.can(Permission.VIEW_ALL_HISTORY)) {
            Db.stockChecks()
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(limit)
        } else {
            Db.stockChecks()
                .whereEqualTo("createdByUid", session.uid)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(limit)
        }
        return query.asFlow()
    }

    fun observeStockCheck(id: String): Flow<StockCheck?> = Db.stockCheck(id).asFlow()

    suspend fun createStockCheck(session: Session, template: Template, note: String = ""): String {
        session.require(Permission.CREATE_STOCK_CHECK)
        val id = Db.stockChecks().document().id
        val now = System.currentTimeMillis()
        val check = StockCheck(
            id = id,
            refNo = nextRefNo(),
            templateId = template.id,
            templateName = template.name,
            status = StockStatus.IN_PROGRESS.name,
            createdByUid = session.uid,
            createdByName = session.profile.displayName,
            createdAt = now,
            updatedAt = now,
            note = note,
        )
        Db.stockCheck(id).set(check).await()
        audit.record(
            session = session,
            entity = "StockCheck",
            entityId = id,
            entityLabel = check.refNo,
            action = AuditAction.CREATE,
            stockCheckId = id,
        )
        return id
    }

    /**
     * Human-readable reference such as `SC-483920`.
     *
     * Derived from the device clock rather than a shared server counter so a
     * stock check started with no connectivity still gets a reference straight
     * away. It is display-only; [StockCheck.id] remains the real key.
     */
    private fun nextRefNo(): String {
        val seq = (System.currentTimeMillis() / 1000) % 1_000_000
        return "SC-" + seq.toString().padStart(6, '0')
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
        Db.stockCheck(check.id).update(updates).await()
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
        Db.stockCheck(check.id).delete().await()
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
            batch.commit().await()
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
                        createdByUid = session.uid,
                        createdAt = System.currentTimeMillis(),
                        updatedAt = System.currentTimeMillis(),
                    ),
                )
            }
            batch.commit().await()
        }
        Db.stockCheck(newId).update(
            mapOf("itemCount" to items.size, "totalQuantity" to 0),
        ).await()
        return newId
    }

    // ---------------------------------------------------------------- items

    fun observeItems(stockCheckId: String): Flow<List<StockItem>> =
        Db.items(stockCheckId).orderBy("createdAt", Query.Direction.ASCENDING).asFlow()

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
        quantity: Int = 1,
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

        val existing = Db.items(stockCheckId)
            .whereEqualTo("barcode", trimmed)
            .limit(1)
            .get().await()
            .toObjects(StockItem::class.java)
            .firstOrNull()
        if (existing != null) return ScanOutcome.AlreadyPresent(existing)

        val now = System.currentTimeMillis()
        val doc = Db.items(stockCheckId).document()
        val item = StockItem(
            id = doc.id,
            barcode = trimmed,
            productName = productName,
            quantity = quantity,
            unit = unit,
            source = source.name,
            createdByUid = session.uid,
            createdAt = now,
            updatedAt = now,
        )
        // Written before the totals are bumped so the line is durable even if
        // the process dies between the two writes; the counters are rebuildable
        // from the items, the items are not rebuildable from the counters.
        doc.set(item).await()
        bumpTotals(stockCheckId, itemDelta = 1, qtyDelta = quantity)
        audit.record(
            session = session,
            entity = "StockItem",
            entityId = doc.id,
            entityLabel = productName.ifEmpty { trimmed },
            action = AuditAction.CREATE,
            field = "quantity",
            newValue = quantity.toString(),
            stockCheckId = stockCheckId,
        )
        return ScanOutcome.Added(item)
    }

    /** Adds [delta] to an existing line, keeping the before/after in the trail. */
    suspend fun adjustQuantity(
        session: Session,
        stockCheckId: String,
        item: StockItem,
        delta: Int,
    ) {
        session.require(Permission.EDIT_OWN_STOCK)
        val newQty = (item.quantity + delta).coerceAtLeast(0)
        if (newQty == item.quantity) return
        Db.item(stockCheckId, item.id).update(
            mapOf("quantity" to newQty, "updatedAt" to System.currentTimeMillis()),
        ).await()
        bumpTotals(stockCheckId, itemDelta = 0, qtyDelta = newQty - item.quantity)
        audit.record(
            session = session,
            entity = "StockItem",
            entityId = item.id,
            entityLabel = item.productName.ifEmpty { item.barcode },
            action = AuditAction.UPDATE,
            field = "quantity",
            oldValue = item.quantity.toString(),
            newValue = newQty.toString(),
            stockCheckId = stockCheckId,
        )
    }

    suspend fun updateItem(
        session: Session,
        stockCheckId: String,
        before: StockItem,
        after: StockItem,
    ) {
        session.require(Permission.EDIT_OWN_STOCK)
        Db.item(stockCheckId, before.id)
            .set(after.copy(id = before.id, updatedAt = System.currentTimeMillis()))
            .await()
        bumpTotals(stockCheckId, itemDelta = 0, qtyDelta = after.quantity - before.quantity)
        audit.recordChanges(
            session = session,
            entity = "StockItem",
            entityId = before.id,
            entityLabel = after.productName.ifEmpty { after.barcode },
            stockCheckId = stockCheckId,
            changes = changesOf {
                compare("Barcode", before.barcode, after.barcode)
                compare("Product", before.productName, after.productName)
                compare("Quantity", before.quantity, after.quantity)
                compare("Unit", before.unit, after.unit)
                compare("Remark", before.remark, after.remark)
                after.fieldValues.keys.plus(before.fieldValues.keys).forEach { key ->
                    compare(key, before.fieldValues[key], after.fieldValues[key])
                }
            },
        )
    }

    suspend fun deleteItem(session: Session, stockCheckId: String, item: StockItem) {
        session.require(Permission.EDIT_OWN_STOCK)
        Db.item(stockCheckId, item.id).delete().await()
        bumpTotals(stockCheckId, itemDelta = -1, qtyDelta = -item.quantity)
        audit.record(
            session = session,
            entity = "StockItem",
            entityId = item.id,
            entityLabel = item.productName.ifEmpty { item.barcode },
            action = AuditAction.DELETE,
            oldValue = item.quantity.toString(),
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
    private suspend fun bumpTotals(stockCheckId: String, itemDelta: Int, qtyDelta: Int) {
        val updates = mutableMapOf<String, Any>("updatedAt" to System.currentTimeMillis())
        if (itemDelta != 0) updates["itemCount"] = FieldValue.increment(itemDelta.toLong())
        if (qtyDelta != 0) updates["totalQuantity"] = FieldValue.increment(qtyDelta.toLong())
        // A counter that fails to update is a cosmetic problem, not a data-loss
        // one, so it must never surface as a failure of the scan itself.
        runCatching { Db.stockCheck(stockCheckId).update(updates).await() }
    }
}
