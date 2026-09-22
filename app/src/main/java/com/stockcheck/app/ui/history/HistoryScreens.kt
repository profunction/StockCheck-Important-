package com.stockcheck.app.ui.history

import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CardDefaults
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import com.stockcheck.app.ui.common.labelRes
import android.content.Intent
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.stockcheck.app.R
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.export.ExportFormat
import com.stockcheck.app.export.ExportOptions
import com.stockcheck.app.export.ExportScope
import com.stockcheck.app.model.Quantity
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockItem
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import com.stockcheck.app.ui.common.StatusChip
import com.stockcheck.app.ui.common.TotalTile
import com.stockcheck.app.ui.stock.friendlyDate

/**
 * Page 4 — history.
 *
 * The list a user sees is already narrowed by their role: without
 * VIEW_ALL_HISTORY the underlying query only ever asks for their own rows, so
 * there is nothing here to accidentally leak.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    session: Session,
    onOpen: (String) -> Unit,
) {
    val viewModel: HistoryViewModel = viewModel(factory = HistoryViewModel.factory(session))
    val checks by viewModel.filtered.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val statusFilter by viewModel.statusFilter.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val exportResult by viewModel.lastExport.collectAsStateWithLifecycle()
    val customColumns by viewModel.customColumns.collectAsStateWithLifecycle()
    val exportPassword by viewModel.exportPassword.collectAsStateWithLifecycle()

    val permissions = session.effectivePermissions
    val context = LocalContext.current
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    var exporting by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf(emptySet<String>()) }
    // Selection mode is simply "something is selected". A separate flag would
    // be a second source of truth for one fact, and the two drift.
    val selecting = selected.isNotEmpty()
    // What the admin password is being asked for, null when it is not.
    var pendingAction by remember { mutableStateOf<BulkAction?>(null) }

    // Hand the finished file straight to a share sheet — a file sitting in the
    // cache directory is of no use to anyone on its own.
    LaunchedEffect(exportResult) {
        exportResult?.let { result ->
            context.startActivity(
                Intent.createChooser(viewModel.shareIntent(result), "Share export"),
            )
            viewModel.clearExport()
        }
    }

    Scaffold(
        topBar = {
            if (selecting) {
                // The bar changes rather than gaining a row, so the count of
                // what is selected and the things that can be done to it are
                // in the place attention already is.
                // Gated the same way the individual actions below are: an icon
                // a role cannot use is not a shortcut, it is a password prompt
                // that was always going to end in a refusal.
                val selectedChecks = checks.filter { it.id in selected }
                val canExportSelection = permissions.has(Permission.VIEW_EXPORT)
                val canDeleteSelection = selectedChecks.all {
                    permissions.canDeleteRecordBy(it.createdByUid, session.uid)
                }
                TopAppBar(
                    navigationIcon = {
                        IconButton(onClick = { selected = emptySet() }) {
                            Icon(Icons.Filled.Close, contentDescription = "Clear selection")
                        }
                    },
                    title = { Text("${selected.size} selected") },
                    actions = {
                        if (canExportSelection) {
                            IconButton(onClick = { pendingAction = BulkAction.EXPORT }) {
                                Icon(
                                    Icons.Filled.FileDownload,
                                    contentDescription = "Export selected",
                                )
                            }
                        }
                        if (canDeleteSelection) {
                            IconButton(onClick = { pendingAction = BulkAction.DELETE }) {
                                Icon(
                                    Icons.Filled.Delete,
                                    contentDescription = "Delete selected",
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    },
                )
            } else {
                TopAppBar(
                    title = { Text(stringResource(R.string.tab_history)) },
                    actions = {
                        if (permissions.has(Permission.VIEW_EXPORT)) {
                            IconButton(onClick = { exporting = true }) {
                                Icon(Icons.Filled.FileDownload, contentDescription = "Export")
                            }
                        }
                    },
                )
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            message?.let { NoticeBar(text = it, tone = NoticeTone.ERROR) }

            OutlinedTextField(
                value = query,
                onValueChange = viewModel::setQuery,
                label = { Text(stringResource(R.string.search_history)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )

            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    FilterChip(
                        selected = statusFilter == null,
                        onClick = { viewModel.setStatusFilter(null) },
                        label = { Text(stringResource(R.string.filter_all)) },
                    )
                }
                items(StockStatus.entries.toList()) { status ->
                    FilterChip(
                        selected = statusFilter == status,
                        onClick = { viewModel.setStatusFilter(status) },
                        label = { Text(stringResource(status.labelRes)) },
                    )
                }
            }

            if (checks.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.History,
                    title = "Nothing here yet",
                    message = if (permissions.has(Permission.VIEW_ALL_HISTORY)) {
                        "Completed stock checks will appear here."
                    } else {
                        "Your own stock checks will appear here. Your role does not " +
                            "include seeing other workers' counts."
                    },
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(checks, key = { it.id }) { check ->
                        HistoryCard(
                            check = check,
                            selected = check.id in selected,
                            selecting = selecting,
                            onClick = {
                                // A tap opens a count normally and toggles it
                                // while selecting. Opening one mid-selection
                                // would lose the selection to a mis-tap.
                                if (selecting) {
                                    selected = if (check.id in selected) {
                                        selected - check.id
                                    } else {
                                        selected + check.id
                                    }
                                } else {
                                    onOpen(check.id)
                                }
                            },
                            onLongClick = { selected = selected + check.id },
                        )
                    }
                }
            }
        }
    }

    pendingAction?.let { action ->
        AdminPasswordDialog(
            action = action,
            count = selected.size,
            busy = busy,
            onDismiss = { pendingAction = null },
            onConfirm = { email, password ->
                viewModel.runWithAdmin(action, selected.toList(), email, password) {
                    pendingAction = null
                    selected = emptySet()
                }
            },
        )
    }

    if (exporting) {
        ExportDialog(
            session = session,
            checks = checks,
            customColumns = customColumns,
            exportPassword = exportPassword,
            onDismiss = { exporting = false },
            onExport = { options ->
                exporting = false
                viewModel.export(checks, options)
            },
        )
    }
}

/**
 * What a bulk action is, so the dialog can say which one it is guarding.
 */
