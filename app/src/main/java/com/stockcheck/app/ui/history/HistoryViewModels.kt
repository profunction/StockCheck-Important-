package com.stockcheck.app.ui.history

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.stockcheck.app.data.AdminGate
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.export.ExportColumn
import kotlinx.coroutines.flow.map
import com.stockcheck.app.export.ExportOptions
import com.stockcheck.app.export.ExportResult
import com.stockcheck.app.model.AuditEntry
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.StockStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HistoryViewModel(private val session: Session) : ViewModel() {

    private val stock = ServiceLocator.stock
    private val exports = ServiceLocator.exports

    private val all: StateFlow<List<StockCheck>> = stock.observeStockChecks(session, limit = 300)
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _statusFilter = MutableStateFlow<StockStatus?>(null)
    val statusFilter: StateFlow<StockStatus?> = _statusFilter.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    /** True while a password is being checked or a bulk action is running. */
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    /**
     * The custom columns the visible checks' templates define, so the export
     * dialog can offer them. Without this the picker only ever showed the
     * standard columns and a template field could not be selected at all.
     */
    val customColumns: StateFlow<List<ExportColumn>> =
        ServiceLocator.templates.observeTemplates()
            .map { templates -> ExportColumn.availableForAll(templates) - ExportColumn.standard.toSet() }
            .catch { emit(emptyList()) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Empty when no admin has set one, which means exports go out in the open. */
    val exportPassword: StateFlow<String> = ServiceLocator.users.observeConfig()
        .map { it?.exportPassword.orEmpty() }
        .catch { emit("") }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")

    private val _lastExport = MutableStateFlow<ExportResult?>(null)
    val lastExport: StateFlow<ExportResult?> = _lastExport.asStateFlow()

    val filtered: StateFlow<List<StockCheck>> =
        combine(all, _query, _statusFilter) { checks, text, status ->
            checks.filter { check ->
                (status == null || check.statusEnum == status) &&
                    (
                        text.isBlank() ||
                            check.refNo.contains(text, ignoreCase = true) ||
                            check.templateName.contains(text, ignoreCase = true) ||
                            check.createdByName.contains(text, ignoreCase = true) ||
                            // The area is often the only thing that tells two
                            // counts of the same day apart.
                            check.zone.contains(text, ignoreCase = true)
                        )
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setQuery(value: String) {
        _query.value = value
    }

    fun setStatusFilter(status: StockStatus?) {
        _statusFilter.value = status
    }

    fun export(checks: List<StockCheck>, options: ExportOptions) {
        viewModelScope.launch {
            runCatching { exports.export(session, checks, options) }
                .onSuccess { _lastExport.value = it }
                .onFailure { _message.value = it.message }
        }
    }

    /**
     * Exports or deletes the selected counts, once an administrator has
     * approved it with their password.
     *
     * The verification happens first and the work only follows it, so a wrong
     * password costs nothing: nothing has been deleted and no file has been
     * written by the time it is refused.
     *
     * The approval is recorded in the note on the export, and by the audit
     * entry each deletion already writes. Who pressed the button and who
     * allowed it are two different facts and a trail that keeps only one of
     * them cannot answer what happened.
     */
    fun runWithAdmin(
        action: BulkAction,
        ids: List<String>,
        email: String,
        password: String,
        onDone: () -> Unit,
    ) {
        if (ids.isEmpty()) return
        viewModelScope.launch {
            _busy.value = true
            try {
                when (val verdict = ServiceLocator.adminGate.verify(email, password)) {
                    is AdminGate.Result.Refused -> {
                        _message.value = verdict.reason
                        return@launch
                    }
                    is AdminGate.Result.Approved -> {
                        val picked = all.value.filter { it.id in ids }
                        when (action) {
                            BulkAction.DELETE -> {
                                // One at a time rather than a batch: each
                                // check has its own items and photos to clear
                                // and its own audit entry to write, and a
                                // half-finished batch would leave orphans no
                                // screen can reach.
                                var failed = 0
                                picked.forEach { check ->
                                    runCatching { stock.deleteStockCheck(session, check) }
                                        .onFailure { failed++ }
                                }
                                _message.value = if (failed == 0) {
                                    "Deleted ${picked.size}, approved by ${verdict.name}."
                                } else {
                                    "Deleted ${picked.size - failed}. $failed could not be " +
                                        "removed — a locked count needs unlocking first."
                                }
                            }
                            BulkAction.EXPORT -> {
                                runCatching {
                                    exports.export(session, picked, ExportOptions())
                                }
                                    .onSuccess { _lastExport.value = it }
                                    .onFailure { _message.value = it.message }
                            }
                        }
                        onDone()
                    }
                }
            } finally {
                _busy.value = false
            }
        }
    }

    fun shareIntent(result: ExportResult): Intent = exports.shareIntent(result)

    fun clearExport() {
        _lastExport.value = null
    }

    companion object {
        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                HistoryViewModel(session) as T
        }
    }
}

class HistoryDetailViewModel(
    private val session: Session,
    private val checkId: String,
) : ViewModel() {

    private val stock = ServiceLocator.stock
    private val auditRepo = ServiceLocator.audit

    val check: StateFlow<StockCheck?> = stock.observeStockCheck(checkId)
        .catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val items: StateFlow<List<StockItem>> = stock.observeItems(checkId)
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Only queried when the role may read it; otherwise the listener would be denied. */
    val audit: StateFlow<List<AuditEntry>> =
        if (session.role.permissionSet.has(Permission.VIEW_AUDIT_LOG) ||
            session.role.id == "admin"
        ) {
            auditRepo.observeForStockCheck(checkId)
                .catch { emit(emptyList()) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
        } else {
            flowOf(emptyList<AuditEntry>())
                .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
        }

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun edit(before: StockItem, after: StockItem) {
        viewModelScope.launch {
            runCatching { stock.updateItem(session, checkId, before, after) }
                .onFailure { _message.value = it.message }
        }
    }

    fun duplicate() {
        val current = check.value ?: return
        viewModelScope.launch {
            runCatching { stock.duplicateStockCheck(session, current) }
                .onSuccess { _message.value = "Duplicated — find it on the Stock tab." }
                .onFailure { _message.value = it.message }
        }
    }

    fun delete(onDeleted: () -> Unit) {
        val current = check.value ?: return
        viewModelScope.launch {
            runCatching { stock.deleteStockCheck(session, current) }
                .onSuccess { onDeleted() }
                .onFailure { _message.value = it.message }
        }
    }

    companion object {
        fun factory(session: Session, checkId: String) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                HistoryDetailViewModel(session, checkId) as T
        }
    }
}
