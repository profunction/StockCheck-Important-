package com.stockcheck.app.data

import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
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
