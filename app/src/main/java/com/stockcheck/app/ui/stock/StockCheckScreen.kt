package com.stockcheck.app.ui.stock

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.data.ImportSummary
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.model.ItemSource
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.runtime.mutableStateMapOf
import com.stockcheck.app.model.FieldType
import com.stockcheck.app.model.Template
import com.stockcheck.app.model.TemplateField
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import com.stockcheck.app.model.SignatureInk
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.scan.BarcodeScannerPreview
import com.stockcheck.app.scan.VoiceState
import com.stockcheck.app.scan.rememberVoiceInputController
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import com.stockcheck.app.ui.common.StatusChip
import com.stockcheck.app.ui.common.TotalTile

/**
 * Page 1 — the counting screen.
 *
 * Laid out for one-handed use on a warehouse floor: the camera sits at the top
 * where it is naturally aimed, the running list fills the middle, the totals
 * are pinned above the navigation bar, and the microphone is a large target in
 * the bottom-right corner where a thumb already rests.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun StockCheckScreen(
    session: Session,
    checkId: String,
    onBack: () -> Unit,
    onOpenPhotos: () -> Unit,
) {
    val viewModel: StockCheckViewModel = viewModel(
        key = checkId,
        factory = StockCheckViewModel.factory(session, checkId),
    )
    val context = LocalContext.current
    val permissions = session.effectivePermissions

    val check by viewModel.check.collectAsStateWithLifecycle()
    val items by viewModel.items.collectAsStateWithLifecycle()
    val duplicate by viewModel.duplicate.collectAsStateWithLifecycle()
    val toast by viewModel.toast.collectAsStateWithLifecycle()
    val focusedId by viewModel.focusedItemId.collectAsStateWithLifecycle()
    val scannerActive by viewModel.scannerActive.collectAsStateWithLifecycle()
    // Drives which extra fields the edit dialog offers for a counted line.
    val template by viewModel.template.collectAsStateWithLifecycle()
    val pendingScanId by viewModel.pendingScanId.collectAsStateWithLifecycle()
    val confirmEachScan by viewModel.confirmEachScan.collectAsStateWithLifecycle()

    val importing by viewModel.importing.collectAsStateWithLifecycle()
    val importResult by viewModel.importResult.collectAsStateWithLifecycle()

    // Any type, and the bytes rather than the text. A file exported from
    // Excel arrives as text/csv on one phone and octet-stream on the next, so
    // filtering by MIME hides the file the customer is looking at; and reading
    // it as text would rule out a real .xlsx, which is what they actually
    // have. SheetReader decides what it is by looking at the first four bytes.
    val sheetPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val bytes = runCatching {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        }.getOrNull()
        if (bytes == null || bytes.isEmpty()) {
            viewModel.onFileUnreadable()
        } else {
            viewModel.importCountSheet(bytes)
        }
    }

    val snackbarHost = remember { SnackbarHostState() }
    var manualEntry by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<StockItem?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }

    // Finding one line in a two-hundred-item count meant scrolling for it,
    // which on a warehouse floor means scrolling past it. Matching on barcode
    // and SKU as well as name is deliberate: the operator usually has the
    // physical label in hand, not the product name in mind.
    val visibleItems = remember(items, search) {
        val needle = search.trim().lowercase()
        if (needle.isEmpty()) {
            items
        } else {
            items.filter { item ->
                item.productName.lowercase().contains(needle) ||
                    item.barcode.lowercase().contains(needle) ||
                    item.sku.lowercase().contains(needle)
            }
        }
    }
    val unnamedCount = remember(items) { items.count { it.productName.isBlank() } }

    val frozen = check?.statusEnum?.isFrozen == true

    // ------------------------------------------------------ runtime permissions

    var hasCamera by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var hasMic by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { hasCamera = it }
    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasMic = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCamera && permissions.has(Permission.SCAN_BARCODE)) {
            cameraLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    // ------------------------------------------------------------------ voice

    val voice = rememberVoiceInputController()
    val voiceState by voice.state.collectAsStateWithLifecycle()

    LaunchedEffect(toast) {
        toast?.let {
            snackbarHost.showSnackbar(it.message)
            viewModel.clearToast()
        }
    }
    LaunchedEffect(voiceState) {
        (voiceState as? VoiceState.Failed)?.let {
            snackbarHost.showSnackbar(it.message)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        // Reference plus area: "SC-481997 - C" is how
                        // someone refers to this count out loud.
                        Text(check?.label ?: "Stock check")
                        Text(
                            text = check?.templateName.orEmpty(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    check?.let { StatusChip(it.statusEnum, Modifier.padding(end = 4.dp)) }
                    IconButton(onClick = { viewModel.setScannerActive(!scannerActive) }) {
                        Icon(
                            imageVector = if (scannerActive) {
                                Icons.Filled.Videocam
                            } else {
                                Icons.Filled.VideocamOff
                            },
                            contentDescription = if (scannerActive) {
                                "Turn scanner off"
                            } else {
                                "Turn scanner on"
                            },
                        )
                    }
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "More")
                        }
                        StatusMenu(
                            expanded = menuOpen,
                            session = session,
                            currentStatus = check?.statusEnum,
                            onDismiss = { menuOpen = false },
                            onComplete = {
                                menuOpen = false
                                // Back to the list this check has just left.
                                viewModel.complete(onCompleted = onBack)
                            },
                            onStatus = { menuOpen = false; viewModel.setStatus(it) },
                            onManual = { menuOpen = false; manualEntry = true },
                            onPhotos = { menuOpen = false; onOpenPhotos() },
                            onImportSheet = {
                                menuOpen = false
                                sheetPicker.launch(arrayOf("*/*"))
                            },
                            confirmEachScan = confirmEachScan,
                            onToggleConfirm = {
                                menuOpen = false
                                viewModel.setConfirmEachScan(!confirmEachScan)
                            },
                        )
                    }
                },
            )
        },
        bottomBar = {
            TotalsBar(
                itemCount = items.size,
                totalQuantity = items.sumOf { it.quantity },
                photoCount = check?.photoCount ?: 0,
                status = check?.statusEnum,
                unnamedCount = unnamedCount,
                varianceCount = items.count { it.hasVariance },
                onList = items.any { it.onList },
            )
        },
        floatingActionButton = {
            if (permissions.has(Permission.VOICE_INPUT) && !frozen) {
                VoiceFab(
                    listening = voiceState is VoiceState.Listening ||
                        voiceState is VoiceState.Hearing,
                    onClick = {
                        if (!hasMic) {
                            micLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        } else if (voiceState is VoiceState.Listening ||
                            voiceState is VoiceState.Hearing
                        ) {
                            voice.stop()
                        } else {
                            voice.start(onCommand = viewModel::onVoiceCommand)
                        }
                    },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHost) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (frozen) {
                NoticeBar(
                    text = "This stock check is locked. Ask a supervisor to unlock it " +
                        "before making changes.",
                    tone = NoticeTone.INFO,
                )
            }

            if (importing) {
                NoticeBar(
                    text = "Loading the count sheet…",
                    tone = NoticeTone.INFO,
                )
            }

            // The scanned line, resolved fresh each time so the quantity
            // shown is the one in the database rather than a copy taken at
            // scan time.
            val pendingItem = items.firstOrNull { it.id == pendingScanId }

            AnimatedVisibility(visible = pendingItem != null) {
                pendingItem?.let { item ->
                    ScanConfirmPanel(
                        item = item,
                        onDecrement = { viewModel.adjust(item, -1) },
                        onIncrement = { viewModel.adjust(item, 1) },
                        onEdit = { editing = item },
                        onContinue = viewModel::continueScanning,
                        onComplete = {
                            viewModel.continueScanning()
                            viewModel.complete(onCompleted = onBack)
                        },
                        canComplete = permissions.has(Permission.MARK_COMPLETED),
                    )
                }
            }

            AnimatedVisibility(visible = scannerActive && !frozen && pendingItem == null) {
                ScannerPanel(
                    hasPermission = hasCamera,
                    allowed = permissions.has(Permission.SCAN_BARCODE),
                    onRequestPermission = { cameraLauncher.launch(Manifest.permission.CAMERA) },
                    onScanned = { viewModel.onBarcodeScanned(it.value) },
                )
            }

            (voiceState as? VoiceState.Hearing)?.let { hearing ->
                NoticeBar(text = "Hearing: ${hearing.partial}", tone = NoticeTone.INFO)
            }

            // Only once the list is long enough to be worth searching --
            // below that the search box costs more screen than it saves.
            if (items.size >= SEARCH_THRESHOLD) {
                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    label = { Text("Find in this count") },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (search.isNotEmpty()) {
                            IconButton(onClick = { search = "" }) {
                                Icon(Icons.Filled.Close, contentDescription = "Clear search")
                            }
                        }
                    },
                    supportingText = if (search.isNotEmpty()) {
                        { Text("${visibleItems.size} of ${items.size} lines") }
                    } else {
                        null
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                )
            }

            if (items.isEmpty()) {
                com.stockcheck.app.ui.common.EmptyState(
                    icon = Icons.Filled.Inventory2,
                    title = "Nothing counted yet",
                    message = "Point the camera at a barcode, or tap the microphone " +
                        "and say the product and quantity.",
                )
            } else if (visibleItems.isEmpty()) {
                com.stockcheck.app.ui.common.EmptyState(
                    icon = Icons.Filled.Search,
                    title = "No match",
                    message = "Nothing in this count matches \"${search.trim()}\".",
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(12.dp, 8.dp, 12.dp, 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(visibleItems, key = { it.id }) { item ->
                        ItemRow(
                            item = item,
                            focused = item.id == focusedId,
                            editable = !frozen &&
                                permissions.canEditRecordBy(
                                    check?.createdByUid.orEmpty(),
                                    session.uid,
                                ),
                            onFocus = { viewModel.focus(item.id) },
                            onIncrement = { viewModel.adjust(item, 1) },
                            onDecrement = { viewModel.adjust(item, -1) },
                            onEdit = { editing = item },
                            onDelete = { viewModel.deleteItem(item) },
                        )
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------- dialogs

    duplicate?.let { prompt ->
        DuplicateBarcodeDialog(
            prompt = prompt,
            onDismiss = viewModel::dismissDuplicate,
            onConfirm = viewModel::confirmDuplicateAdd,
        )
    }

    if (manualEntry) {
        ManualEntryDialog(
            onDismiss = { manualEntry = false },
            onAdd = { barcode ->
                manualEntry = false
                viewModel.onBarcodeScanned(barcode, ItemSource.MANUAL)
            },
        )
    }

    importResult?.let { summary ->
        ImportSummaryDialog(summary) { viewModel.clearImportResult() }
    }

    editing?.let { item ->
        EditItemDialog(
            item = item,
            template = template,
            roleId = session.role.id,
            signerName = session.profile.displayName.ifBlank { session.profile.email },
            onDismiss = { editing = null },
            onSave = { updated, addToCatalogue ->
                editing = null
                viewModel.updateItem(item, updated, addToCatalogue)
            },
            onDelete = {
                editing = null
                viewModel.deleteItem(item)
            },
        )
    }
}

/** How long a count has to get before a search box earns its place. */
private const val SEARCH_THRESHOLD = 8

/** When a signature was made, in the form that reads clearly in an export. */
private fun signedStamp(): String =
    java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US)
        .format(java.util.Date())

// ------------------------------------------------------------------ scanner

@Composable
private fun ScannerPanel(
    hasPermission: Boolean,
    allowed: Boolean,
    onRequestPermission: () -> Unit,
    onScanned: (com.stockcheck.app.scan.ScannedCode) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(210.dp)
            .background(Color.Black),
    ) {
        when {
            !allowed -> CentredHint("Your role does not include barcode scanning.")

            !hasPermission -> Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Camera access is needed to scan", color = Color.White)
                TextButton(onClick = onRequestPermission) { Text("Allow camera") }
            }

            else -> {
                // No reticle. The whole frame is analysed, and a box drawn
                // in the middle said the opposite -- people aim carefully at a
                // rectangle that means nothing, and miss codes that were
                // already readable at the edge.
                BarcodeScannerPreview(
                    modifier = Modifier.fillMaxSize(),
                    onScanned = onScanned,
                )
            }
        }
    }
}

@Composable
private fun CentredHint(text: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text, color = Color.White, style = MaterialTheme.typography.bodyMedium)
    }
}

