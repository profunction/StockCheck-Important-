package com.stockcheck.app.data

import com.google.firebase.firestore.Query
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.FieldType
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.Template
import com.stockcheck.app.model.TemplateField
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class TemplateRepository(private val audit: AuditRepository) {

    /**
     * Sorting happens in memory, not in the query.
     *
     * Firestore needs a composite index for an equality filter on one field
     * combined with an order on another, and without it the query does not
     * degrade — it fails outright. `where(active) + orderBy(name)` therefore
     * returned nothing but an error, which the collector turned into an empty
     * list, and the template picker told the user "no active templates yet"
     * while five sat in the database. A handful of templates sorts for free
     * here and needs no index to maintain.
     */
    fun observeTemplates(activeOnly: Boolean = false): Flow<List<Template>> {
        val query = if (activeOnly) {
            Db.templates().whereEqualTo("active", true)
        } else {
            Db.templates()
        }
        return query.asFlow<Template>().map { list -> list.sortedBy { it.name.lowercase() } }
    }

    fun observeTemplate(id: String): Flow<Template?> = Db.template(id).asFlow()

    suspend fun getTemplate(id: String): Template? = Db.template(id).getAs<Template>()

    suspend fun save(session: Session, template: Template): String {
        val isNew = template.id.isEmpty()
        session.require(if (isNew) Permission.CREATE_TEMPLATE else Permission.EDIT_TEMPLATE)
        require(template.name.isNotBlank()) { "Template name cannot be empty." }
        require(template.fields.isNotEmpty()) { "A template needs at least one field." }
        val duplicateKeys = template.fields.groupBy { it.key }.filterValues { it.size > 1 }.keys
        require(duplicateKeys.isEmpty()) {
            "Field keys must be unique: " + duplicateKeys.joinToString()
        }

        val id = template.id.ifEmpty { Db.templates().document().id }
        val existing = if (isNew) null else Db.template(id).getAs<Template>()
        val now = System.currentTimeMillis()
        val saved = template.copy(
            id = id,
            // Renumbered on save so the stored order always matches the order
            // the author arranged on screen, regardless of how it was edited.
            fields = template.fields.mapIndexed { index, field -> field.copy(order = index) },
            createdByUid = existing?.createdByUid ?: session.uid,
            createdAt = existing?.createdAt ?: now,
            updatedAt = now,
        )
        Db.template(id).set(saved).awaitAck()

        if (existing == null) {
            audit.record(
                session = session,
                entity = "Template",
                entityId = id,
                entityLabel = saved.name,
                action = AuditAction.CREATE,
            )
        } else {
            audit.recordChanges(
                session = session,
                entity = "Template",
                entityId = id,
                entityLabel = saved.name,
                stockCheckId = "",
                changes = changesOf {
                    compare("Name", existing.name, saved.name)
                    compare("Description", existing.description, saved.description)
                    compare("Photo required", existing.photoRequired, saved.photoRequired)
                    compare("Minimum photos", existing.minPhotos, saved.minPhotos)
                    compare("Signature required", existing.signatureRequired, saved.signatureRequired)
                    compare("Active", existing.active, saved.active)
                    compare(
                        "Fields",
                        existing.fields.joinToString { it.label },
                        saved.fields.joinToString { it.label },
                    )
                },
            )
        }
        return id
    }

    suspend fun delete(session: Session, template: Template) {
        session.require(Permission.DELETE_TEMPLATE)
        val inUse = Db.stockChecks()
            .whereEqualTo("templateId", template.id)
            .limit(1)
            .get().await()
        // Deleting a template that history still references would leave those
        // stock checks unable to render or export their custom columns, so it
        // is deactivated instead and disappears from the "new check" picker.
        require(inUse.isEmpty) {
            "This template is used by existing stock checks. Deactivate it instead."
        }
        Db.template(template.id).delete().awaitAck()
        audit.record(
            session = session,
            entity = "Template",
            entityId = template.id,
            entityLabel = template.name,
            action = AuditAction.DELETE,
        )
    }

    suspend fun setActive(session: Session, template: Template, active: Boolean) {
        session.require(Permission.EDIT_TEMPLATE)
        Db.template(template.id).update(
            mapOf("active" to active, "updatedAt" to System.currentTimeMillis()),
        ).awaitAck()
        audit.record(
            session = session,
            entity = "Template",
            entityId = template.id,
            entityLabel = template.name,
            action = AuditAction.UPDATE,
            field = "active",
            oldValue = template.active.toString(),
            newValue = active.toString(),
        )
    }

    /** Writes the starter templates the first time a workspace is opened. */
    suspend fun seedDefaults(session: Session) {
        if (!Db.templates().limit(1).get().await().isEmpty) return
        val now = System.currentTimeMillis()
        val batch = Db.batch()
        DefaultTemplates.all.forEach { template ->
            val doc = Db.templates().document()
            batch.set(
                doc,
                template.copy(
                    id = doc.id,
                    createdByUid = session.uid,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
        }
        batch.commit().awaitAck()
    }
}

/**
 * Starter templates.
 *
 * Barcode, product, quantity and unit live on [com.stockcheck.app.model.StockItem]
 * itself because every stock check needs them; the fields listed here are the
 * extra, per-template columns stored in `fieldValues`.
 */
object DefaultTemplates {

    private fun field(
        key: String,
        label: String,
        type: FieldType = FieldType.TEXT,
        required: Boolean = false,
        options: List<String> = emptyList(),
    ) = TemplateField(
        key = key,
        label = label,
        type = type.name,
        required = required,
        options = options,
    )

    val supermarket = Template(
        name = "Supermarket Stock Check",
        description = "Shelf counting with category, location and expiry tracking.",
        photoRequired = true,
        minPhotos = 1,
        fields = listOf(
            field("category", "Category", FieldType.DROPDOWN, options = listOf(
                "Beverage", "Snack", "Dairy", "Frozen", "Household", "Other",
            )),
            field("location", "Shelf / Location", FieldType.LOCATION, required = true),
            field("expiry", "Expiry date", FieldType.DATE),
            field("remark", "Remark"),
        ),
    )

    val warehouse = Template(
        name = "Warehouse Stock Check",
        description = "Rack-level counting with SKU and batch traceability.",
        photoRequired = false,
        fields = listOf(
            field("sku", "SKU", FieldType.TEXT, required = true),
            field("rack", "Rack", FieldType.TEXT, required = true),
            field("location", "Location", FieldType.LOCATION),
            field("batch", "Batch number", FieldType.TEXT),
            field("remark", "Remark"),
        ),
    )

    val quickCount = Template(
        name = "Quick Count",
        description = "Barcode and quantity only — fastest option for a spot check.",
        photoRequired = false,
        fields = listOf(field("remark", "Remark")),
    )

    val all: List<Template> = listOf(quickCount, supermarket, warehouse)
}
