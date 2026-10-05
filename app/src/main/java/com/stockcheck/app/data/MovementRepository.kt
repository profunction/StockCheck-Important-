package com.stockcheck.app.data

import com.google.firebase.firestore.Query
import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.MovementSource
import com.stockcheck.app.model.MovementType
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Quantity
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockMovement
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import java.time.LocalTime
import java.time.ZoneId

/**
 * Goods in and out between counts: deliveries, sales, refunds, write-offs.
 */
class MovementRepository(private val audit: AuditRepository) {

    /**
     * Movements this account may see, from [since] on (or all of them).
     *
     * Head office's query is filtered by time on the server. A branch
     * account's has to be filtered by branch for the rules to accept it, and
     * branch plus time on two different fields needs a composite index this
     * project does not deploy -- so for a branch account the time filter is
     * applied here instead, which reads that branch's whole history. Fine for
     * a shop; worth an index once a branch has years of daily sales in it.
     */
    fun observe(session: Session, since: Long?): Flow<List<StockMovement>> {
        val branches = session.profile.branchIds
        if (branches.isEmpty()) {
            val query: Query = if (since != null) {
                Db.movements().whereGreaterThanOrEqualTo("at", since)
            } else {
                Db.movements()
            }
            return query.asFlow<StockMovement>()
        }
        val flows = (branches + "").distinct().chunked(10).map { chunk ->
            Db.movements().whereIn("branchId", chunk).asFlow<StockMovement>()
        }
        val merged: Flow<List<StockMovement>> =
            if (flows.size == 1) flows.single() else combine(flows) { lists -> lists.flatMap { it } }
        return merged.map { list -> if (since == null) list else list.filter { it.at >= since } }
    }

    /** One movement entered by hand: a delivery, a write-off. */
    suspend fun record(
        session: Session,
        type: MovementType,
        product: Product?,
        barcode: String,
        quantityMilli: Long,
        branchId: String,
        note: String,
        at: Long = System.currentTimeMillis(),
    ) {
        session.require(Permission.RECORD_STOCK_MOVEMENTS)
        require(barcode.isNotBlank()) { "Choose a product." }
        require(quantityMilli > 0L) { "Enter how many." }
        val doc = Db.movements().document()
        val now = System.currentTimeMillis()
        doc.set(
            StockMovement(
                barcode = product?.barcode ?: barcode.trim(),
                productName = product?.name.orEmpty(),
                branchId = branchId,
                type = type.name,
                quantityMilli = quantityMilli,
                at = at,
                source = MovementSource.MANUAL.name,
                note = note.trim(),
                createdByUid = session.uid,
                createdByName = session.profile.displayName,
                createdAt = now,
            ),
        ).awaitAck()
        audit.record(
            session = session,
            entity = "Movement",
            entityId = doc.id,
            entityLabel = product?.name?.ifBlank { null } ?: barcode,
            action = AuditAction.CREATE,
            field = type.name.lowercase(),
            newValue = Quantity.format(quantityMilli),
        )
    }

    /**
     * Writes an imported file's movements.
     *
     * Each id comes from the product, the day, the branch and the kind of
     * file, and set() replaces whatever that id held -- so importing the
     * same day again corrects it rather than adding to it.
     */
    suspend fun importPlanned(
        session: Session,
        kind: MovementFile.Kind,
        branchId: String,
        planned: List<MovementFile.Planned>,
        fileName: String,
    ): Int {
        session.require(Permission.RECORD_STOCK_MOVEMENTS)
        val now = System.currentTimeMillis()
        val zone = ZoneId.systemDefault()
        planned.chunked(400).forEach { chunk ->
            val batch = Db.batch()
            chunk.forEach { line ->
                batch.set(
                    Db.movement(MovementFile.movementId(kind, branchId, line)),
                    StockMovement(
                        barcode = line.key,
                        productName = line.name,
                        branchId = branchId,
                        type = line.type(kind).name,
                        quantityMilli = line.quantity,
                        // Midday: see StockMovement.at.
                        at = line.date.atTime(LocalTime.NOON).atZone(zone).toInstant().toEpochMilli(),
                        source = MovementSource.FILE.name,
                        reference = fileName,
                        createdByUid = session.uid,
                        createdByName = session.profile.displayName,
                        createdAt = now,
                    ),
                )
            }
            batch.commit().awaitAck()
        }
        audit.record(
            session = session,
            entity = "Movement",
            entityId = "import",
            entityLabel = fileName,
            action = AuditAction.CREATE,
            field = kind.name.lowercase(),
            newValue = "${planned.size} product-days from $fileName",
        )
        return planned.size
    }

    suspend fun delete(session: Session, movement: StockMovement) {
        session.require(Permission.RECORD_STOCK_MOVEMENTS)
        Db.movement(movement.id).delete().awaitAck()
        audit.record(
            session = session,
            entity = "Movement",
            entityId = movement.id,
            entityLabel = movement.productName.ifBlank { movement.barcode },
            action = AuditAction.DELETE,
            field = movement.type.lowercase(),
            oldValue = Quantity.format(movement.quantityMilli),
        )
    }

    /**
     * When to call a product low. Null clears it. A product the catalogue
     * does not have yet is added, by its barcode, with just this set.
     */
    suspend fun setReorderLevel(session: Session, barcode: String, name: String, levelMilli: Long?) {
        session.require(Permission.RECORD_STOCK_MOVEMENTS)
        require(barcode.isNotBlank() && !barcode.startsWith("name:")) {
            "Only a product with a barcode can have a reorder level."
        }
        val ref = Db.product(barcode)
        val now = System.currentTimeMillis()
        if (ref.get().await().exists()) {
            ref.update(mapOf("reorderLevelMilli" to levelMilli, "updatedAt" to now)).awaitAck()
        } else {
            ref.set(
                Product(
                    barcode = barcode,
                    name = name,
                    reorderLevelMilli = levelMilli,
                    createdAt = now,
                    createdByUid = session.uid,
                    updatedAt = now,
                ),
            ).awaitAck()
        }
    }
}
