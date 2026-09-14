package com.stockcheck.app.data

import com.google.firebase.firestore.Query
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.AuditEntry
import com.stockcheck.app.model.Session
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await

/**
 * Append-only trail of who changed what.
 *
 * Entries are written from the client, which is why the matching Firestore
 * rule allows create but denies update and delete to everyone: a worker can
 * add to the log but nobody can quietly rewrite it.
 */
class AuditRepository {

    suspend fun record(
        session: Session,
        entity: String,
        entityId: String,
        entityLabel: String = "",
        action: AuditAction,
        field: String = "",
        oldValue: String = "",
        newValue: String = "",
        stockCheckId: String = "",
    ) {
        val entry = AuditEntry(
            stockCheckId = stockCheckId,
            entity = entity,
            entityId = entityId,
            entityLabel = entityLabel,
            action = action.name,
            field = field,
            oldValue = oldValue,
            newValue = newValue,
            actorUid = session.uid,
            actorName = session.profile.displayName,
            at = System.currentTimeMillis(),
        )
        // The trail must never block the user's actual work, so a failure here
        // is swallowed rather than propagated into the calling write.
        runCatching { Db.auditLog().add(entry).awaitAck() }
    }

    /** Records a batch of field-level changes as one entry per changed field. */
    suspend fun recordChanges(
        session: Session,
        entity: String,
        entityId: String,
        entityLabel: String,
        stockCheckId: String,
        changes: List<FieldChange>,
    ) {
        changes.forEach { change ->
            record(
                session = session,
                entity = entity,
                entityId = entityId,
                entityLabel = entityLabel,
                action = AuditAction.UPDATE,
                field = change.field,
                oldValue = change.oldValue,
                newValue = change.newValue,
                stockCheckId = stockCheckId,
            )
        }
    }

    fun observeAll(limit: Long = 300): Flow<List<AuditEntry>> =
        Db.auditLog().orderBy("at", Query.Direction.DESCENDING).limit(limit).asFlow()

    fun observeForStockCheck(stockCheckId: String): Flow<List<AuditEntry>> =
        Db.auditLog()
            .whereEqualTo("stockCheckId", stockCheckId)
            .orderBy("at", Query.Direction.DESCENDING)
            .asFlow()
}

data class FieldChange(val field: String, val oldValue: String, val newValue: String)

/**
 * Collects field-level differences for the audit trail.
 *
 * Written as a small builder rather than a list of extractor lambdas because
 * Kotlin cannot infer the receiver type of a bare `{ it.field }` passed into a
 * generic vararg, which the lambda form would require at every call site.
 */
class ChangeCollector internal constructor() {
    private val collected = mutableListOf<FieldChange>()

    /** Records [field] only when the value actually moved. */
    fun compare(field: String, old: Any?, new: Any?) {
        val before = old?.toString().orEmpty()
        val after = new?.toString().orEmpty()
        if (before != after) collected += FieldChange(field, before, after)
    }

    internal fun build(): List<FieldChange> = collected.toList()
}

fun changesOf(build: ChangeCollector.() -> Unit): List<FieldChange> =
    ChangeCollector().apply(build).build()
