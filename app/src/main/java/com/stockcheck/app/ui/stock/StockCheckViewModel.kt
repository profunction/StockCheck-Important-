package com.stockcheck.app.ui.stock

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.stockcheck.app.data.ImportSummary
import com.stockcheck.app.data.ScanOutcome
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.model.ItemSource
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.model.Template
import com.stockcheck.app.scan.VoiceCommand
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Prompt shown when a barcode that is already on the list is scanned again.
 *
 * The operator decides how much to add rather than the app silently creating a
 * duplicate line or blindly incrementing by one.
 */
data class DuplicatePrompt(
    val item: StockItem,
    val suggestedAdd: Int = 1,
)

/** A transient message for the snackbar. */
data class Toast(val message: String, val isError: Boolean = false)

class StockCheckViewModel(
    private val session: Session,
    private val checkId: String,
) : ViewModel() {

    private val stock = ServiceLocator.stock
    private val products = ServiceLocator.products
    private val templates = ServiceLocator.templates
    private val photos = ServiceLocator.photos
    private val imports = ServiceLocator.imports

    val check: StateFlow<StockCheck?> = stock.observeStockCheck(checkId)
        .catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val items: StateFlow<List<StockItem>> = stock.observeItems(checkId)
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _template = MutableStateFlow<Template?>(null)
    val template: StateFlow<Template?> = _template.asStateFlow()

    private val _duplicate = MutableStateFlow<DuplicatePrompt?>(null)
    val duplicate: StateFlow<DuplicatePrompt?> = _duplicate.asStateFlow()

    private val _toast = MutableStateFlow<Toast?>(null)
    val toast: StateFlow<Toast?> = _toast.asStateFlow()

    /** The line most recently touched; a bare spoken number applies to it. */
    private val _focusedItemId = MutableStateFlow<String?>(null)
    val focusedItemId: StateFlow<String?> = _focusedItemId.asStateFlow()

    private val _scannerActive = MutableStateFlow(true)
    val scannerActive: StateFlow<Boolean> = _scannerActive.asStateFlow()

    init {
        viewModelScope.launch {
            check.collect { current ->
                if (current != null && _template.value?.id != current.templateId) {
                    _template.value = templates.getTemplate(current.templateId)
                }
            }
        }
        // Anything captured before the app was last closed still needs pushing.
        photos.retryPendingUploads(checkId)
    }

    fun setScannerActive(active: Boolean) {
        _scannerActive.value = active
    }

    fun focus(itemId: String?) {
        _focusedItemId.value = itemId
    }

    // ------------------------------------------------------------- scanning

    fun onBarcodeScanned(barcode: String, source: ItemSource = ItemSource.SCAN) {
        if (isFrozen()) return
        viewModelScope.launch {
            runCatching {
                stock.scanBarcode(
                    session = session,
                    stockCheckId = checkId,
                    barcode = barcode,
                    source = source,
                )
            }.onSuccess { outcome ->
                when (outcome) {
                    is ScanOutcome.Added -> {
                        _focusedItemId.value = outcome.item.id
                        _toast.value = Toast("Added ${outcome.item.barcode}")
                    }
                    is ScanOutcome.AlreadyPresent -> {
                        _focusedItemId.value = outcome.item.id
                        _duplicate.value = DuplicatePrompt(outcome.item)
                    }
                }
            }.onFailure { fail(it) }
        }
    }

    fun confirmDuplicateAdd(amount: Int) {
        val prompt = _duplicate.value ?: return
        _duplicate.value = null
        adjust(prompt.item, amount)
    }

    fun dismissDuplicate() {
        _duplicate.value = null
    }

    // ---------------------------------------------------------------- voice

    /**
     * Applies a parsed voice command.
     *
     * A phrase naming a product creates or updates that product; a bare number
     * adjusts the focused line, which is what makes "scan, then say twenty
     * five" work as one continuous motion.
     */
    fun onVoiceCommand(command: VoiceCommand) {
        if (isFrozen()) return
        when (command) {
            is VoiceCommand.Barcode -> onBarcodeScanned(command.barcode, ItemSource.VOICE)

            is VoiceCommand.Count -> viewModelScope.launch {
                val existing = items.value.firstOrNull { item ->
                    item.productName.equals(command.productName, ignoreCase = true) ||
                        item.barcode == command.productName
                }
                runCatching {
                    if (existing != null) {
                        stock.updateItem(
                            session = session,
                            stockCheckId = checkId,
                            before = existing,
                            after = existing.copy(
                                quantity = command.quantity,
                                unit = command.unit ?: existing.unit,
                            ),
                        )
                        _focusedItemId.value = existing.id
                        _toast.value = Toast(
                            "${existing.productName.ifEmpty { existing.barcode }} " +
                                "set to ${command.quantity}",
                        )
                    } else {
                        // A spoken product with no barcode still needs a key, so
                        // the name itself is used until the item is scanned.
                        val outcome = stock.scanBarcode(
                            session = session,
                            stockCheckId = checkId,
                            barcode = command.productName,
                            productName = command.productName,
                            quantity = command.quantity,
                            unit = command.unit ?: "pcs",
                            source = ItemSource.VOICE,
                        )
                        when (outcome) {
                            is ScanOutcome.Added -> {
                                _focusedItemId.value = outcome.item.id
                                _toast.value = Toast(
                                    "${command.productName} × ${command.quantity}",
                                )
                            }
                            is ScanOutcome.AlreadyPresent ->
                                _duplicate.value = DuplicatePrompt(
                                    outcome.item,
                                    suggestedAdd = command.quantity,
                                )
                        }
                    }
                }.onFailure { fail(it) }
            }

            is VoiceCommand.QuantityOnly -> {
                val focused = items.value.firstOrNull { it.id == _focusedItemId.value }
                if (focused == null) {
                    _toast.value = Toast(
                        "Heard \"${command.quantity}\" — scan or tap an item first.",
                        isError = true,
                    )
                } else {
                    setQuantity(focused, command.quantity)
                }
            }

            is VoiceCommand.Unrecognised ->
                _toast.value = Toast("${command.reason} Heard: \"${command.transcript}\"", true)
        }
    }

    // ------------------------------------------------------------ item edits

    /**
     * Adds [delta] to a line, removing it entirely when subtracting reaches
     * zero.
     *
     * A line at zero says nothing a missing line does not, and leaving it
     * there makes the count read as if the product were found and counted as
     * none. Subtracting to nothing is how someone says "this is not here", so
     * it takes the row with it. Re-scanning brings it straight back, and the
     * removal is in the audit trail either way.
     */
    fun adjust(item: StockItem, delta: Int) {
        if (isFrozen()) return
        _focusedItemId.value = item.id

        if (delta < 0 && item.quantity + delta <= 0) {
            // A line the count sheet expected stays, at zero. "Expected 10,
            // found none" is the finding; deleting the row deletes it.
            if (item.survivesZero) {
                if (item.quantity == 0) return
                viewModelScope.launch {
                    runCatching { stock.adjustQuantity(session, checkId, item, -item.quantity) }
                        .onFailure { fail(it) }
                }
            } else {
                deleteItem(item)
            }
            return
        }

        viewModelScope.launch {
            runCatching {
                stock.adjustQuantity(session, checkId, item, delta)
            }.onFailure { fail(it) }
        }
    }

    fun setQuantity(item: StockItem, quantity: Int) {
        adjust(item, quantity - item.quantity)
    }

    /**
     * Saves an edited line, optionally teaching the catalogue what it is.
     *
     * Naming an unknown product used to be a dead end mid-count: the only
     * place to do it was the Products page, which meant carrying the barcode
     * in your head until the count was over. Doing it here, once, is the
     * difference between a catalogue that grows as people work and one that
     * never gets filled in.
     */
    fun updateItem(before: StockItem, after: StockItem, addToCatalogue: Boolean = false) {
        if (isFrozen()) return
        viewModelScope.launch {
            runCatching {
                stock.updateItem(session, checkId, before, after)
            }.onFailure { fail(it); return@launch }

            if (!addToCatalogue) return@launch
            if (after.barcode.isBlank() || after.productName.isBlank()) return@launch
            runCatching {
                products.save(
                    session = session,
                    barcode = after.barcode,
                    name = after.productName,
                    sku = after.sku,
                    unit = after.unit,
                )
            }.onSuccess {
                _toast.value = Toast("Saved ${after.productName} to the product list")
            }.onFailure {
                // The count itself is already saved; only the catalogue entry
                // failed, and saying which one failed matters.
                _toast.value = Toast(
                    "Counted, but could not save ${after.productName} to the " +
                        "product list: ${it.message.orEmpty()}",
                    isError = true,
                )
            }
        }
    }

    fun deleteItem(item: StockItem) {
        if (isFrozen()) return
        viewModelScope.launch {
            runCatching { stock.deleteItem(session, checkId, item) }
                .onSuccess {
                    if (_focusedItemId.value == item.id) _focusedItemId.value = null
                    _toast.value = Toast(
                        "Removed ${item.productName.ifEmpty { item.barcode }}",
                    )
                }
                .onFailure { fail(it) }
        }
    }

    // --------------------------------------------------------------- status

    /**
     * Marks the count finished and, on success, tells the caller to leave.
     *
     * A completed check drops out of the Stock tab, so staying on its counting
     * screen leaves the operator looking at a record that is no longer in the
     * list they came from. [onCompleted] does not fire when the template's
     * photo requirement blocks it — that is a correction to make here, not a
     * reason to navigate away.
     */
    fun complete(onCompleted: () -> Unit = {}) {
        val current = check.value ?: return
        val required = _template.value
        if (required?.photoRequired == true && current.photoCount < required.minPhotos) {
            _toast.value = Toast(
                "This template requires at least ${required.minPhotos} photo" +
                    (if (required.minPhotos == 1) "" else "s") +
                    " — take them on the Photos tab before completing.",
                isError = true,
            )
            return
        }
        setStatus(StockStatus.COMPLETED, onCompleted)
    }

    fun setStatus(target: StockStatus, onChanged: () -> Unit = {}) {
        val current = check.value ?: return
        viewModelScope.launch {
            runCatching { stock.updateStatus(session, current, target) }
                .onSuccess {
                    _toast.value = Toast("Marked ${target.label.lowercase()}")
                    onChanged()
                }
                .onFailure { fail(it) }
        }
    }

    // ------------------------------------------------------ count sheet

    private val _importing = MutableStateFlow(false)
    val importing: StateFlow<Boolean> = _importing.asStateFlow()

    private val _importResult = MutableStateFlow<ImportSummary?>(null)
    val importResult: StateFlow<ImportSummary?> = _importResult.asStateFlow()

    /**
     * Loads what the customer's system says should be on the shelf.
     *
     * Until this exists a stock check answers "how many are here". The
     * question anyone orders a stock take to answer is "how many are
     * missing", and nothing in the app could say.
     */
    fun importCountSheet(text: String) {
        if (isFrozen()) return
        if (_importing.value) return
        _importing.value = true
        viewModelScope.launch {
            val (rows, problems) = imports.readCountSheet(text)
            if (rows.isEmpty()) {
                _importing.value = false
                _toast.value = Toast(
                    problems.firstOrNull()
                        ?: "Nothing in that file had a barcode and an expected quantity.",
                    isError = true,
                )
                return@launch
            }
            runCatching { imports.importCountSheet(session, checkId, rows) }
                .onSuccess { summary ->
                    _importResult.value = summary.copy(
                        skipped = summary.skipped + problems,
                    )
                }
                .onFailure { fail(it) }
            _importing.value = false
        }
    }

    /** The picker returned something this app could not read as text. */
    fun onFileUnreadable() {
        _toast.value = Toast(
            "That file could not be read. Export it from Excel as CSV UTF-8 and try again.",
            isError = true,
        )
    }

    fun clearImportResult() {
        _importResult.value = null
    }

    fun clearToast() {
        _toast.value = null
    }

    private fun isFrozen(): Boolean {
        val frozen = check.value?.statusEnum?.isFrozen == true
        if (frozen) {
            _toast.value = Toast("This stock check is locked and cannot be changed.", true)
        }
        return frozen
    }

    private fun fail(error: Throwable) {
        _toast.value = Toast(error.message ?: "That action failed.", isError = true)
    }

    companion object {
        fun factory(session: Session, checkId: String) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                StockCheckViewModel(session, checkId) as T
        }
    }
}
