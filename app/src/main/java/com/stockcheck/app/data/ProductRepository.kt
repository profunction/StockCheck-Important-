package com.stockcheck.app.data

import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Session
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * The product catalogue: barcode to name, SKU and default unit.
 *
 * A stock check without this records rows of bare digits that nobody can check
 * against the shelf in front of them. With it, a scan names itself.
 */
class ProductRepository(private val audit: AuditRepository) {

    /**
     * Sorted in memory rather than by the query.
     *
     * Filtering on `active` while ordering by `name` needs a composite index,
     * and Firestore fails such a query outright instead of returning unsorted
     * results — which surfaces as an empty catalogue with no error. A few
     * thousand products sort here in microseconds.
     */
    fun observeProducts(activeOnly: Boolean = false): Flow<List<Product>> {
        val query = if (activeOnly) Db.products().whereEqualTo("active", true) else Db.products()
        return query.asFlow<Product>().map { list -> list.sortedBy { it.name.lowercase() } }
    }

    /**
     * Looks up one barcode.
     *
     * A direct document read, not a query: this runs on every scan, often with
     * no signal, and has to come back from the offline cache before the row
     * appears on screen.
     */
    suspend fun find(barcode: String): Product? {
        val key = barcode.trim()
        if (key.isEmpty()) return null
        return runCatching { Db.product(key).getAs<Product>() }.getOrNull()
    }

    suspend fun save(
        session: Session,
        barcode: String,
        name: String,
        sku: String,
        unit: String,
    ) {
        session.require(Permission.CREATE_STOCK_CHECK)
        val key = barcode.trim()
        require(key.isNotEmpty()) { "A product needs a barcode." }
        require(name.isNotBlank()) { "A product needs a name." }

        val existing = find(key)
        val now = System.currentTimeMillis()
        Db.product(key).set(
            Product(
                barcode = key,
                name = name.trim(),
                sku = sku.trim(),
                unit = unit.trim().ifEmpty { "pcs" },
                active = true,
                createdAt = existing?.createdAt ?: now,
                createdByUid = existing?.createdByUid ?: session.uid,
                updatedAt = now,
            ),
        ).awaitAck()

        if (existing == null) {
            audit.record(
                session = session,
                entity = "Product",
                entityId = key,
                entityLabel = name.trim(),
                action = AuditAction.CREATE,
                field = "sku",
                newValue = sku.trim(),
            )
        } else {
            audit.recordChanges(
                session = session,
                entity = "Product",
                entityId = key,
                entityLabel = name.trim(),
                stockCheckId = "",
                changes = changesOf {
                    compare("Name", existing.name, name.trim())
                    compare("SKU", existing.sku, sku.trim())
                    compare("Unit", existing.unit, unit.trim())
                },
            )
        }
    }

    suspend fun delete(session: Session, product: Product) {
        session.require(Permission.EDIT_TEMPLATE)
        Db.product(product.barcode).delete().awaitAck()
        audit.record(
            session = session,
            entity = "Product",
            entityId = product.barcode,
            entityLabel = product.name,
            action = AuditAction.DELETE,
        )
    }
}
