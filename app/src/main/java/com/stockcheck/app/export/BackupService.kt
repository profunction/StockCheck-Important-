package com.stockcheck.app.export

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.google.firebase.firestore.Query
import com.stockcheck.app.data.AuditRepository
import com.stockcheck.app.data.Db
import com.stockcheck.app.data.require
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** What a backup contains and where it ended up. */
data class BackupResult(
    val file: File,
    val uri: Uri,
    val sizeBytes: Long,
    val stockCheckCount: Int,
    val itemCount: Int,
    val photoCount: Int,
    val photosIncluded: Int,
    val encrypted: Boolean,
)

/**
 * Takes the whole company's data off the phone in one file.
 *
 * Two holes this closes, both of which were real and neither of which the app
 * admitted to:
 *
 * The free Firestore plan has no automatic backup. A stock check deleted by
 * mistake, or a rules change that empties a collection, is simply gone — there
 * is no version to roll back to and no export that covers anything but the
 * counted lines.
 *
 * Photos are worse. They live in this app's private storage on whichever phone
 * took them, and until now nothing carried them anywhere: the Photos screen
 * claimed they "travel out with the export", and they did not — the export is
 * a spreadsheet of items and has never contained an image. A lost phone took
 * its photos with it and the company had no way to know what it had lost.
 *
 * So the backup is a zip: `data.json` holding every collection verbatim, and
 * `photos/` holding every image this device still has. Restoring is a manual
 * job — deliberately, because an automatic restore that silently overwrites
 * live data is a worse accident than the one it prevents.
 */