enum class BulkAction(val title: String, val verb: String) {
    EXPORT("Export selected counts", "Export"),
    DELETE("Delete selected counts", "Delete"),
}

/**
 * Asks for an administrator's password before a bulk action.
 *
 * The role already decides who may. This answers what a role cannot see:
 * whether a supervisor is actually standing here, on a phone that is in a
 * worker's hand all day. Deleting a month of counts and carrying the
 * company's stock figures out of the building are both things worth a
 * deliberate second person.
 *
 * It names the count and the action, because "are you sure" over an
 * unstated number is how somebody deletes forty records meaning to delete
 * four.
 */
@Composable
private fun AdminPasswordDialog(
    action: BulkAction,
    count: Int,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (email: String, password: String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(action.title) },
        text = {
            Column {
                Text(
                    text = if (action == BulkAction.DELETE) {
                        "$count stock check(s) and everything counted in them will be " +
                            "removed. This cannot be undone."
                    } else {
                        "$count stock check(s) will be written to one file."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "An administrator has to approve this.",
                    style = MaterialTheme.typography.labelMedium,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Administrator email") },
                    singleLine = true,
                    enabled = !busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    enabled = !busy,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(email, password) },
                enabled = !busy && email.isNotBlank() && password.isNotBlank(),
            ) {
                Text(
                    text = if (busy) "Checking…" else action.verb,
                    color = if (action == BulkAction.DELETE) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) {
                Text(stringResource(R.string.cancel))
            }
        },
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HistoryCard(
    check: StockCheck,
    selected: Boolean,
    selecting: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick),
        colors = if (selected) {
            CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
            )
        } else {
            CardDefaults.cardColors()
        },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Only while selecting. A row of empty boxes on a screen
                    // nobody is selecting on is a control looking for a job.
                    if (selecting) {
                        Checkbox(checked = selected, onCheckedChange = { onClick() })
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(check.refNo, style = MaterialTheme.typography.titleMedium)
                }
                StatusChip(check.statusEnum)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                // Which area, beside the date. Searching History by area
                // already worked; seeing which area a count covers did not,
                // so the search only helped somebody who already knew.
                text = if (check.zone.isBlank()) {
                    friendlyDate(check.createdAt)
                } else {
                    "${friendlyDate(check.createdAt)} · ${check.zone}"
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                TotalTile("Products", check.itemCount.toString())
                TotalTile("Total qty", Quantity.format(check.counted), emphasis = true)
                TotalTile("Photos", check.photoCount.toString())
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = "${check.createdByName} · ${check.templateName}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ----------------------------------------------------------------- detail

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryDetailScreen(
    session: Session,
    checkId: String,
    onBack: () -> Unit,
    onContinueCounting: (String) -> Unit,
) {
    val viewModel: HistoryDetailViewModel = viewModel(
        key = checkId,
        factory = HistoryDetailViewModel.factory(session, checkId),
    )
    val check by viewModel.check.collectAsStateWithLifecycle()
    val items by viewModel.items.collectAsStateWithLifecycle()
    val audit by viewModel.audit.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()

    val permissions = session.effectivePermissions
    val current = check
    var confirmDelete by remember { mutableStateOf(false) }

    val canEdit = current != null &&
        !current.statusEnum.isFrozen &&
        permissions.canEditRecordBy(current.createdByUid, session.uid)
    val canDelete = current != null &&
        permissions.canDeleteRecordBy(current.createdByUid, session.uid)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(current?.refNo ?: "Stock check") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    // A completed check is still editable; it has simply left
                    // the Stock tab, which is the only other way back to the
                    // scanner. Locked ones stay out until unlocked.
                    if (canEdit) {
                        IconButton(onClick = { onContinueCounting(checkId) }) {
                            Icon(
                                Icons.Filled.QrCodeScanner,
                                contentDescription = "Continue counting",
                            )
                        }
                    }
                    if (permissions.has(Permission.DUPLICATE_STOCK)) {
                        IconButton(onClick = viewModel::duplicate) {
                            Icon(Icons.Filled.ContentCopy, contentDescription = "Duplicate")
                        }
                    }
                    if (canDelete) {
                        IconButton(onClick = { confirmDelete = true }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Delete")
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            message?.let { NoticeBar(text = it, tone = NoticeTone.ERROR) }

            current?.let { check ->
                Card(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(check.templateName, style = MaterialTheme.typography.titleMedium)
                            StatusChip(check.statusEnum)
                        }
                        Spacer(Modifier.height(8.dp))
                        if (check.zone.isNotBlank()) {
                            Text(stringResource(R.string.area_label, check.zone))
                        }
                        Text(stringResource(R.string.worker_label, check.createdByName))
                        Text(stringResource(R.string.started_label, friendlyDate(check.createdAt)))
                        check.completedAt?.let { Text(stringResource(R.string.completed_label, friendlyDate(it))) }
                        check.reviewedByName?.let { Text(stringResource(R.string.reviewed_by_label, it)) }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                            TotalTile("Products", check.itemCount.toString())
                            TotalTile("Total", Quantity.format(check.counted), emphasis = true)
                            TotalTile("Photos", check.photoCount.toString())
                        }
                    }
                }
            }

            Text(
                text = "Items",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Spacer(Modifier.height(6.dp))
            items.forEach { item ->
                ItemLine(item = item, canEdit = canEdit, onEdit = { viewModel.edit(item, it) })
            }

            if (permissions.has(Permission.VIEW_AUDIT_LOG) && audit.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                HorizontalDivider()
                Text(
                    text = "Change history",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(16.dp),
                )
                audit.forEach { entry ->
                    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                        Text(
                            text = "${entry.actorName} · ${friendlyDate(entry.at)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                        )
                        Text(
                            text = buildString {
                                append(entry.actionEnum.label)
                                if (entry.entityLabel.isNotEmpty()) append(" ${entry.entityLabel}")
                                if (entry.field.isNotEmpty()) {
                                    append(": ${entry.field} ")
                                    append(entry.oldValue.ifEmpty { "—" })
                                    append(" → ")
                                    append(entry.newValue.ifEmpty { "—" })
                                }
                            },
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this stock check?") },
            text = {
                Text(
                    "Its items and photos are removed too. The audit trail keeps a " +
                        "record that you deleted it.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDelete = false
                        viewModel.delete(onBack)
                    },
                ) { Text(stringResource(R.string.delete)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.cancel)) }
            },
        )
    }
}

@Composable
private fun ItemLine(item: StockItem, canEdit: Boolean, onEdit: (StockItem) -> Unit) {
    var editing by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = canEdit) { editing = true }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(item.productName.ifEmpty { item.barcode })
            Text(
                text = item.barcode,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
        Text(
            text = Quantity.formatWith(item.counted, item.unit),
            style = MaterialTheme.typography.titleMedium,
        )
    }
    HorizontalDivider()

    if (editing) {
        var quantity by remember { mutableStateOf(Quantity.format(item.counted)) }
        var name by remember { mutableStateOf(item.productName) }
        var remark by remember { mutableStateOf(item.remark) }
        AlertDialog(
            onDismissRequest = { editing = false },
            title = { Text("Edit ${item.barcode}") },
            text = {
                Column {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Product") },
                        singleLine = true,
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { quantity = Quantity.filterInput(it) },
                        label = { Text("Quantity") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = remark,
                        onValueChange = { remark = it },
                        label = { Text("Remark") },
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        editing = false
                        onEdit(
                            item.copy(
                                productName = name.trim(),
                                quantityMilli = Quantity.parse(quantity) ?: item.counted,
                                remark = remark.trim(),
                            ),
                        )
                    },
                ) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { editing = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

@Composable
private fun CheckRow(
    checked: Boolean,
    enabled: Boolean,
    title: String,
    subtitle: String,
    onToggle: () -> Unit,
    indent: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onToggle)
            .padding(start = if (indent) 24.dp else 0.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Checkbox(checked = checked, onCheckedChange = { onToggle() }, enabled = enabled)
        Spacer(Modifier.width(4.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = if (enabled) {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    MaterialTheme.colorScheme.outline
                },
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ----------------------------------------------------------------- export

/**
 * The export sheet.
 *
 * Only the options the role actually holds are offered — a worker with
 * EXPORT_CSV but not EXPORT_EXCEL never sees an Excel choice, and the
 * "editable file" switch appears only with EDIT_EXPORTED_FILE. The same
 * narrowing is repeated inside [com.stockcheck.app.export.ExportService], so
 * the file is correct even if this dialog is bypassed.
 */
@Composable
private fun ExportDialog(
    session: Session,
    checks: List<StockCheck>,
    customColumns: List<com.stockcheck.app.export.ExportColumn>,
    exportPassword: String,
    onDismiss: () -> Unit,
    onExport: (ExportOptions) -> Unit,
) {
    val permissions = session.effectivePermissions
    val canCsv = permissions.has(Permission.EXPORT_CSV)
    val canExcel = permissions.has(Permission.EXPORT_EXCEL)
    val canAll = permissions.has(Permission.EXPORT_ALL_DATA)
    val canEditable = permissions.has(Permission.EDIT_EXPORTED_FILE)

    var format by remember {
        mutableStateOf(if (canCsv) ExportFormat.CSV else ExportFormat.XLSX)
    }
    var scope by remember {
        mutableStateOf(if (canAll) ExportScope.ALL else ExportScope.OWN)
    }
    var editable by remember { mutableStateOf(false) }
    var protectSheet by remember { mutableStateOf(true) }
    var encryptBundle by remember { mutableStateOf(false) }
    val allColumns = com.stockcheck.app.export.ExportColumn.standard + customColumns
    // Everything is selected to begin with. A column left out produces a file
    // that looks complete and is not, which is a worse failure than a sheet
    // with more columns than someone wanted.
    var selected by remember(customColumns) {
        mutableStateOf(allColumns.map { it.key }.toSet())
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            // Counted against the chosen scope, not the whole list: the header
            // used to promise more records than "Mine" would actually include.
            val included = checks.count {
                scope == ExportScope.ALL || it.createdByUid == session.uid
            }
            Text("Export $included of ${checks.size} stock checks")
        },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text("Format", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (canCsv) {
                        FilterChip(
                            selected = format == ExportFormat.CSV,
                            onClick = { format = ExportFormat.CSV },
                            label = { Text("CSV") },
                        )
                    }
                    if (canExcel) {
                        FilterChip(
                            selected = format == ExportFormat.XLSX,
                            onClick = { format = ExportFormat.XLSX },
                            label = { Text("Excel") },
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))
                Text("Data", style = MaterialTheme.typography.labelLarge)
                Text(
                    text = "\"Mine\" means stock checks you created yourself.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = scope == ExportScope.OWN,
                        onClick = { scope = ExportScope.OWN },
                        label = { Text("Mine") },
                    )
                    if (canAll) {
                        FilterChip(
                            selected = scope == ExportScope.ALL,
                            onClick = { scope = ExportScope.ALL },
                            label = { Text("Everyone") },
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Columns", style = MaterialTheme.typography.labelLarge)
                    TextButton(
                        onClick = {
                            selected = if (selected.size == allColumns.size) {
                                emptySet()
                            } else {
                                allColumns.map { it.key }.toSet()
                            }
                        },
                    ) {
                        Text(if (selected.size == allColumns.size) "Clear all" else "Select all")
                    }
                }
                allColumns.forEach { column ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                selected = if (column.key in selected) {
                                    selected - column.key
                                } else {
                                    selected + column.key
                                }
                            }
                            .padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(column.header)
                        Text(if (column.key in selected) "✓" else "")
                    }
                }

                Spacer(Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(Modifier.height(12.dp))
                Text("Protection", style = MaterialTheme.typography.labelLarge)

                if (exportPassword.isBlank()) {
                    Spacer(Modifier.height(8.dp))
                    NoticeBar(
                        text = "No password is set for this company, so nothing here can be " +
                            "protected. An admin sets one under Profile, Company code.",
                        tone = NoticeTone.ERROR,
                    )
                }

                if (format == ExportFormat.XLSX) {
                    CheckRow(
                        checked = protectSheet && exportPassword.isNotBlank(),
                        enabled = exportPassword.isNotBlank(),
                        title = "Protect the sheet with the password",
                        subtitle = "Excel asks for the password before anything can be " +
                            "changed. Stops an accidental edit; a determined person can " +
                            "strip it.",
                        onToggle = { protectSheet = !protectSheet },
                    )
                    if (protectSheet && canEditable && exportPassword.isNotBlank()) {
                        CheckRow(
                            checked = editable,
                            enabled = true,
                            title = "…but leave the counted values editable",
                            subtitle = "Product, quantity, unit and remark stay open. " +
                                "Reference, date, worker and status stay locked.",
                            onToggle = { editable = !editable },
                            indent = true,
                        )
                    }
                }

                CheckRow(
                    checked = encryptBundle && exportPassword.isNotBlank(),
                    enabled = exportPassword.isNotBlank(),
                    title = "Send as an encrypted ZIP",
                    subtitle = "The file cannot be opened at all without the password. " +
                        "Real AES-256 encryption — this is the strong one, and the only " +
                        "option that protects a CSV.",
                    onToggle = { encryptBundle = !encryptBundle },
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onExport(
                        ExportOptions(
                            format = format,
                            scope = scope,
                            selectedKeys = selected,
                            protectSheet = protectSheet && exportPassword.isNotBlank(),
                            editable = editable,
                            encryptBundle = encryptBundle && exportPassword.isNotBlank(),
                        ),
                    )
                },
                enabled = selected.isNotEmpty() && (canCsv || canExcel) &&
                    checks.any { scope == ExportScope.ALL || it.createdByUid == session.uid },
            ) { Text("Export") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}
