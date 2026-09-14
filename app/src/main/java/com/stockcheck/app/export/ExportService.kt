package com.stockcheck.app.export

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.stockcheck.app.data.AuditRepository
import com.stockcheck.app.data.Db
import com.stockcheck.app.data.TemplateRepository
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.data.getAs
import com.stockcheck.app.data.require
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.model.Template
import com.stockcheck.app.model.WorkspaceConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Where an export ended up, ready to be shared or opened. */
data class ExportResult(
    val file: File,
    val uri: Uri,
    val format: ExportFormat,
    val rowCount: Int,
    val editable: Boolean,
    /** True when the file was wrapped in a password-protected archive. */
    val encrypted: Boolean = false,
)

class ExportService(
    private val appContext: Context,
    private val templates: TemplateRepository,
    private val audit: AuditRepository,
) {

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    private val timeFormat = SimpleDateFormat("HH:mm", Locale.US)
    private val stampFormat = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)

    /**
     * Builds an export file for [checks].
     *
     * The requested options are narrowed to what the session may actually do
     * before anything is read, so a caller cannot widen its own scope by
     * passing different options.
     */
    suspend fun export(
        session: Session,
        checks: List<StockCheck>,
        requested: ExportOptions,
    ): ExportResult = withContext(Dispatchers.IO) {
        session.require(Permission.VIEW_EXPORT)
        val options = requested.narrowedFor(session.effectivePermissions)
        session.require(
            if (options.format == ExportFormat.XLSX) Permission.EXPORT_EXCEL
            else Permission.EXPORT_CSV,
        )
        session.require(
            if (options.scope == ExportScope.ALL) Permission.EXPORT_ALL_DATA
            else Permission.EXPORT_OWN_DATA,
        )

        val scoped = checks
            .filter { options.scope == ExportScope.ALL || it.createdByUid == session.uid }
            .filter { check ->
                (options.fromMillis == null || check.createdAt >= options.fromMillis) &&
                    (options.toMillis == null || check.createdAt <= options.toMillis)
            }
            // Belt and braces: a user who cannot see all history must never be
            // able to export a row they could not have opened.
            .filter { session.effectivePermissions.canViewRecordBy(it.createdByUid, session.uid) }

        val rows = mutableListOf<ExportRow>()
        for (check in scoped) {
            val items = Db.items(check.id)
                .get().await()
                .toObjects(StockItem::class.java)
            items.forEach { rows += ExportRow(check, it) }
        }

        // A file with headers and no rows looks like a successful export of
        // nothing, and the usual cause is a scope that excluded everything --
        // "Mine" when the counts belong to a colleague. Say that instead of
        // handing over an empty spreadsheet.
        if (rows.isEmpty()) {
            throw IllegalStateException(
                if (options.scope == ExportScope.OWN && checks.isNotEmpty()) {
                    "Nothing to export: none of these stock checks were created by you. " +
                        "Choose Everyone under Data to include your colleagues' counts."
                } else if (scoped.isEmpty()) {
                    "Nothing to export: no stock checks match the current filter."
                } else {
                    "Nothing to export: these stock checks have no items counted yet."
                },
            )
        }

        // Every template represented in the selection contributes its
        // columns. Reading only the first check's template quietly dropped
        // the rest, so a mixed export lost the very fields that distinguish
        // one kind of count from another.
        val involved: List<Template> = scoped
            .map { it.templateId }
            .distinct()
            .mapNotNull { templates.getTemplate(it) }
        val columns = options.columnsFor(involved).ifEmpty { ExportColumn.standard.take(6) }

        val dir = File(appContext.cacheDir, "exports").apply { mkdirs() }
        val name = buildString {
            append("stockcheck-")
            append(if (scoped.size == 1) scoped.first().refNo else "${scoped.size}-checks")
            append('-')
            append(stampFormat.format(Date()))
            append('.')
            append(options.format.extension)
        }
        val file = File(dir, name)

        // The company password if an admin set one. A constant compiled into
        // a published app is known to everyone, which is why this is
        // configurable; when it is unset the export is not encrypted at all,
        // because a fixed password would only look like protection.
        val password = Db.config().getAs<WorkspaceConfig>()
            ?.exportPassword
            ?.takeIf { it.isNotBlank() }

        when (options.format) {
            ExportFormat.CSV -> writeCsv(file, columns, rows)
            ExportFormat.XLSX -> writeXlsx(
                file = file,
                columns = columns,
                rows = rows,
                editable = options.editable,
                // Null means no protection at all: the sheet opens and edits
                // like any ordinary spreadsheet.
                password = if (options.protectSheet) password ?: SHEET_GUARD else null,
            )
        }

        // Encryption goes on the container, not the file. A CSV has no notion
        // of a password, and an xlsx's sheet protection is a 16-bit hash free
        // tools strip in seconds; AES-256 on the archive is the only part of
        // this that is real.
        val delivered = if (options.encryptBundle && password != null) {
            EncryptedBundle.wrap(file, password)
        } else {
            file
        }

        audit.record(
            session = session,
            entity = "Export",
            entityId = delivered.name,
            entityLabel = delivered.name,
            action = AuditAction.EXPORT,
            field = "rows",
            newValue = "${rows.size} rows, ${columns.size} columns, " +
                "${options.format.name}, ${options.scope.name}" +
                (if (options.protectSheet) ", sheet protected" else ", unprotected") +
                (if (options.editable) ", values editable" else "") +
                (if (options.encryptBundle && password != null) ", encrypted archive" else ""),
            stockCheckId = if (scoped.size == 1) scoped.first().id else "",
        )

        ExportResult(
            file = delivered,
            uri = FileProvider.getUriForFile(
                appContext,
                "${appContext.packageName}.fileprovider",
                delivered,
            ),
            format = options.format,
            rowCount = rows.size,
            editable = options.editable,
            encrypted = options.encryptBundle && password != null,
        )
    }

    // ------------------------------------------------------------------ CSV

    private fun writeCsv(file: File, columns: List<ExportColumn>, rows: List<ExportRow>) {
        file.outputStream().bufferedWriter(Charsets.UTF_8).use { writer ->
            // Excel only detects UTF-8 in a CSV when this BOM is present; without
            // it, product names in Chinese open as mojibake on Windows.
            writer.write("﻿")
            writer.write(columns.joinToString(",") { csvField(it.header) })
            writer.write("\r\n")
            rows.forEach { row ->
                writer.write(columns.joinToString(",") { csvField(valueOf(it, row)) })
                writer.write("\r\n")
            }
        }
    }

    private fun csvField(raw: String): String {
        val needsQuoting = raw.any { it == ',' || it == '"' || it == '\n' || it == '\r' }
        // A leading =, +, - or @ makes Excel treat the cell as a formula, which
        // turns a scanned barcode or a pasted remark into a spreadsheet
        // injection vector. Prefixing an apostrophe keeps it literal text.
        val guarded = if (raw.firstOrNull() in listOf('=', '+', '-', '@')) "'$raw" else raw
        return if (needsQuoting || guarded !== raw) {
            '"' + guarded.replace("\"", "\"\"") + '"'
        } else {
            guarded
        }
    }

    // ----------------------------------------------------------------- XLSX

    private fun writeXlsx(
        file: File,
        columns: List<ExportColumn>,
        rows: List<ExportRow>,
        editable: Boolean,
        password: String?,
    ) {
        val writer = XlsxWriter(sheetName = "Stock Check")
            .header(columns.map { it.header }, columns.map { it.width })

        rows.forEach { row ->
            writer.row(
                columns.map { column ->
                    val text = valueOf(column, row)
                    val cell = when {
                        text.isEmpty() -> XlsxWriter.Cell.Blank
                        column.numeric -> text.toDoubleOrNull()
                            ?.let { XlsxWriter.Cell.Number(it) }
                            ?: XlsxWriter.Cell.Text(text)
                        else -> XlsxWriter.Cell.Text(text)
                    }
                    XlsxWriter.Styled(cell, editable = editable && column.editableWhenGranted)
                },
            )
        }

        // Protection is always applied. For an editable export the data columns
        // are individually unlocked, so the reference, date, worker and status
        // columns stay fixed even in a file the recipient may amend.
        writer.writeTo(file, protectionPassword = password)
    }

    // --------------------------------------------------------- cell values

    private fun valueOf(column: ExportColumn, row: ExportRow): String {
        val check = row.check
        val item = row.item
        if (column.key.startsWith("field:")) {
            return item.fieldValues[column.key.removePrefix("field:")].orEmpty()
        }
        return when (column.key) {
            ExportColumn.REF.key -> check.refNo
            ExportColumn.DATE.key -> dateFormat.format(Date(check.createdAt))
            ExportColumn.TIME.key -> timeFormat.format(Date(item.createdAt))
            ExportColumn.WORKER.key -> check.createdByName
            ExportColumn.TEMPLATE.key -> check.templateName
            ExportColumn.STATUS.key -> StockStatus.parse(check.status).label
            ExportColumn.BARCODE.key -> item.barcode
            ExportColumn.PRODUCT.key -> item.productName
            ExportColumn.SKU.key -> item.sku
            ExportColumn.QUANTITY.key -> item.quantity.toString()
            ExportColumn.UNIT.key -> item.unit
            ExportColumn.REMARK.key -> item.remark
            ExportColumn.SOURCE.key -> item.sourceEnum.name.lowercase()
                .replaceFirstChar { it.uppercase() }
            else -> ""
        }
    }

    /** Intent that hands the finished file to a mail, chat or files app. */
    fun shareIntent(result: ExportResult): Intent =
        Intent(Intent.ACTION_SEND).apply {
            type = if (result.encrypted) "application/zip" else result.format.mime
            putExtra(Intent.EXTRA_STREAM, result.uri)
            putExtra(Intent.EXTRA_SUBJECT, result.file.name)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

    private companion object {
        /**
         * Fallback when no company password is set.
         *
         * Published in the repository, so it is not a secret and is not meant
         * to be — it only stops an accidental edit. Nothing about the
         * integrity of a record depends on it; the record in the app and its
         * audit trail are what establish what a count said.
         */
        const val SHEET_GUARD = "stockcheck"
    }
}
