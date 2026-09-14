package com.stockcheck.app.data

import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import com.google.android.gms.tasks.Task
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Every collection path in one place. Paths are nested under a single
 * workspace document so that turning this into a multi-company product later
 * means changing [workspaceId] here rather than every query in the app.
 */
object Db {

    /** Single-tenant for now; becomes the signed-in user's company id later. */
    var workspaceId: String = "default"
        internal set

    private val db: FirebaseFirestore get() = FirebaseFirestore.getInstance()

    private fun workspace(): DocumentReference =
        db.collection("workspaces").document(workspaceId)

    fun users(): CollectionReference = workspace().collection("users")
    fun user(uid: String): DocumentReference = users().document(uid)

    fun roles(): CollectionReference = workspace().collection("roles")
    fun role(id: String): DocumentReference = roles().document(id)

    fun templates(): CollectionReference = workspace().collection("templates")
    fun template(id: String): DocumentReference = templates().document(id)

    fun stockChecks(): CollectionReference = workspace().collection("stockChecks")
    fun stockCheck(id: String): DocumentReference = stockChecks().document(id)

    fun items(stockCheckId: String): CollectionReference =
        stockCheck(stockCheckId).collection("items")
    fun item(stockCheckId: String, itemId: String): DocumentReference =
        items(stockCheckId).document(itemId)

    fun photos(stockCheckId: String): CollectionReference =
        stockCheck(stockCheckId).collection("photos")
    fun photo(stockCheckId: String, photoId: String): DocumentReference =
        photos(stockCheckId).document(photoId)

    fun auditLog(): CollectionReference = workspace().collection("auditLog")

    /**
     * Workspace settings, including the company code registration is gated
     * on. The security rules read this document directly, which is how the
     * code can be verified by someone who is not allowed to read it.
     */
    fun config(): DocumentReference = workspace().collection("meta").document("config")

    /** Counter document used to hand out human-readable reference numbers. */
    fun counters(): DocumentReference = workspace().collection("meta").document("counters")

    fun batch() = db.batch()

    fun firestore(): FirebaseFirestore = db
}

/**
 * Streams a query as a list of [T].
 *
 * Latency-compensated writes are included deliberately: a scan made offline
 * must appear in the list immediately, long before the server confirms it.
 */
inline fun <reified T : Any> Query.asFlow(): Flow<List<T>> = callbackFlow {
    val registration = addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error ->
        if (error != null) {
            close(error)
            return@addSnapshotListener
        }
        if (snapshot != null) {
            trySend(snapshot.documents.mapNotNull { doc ->
                runCatching { doc.toObject(T::class.java) }.getOrNull()
            })
        }
    }
    awaitClose { registration.remove() }
}

/** Streams a single document, emitting null when it does not exist. */
inline fun <reified T : Any> DocumentReference.asFlow(): Flow<T?> = callbackFlow {
    val registration = addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error ->
        if (error != null) {
            close(error)
            return@addSnapshotListener
        }
        trySend(snapshot?.let { doc -> runCatching { doc.toObject(T::class.java) }.getOrNull() })
    }
    awaitClose { registration.remove() }
}

/**
 * Awaits a read that must reflect the server when online but must still
 * succeed offline. Firestore's own `get()` already falls back to cache, so
 * this is a thin alias kept for readability at call sites.
 */
suspend inline fun <reified T : Any> DocumentReference.getAs(): T? =
    runCatching { get().await().toObject(T::class.java) }.getOrNull()

/**
 * How long a write may wait for the server before the caller carries on.
 *
 * Firestore has already applied the write to the local cache and fired every
 * listener by the time it is handed back; the Task completes only when the
 * SERVER acknowledges. Awaiting that Task therefore blocks forever with no
 * network — exactly the condition this app's persistent cache exists to
 * survive — which showed up as buttons that did nothing at all: no error, no
 * navigation, no spinner, because the coroutine simply never resumed.
 */
const val WRITE_ACK_TIMEOUT_MS = 4_000L

/**
 * Waits for the server to acknowledge a write, but never longer than
 * [WRITE_ACK_TIMEOUT_MS].
 *
 * A timeout is not a failure: the write is durable in the local cache and
 * queued for sync, and the UI is driven by snapshot listeners that have
 * already reflected it. Returns true when the server confirmed within the
 * window, so a caller that genuinely needs confirmation can tell.
 *
 * A write the rules reject still fails, just asynchronously — Firestore rolls
 * it back out of the cache and the listeners correct the UI.
 */
suspend fun <T> Task<T>.awaitAck(): Boolean =
    withTimeoutOrNull(WRITE_ACK_TIMEOUT_MS) {
        runCatching { await() }.isSuccess
    } ?: false