// -------------------------------------------------------------------- rows

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ItemRow(
    item: StockItem,
    focused: Boolean,
    editable: Boolean,
    onFocus: () -> Unit,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    var confirmingDelete by remember(item.id) { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = onFocus,
                // Long-press rather than a swipe: a swipe is too easy to
                // trigger while scrolling a long count with gloves on.
                onLongClick = { if (editable) confirmingDelete = true },
            ),
        colors = CardDefaults.cardColors(
            containerColor = if (focused) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
            },
        ),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.productName.ifEmpty { item.barcode },
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                )
                Text(
                    // Barcode plus SKU once the catalogue has named it; the
                    // scan source only matters while the line is still just a
                    // number nobody has identified.
                    text = buildString {
                        if (item.productName.isEmpty()) {
                            append(item.sourceEnum.name.lowercase())
                        } else {
                            append(item.barcode)
                            if (item.sku.isNotEmpty()) append("  ·  ${item.sku}")
                        }
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                if (item.onList) {
                    Text(
                        text = when {
                            item.variance == 0 -> "Expected ${item.expected} · matches"
                            item.variance < 0 -> "Expected ${item.expected} · short ${-item.variance}"
                            else -> "Expected ${item.expected} · over ${item.variance}"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = if (item.hasVariance) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.primary
                        },
                        maxLines = 1,
                    )
                }
            }

            if (editable) {
                FilledTonalIconButton(onClick = onDecrement, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Filled.Remove, contentDescription = "Subtract one")
                }
            }
            Column(
                modifier = Modifier
                    .width(64.dp)
                    .clickable(enabled = editable) { onEdit() },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = item.quantity.toString(),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = item.unit,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (editable) {
                FilledTonalIconButton(onClick = onIncrement, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Filled.Add, contentDescription = "Add one")
                }
            }
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Remove this line?") },
            text = {
                Text(
                    "${item.productName.ifEmpty { item.barcode }} will be removed from " +
                        "this stock check. The audit log keeps a record of the removal.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmingDelete = false
                        onDelete()
                    },
                ) { Text("Remove") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) { Text("Cancel") }
            },
        )
    }
}

