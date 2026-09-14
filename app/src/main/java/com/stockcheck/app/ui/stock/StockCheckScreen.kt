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
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.AlertDialog
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
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.model.ItemSource
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
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

    val snackbarHost = remember { SnackbarHostState() }
    var manualEntry by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<StockItem?>(null) }
    var menuOpen by remember { mutableStateOf(false) }

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
                        Text(check?.refNo ?: "Stock check")
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

            AnimatedVisibility(visible = scannerActive && !frozen) {
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

            if (items.isEmpty()) {
                com.stockcheck.app.ui.common.EmptyState(
                    icon = Icons.Filled.Inventory2,
                    title = "Nothing counted yet",
                    message = "Point the camera at a barcode, or tap the microphone " +
                        "and say the product and quantity.",
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(12.dp, 8.dp, 12.dp, 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(items, key = { it.id }) { item ->
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

    editing?.let { item ->
        EditItemDialog(
            item = item,
            onDismiss = { editing = null },
            onSave = { updated ->
                editing = null
                viewModel.updateItem(item, updated)
            },
            onDelete = {
                editing = null
                viewModel.deleteItem(item)
            },
        )
    }
}

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
                BarcodeScannerPreview(
                    modifier = Modifier.fillMaxSize(),
                    onScanned = onScanned,
                )
                // A simple reticle: it tells the operator where to aim without
                // implying the scanner only reads inside the frame, which it
                // does not — ML Kit analyses the whole image.
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .width(240.dp)
                        .height(96.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.08f)),
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
                    text = if (item.productName.isEmpty()) {
                        item.sourceEnum.name.lowercase()
                    } else {
                        item.barcode
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
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
                TotalTile("Photos", photoCount.toString())
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

@Composable
private fun EditItemDialog(
    item: StockItem,
    onDismiss: () -> Unit,
    onSave: (StockItem) -> Unit,
    onDelete: () -> Unit,
) {
    var name by remember(item.id) { mutableStateOf(item.productName) }
    var quantity by remember(item.id) { mutableStateOf(item.quantity.toString()) }
    var unit by remember(item.id) { mutableStateOf(item.unit) }
    var remark by remember(item.id) { mutableStateOf(item.remark) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(item.barcode) },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Product name") },
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
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        item.copy(
                            productName = name.trim(),
                            quantity = quantity.toIntOrNull() ?: item.quantity,
                            unit = unit.trim().ifEmpty { "pcs" },
                            remark = remark.trim(),
                        ),
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
