package com.stockcheck.app.ui.inventory

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.export.CsvReader
import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.export.SheetMapping
import com.stockcheck.app.export.SheetMapping.Role
import com.stockcheck.app.export.SheetReader
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate

/** A file once read: its header and the rows under it. */
data class SheetFile(
    val name: String,
    val headers: List<String>,
    val rows: List<List<String>>,
    /** 1-based line of the header in the file, for messages. */
    val headerLine: Int,
)

data class ImportPreview(
    val rowsRead: Int = 0,
    val problems: List<String> = emptyList(),
    val planned: List<MovementFile.Planned> = emptyList(),
) {
    val unmatched: Int get() = planned.filter { !it.matched }.map { it.key }.distinct().size
}

/**
 * Sales or deliveries from a file the customer already has.
 *
 * Nothing is written until the person has seen which column is which and
 * what will be recorded; the guess is made for them, the decision is theirs.
 */
class ImportMovementsViewModel(
    private val session: Session,
    val kind: MovementFile.Kind,
) : ViewModel() {

    val roles = listOf(Role.BARCODE, Role.SKU, Role.NAME, Role.QUANTITY, Role.DATE)

    private val products: StateFlow<List<Product>> = ServiceLocator.products.observeProducts()
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val branches: StateFlow<List<Branch>> = ServiceLocator.users.observeConfig()
        .map { config ->
            val all = config?.branches.orEmpty()
            val mine = session.profile.branchIds
            if (mine.isEmpty()) all else all.filter { it.id in mine }
        }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** A branch account files under one of its branches; the rules refuse anything else. */
    val restricted: Boolean = session.profile.branchIds.isNotEmpty()

    private val _file = MutableStateFlow<SheetFile?>(null)
    val file: StateFlow<SheetFile?> = _file.asStateFlow()

    private val _columns = MutableStateFlow<Map<Role, Int>>(emptyMap())
    val columns: StateFlow<Map<Role, Int>> = _columns.asStateFlow()

    private val _date = MutableStateFlow(LocalDate.now())
    val date: StateFlow<LocalDate> = _date.asStateFlow()

    private val _branchId = MutableStateFlow(session.profile.branchIds.firstOrNull().orEmpty())
    val branchId: StateFlow<String> = _branchId.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _done = MutableStateFlow<Int?>(null)
    val done: StateFlow<Int?> = _done.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    val preview: StateFlow<ImportPreview> = combine(_file, _columns, _date, products) { file, columns, date, catalogue ->
        if (file == null) return@combine ImportPreview()
        val (lines, problems) = MovementFile.read(file.rows, columns, firstLineNumber = file.headerLine + 1)
        ImportPreview(
            rowsRead = lines.size,
            problems = problems,
            planned = MovementFile.plan(lines, date, MovementFile.Matcher(catalogue)),
        )
    }
        .flowOn(Dispatchers.Default)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ImportPreview())

    val hasProduct: Boolean get() = listOf(Role.BARCODE, Role.SKU, Role.NAME).any { it in _columns.value }
    val hasQuantity: Boolean get() = Role.QUANTITY in _columns.value

    fun load(bytes: ByteArray, name: String) {
        viewModelScope.launch {
            _message.value = null
            _done.value = null
            runCatching {
                withContext(Dispatchers.Default) {
                    val cells = SheetReader.readCells(bytes)
                    val headerIndex = SheetMapping.findHeader(cells)
                        ?: throw IllegalArgumentException("That file has nothing in it.")
                    SheetFile(
                        name = name,
                        headers = cells[headerIndex].map { it.trim() },
                        rows = cells.drop(headerIndex + 1),
                        headerLine = headerIndex + 1,
                    )
                }
            }
                .onSuccess { file ->
                    _file.value = file
                    _columns.value = remembered(file.headers)
                        ?: SheetMapping.guess(file.headers, file.rows.take(30), roles).columns
                }
                .onFailure { _message.value = it.message ?: "That file could not be read." }
        }
    }

    fun onFileUnreadable() {
        _message.value = "That file could not be opened. Pick a .xlsx or .csv file."
    }

    fun setColumn(role: Role, index: Int?) {
        val next = _columns.value.toMutableMap()
        // One role per column: giving a column a new role takes it from the old one.
        if (index != null) next.entries.removeAll { it.value == index }
        if (index == null) next.remove(role) else next[role] = index
        _columns.value = next
    }

    fun setDate(date: LocalDate) {
        _date.value = date
    }

    fun setBranch(branchId: String) {
        _branchId.value = branchId
    }

    fun reset() {
        _file.value = null
        _columns.value = emptyMap()
        _done.value = null
        _message.value = null
    }

    fun runImport() {
        val file = _file.value ?: return
        val planned = preview.value.planned
        if (planned.isEmpty() || _busy.value) return
        _busy.value = true
        viewModelScope.launch {
            runCatching {
                ServiceLocator.movements.importPlanned(session, kind, _branchId.value, planned, file.name)
            }
                .onSuccess { count ->
                    remember(file.headers, _columns.value)
                    _done.value = count
                }
                .onFailure { _message.value = it.message }
            _busy.value = false
        }
    }

    // ------------------------------------------------------- remembered layout

    /**
     * The same till exports the same layout every time, so a mapping
     * corrected once is used again for any file with the same columns.
     */
    private fun prefs() = ServiceLocator.context().getSharedPreferences("import_mappings", Context.MODE_PRIVATE)

    private fun layoutKey(headers: List<String>): String =
        "${kind.name}:" + headers.joinToString("|") { CsvReader.normaliseHeader(it) }

    private fun remembered(headers: List<String>): Map<Role, Int>? {
        val stored = prefs().getString(layoutKey(headers), null) ?: return null
        return stored.split(';').mapNotNull { entry ->
            val (role, index) = entry.split('=').takeIf { it.size == 2 } ?: return@mapNotNull null
            val parsedRole = Role.entries.firstOrNull { it.name == role } ?: return@mapNotNull null
            val column = index.toIntOrNull()?.takeIf { it in headers.indices } ?: return@mapNotNull null
            parsedRole to column
        }.toMap().ifEmpty { null }
    }

    private fun remember(headers: List<String>, columns: Map<Role, Int>) {
        prefs().edit()
            .putString(layoutKey(headers), columns.entries.joinToString(";") { "${it.key.name}=${it.value}" })
            .apply()
    }

    // ------------------------------------------------------------ sample file

    /** A small file in the shape this screen reads best, to show a supplier or a till. */
    fun sampleIntent(context: Context): Intent {
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, "stockcheck-sample-${kind.name.lowercase()}.csv")
        val today = LocalDate.now()
        val day = "%02d/%02d/%d".format(today.dayOfMonth, today.monthValue, today.year)
        file.writeText(
            "﻿Date,Barcode,SKU,Product,Quantity\r\n" +
                "$day,9555012345678,M1,Milo 1kg,3\r\n" +
                "$day,,S5,Sugar 1kg,12\r\n" +
                "$day,9555098765432,,Rice 5kg,1.5\r\n",
            Charsets.UTF_8,
        )
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, file.name)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    companion object {
        fun factory(session: Session, kind: MovementFile.Kind) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                ImportMovementsViewModel(session, kind) as T
        }
    }
}
