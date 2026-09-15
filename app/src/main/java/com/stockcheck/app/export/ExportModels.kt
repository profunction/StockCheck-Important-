package com.stockcheck.app.export

import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.PermissionSet
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.Template

enum class ExportFormat(val label: String, val extension: String, val mime: String) {
    CSV("CSV (.csv)", "csv", "text/csv"),
    XLSX(
        "Excel (.xlsx)",
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
}

enum class ExportScope(val label: String) {
    OWN("My records only"),
    ALL("All workers' records"),
}

/**
 * One column of the exported sheet.
 *
 * [editableWhenGranted] marks columns that a user holding EDIT_EXPORTED_FILE
 * is allowed to change in the produced file. Everything else is locked, which
 * is what stops a worker from receiving an export, retyping the quantities and
 * sending it on as if it were the counted record.
 */
data class ExportColumn(
    val key: String,
    val header: String,
    val width: Int = 16,
    val numeric: Boolean = false,
    val editableWhenGranted: Boolean = false,
    /** Columns the role may not even see are exported blank, not omitted. */
    val requiresPermission: Permission? = null,
) {
    companion object {
        val REF = ExportColumn("refNo", "Ref No", width = 14)
        val DATE = ExportColumn("date", "Date", width = 12)
        val TIME = ExportColumn("time", "Time", width = 10)
        val WORKER = ExportColumn("worker", "Worker", width = 18)
        val TEMPLATE = ExportColumn("template", "Template", width = 20)
        val STATUS = ExportColumn("status", "Status", width = 13)
        val BARCODE = ExportColumn("barcode", "Barcode", width = 20)
        val PRODUCT = ExportColumn("product", "Product", width = 26, editableWhenGranted = true)
        val SKU = ExportColumn("sku", "SKU", width = 16, editableWhenGranted = true)
        val QUANTITY = ExportColumn(
            "quantity", "Quantity", width = 11, numeric = true, editableWhenGranted = true,
        )
        val UNIT = ExportColumn("unit", "Unit", width = 9, editableWhenGranted = true)
        val REMARK = ExportColumn("remark", "Remark", width = 30, editableWhenGranted = true)
        val SOURCE = ExportColumn("source", "Entered by", width = 12)

        /** The columns every export offers, before template fields are added. */
        val standard: List<ExportColumn> = listOf(
            REF, DATE, TIME, WORKER, TEMPLATE, STATUS,
            BARCODE, PRODUCT, SKU, QUANTITY, UNIT, REMARK, SOURCE,
        )

        /** Ticked by default in the export sheet. */
        val defaultSelection: Set<String> = setOf(
            REF.key, DATE.key, WORKER.key, BARCODE.key, PRODUCT.key, QUANTITY.key, UNIT.key,
        )

        /** Standard columns plus the custom fields of [template]. */
        fun availableFor(template: Template?): List<ExportColumn> =
            availableForAll(listOfNotNull(template))

        /**
         * Standard columns plus the custom fields of EVERY template involved.
         *
         * One export covers whatever the History filter selected, which can
         * mix templates. Taking the fields of just the first check dropped
         * every other template's columns silently — a warehouse count merged
         * with a quick count lost its SKU, rack and batch with nothing to say
         * so. The union keeps them; rows from a template that has no such
         * field simply leave that cell empty, which is the honest rendering.
         */
        fun availableForAll(templates: List<Template>): List<ExportColumn> {
            // A template field can share a name with a standard column --
            // "remark" is the obvious one -- and the export then carried two
            // columns headed Remark, one of them always empty. Compared by
            // header because that is what a reader sees; the internal keys
            // differ ("remark" against "field:remark") and so never collided.
            val standardHeaders = standard.map { it.header.lowercase() }.toSet()
            val custom = templates
                .flatMap { it.fields }
                .filter { it.includeInExport }
                .filter { it.label.lowercase() !in standardHeaders }
                // Two templates can name the same key; one column serves both.
                .distinctBy { it.key }
                .map { field ->
                    ExportColumn(
                        key = "field:${field.key}",
                        header = field.label,
                        width = 18,
                        editableWhenGranted = true,
                    )
                }
            return standard + custom
        }
    }
}

data class ExportOptions(
    val format: ExportFormat = ExportFormat.CSV,
    val scope: ExportScope = ExportScope.OWN,
    val selectedKeys: Set<String> = ExportColumn.defaultSelection,
    /** Inclusive day bounds in epoch millis; null means unbounded. */
    val fromMillis: Long? = null,
    val toMillis: Long? = null,
    /**
     * Apply Excel's own sheet protection, with the company password.
     *
     * Was always on, which meant the choice did not exist and the only
     * related control -- "allow editing" -- read backwards. It is a decision
     * per export: a sheet someone is meant to fill in should not arrive
     * locked, and one going to a customer should.
     */
    val protectSheet: Boolean = true,
    /**
     * Within a protected sheet, leave the counted values editable.
     *
     * Reference, date, worker and status stay locked regardless. Only offered
     * to holders of EDIT_EXPORTED_FILE.
     */
    val editable: Boolean = false,
    /**
     * Deliver inside an AES-256 archive that cannot be opened without the
     * password at all — a different thing from sheet protection, which only
     * governs editing once the file is already open.
     */
    val encryptBundle: Boolean = false,
) {
    fun columns(template: Template?): List<ExportColumn> =
        ExportColumn.availableFor(template).filter { it.key in selectedKeys }

    fun columnsFor(templates: List<Template>): List<ExportColumn> =
        ExportColumn.availableForAll(templates).filter { it.key in selectedKeys }
}

/** One exported line: an item together with the check it belongs to. */
data class ExportRow(val check: StockCheck, val item: StockItem)

/**
 * Decides what a given role may actually put in the file.
 *
 * Narrowing happens here rather than in the UI so that an export triggered from
 * anywhere produces the same, permitted result.
 */
fun ExportOptions.narrowedFor(permissions: PermissionSet): ExportOptions {
    val scope = if (this.scope == ExportScope.ALL && !permissions.has(Permission.EXPORT_ALL_DATA)) {
        ExportScope.OWN
    } else {
        this.scope
    }
    val format = when {
        this.format == ExportFormat.XLSX && !permissions.has(Permission.EXPORT_EXCEL) ->
            ExportFormat.CSV
        this.format == ExportFormat.CSV && !permissions.has(Permission.EXPORT_CSV) ->
            ExportFormat.XLSX
        else -> this.format
    }
    return copy(
        scope = scope,
        format = format,
        editable = this.editable && permissions.has(Permission.EDIT_EXPORTED_FILE),
    )
}
