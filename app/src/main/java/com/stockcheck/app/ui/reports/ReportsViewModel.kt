package com.stockcheck.app.ui.reports

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.export.ExportFormat
import com.stockcheck.app.export.ExportResult
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockComparison
import com.stockcheck.app.model.StockItem
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.util.concurrent.ConcurrentHashMap

enum class ReportMode { MONTHS, COUNTS }

/** The comparison for whatever is currently chosen. */
data class ReportState(
    val loading: Boolean = true,
    /** The counts each side was built from; empty when that side has none. */
    val before: List<StockCheck> = emptyList(),
    val after: List<StockCheck> = emptyList(),
    val rows: List<StockComparison.Row> = emptyList(),
    val summary: StockComparison.Summary? = null,
)

data class TrendPoint(val month: YearMonth, val quantity: Long?)

data class TrendState(
    val row: StockComparison.Row,
    val loading: Boolean,
    val points: List<TrendPoint> = emptyList(),
)

private data class Choice(
    val mode: ReportMode,
    val beforeMonth: YearMonth,
    val afterMonth: YearMonth,
    val branchId: String?,
    val beforeCheckId: String?,
    val afterCheckId: String?,
)

/**
 * Compares what two periods -- or two particular counts -- say was on the
 * shelves. The rule for turning counts into a figure lives in
 * [StockComparison]; this decides which counts each side is made of.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReportsViewModel(private val session: Session) : ViewModel() {

    private val stock = ServiceLocator.stock
    private val exports = ServiceLocator.exports

    /** Null until the first answer arrives, so "nothing to compare" never flashes. */
    private val loaded: StateFlow<List<StockCheck>?> = stock.observeStockChecks(session, limit = 1000)
        .map<List<StockCheck>, List<StockCheck>?> { it }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Every count this account may see, newest first, for the count pickers. */
    val checks: StateFlow<List<StockCheck>> = loaded
        .map { it.orEmpty() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** The company's branches, narrowed to the ones this account works at. */
    val branches: StateFlow<List<Branch>> = ServiceLocator.users.observeConfig()
        .map { config ->
            val all = config?.branches.orEmpty()
            val mine = session.profile.branchIds
            if (mine.isEmpty()) all else all.filter { it.id in mine }
        }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val thisMonth = YearMonth.now()

    private val _mode = MutableStateFlow(ReportMode.MONTHS)
    val mode: StateFlow<ReportMode> = _mode.asStateFlow()

    // Last month against this one: the question a shop owner opens this with.
    private val _beforeMonth = MutableStateFlow(thisMonth.minusMonths(1))
    val beforeMonth: StateFlow<YearMonth> = _beforeMonth.asStateFlow()

    private val _afterMonth = MutableStateFlow(thisMonth)
    val afterMonth: StateFlow<YearMonth> = _afterMonth.asStateFlow()

    /** Null is every branch this account can see. */
    private val _branchId = MutableStateFlow<String?>(null)
    val branchId: StateFlow<String?> = _branchId.asStateFlow()

    private val _beforeCheckId = MutableStateFlow<String?>(null)
    val beforeCheckId: StateFlow<String?> = _beforeCheckId.asStateFlow()

    private val _afterCheckId = MutableStateFlow<String?>(null)
    val afterCheckId: StateFlow<String?> = _afterCheckId.asStateFlow()

    private val _changesOnly = MutableStateFlow(false)
    val changesOnly: StateFlow<Boolean> = _changesOnly.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _lastExport = MutableStateFlow<ExportResult?>(null)
    val lastExport: StateFlow<ExportResult?> = _lastExport.asStateFlow()

    private val _trend = MutableStateFlow<TrendState?>(null)
    val trend: StateFlow<TrendState?> = _trend.asStateFlow()
    private var trendJob: Job? = null

    private val choice = combine(
        _mode,
        _beforeMonth,
        _afterMonth,
        _branchId,
        combine(_beforeCheckId, _afterCheckId) { a, b -> a to b },
    ) { mode, beforeMonth, afterMonth, branchId, picks ->
        Choice(mode, beforeMonth, afterMonth, branchId, picks.first, picks.second)
    }

    private var last = ReportState()

    val state: StateFlow<ReportState> = combine(loaded.filterNotNull(), choice) { all, c -> sides(all, c) }
        // The counts listener fires on every metadata change; the lines only
        // need reading again when the counts making up a side actually differ.
        .distinctUntilChanged()
        .transformLatest { (before, after) ->
            if (before.isEmpty() && after.isEmpty()) {
                last = ReportState(loading = false)
                emit(last)
                return@transformLatest
            }
            // The previous result stays on screen while the next loads,
            // rather than the list blanking on every month tapped through.
            emit(last.copy(loading = true))
            last = runCatching { build(before, after) }.getOrElse {
                _message.value = it.message
                ReportState(loading = false, before = before, after = after)
            }
            emit(last)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ReportState())

    init {
        // Two sensible counts are already chosen by the time anyone switches
        // to comparing two counts.
        viewModelScope.launch {
            val all = loaded.filterNotNull().first { it.isNotEmpty() }
            if (_afterCheckId.value == null) pickDefaultCounts(all)
        }
    }

    // ---------------------------------------------------------------- choices

    fun setMode(mode: ReportMode) {
        _mode.value = mode
    }

    fun setBeforeMonth(month: YearMonth) {
        _beforeMonth.value = month
    }

    fun setAfterMonth(month: YearMonth) {
        _afterMonth.value = if (month.isAfter(thisMonth)) thisMonth else month
    }

    fun setBranch(branchId: String?) {
        _branchId.value = branchId
    }

    fun pickBefore(check: StockCheck) {
        _beforeCheckId.value = check.id
    }

    fun pickAfter(check: StockCheck) {
        _afterCheckId.value = check.id
    }

    fun setChangesOnly(on: Boolean) {
        _changesOnly.value = on
    }

    fun clearMessage() {
        _message.value = null
    }

    /**
     * The latest finished count, against the one before it of the same area
     * -- the same cold room last time -- or simply the one before it.
     */
    private fun pickDefaultCounts(all: List<StockCheck>) {
        val finished = all.filter(StockComparison::isFinished).ifEmpty { all }
        val later = finished.maxByOrNull(StockComparison::takenAt) ?: return
        val older = finished
            .filter { it.id != later.id && StockComparison.takenAt(it) <= StockComparison.takenAt(later) }
            .sortedByDescending(StockComparison::takenAt)
        val earlier = older.firstOrNull { it.branchId == later.branchId && it.zone.equals(later.zone, true) }
            ?: older.firstOrNull()
        _afterCheckId.value = later.id
        _beforeCheckId.value = earlier?.id
    }

    private fun sides(all: List<StockCheck>, c: Choice): Pair<List<StockCheck>, List<StockCheck>> =
        when (c.mode) {
            ReportMode.MONTHS -> {
                val inScope = all.filter {
                    StockComparison.isFinished(it) && (c.branchId == null || it.branchId == c.branchId)
                }
                inScope.filter { monthOf(it) == c.beforeMonth } to
                    inScope.filter { monthOf(it) == c.afterMonth }
            }
            ReportMode.COUNTS ->
                listOfNotNull(all.firstOrNull { it.id == c.beforeCheckId }) to
                    listOfNotNull(all.firstOrNull { it.id == c.afterCheckId })
        }

    // --------------------------------------------------------------- building

    private suspend fun build(before: List<StockCheck>, after: List<StockCheck>): ReportState {
        val items = loadItems(before + after)
        val rows = StockComparison.compare(
            StockComparison.snapshot(before) { items[it.id].orEmpty() },
            StockComparison.snapshot(after) { items[it.id].orEmpty() },
        )
        return ReportState(
            loading = false,
            before = before,
            after = after,
            rows = rows,
            summary = StockComparison.summarise(rows),
        )
    }

    /**
     * Keyed by the count's updatedAt as well as its id: every change to a
     * line bumps it, so an edited count is read again and an untouched one
     * never is.
     */
    private val itemCache = ConcurrentHashMap<String, List<StockItem>>()

    private suspend fun loadItems(checks: List<StockCheck>): Map<String, List<StockItem>> =
        coroutineScope {
            checks.distinctBy { it.id }
                .map { check ->
                    async {
                        val key = "${check.id}@${check.updatedAt}"
                        check.id to (itemCache[key] ?: stock.fetchItems(check.id).also { itemCache[key] = it })
                    }
                }
                .awaitAll()
                .toMap()
        }

    // ------------------------------------------------------------------ trend

    /**
     * One product over the six months up to the later side, figured the same
     * way as the comparison: each area's latest count of it in the month.
     */
    fun openTrend(row: StockComparison.Row) {
        val current = state.value
        val (endMonth, branch) = when (_mode.value) {
            ReportMode.MONTHS -> _afterMonth.value to _branchId.value
            ReportMode.COUNTS -> {
                val after = current.after.firstOrNull()
                (after?.let { monthOf(it) } ?: thisMonth) to after?.branchId?.ifEmpty { null }
            }
        }
        val months = (5 downTo 0).map { endMonth.minusMonths(it.toLong()) }
        _trend.value = TrendState(row, loading = true)
        trendJob?.cancel()
        trendJob = viewModelScope.launch {
            runCatching {
                val inScope = checks.value.filter {
                    StockComparison.isFinished(it) && (branch == null || it.branchId == branch)
                }
                val byMonth = months.associateWith { month -> inScope.filter { monthOf(it) == month } }
                val items = loadItems(byMonth.values.flatten())
                months.map { month ->
                    val held = StockComparison.snapshot(byMonth.getValue(month)) { items[it.id].orEmpty() }
                    TrendPoint(month, held[row.key]?.quantity)
                }
            }.onSuccess { _trend.value = TrendState(row, loading = false, points = it) }
                .onFailure {
                    _trend.value = null
                    _message.value = it.message
                }
        }
    }

    fun closeTrend() {
        trendJob?.cancel()
        _trend.value = null
    }

    // ----------------------------------------------------------------- export

    fun export(
        format: ExportFormat,
        fileLabel: String,
        headers: List<String>,
        noteFor: (StockComparison.Row) -> String,
    ) {
        val current = state.value
        viewModelScope.launch {
            runCatching {
                exports.exportComparison(
                    session = session,
                    involved = current.before + current.after,
                    fileLabel = fileLabel,
                    headers = headers,
                    rows = current.rows,
                    noteFor = noteFor,
                    format = format,
                )
            }
                .onSuccess { _lastExport.value = it }
                .onFailure { _message.value = it.message }
        }
    }

    fun shareIntent(result: ExportResult): Intent = exports.shareIntent(result)

    fun clearExport() {
        _lastExport.value = null
    }

    companion object {
        fun monthOf(check: StockCheck): YearMonth =
            YearMonth.from(Instant.ofEpochMilli(StockComparison.takenAt(check)).atZone(ZoneId.systemDefault()))

        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                ReportsViewModel(session) as T
        }
    }
}