class BackupService(
    private val appContext: Context,
    private val audit: AuditRepository,
) {

    private val stampFormat = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)

    suspend fun backup(
        session: Session,
        includePhotos: Boolean = true,
        password: String? = null,
    ): BackupResult = withContext(Dispatchers.IO) {
        // A backup is every worker's data regardless of who asks, so it takes
        // the permission that means exactly that.
        session.require(Permission.EXPORT_ALL_DATA)

        val root = JSONObject()
        root.put("format", "stockcheck-backup-1")
        root.put("takenAt", System.currentTimeMillis())
        root.put("takenAtReadable", readable(System.currentTimeMillis()))
        root.put("takenByUid", session.uid)
        root.put("takenByName", session.profile.displayName)
        root.put("workspaceId", Db.workspaceId)

        root.put("config", documentJson(Db.config()))
        root.put("users", collectionJson(Db.users()))
        root.put("roles", collectionJson(Db.roles()))
        root.put("products", collectionJson(Db.products()))
        root.put("templates", collectionJson(Db.templates()))
        root.put("auditLog", collectionJson(Db.auditLog()))

        var itemCount = 0
        var photoCount = 0
        val photoPaths = mutableListOf<String>()
        val checks = JSONArray()

        val checkDocs = Db.stockChecks().get().await().documents
        for (doc in checkDocs) {
            val check = JSONObject()
            check.put("id", doc.id)
            check.put("data", toJson(doc.data))

            val items = collectionJson(Db.items(doc.id))
            itemCount += items.length()
            check.put("items", items)

            val photos = collectionJson(Db.photos(doc.id))
            photoCount += photos.length()
            check.put("photos", photos)

            for (index in 0 until photos.length()) {
                val local = photos.getJSONObject(index)
                    .optJSONObject("data")
                    ?.optString("localPath")
                    .orEmpty()
                if (local.isNotEmpty()) photoPaths += local
            }
            checks.put(check)
        }
        root.put("stockChecks", checks)

        val dir = File(appContext.cacheDir, "backups").apply { mkdirs() }
        val plain = File(dir, "stockcheck-backup-${stampFormat.format(Date())}.zip")

        var photosWritten = 0
        ZipOutputStream(plain.outputStream().buffered()).use { zip ->
            zip.putNextEntry(ZipEntry("data.json"))
            zip.write(root.toString(2).toByteArray(Charsets.UTF_8))
            zip.closeEntry()

            if (includePhotos) {
                photoPaths.distinct().forEach { path ->
                    val source = File(path)
                    if (!source.isFile) return@forEach
                    zip.putNextEntry(ZipEntry("photos/${source.name}"))
                    source.inputStream().use { it.copyTo(zip) }
                    zip.closeEntry()
                    photosWritten++
                }
            }

            // Says in the file itself what is missing, because a backup whose
            // gaps are only knowable from the app that wrote it is not much of
            // a backup.
            zip.putNextEntry(ZipEntry("README.txt"))
            zip.write(readme(photoCount, photosWritten, includePhotos).toByteArray(Charsets.UTF_8))
            zip.closeEntry()
        }

        val delivered = if (!password.isNullOrBlank()) {
            EncryptedBundle.wrap(plain, password)
        } else {
            plain
        }

        audit.record(
            session = session,
            entity = "Backup",
            entityId = delivered.name,
            entityLabel = delivered.name,
            action = AuditAction.EXPORT,
            field = "contents",
            newValue = "${checkDocs.size} checks, $itemCount items, " +
                "$photosWritten of $photoCount photos, " +
                "${delivered.length() / 1024} KB" +
                (if (!password.isNullOrBlank()) ", encrypted" else ""),
        )

        BackupResult(
            file = delivered,
            uri = FileProvider.getUriForFile(
                appContext,
                "${appContext.packageName}.fileprovider",
                delivered,
            ),
            sizeBytes = delivered.length(),
            stockCheckCount = checkDocs.size,
            itemCount = itemCount,
            photoCount = photoCount,
            photosIncluded = photosWritten,
            encrypted = !password.isNullOrBlank(),
        )
    }

    fun shareIntent(result: BackupResult): Intent =
        Intent(Intent.ACTION_SEND).apply {
            type = "application/zip"
            putExtra(Intent.EXTRA_STREAM, result.uri)
            putExtra(Intent.EXTRA_SUBJECT, result.file.name)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

    // ------------------------------------------------------------ plumbing

    private suspend fun collectionJson(query: Query): JSONArray {
        val array = JSONArray()
        query.get().await().documents.forEach { doc ->
            array.put(
                JSONObject()
                    .put("id", doc.id)
                    .put("data", toJson(doc.data)),
            )
        }
        return array
    }

    private suspend fun documentJson(
        reference: com.google.firebase.firestore.DocumentReference,
    ): JSONObject = JSONObject()
        .put("id", reference.id)
        .put("data", toJson(reference.get().await().data))

    /**
     * Converts a Firestore document to JSON without a schema.
     *
     * Deliberately generic: a backup written against today's model classes
     * would silently drop any field added later, which is the one failure a
     * backup must not have.
     */
    private fun toJson(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSONObject().apply {
            value.forEach { (key, item) -> put(key.toString(), toJson(item)) }
        }
        is List<*> -> JSONArray().apply { value.forEach { put(toJson(it)) } }
        is String, is Number, is Boolean -> value
        // Timestamps, references and anything else reach the file as their
        // printed form rather than being dropped.
        else -> value.toString()
    }

    private fun readable(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date(millis))

    private fun readme(
        photosKnown: Int,
        photosIncluded: Int,
        includePhotos: Boolean,
    ): String = buildString {
        appendLine("StockCheck backup")
        appendLine("=================")
        appendLine()
        appendLine("data.json  - every record of this company, exactly as stored.")
        appendLine("photos/    - the photo files this phone still holds.")
        appendLine()
        if (!includePhotos) {
            appendLine("Photos were EXCLUDED from this backup by choice.")
        } else if (photosIncluded < photosKnown) {
            appendLine(
                "WARNING: $photosKnown photos are recorded but only $photosIncluded " +
                    "were found on this device.",
            )
            appendLine(
                "Photos live only on the phone that took them. The missing ones are " +
                    "on someone else's phone, or are already lost. Run a backup from " +
                    "each phone that was used for counting.",
            )
        } else {
            appendLine("All $photosKnown recorded photos were found and included.")
        }
        appendLine()
        appendLine("Restoring is a manual job - there is no import button. Keep this file")
        appendLine("somewhere off the phone: cloud drive, company server, anywhere but here.")
    }
}