// ------------------------------------------------------------------ totals

@Composable
private fun TotalsBar(
    itemCount: Int,
    totalQuantity: Int,
    photoCount: Int,
    status: StockStatus?,
    unnamedCount: Int = 0,
    varianceCount: Int = 0,
    onList: Boolean = false,
) {
    Surface(tonalElevation = 3.dp) {
        Column {
            HorizontalDivider()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TotalTile("Products", itemCount.toString())
                TotalTile("Total qty", totalQuantity.toString(), emphasis = true)
                // Once a count sheet is loaded the variance is the number
                // anyone ordered this count to produce, so it takes the slot.
                // Before that, how much of the count is still anonymous --
                // a nameless line is a row of digits nobody can check against
                // a shelf, and this is where it shows before the export does.
                when {
                    onList -> TotalTile("Differences", varianceCount.toString())
                    unnamedCount > 0 -> TotalTile("Unnamed", unnamedCount.toString())
                    else -> TotalTile("Photos", photoCount.toString())
                }
                TotalTile("Status", status?.label ?: "—")
            }
        }
    }
}

// --------------------------------------------------------------- voice FAB

@Composable
private fun VoiceFab(listening: Boolean, onClick: () -> Unit) {
    FloatingActionButton(
        onClick = onClick,
        modifier = Modifier.size(68.dp),
        containerColor = if (listening) {
            MaterialTheme.colorScheme.error
        } else {
            MaterialTheme.colorScheme.primary
        },
    ) {
        Icon(
            imageVector = Icons.Filled.Mic,
            contentDescription = if (listening) "Stop listening" else "Speak a quantity",
            modifier = Modifier.size(30.dp),
        )
    }
}

