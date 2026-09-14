package com.stockcheck.app.data

import android.content.Context
import android.net.Uri
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.PhotoRecord
import com.stockcheck.app.model.Session
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Photos are the one part of the app Firestore's offline cache cannot carry:
 * the bytes go to Firebase Storage, which has no offline queue of its own.
 *
 * So capture writes the file into app storage and records it immediately with
 * `uploaded = false`; a [PhotoUploadWorker] job then pushes it whenever the
 * network allows. The UI always renders [PhotoRecord.localPath] when it is
 * present, so a photo taken in a basement is visible instantly and simply
 * gains a download URL later.
 */
class PhotoRepository(
    private val appContext: Context,
    private val audit: AuditRepository,
) {

    fun observePhotos(stockCheckId: String): Flow<List<PhotoRecord>> =
        Db.photos(stockCheckId).orderBy("takenAt", Query.Direction.DESCENDING).asFlow()

    fun observeRecentPhotos(stockCheckId: String, limit: Long): Flow<List<PhotoRecord>> =
        Db.photos(stockCheckId)
            .orderBy("takenAt", Query.Direction.DESCENDING)
            .limit(limit)
            .asFlow()

    /** Directory holding the on-device copies; matches `file_paths.xml`. */
    fun photoDir(): File = File(appContext.filesDir, "photos").apply { mkdirs() }

    fun newPhotoFile(stockCheckId: String): File =
        File(photoDir(), "${stockCheckId}_${System.currentTimeMillis()}.jpg")

    fun uriFor(file: File): Uri = androidx.core.content.FileProvider.getUriForFile(
        appContext,
        "${appContext.packageName}.fileprovider",
        file,
    )

    /**
     * Registers a captured photo and queues its upload.
     *
     * [localFile] must already contain the JPEG bytes.
     */
    suspend fun registerCapture(
        session: Session,
        stockCheckId: String,
        localFile: File,
        caption: String = "",
        linkedBarcode: String = "",
    ): String {
        session.require(Permission.TAKE_PHOTO)
        require(localFile.exists() && localFile.length() > 0) { "The photo file is empty." }

        val doc = Db.photos(stockCheckId).document()
        val record = PhotoRecord(
            id = doc.id,
            stockCheckId = stockCheckId,
            storagePath = "workspaces/${Db.workspaceId}/stockChecks/$stockCheckId/${doc.id}.jpg",
            localPath = localFile.absolutePath,
            uploaded = false,
            caption = caption,
            linkedBarcode = linkedBarcode,
            takenAt = System.currentTimeMillis(),
            takenByUid = session.uid,
            takenByName = session.profile.displayName,
        )
        doc.set(record).awaitAck()
        runCatching {
            Db.stockCheck(stockCheckId).update(
                mapOf(
                    "photoCount" to FieldValue.increment(1),
                    "updatedAt" to System.currentTimeMillis(),
                ),
            ).awaitAck()
        }
        if (CloudPhotos.ENABLED) enqueueUpload(stockCheckId, doc.id)
        audit.record(
            session = session,
            entity = "Photo",
            entityId = doc.id,
            entityLabel = caption.ifEmpty { "Photo" },
            action = AuditAction.CREATE,
            stockCheckId = stockCheckId,
        )
        return doc.id
    }

    suspend fun deletePhoto(session: Session, photo: PhotoRecord) {
        session.require(Permission.EDIT_OWN_STOCK)
        runCatching { File(photo.localPath).delete() }
        if (photo.uploaded && photo.storagePath.isNotEmpty()) {
            runCatching {
                com.google.firebase.storage.FirebaseStorage.getInstance()
                    .getReference(photo.storagePath)
                    .delete()
                    .await()
            }
        }
        Db.photo(photo.stockCheckId, photo.id).delete().awaitAck()
        runCatching {
            Db.stockCheck(photo.stockCheckId).update(
                "photoCount", FieldValue.increment(-1),
            ).awaitAck()
        }
        audit.record(
            session = session,
            entity = "Photo",
            entityId = photo.id,
            entityLabel = photo.caption.ifEmpty { "Photo" },
            action = AuditAction.DELETE,
            stockCheckId = photo.stockCheckId,
        )
    }

    suspend fun updateCaption(session: Session, photo: PhotoRecord, caption: String) {
        session.require(Permission.EDIT_OWN_STOCK)
        Db.photo(photo.stockCheckId, photo.id).update("caption", caption).awaitAck()
    }

    /**
     * Re-queues everything still marked un-uploaded, e.g. after a cold start
     * or the first launch after cloud photos are switched on.
     */
    fun retryPendingUploads(stockCheckId: String) {
        if (CloudPhotos.ENABLED) enqueueUpload(stockCheckId, photoId = "")
    }

    private fun enqueueUpload(stockCheckId: String, photoId: String) {
        val request = OneTimeWorkRequestBuilder<PhotoUploadWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setInputData(
                Data.Builder()
                    .putString(PhotoUploadWorker.KEY_STOCK_CHECK_ID, stockCheckId)
                    .putString(PhotoUploadWorker.KEY_PHOTO_ID, photoId)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        // Keyed per stock check and APPENDed, so a burst of captures uploads in
        // order without each one cancelling the last.
        WorkManager.getInstance(appContext).enqueueUniqueWork(
            "photo-upload-$stockCheckId",
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            request,
        )
    }
}
