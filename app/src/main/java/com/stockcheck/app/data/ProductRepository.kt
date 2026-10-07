package com.stockcheck.app.data

import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Session
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

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

        // The fast path, unchanged: one cached document read, which is what
        // lets a scan resolve in a basement with no signal.
        runCatching { Db.product(key).getAs<Product>() }.getOrNull()?.let { return it }

        // Only on a miss. A product can wear several codes -- new packaging, a
        // second supplier, a carton numbered differently from the tin inside
        // -- and without this each of them scans as a new unknown product, so
        // one item on one shelf is counted three times under three names.
        //
        // Firestore serves this from the persistent cache while offline for
        // products the cache has seen. A code that has never been near this
        // phone still needs a connection, which was true before as well.
        return runCatching {
            Db.products()
                .whereArrayContains("altBarcodes", key)
                .limit(1)
                .get().await()
                .toObjects(Product::class.java)
                .firstOrNull()
        }.getOrNull()
    }

    /**
     * The product already answering to [code], ignoring the one with id
     * [exceptId].
     *
     * Two products claiming one barcode is a scan with no right answer, and
     * whichever is found first gets counted. Checked before a save rather
     * than enforced by a rule, because a rule cannot look across documents.
     */
    suspend fun clashingWith(code: String, exceptId: String): Product? {
        val found = find(code) ?: return null
        return if (found.barcode.equals(exceptId, ignoreCase = true)) null else found
    }

    suspend fun save(
        session: Session,
        barcode: String,
        name: String,
        sku: String,
        unit: String,
        /** Other codes that are this same product. */
        altBarcodes: List<String> = emptyList(),
    ) {
        session.require(Permission.CREATE_STOCK_CHECK)
        val key = barcode.trim()
        require(key.isNotEmpty()) { "A product needs a barcode." }
        require(name.isNotBlank()) { "A product needs a name." }

        // The document id is already one of this product's codes; repeating it
        // in the list would make a scan of it take the slow path for nothing.
        val alts = altBarcodes
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.equals(key, ignoreCase = true) }
            .distinctBy { it.lowercase() }

        // A code pointing at two products is a scan with no right answer, and
        // whichever is found first is what gets counted.
        alts.forEach { code ->
            clashingWith(code, exceptId = key)?.let { owner ->
                throw IllegalArgumentException(
                    "$code already belongs to ${owner.name.ifBlank { owner.barcode }}.",
                )
            }
        }

        val existing = find(key)
        val now = System.currentTimeMillis()
        Db.product(key).set(
            Product(
                barcode = key,
                name = name.trim(),
                sku = sku.trim(),
                altBarcodes = alts,
                unit = unit.trim().ifEmpty { "pcs" },
                // Owned elsewhere -- the stock screen, the POS website -- and
                // not on this form, so carried over rather than wiped.
                reorderLevelMilli = existing?.reorderLevelMilli,
                priceSen = existing?.priceSen,
                category = existing?.category.orEmpty(),
                photoUrl = existing?.photoUrl.orEmpty(),
                costSen = existing?.costSen,
                modifierIds = existing?.modifierIds.orEmpty(),
                trackStock = existing?.trackStock ?: true,
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
                    compare(
                        "Other barcodes",
                        existing.altBarcodes.joinToString(", "),
                        alts.joinToString(", "),
                    )
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
