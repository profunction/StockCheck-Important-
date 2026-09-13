package com.stockcheck.app.data

import android.content.Context
import android.net.Uri
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.storage.FirebaseStorage
import com.stockcheck.app.model.PhotoRecord
import kotlinx.coroutines.tasks.await
import java.io.File

/**
 * Pushes locally captured photos to Firebase Storage.
 *
 * Runs under a CONNECTED constraint with exponential backoff, so a phone that
 * spends the morning out of coverage uploads the whole morning's photos the
 * moment it reconnects, without the operator doing anything.
 */
class PhotoUploadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val stockCheckId = inputData.getString(KEY_STOCK_CHECK_ID).orEmpty()
        if (stockCheckId.isEmpty()) return Result.success()

        val pending = runCatching {
            Db.photos(stockCheckId)
                .whereEqualTo("uploaded", false)
                .get().await()
                .toObjects(PhotoRecord::class.java)
        }.getOrElse { return Result.retry() }

        if (pending.isEmpty()) return Result.success()

        var anyFailed = false
        for (photo in pending) {
            val file = File(photo.localPath)
            if (!file.exists()) {
                // The local copy is gone (cache cleared, user wiped storage) and
                // the bytes were never uploaded, so there is nothing to retry —
                // clearing the flag stops this job looping forever.
                runCatching {
                    Db.photo(stockCheckId, photo.id)
                        .update(mapOf("uploaded" to true, "localPath" to ""))
                        .await()
                }
                continue
            }
            val uploaded = runCatching {
                val ref = FirebaseStorage.getInstance().getReference(photo.storagePath)
                ref.putFile(Uri.fromFile(file)).await()
                val url = ref.downloadUrl.await().toString()
                Db.photo(stockCheckId, photo.id).update(
                    mapOf("uploaded" to true, "downloadUrl" to url),
                ).await()
            }.isSuccess
            if (!uploaded) anyFailed = true
        }

        return if (anyFailed) Result.retry() else Result.success()
    }

    companion object {
        const val KEY_STOCK_CHECK_ID = "stockCheckId"
        const val KEY_PHOTO_ID = "photoId"
    }
}
