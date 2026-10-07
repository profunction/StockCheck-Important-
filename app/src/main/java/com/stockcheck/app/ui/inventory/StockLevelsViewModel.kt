package com.stockcheck.app.ui.inventory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.data.can
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.MovementType
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockComparison
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.StockLedger
import com.stockcheck.app.model.StockMovement
import com.stockcheck.app.pos.LoyverseSettings
import com.stockcheck.app.pos.PosStock
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

enum class LevelFilter { ALL, LOW, MISSING, UNCOUNTED }

data class LevelsState(
    val loading: Boolean = true,
    val levels: List<StockLedger.Level> = emptyList(),
    /** Movements since each product's count, for the detail sheet. */
    val movementsByKey: Map<String, List<StockMovement>> = emptyMap(),
)

/**
 * What should be on the shelves now. See [StockLedger] for the arithmetic;
 * this gathers what it needs and keeps it current.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StockLevelsViewModel(private val session: Session) : ViewModel() {

    private val stock = ServiceLocator.stock
    private val movementsRepo = ServiceLocator.movements

    val canRecord: Boolean = session.can(Permission.RECORD_STOCK_MOVEMENTS)
    val canConnect: Boolean = session.can(Permission.CHANGE_PERMISSION)

    private val checks: StateFlow<List<StockCheck>?> = stock.observeStockChecks(session, limit = 1000)
        .map<List<StockCheck>, List<StockCheck>?> { it }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /**
     * Thirteen months back. A product counted within the year is exact; one
     * not counted for longer shows only that window's movements, which the
     * screen's note owns up to.
     */
    private val since = System.currentTimeMillis() - WINDOW_MILLIS

    private val movements: StateFlow<List<StockMovement>?> = movementsRepo.observe(session, since)
        .map<List<StockMovement>, List<StockMovement>?> { it }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val products: StateFlow<List<Product>> = ServiceLocator.products.observeProducts()
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val branches: StateFlow<List<Branch>> = ServiceLocator.users.observeConfig()
        .map { config ->
            val all = config?.branches.orEmpty()
            val mine = session.profile.branchIds
            if (mine.isEmpty()) all else all.filter { it.id in mine }
        }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Only an admin may read the connection; for anyone else it is simply absent. */
    val loyverse: StateFlow<LoyverseSettings?> = (
        if (canConnect) ServiceLocator.loyverse.observe() else flowOf(null)
        )
        .catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** The till's own stock figures; like the connection, admins only. */
    private val posStock: StateFlow<PosStock?> = (
        if (canConnect) ServiceLocator.loyverse.observeStock() else flowOf(null)
        )
        .catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _branchId = MutableStateFlow<String?>(null)
    val branchId: StateFlow<String?> = _branchId.asStateFlow()

    private val _filter = MutableStateFlow(LevelFilter.ALL)
    val filter: StateFlow<LevelFilter> = _filter.asStateFlow()

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    private var last = LevelsState()

    val state: StateFlow<LevelsState> = combine(
        checks.filterNotNull(),
        movements.filterNotNull(),
        products,
        _branchId,
        posStock,
    ) { checks, movements, products, branch, pos -> Inputs(checks, movements, products, branch, pos) }
        .distinctUntilChanged()
        .transformLatest { inputs ->
            emit(last.copy(loading = true))
            last = runCatching { build(inputs) }.getOrElse {
                _message.value = it.message
                LevelsState(loading = false)
            }
            emit(last)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LevelsState())

    private data class Inputs(
        val checks: List<StockCheck>,
        val movements: List<StockMovement>,
        val products: List<Product>,
        val branch: String?,
        val pos: PosStock?,
    )

    private suspend fun build(inputs: Inputs): LevelsState {
        val finished = inputs.checks
            .filter(StockComparison::isFinished)
            .filter { inputs.branch == null || it.branchId == inputs.branch }
        val moves = inputs.movements.filter { inputs.branch == null || it.branchId == inputs.branch }
        val items = loadItems(finished)
        val catalogue = inputs.products.associateBy { it.barcode }

        val branchIds = (finished.map { it.branchId } + moves.map { it.branchId }).distinct()
        val perBranch = branchIds.map { branch ->
            StockLedger.levels(
                checks = finished.filter { it.branchId == branch },
                itemsOf = { items[it.id].orEmpty() },
                movements = moves.filter { it.branchId == branch },
                catalogue = catalogue,
            )
        }
        val counted = if (perBranch.size == 1) perBranch.single() else StockLedger.merge(perBranch)
        val till = inputs.pos?.levels.orEmpty()
            .filter { inputs.branch == null || it.branchId == inputs.branch }
            .groupBy { it.key }
            .mapValues { (_, list) -> list.first().name to list.sumOf { it.inStockMilli } }
        val levels = StockLedger.withPos(counted, till, catalogue)

        val countedAt = levels.associate { it.key to it.countedAt }
        val since = moves
            .filter { move -> countedAt[move.barcode]?.let { move.at > it } ?: true }
            .sortedByDescending { it.at }
            .groupBy { it.barcode }
        return LevelsState(loading = false, levels = levels, movementsByKey = since)
    }

    private val itemCache = ConcurrentHashMap<String, List<StockItem>>()

    private suspend fun loadItems(checks: List<StockCheck>): Map<String, List<StockItem>> = coroutineScope {
        checks.map { check ->
            async {
                val key = "${check.id}@${check.updatedAt}"
                check.id to (itemCache[key] ?: stock.fetchItems(check.id).also { itemCache[key] = it })
            }
        }.awaitAll().toMap()
    }

    // --------------------------------------------------------------- choices

    fun setBranch(branchId: String?) {
        _branchId.value = branchId
    }

    fun setFilter(filter: LevelFilter) {
        _filter.value = filter
    }

    fun setQuery(text: String) {
        _query.value = text
    }

    fun clearMessage() {
        _message.value = null
    }

    // --------------------------------------------------------------- actions

    fun record(
        type: MovementType,
        code: String,
        quantityMilli: Long,
        branchId: String,
        note: String,
        onDone: () -> Unit,
    ) {
        val product = products.value.firstOrNull { it.answersTo(code) }
            ?: products.value.firstOrNull { it.name.equals(code.trim(), ignoreCase = true) }
        viewModelScope.launch {
            runCatching {
                movementsRepo.record(session, type, product, code, quantityMilli, branchId, note)
            }
                .onSuccess { onDone() }
                .onFailure { _message.value = it.message }
        }
    }

    fun delete(movement: StockMovement) {
        viewModelScope.launch {
            runCatching { movementsRepo.delete(session, movement) }
                .onFailure { _message.value = it.message }
        }
    }

    fun setReorderLevel(level: StockLedger.Level, milli: Long?) {
        viewModelScope.launch {
            runCatching { movementsRepo.setReorderLevel(session, level.key, level.name, milli) }
                .onFailure { _message.value = it.message }
        }
    }

    fun syncLoyverse() {
        if (_syncing.value) return
        _syncing.value = true
        viewModelScope.launch {
            runCatching { ServiceLocator.loyverse.sync(session) }
                .onFailure { _message.value = it.message }
            _syncing.value = false
        }
    }

    companion object {
        private const val WINDOW_MILLIS = 400L * 24 * 60 * 60 * 1000

        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                StockLevelsViewModel(session) as T
        }
    }
}
