package com.stockcheck.app.ui.products

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.stockcheck.app.scan.BarcodeScannerPreview
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.UploadFile
import com.stockcheck.app.data.ImportSummary
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Product
import com.stockcheck.app.model.Session
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ProductsViewModel(private val session: Session) : ViewModel() {

    private val repo = ServiceLocator.products

    private val all: StateFlow<List<Product>> = repo.observeProducts()
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val imports = ServiceLocator.imports

    private val _importing = MutableStateFlow(false)
    val importing: StateFlow<Boolean> = _importing.asStateFlow()

    private val _importResult = MutableStateFlow<ImportSummary?>(null)
    val importResult: StateFlow<ImportSummary?> = _importResult.asStateFlow()

    /**
     * Loads a product list out of the customer's own spreadsheet.
     *
     * Without this the catalogue only fills up one product at a time, through
     * a dialog, on a phone. Nobody types two thousand SKUs that way, so the
     * catalogue stays empty and every counted line is a row of digits nobody
     * can check against a shelf.
     */
    fun importProducts(bytes: ByteArray) {
        if (_importing.value) return
        _importing.value = true
        viewModelScope.launch {
            val (rows, problems) = imports.readProducts(bytes)
            if (rows.isEmpty()) {
                _importing.value = false
                _message.value = problems.firstOrNull()
                    ?: "Nothing in that file had a barcode."
                return@launch
            }
            runCatching { imports.importProducts(session, rows) }
                .onSuccess { summary ->
                    _importResult.value = summary.copy(skipped = summary.skipped + problems)
                }
                .onFailure { _message.value = it.message }
            _importing.value = false
        }
    }

    fun onFileUnreadable() {
        _message.value = "That file could not be opened. Pick a .xlsx or .csv file."
    }

    fun clearImportResult() {
        _importResult.value = null
    }

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    val filtered: StateFlow<List<Product>> = combine(all, _query) { products, text ->
        if (text.isBlank()) {
            products
        } else {
            products.filter {
                it.name.contains(text, ignoreCase = true) ||
                    it.sku.contains(text, ignoreCase = true) ||
                    it.barcode.contains(text)
            }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setQuery(value: String) {
        _query.value = value
    }

    fun save(barcode: String, name: String, sku: String, unit: String, onSaved: () -> Unit) {
        viewModelScope.launch {
            runCatching { repo.save(session, barcode, name, sku, unit) }
                .onSuccess { onSaved() }
                .onFailure { _message.value = it.message }
        }
    }

    fun delete(product: Product) {
        viewModelScope.launch {
            runCatching { repo.delete(session, product) }
                .onFailure { _message.value = it.message }
        }
    }

    companion object {
        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                ProductsViewModel(session) as T
        }
    }
}

/**
 * The product catalogue.
 *
 * Exists so a scan can name itself during a count. Everything here is
 * reference data — editing it never changes a stock check that has already
 * recorded a product, because those rows keep the name and SKU they were
 * given at the time.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductsScreen(
    session: Session,
    onBack: () -> Unit,
) {
    val viewModel: ProductsViewModel = viewModel(factory = ProductsViewModel.factory(session))
    val products by viewModel.filtered.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()

    val permissions = session.effectivePermissions
    val canEdit = permissions.has(Permission.CREATE_STOCK_CHECK) ||
        permissions.has(Permission.EDIT_TEMPLATE)
    val canDelete = permissions.has(Permission.EDIT_TEMPLATE)
    // Naming one product is what canEdit covers. Replacing the catalogue from
    // a spreadsheet is a different act with its own permission, so the button
    // that does it is shown on that one and not on the right to type a name.
    val canImport = permissions.has(Permission.IMPORT_PRODUCTS)

    var editing by remember { mutableStateOf<Product?>(null) }
    var adding by remember { mutableStateOf(false) }

    val importing by viewModel.importing.collectAsStateWithLifecycle()
    val importResult by viewModel.importResult.collectAsStateWithLifecycle()
    val context = LocalContext.current

    // Bytes, not text, and no MIME filter. A real .xlsx is a zip, Android
    // reports an unfamiliar file as octet-stream, and filtering by type hides
    // the file the customer is looking at. SheetReader tells xlsx from CSV by
    // its first four bytes.
    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val bytes = runCatching {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        }.getOrNull()
        if (bytes == null || bytes.isEmpty()) {
            viewModel.onFileUnreadable()
        } else {
            viewModel.importProducts(bytes)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Products") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (canImport) {
                        IconButton(
                            enabled = !importing,
                            onClick = { filePicker.launch(arrayOf("*/*")) },
                        ) {
                            Icon(
                                Icons.Filled.UploadFile,
                                contentDescription = "Import from Excel or CSV",
                            )
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            if (canEdit) {
                ExtendedFloatingActionButton(
                    onClick = { adding = true },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("Add product") },
                )
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            message?.let { NoticeBar(text = it, tone = NoticeTone.ERROR) }
            if (importing) {
                NoticeBar(text = "Reading the file\u2026", tone = NoticeTone.INFO)
            }

            OutlinedTextField(
                value = query,
                onValueChange = viewModel::setQuery,
                label = { Text("Search name, SKU or barcode") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )

            if (products.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.Inventory2,
                    title = if (query.isBlank()) "No products yet" else "Nothing matches",
                    message = if (query.isBlank()) {
                        "Add the products you count, or tap the import button above to " +
                            "load an Excel or CSV list. A scanned barcode then shows its " +
                            "name and SKU straight away instead of a row of digits."
                    } else {
                        "No product matches \"$query\"."
                    },
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(bottom = 88.dp)) {
                    items(products, key = { it.barcode }) { product ->
                        ListItem(
                            headlineContent = { Text(product.name) },
                            supportingContent = {
                                Text(
                                    buildString {
                                        if (product.sku.isNotEmpty()) append("SKU ${product.sku}  ·  ")
                                        append(product.barcode)
                                        append("  ·  ")
                                        append(product.unit)
                                    },
                                )
                            },
                            modifier = Modifier.clickable(enabled = canEdit) { editing = product },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    importResult?.let { summary ->
        ImportSummaryDialog(summary) { viewModel.clearImportResult() }
    }

    if (adding) {
        ProductDialog(
            existing = null,
            canDelete = false,
            onDismiss = { adding = false },
            onSave = { barcode, name, sku, unit ->
                viewModel.save(barcode, name, sku, unit) { adding = false }
            },
            onDelete = {},
        )
    }

    editing?.let { product ->
        ProductDialog(
            existing = product,
            canDelete = canDelete,
            onDismiss = { editing = null },
            onSave = { barcode, name, sku, unit ->
                viewModel.save(barcode, name, sku, unit) { editing = null }
            },
            onDelete = {
                viewModel.delete(product)
                editing = null
            },
        )
    }
}

/**
 * What the import actually did.
 *
 * Reports skipped rows with their line number. An import that says "1,847 of
 * 2,000" without saying which 153 or why is one nobody can trust against real
 * stock -- and the rows it drops are the products that will scan as a row of
 * digits later.
 */
@Composable
private fun ImportSummaryDialog(summary: ImportSummary, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Product list loaded") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    buildString {
                        append("${summary.created} new products")
                        if (summary.updated > 0) append(", ${summary.updated} updated")
                    },
                )
                if (summary.skipped.isNotEmpty()) {
                    Spacer(Modifier.height(14.dp))
                    Text(
                        "${summary.skipped.size} rows skipped",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(4.dp))
                    summary.skipped.take(12).forEach { reason ->
                        Text(reason, style = MaterialTheme.typography.bodySmall)
                    }
                    if (summary.skipped.size > 12) {
                        Text(
                            "and ${summary.skipped.size - 12} more",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("OK") } },
    )
}

@Composable
private fun ProductDialog(
    existing: Product?,
    canDelete: Boolean,
    onDismiss: () -> Unit,
    onSave: (barcode: String, name: String, sku: String, unit: String) -> Unit,
    onDelete: () -> Unit,
) {
    var barcode by remember { mutableStateOf(existing?.barcode.orEmpty()) }
    var name by remember { mutableStateOf(existing?.name.orEmpty()) }
    var sku by remember { mutableStateOf(existing?.sku.orEmpty()) }
    var unit by remember { mutableStateOf(existing?.unit ?: "pcs") }
    var scanning by remember { mutableStateOf(false) }

    val valid = barcode.isNotBlank() && name.isNotBlank()

    val context = LocalContext.current
    var hasCamera by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasCamera = granted
        // Opening the scanner is what the person asked for; the permission
        // prompt was only in the way, so carry on once it is answered.
        scanning = granted
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                when {
                    scanning -> "Scan the barcode"
                    existing == null -> "Add product"
                    else -> "Edit product"
                },
            )
        },
        text = {
            if (scanning) {
                // The camera replaces the form rather than sitting above it:
                // a dialog has nowhere near the height for both, and the only
                // thing wanted here is the one number.
                Column {
                    BarcodeScannerPreview(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(260.dp),
                        onScanned = { code ->
                            barcode = code.value
                            scanning = false
                        },
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Point the camera at the product's barcode.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                return@AlertDialog
            }

            Column {
                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it.trim() },
                    label = { Text("Barcode") },
                    singleLine = true,
                    // The barcode is the key, so changing it on an existing
                    // product would create a second one rather than rename it.
                    enabled = existing == null,
                    trailingIcon = {
                        if (existing == null) {
                            IconButton(
                                onClick = {
                                    if (hasCamera) {
                                        scanning = true
                                    } else {
                                        cameraLauncher.launch(Manifest.permission.CAMERA)
                                    }
                                },
                            ) {
                                Icon(
                                    Icons.Filled.QrCodeScanner,
                                    contentDescription = "Scan barcode",
                                )
                            }
                        }
                    },
                    supportingText = {
                        if (existing != null) {
                            Text("The barcode identifies the product and cannot change.")
                        } else {
                            Text("Type it, or tap the scanner to read it from the product.")
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Product name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = sku,
                    onValueChange = { sku = it },
                    label = { Text("SKU") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = unit,
                    onValueChange = { unit = it },
                    label = { Text("Default unit") },
                    singleLine = true,
                    supportingText = { Text("Pre-filled when this product is scanned, e.g. ctn") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            if (!scanning) {
                TextButton(onClick = { onSave(barcode, name, sku, unit) }, enabled = valid) {
                    Text("Save")
                }
            }
        },
        dismissButton = {
            if (scanning) {
                TextButton(onClick = { scanning = false }) { Text("Back") }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (existing != null && canDelete) {
                        TextButton(onClick = onDelete) { Text("Delete") }
                        Spacer(Modifier.width(4.dp))
                    }
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                }
            }
        },
    )
}
