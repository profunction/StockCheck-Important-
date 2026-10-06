package com.stockcheck.app.pos

import com.google.firebase.firestore.FieldPath
import com.stockcheck.app.data.AuditRepository
import com.stockcheck.app.data.Db
import com.stockcheck.app.data.asFlow
import com.stockcheck.app.data.awaitAck
import com.stockcheck.app.data.getAs
import com.stockcheck.app.data.require
import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.MovementSource
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockMovement
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** A company's Loyverse connection, at `workspaces/{ws}/integrations/loyverse`. */
data class LoyverseSettings(
    /** The owner's own access token. Readable only by company admins. */
    val token: String = "",
    /** Loyverse store id -> its name, as Loyverse calls it. */
    val stores: Map<String, String> = emptyMap(),
    /** Loyverse store id -> branch id here; a store not listed is the main shop. */
    val storeBranches: Map<String, String> = emptyMap(),
    /** The first day to bring sales in from, start of day, epoch millis. */
    val syncFrom: Long = 0L,
    val lastSyncedAt: Long = 0L,
    val lastResult: String = "",
    val connectedByUid: String = "",
    val connectedAt: Long = 0L,
)

data class SyncResult(val receiptLines: Int, val productDays: Int, val unmatched: Int)

/**
 * Brings a shop's Loyverse sales in as stock movements.
 *
 * Runs on an admin's phone, with the token the owner made in Loyverse's Back
 * Office. Each sync re-reads the last week of receipts and replaces those
 * days' totals, so a receipt that synced late from an offline till, or was
 * refunded or cancelled since, is reflected rather than counted twice.
 */
class LoyverseSync(private val audit: AuditRepository) {

    fun observe(): Flow<LoyverseSettings?> = Db.integration(NAME).asFlow<LoyverseSettings>()

    /**
     * Checks the token by asking Loyverse for the shop's stores, and keeps it
     * only if that works -- a mistyped token found now beats one found at
     * the first sync.
     */
    suspend fun connect(session: Session, token: String, syncFrom: LocalDate) {
        session.require(Permission.CHANGE_PERMISSION)
        val clean = token.trim()
        require(clean.isNotEmpty()) { "Paste the access token from Loyverse first." }
        val stores = withContext(Dispatchers.IO) { Loyverse.parseStores(get("/stores", clean)) }
        val previous = Db.integration(NAME).getAs<LoyverseSettings>()
        val now = System.currentTimeMillis()
        Db.integration(NAME).set(
            LoyverseSettings(
                token = clean,
                stores = stores.associate { it.id to it.name },
                storeBranches = previous?.storeBranches.orEmpty(),
                syncFrom = syncFrom.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli(),
                lastSyncedAt = 0L,
                connectedByUid = session.uid,
                connectedAt = now,
            ),
        ).awaitAck()
        audit.record(
            session = session,
            entity = "Integration",
            entityId = NAME,
            entityLabel = "Loyverse",
            action = AuditAction.CREATE,
            field = "stores",
            newValue = stores.joinToString { it.name },
        )
    }

    suspend fun setStoreBranch(session: Session, storeId: String, branchId: String) {
        session.require(Permission.CHANGE_PERMISSION)
        Db.integration(NAME).update(FieldPath.of("storeBranches", storeId), branchId).awaitAck()
    }

    suspend fun disconnect(session: Session) {
        session.require(Permission.CHANGE_PERMISSION)
        Db.integration(NAME).delete().awaitAck()
        audit.record(
            session = session,
            entity = "Integration",
            entityId = NAME,
            entityLabel = "Loyverse",
            action = AuditAction.DELETE,
        )
    }