// ----------------------------------------------------------------- dialogs

@Composable
private fun StatusMenu(
    expanded: Boolean,
    session: Session,
    currentStatus: StockStatus?,
    onDismiss: () -> Unit,
    onComplete: () -> Unit,
    onStatus: (StockStatus) -> Unit,
    onManual: () -> Unit,
    onPhotos: () -> Unit,
    onImportSheet: () -> Unit,
    confirmEachScan: Boolean,
    onToggleConfirm: () -> Unit,
) {
    val permissions = session.effectivePermissions
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text("Enter barcode by hand") },
            leadingIcon = { Icon(Icons.Filled.Keyboard, contentDescription = null) },
            onClick = onManual,
        )
        DropdownMenuItem(
            text = { Text("Photos for this check") },
            leadingIcon = { Icon(Icons.Filled.PhotoCamera, contentDescription = null) },
            onClick = onPhotos,
        )
        DropdownMenuItem(
            text = {
                Text(
                    if (confirmEachScan) {
                        "Scanning: stop after each code"
                    } else {
                        "Scanning: keep reading"
                    },
                )
            },
            leadingIcon = {
                Icon(
                    imageVector = if (confirmEachScan) {
                        Icons.Filled.PauseCircle
                    } else {
                        Icons.Filled.PlayCircle
                    },
                    contentDescription = null,
                )
            },
            onClick = onToggleConfirm,
        )
        if (permissions.hasAny(Permission.EDIT_OWN_STOCK, Permission.EDIT_ANY_STOCK) &&
            permissions.has(Permission.IMPORT_COUNT_SHEET)
        ) {
            DropdownMenuItem(
                text = { Text("Import count sheet (Excel or CSV)") },
                leadingIcon = { Icon(Icons.Filled.UploadFile, contentDescription = null) },
                onClick = onImportSheet,
            )
        }
        HorizontalDivider()
        if (permissions.has(Permission.MARK_COMPLETED) && currentStatus != StockStatus.COMPLETED) {
            DropdownMenuItem(
                text = { Text("Mark completed") },
                leadingIcon = { Icon(Icons.Filled.Check, contentDescription = null) },
                onClick = onComplete,
            )
        }
        if (permissions.has(Permission.MARK_REVIEWED)) {
            DropdownMenuItem(
                text = { Text("Mark reviewed") },
                onClick = { onStatus(StockStatus.REVIEWED) },
            )
        }
        if (permissions.has(Permission.LOCK_STOCK) && currentStatus != StockStatus.LOCKED) {
            DropdownMenuItem(
                text = { Text("Lock") },
                leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                onClick = { onStatus(StockStatus.LOCKED) },
            )
        }
        if (permissions.has(Permission.UNLOCK_STOCK) && currentStatus == StockStatus.LOCKED) {
            DropdownMenuItem(
                text = { Text("Unlock") },
                onClick = { onStatus(StockStatus.IN_PROGRESS) },
            )
        }
        // Completing is easy to do by accident and used to be one-way: the
        // check vanished from the Stock tab, which is the only route back to
        // the scanner, with no way to reopen it. Locking is the deliberate
        // one-way door; completing should not be.
        if (currentStatus == StockStatus.COMPLETED || currentStatus == StockStatus.REVIEWED) {
            if (permissions.hasAny(Permission.EDIT_OWN_STOCK, Permission.EDIT_ANY_STOCK)) {
                DropdownMenuItem(
                    text = { Text("Reopen for counting") },
                    leadingIcon = { Icon(Icons.Filled.Undo, contentDescription = null) },
                    onClick = { onStatus(StockStatus.IN_PROGRESS) },
                )
            }
        }
    }
}