    suspend fun sync(session: Session, catalogue: List<Product>): SyncResult {
        session.require(Permission.CHANGE_PERMISSION)
        session.require(Permission.RECORD_STOCK_MOVEMENTS)
        val settings = Db.integration(NAME).getAs<LoyverseSettings>()
            ?: throw IllegalStateException("Loyverse is not connected.")
        require(settings.token.isNotBlank()) { "Loyverse is not connected." }

        val zone = ZoneId.systemDefault()
        val firstDay = Instant.ofEpochMilli(settings.syncFrom).atZone(zone).toLocalDate()
        val windowStart = if (settings.lastSyncedAt == 0L) {
            firstDay
        } else {
            maxOf(firstDay, Instant.ofEpochMilli(settings.lastSyncedAt).atZone(zone).toLocalDate().minusDays(RESYNC_DAYS))
        }
        val windowStartMillis = windowStart.atStartOfDay(zone).toInstant().toEpochMilli()

        val (variants, lines) = withContext(Dispatchers.IO) {
            val variants = paged { cursor -> Loyverse.parseItems(get("/items?limit=250" + cursor.param(), settings.token)) }
            val since = URLEncoder.encode(Loyverse.isoStartOf(windowStart, zone), "UTF-8")
            val lines = paged { cursor ->
                Loyverse.parseReceipts(get("/receipts?limit=250&created_at_min=$since" + cursor.param(), settings.token))
            }
            variants to lines
        }

        val totals = Loyverse.totals(
            // A receipt dated before the window synced late; its day is not
            // fully in hand, so it is left to the sync that covered that day.
            lines = lines.filter { !it.at.atZone(zone).toLocalDate().isBefore(windowStart) },
            variants = variants.associateBy { it.variantId },
            storeBranches = settings.storeBranches,
            matcher = MovementFile.Matcher(catalogue),
            zone = zone,
        )

        // Days in the window are rewritten whole: what this sync did not
        // produce -- a sale since cancelled -- goes.
        val stale = Db.movements().whereGreaterThanOrEqualTo("at", windowStartMillis).get().await()
            .toObjects(StockMovement::class.java)
            .filter { it.source == MovementSource.LOYVERSE.name }
            .map { it.id }
            .toSet() - totals.map(Loyverse::movementId).toSet()

        val now = System.currentTimeMillis()
        val writes = totals.map { total ->
            Loyverse.movementId(total) to StockMovement(
                barcode = total.planned.key,
                productName = total.planned.name,
                branchId = total.branchId,
                type = total.planned.type(MovementFile.Kind.SALES).name,
                quantityMilli = total.planned.quantity,
                at = total.planned.date.atTime(LocalTime.NOON).atZone(zone).toInstant().toEpochMilli(),
                source = MovementSource.LOYVERSE.name,
                reference = "Loyverse",
                createdByUid = session.uid,
                createdByName = session.profile.displayName,
                createdAt = now,
            )
        }
        // A null movement is a delete.
        val operations: List<Pair<String, StockMovement?>> = writes + stale.map { it to null }
        operations.chunked(400).forEach { chunk ->
            val batch = Db.batch()
            chunk.forEach { (id, movement) ->
                if (movement != null) batch.set(Db.movement(id), movement) else batch.delete(Db.movement(id))
            }
            batch.commit().awaitAck()
        }

        val result = SyncResult(
            receiptLines = lines.size,
            productDays = totals.size,
            unmatched = totals.map { it.planned }.filter { !it.matched }.map { it.key }.distinct().size,
        )
        Db.integration(NAME).update(
            mapOf(
                "lastSyncedAt" to now,
                "lastResult" to "${result.receiptLines} receipt lines, ${result.productDays} product-days" +
                    " from $windowStart",
            ),
        ).awaitAck()
        audit.record(
            session = session,
            entity = "Integration",
            entityId = NAME,
            entityLabel = "Loyverse",
            action = AuditAction.UPDATE,
            field = "sync",
            newValue = "${result.productDays} product-days from $windowStart",
        )
        return result
    }

    // ----------------------------------------------------------------- HTTP

    private fun String?.param(): String =
        if (this == null) "" else "&cursor=" + URLEncoder.encode(this, "UTF-8")

    /** Follows a cursor to the last page, with a ceiling against a loop. */
    private fun <T> paged(fetch: (String?) -> Loyverse.Page<T>): List<T> {
        val all = mutableListOf<T>()
        var cursor: String? = null
        repeat(MAX_PAGES) {
            val page = fetch(cursor)
            all += page.values
            cursor = page.cursor ?: return all
        }
        return all
    }

    private fun get(path: String, token: String): String {
        val connection = (URL(Loyverse.BASE + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/json")
        }
        try {
            val code = connection.responseCode
            if (code in 200..299) return connection.inputStream.bufferedReader().use { it.readText() }
            val detail = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            throw IllegalStateException(
                when (code) {
                    401, 403 -> "Loyverse refused the access token. Make a new one in Loyverse " +
                        "Back Office -> Settings -> Access tokens and connect again."
                    // Without Loyverse's paid sales-history add-on, receipts
                    // older than 31 days are refused with 402.
                    402 -> "Loyverse only shares the last 31 days of sales on this account. " +
                        "Disconnect, connect again with a start date inside the last month, then sync."
                    429 -> "Loyverse asked to slow down. Try the sync again in a minute."
                    else -> "Loyverse answered $code. ${detail.take(200)}"
                },
            )
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val NAME = "loyverse"
        /** How far back each sync re-reads, for receipts that synced late. */
        const val RESYNC_DAYS = 7L
        const val MAX_PAGES = 400
    }
}