/**
 * Renders one template field according to its declared type.
 *
 * A dropdown offers its options rather than asking someone to spell one
 * correctly, and a number gets the numeric keypad. The type is a promise about
 * the value; honouring it on the way in is what makes it worth anything on the
 * way out.
 */
@Composable
private fun TemplateFieldInput(
    field: TemplateField,
    value: String,
    ink: String,
    signerName: String,
    enabled: Boolean,
    onChange: (String) -> Unit,
    onInkChange: (String) -> Unit,
) {
    val label = field.label + if (field.required) " *" else ""

    when (field.typeEnum) {
        FieldType.DROPDOWN -> {
            Text(label, style = MaterialTheme.typography.labelMedium)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                field.options.forEach { option ->
                    FilterChip(
                        selected = value == option,
                        enabled = enabled,
                        onClick = { onChange(if (value == option) "" else option) },
                        label = { Text(option) },
                    )
                }
            }
        }

        FieldType.SIGNATURE -> {
            Text(label, style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.height(4.dp))
            com.stockcheck.app.ui.common.SignaturePad(
                ink = ink,
                enabled = enabled,
                onInkChange = { raw ->
                    onInkChange(raw)
                    // The field's own value stays readable text, because that
                    // is what a CSV cell can carry. The strokes ride alongside
                    // it and are what actually gets shown back.
                    onChange(
                        if (SignatureInk.isSigned(raw)) {
                            "$signerName - ${signedStamp()}"
                        } else {
                            ""
                        },
                    )
                },
            )
            if (value.isNotEmpty()) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        else -> {
            OutlinedTextField(
                value = value,
                onValueChange = onChange,
                label = { Text(label) },
                enabled = enabled,
                singleLine = true,
                supportingText = when {
                    !enabled -> {
                        { Text("Your role cannot change this field.") }
                    }
                    field.typeEnum == FieldType.DATE -> {
                        { Text("e.g. 2026-12-31") }
                    }
                    else -> null
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = when (field.typeEnum) {
                        FieldType.NUMBER, FieldType.DATE -> KeyboardType.Number
                        else -> KeyboardType.Text
                    },
                ),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun DuplicateBarcodeDialog(
    prompt: DuplicatePrompt,
    onDismiss: () -> Unit,
    onConfirm: (Int) -> Unit,
) {
    var amount by remember(prompt) { mutableStateOf(prompt.suggestedAdd.toString()) }
    val parsed = amount.toIntOrNull() ?: 0

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Already counted") },
        text = {
            Column {
                Text(
                    text = prompt.item.productName.ifEmpty { prompt.item.barcode },
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Current quantity: ${prompt.item.quantity} ${prompt.item.unit}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter(Char::isDigit).take(6) },
                    label = { Text("Add quantity") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Number,
                        imeAction = ImeAction.Done,
                    ),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "New total: ${prompt.item.quantity + parsed}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(parsed) }, enabled = parsed > 0) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun ManualEntryDialog(onDismiss: () -> Unit, onAdd: (String) -> Unit) {
    var barcode by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Enter barcode") },
        text = {
            Column {
                Text(
                    text = "For items whose barcode is missing or unreadable. " +
                        "Any reference you type becomes the item's key.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it },
                    label = { Text("Barcode or reference") },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(barcode.trim()) },
                enabled = barcode.isNotBlank(),
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/**
 * Edits one counted line, including whatever fields its template defines.
 *
 * Template fields were configurable from the start but had nowhere to be
 * filled in, so they stayed empty forever and their export columns came out
 * blank -- half the template feature connected to nothing.
 */
@Composable
private fun EditItemDialog(
    item: StockItem,
    template: Template?,
    roleId: String,
    signerName: String,
    onDismiss: () -> Unit,
    onSave: (StockItem, Boolean) -> Unit,
    onDelete: () -> Unit,
) {
    var name by remember(item.id) { mutableStateOf(item.productName) }
    var sku by remember(item.id) { mutableStateOf(item.sku) }
    var quantity by remember(item.id) { mutableStateOf(item.quantity.toString()) }
    var unit by remember(item.id) { mutableStateOf(item.unit) }
    var remark by remember(item.id) { mutableStateOf(item.remark) }
    // Naming an unknown product mid-count used to mean remembering the
    // barcode, finishing the count, opening the Products page and typing it
    // again from memory. Ticked by default exactly when that is what is
    // happening: a line that arrived nameless and now has one.
    var addToCatalogue by remember(item.id) { mutableStateOf(item.productName.isBlank()) }
    val fieldValues = remember(item.id) {
        mutableStateMapOf<String, String>().apply {
            putAll(item.fieldValues)
            // An untouched field still shows its default, so a template can
            // pre-fill the answer that is usually right.
            template?.fields?.forEach { field ->
                if (!containsKey(field.key) && field.defaultValue.isNotEmpty()) {
                    put(field.key, field.defaultValue)
                }
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(item.barcode) },
        text = {
            // The template can add any number of fields below; without this
            // the dialog simply clips them off the bottom of the screen.
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Product name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = sku,
                    onValueChange = { sku = it },
                    label = { Text("SKU") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Row {
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { quantity = it.filter(Char::isDigit).take(7) },
                        label = { Text("Quantity") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(10.dp))
                    OutlinedTextField(
                        value = unit,
                        onValueChange = { unit = it.take(8) },
                        label = { Text("Unit") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = remark,
                    onValueChange = { remark = it },
                    label = { Text("Remark") },
                    modifier = Modifier.fillMaxWidth(),
                )

                template?.fields?.sortedBy { it.order }?.forEach { field ->
                    Spacer(Modifier.height(10.dp))
                    val inkKey = SignatureInk.inkKeyFor(field.key)
                    TemplateFieldInput(
                        field = field,
                        value = fieldValues[field.key].orEmpty(),
                        ink = fieldValues[inkKey].orEmpty(),
                        signerName = signerName,
                        // A field locked for this role is shown, not hidden:
                        // seeing a value you may not change is useful, not
                        // being able to see it at all is not.
                        enabled = field.isEditableBy(roleId),
                        onChange = { fieldValues[field.key] = it },
                        onInkChange = { fieldValues[inkKey] = it },
                    )
                }

                if (name.isNotBlank() && item.barcode.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = addToCatalogue,
                            onCheckedChange = { addToCatalogue = it },
                        )
                        Column(modifier = Modifier.padding(start = 4.dp)) {
                            Text("Remember this product", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                text = "The next scan of ${item.barcode} names itself.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        item.copy(
                            productName = name.trim(),
                            sku = sku.trim(),
                            quantity = quantity.toIntOrNull() ?: item.quantity,
                            unit = unit.trim().ifEmpty { "pcs" },
                            remark = remark.trim(),
                            fieldValues = fieldValues.filterValues { it.isNotBlank() },
                        ),
                        addToCatalogue && name.isNotBlank() && item.barcode.isNotBlank(),
                    )
                },
            ) { Text("Save") }
        },
        dismissButton = {
            Row {
                TextButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text("Delete")
                }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}


/**
 * What the import actually did, before anyone counts anything.
 *
 * Reports skipped lines by file line number. An import that says "1,847 of
 * 2,000 imported" without saying which 153 or why is one nobody can trust
 * enough to run against real stock -- and the rows it drops are exactly the
 * ones that would have shown up as missing stock.
 */
@Composable
private fun ImportSummaryDialog(summary: ImportSummary, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Count sheet loaded") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    "${summary.created} lines added" +
                        if (summary.updated > 0) {
                            ", ${summary.updated} matched to lines already counted"
                        } else {
                            ""
                        },
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    "Every line starts at zero. Scan the shelf and the difference " +
                        "against the sheet appears as you go.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (summary.skipped.isNotEmpty()) {
                    Spacer(Modifier.height(14.dp))
                    Text(
                        "${summary.skipped.size} lines skipped",
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


/**
 * Holds the count still after a scan until the operator says carry on.
 *
 * Takes the camera's place rather than sitting under it. Leaving the preview
 * running would keep reading codes behind the panel, which is the problem this
 * exists to solve -- and the lens has nothing useful to show while the shelf
 * is not being pointed at.
 *
 * Sized for a thumb and a moving warehouse: the two things anyone does next
 * are carry on and stop, so those are the two buttons.
 */
@Composable
private fun ScanConfirmPanel(
    item: StockItem,
    onDecrement: () -> Unit,
    onIncrement: () -> Unit,
    onEdit: () -> Unit,
    onContinue: () -> Unit,
    onComplete: () -> Unit,
    canComplete: Boolean,
) {
    Surface(
        tonalElevation = 4.dp,
        color = MaterialTheme.colorScheme.primaryContainer,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Text(
                text = "Scanned",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = item.productName.ifEmpty { item.barcode },
                style = MaterialTheme.typography.titleLarge,
                maxLines = 2,
            )
            if (item.productName.isNotEmpty()) {
                Text(
                    text = item.barcode + if (item.sku.isNotEmpty()) "  ·  ${item.sku}" else "",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                FilledTonalIconButton(onClick = onDecrement, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Filled.Remove, contentDescription = "Subtract one")
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(onClick = onEdit),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = item.quantity.toString(),
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = item.unit + "  ·  tap to edit",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                FilledTonalIconButton(onClick = onIncrement, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Filled.Add, contentDescription = "Add one")
                }
            }

            if (item.onList) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = when {
                        item.variance == 0 -> "Matches the count sheet (${item.expected})"
                        item.variance < 0 -> "Sheet says ${item.expected} — short ${-item.variance}"
                        else -> "Sheet says ${item.expected} — over ${item.variance}"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = if (item.hasVariance) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }

            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onContinue,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                ) {
                    Icon(Icons.Filled.Check, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Scan next")
                }
                if (canComplete) {
                    OutlinedButton(
                        onClick = onComplete,
                        modifier = Modifier.height(52.dp),
                    ) { Text("Finish") }
                }
            }
        }
    }
}
