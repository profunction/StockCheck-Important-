package com.stockcheck.app.ui.inventory

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.R
import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.MovementSource
import com.stockcheck.app.model.MovementType
import com.stockcheck.app.model.Quantity
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockLedger
import com.stockcheck.app.model.StockMovement
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import com.stockcheck.app.ui.common.TotalTile
import com.stockcheck.app.ui.stock.friendlyDate

/**
 * What should be on each shelf now, what is running low, and what the last
 * count found missing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockLevelsScreen(
    session: Session,
    onImport: (MovementFile.Kind) -> Unit,
    onConnectPos: () -> Unit,
) {
    val viewModel: StockLevelsViewModel = viewModel(factory = StockLevelsViewModel.factory(session))
    val state by viewModel.state.collectAsStateWithLifecycle()
    val branches by viewModel.branches.collectAsStateWithLifecycle()
    val branchId by viewModel.branchId.collectAsStateWithLifecycle()
    val filter by viewModel.filter.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val loyverse by viewModel.loyverse.collectAsStateWithLifecycle()
    val syncing by viewModel.syncing.collectAsStateWithLifecycle()

    var menuOpen by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf(false) }
    var writingBack by remember { mutableStateOf(false) }
    var opened by remember { mutableStateOf<StockLedger.Level?>(null) }

    val shown = state.levels
        .filter {
            when (filter) {
                LevelFilter.ALL -> true
                LevelFilter.LOW -> it.isLow
                LevelFilter.MISSING -> (it.lossAtCount ?: 0L) < 0L
                LevelFilter.UNCOUNTED -> it.counted == null
            }
        }
        .filter {
            query.isBlank() ||
                it.name.contains(query, ignoreCase = true) ||
                it.barcode.contains(query, ignoreCase = true)
        }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.stock_levels_title)) },
                actions = {
                    if (viewModel.canRecord) {
                        IconButton(onClick = { recording = true }) {
                            Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.levels_record))
                        }
                    }
                    if (viewModel.canRecord || viewModel.canConnect) {
                        Box {
                            IconButton(onClick = { menuOpen = true }) {
                                Icon(Icons.Filled.MoreVert, contentDescription = null)
                            }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                if (viewModel.canRecord) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.levels_import_sales)) },
                                        onClick = {
                                            menuOpen = false
                                            onImport(MovementFile.Kind.SALES)
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.levels_import_received)) },
                                        onClick = {
                                            menuOpen = false
                                            onImport(MovementFile.Kind.RECEIVING)
                                        },
                                    )
                                }
                                if (viewModel.canConnect) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.pos_title)) },
                                        onClick = {
                                            menuOpen = false
                                            onConnectPos()
                                        },
                                    )
                                }
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 32.dp),
        ) {
            message?.let { text -> item { NoticeBar(text = text, tone = NoticeTone.ERROR) } }

            loyverse?.takeIf { it.token.isNotBlank() }?.let { settings ->
                item {
                    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Loyverse", style = MaterialTheme.typography.titleSmall)
                                Text(
                                    text = if (settings.lastSyncedAt == 0L) {
                                        stringResource(R.string.pos_never_synced)
                                    } else {
                                        stringResource(
                                            R.string.pos_last_sync,
                                            friendlyDate(settings.lastSyncedAt),
                                            settings.lastResult,
                                        )
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.outline,
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                TextButton(onClick = viewModel::syncLoyverse, enabled = !syncing) {
                                    Text(stringResource(R.string.pos_sync_now))
                                }
                                TextButton(onClick = { writingBack = true }, enabled = !syncing) {
                                    Text(stringResource(R.string.write_back_open))
                                }
                            }
                        }
                    }
                }
            }

            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = viewModel::setQuery,
                    label = { Text(stringResource(R.string.levels_search)) },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                )
            }

            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item { FilterOption(filter, LevelFilter.ALL, R.string.filter_all, viewModel::setFilter) }
                    item { FilterOption(filter, LevelFilter.LOW, R.string.levels_filter_low, viewModel::setFilter) }
                    item { FilterOption(filter, LevelFilter.MISSING, R.string.levels_filter_missing, viewModel::setFilter) }
                    item {
                        FilterOption(filter, LevelFilter.UNCOUNTED, R.string.levels_filter_uncounted, viewModel::setFilter)
                    }
                }
            }

            if (branches.size > 1) {
                item {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        item {
                            FilterChip(
                                selected = branchId == null,
                                onClick = { viewModel.setBranch(null) },
                                label = { Text(stringResource(R.string.branch_access_all)) },
                            )
                        }
                        items(branches, key = { it.id }) { branch ->
                            FilterChip(
                                selected = branchId == branch.id,
                                onClick = { viewModel.setBranch(branch.id) },
                                label = { Text(branch.name) },
                            )
                        }
                    }
                }
            }

            item {
                if (state.loading) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth().padding(16.dp, 8.dp))
                }
            }

            if (!state.loading && state.levels.isEmpty()) {
                item {
                    EmptyState(
                        icon = Icons.Filled.Inventory2,
                        title = stringResource(R.string.levels_empty_title),
                        message = stringResource(R.string.levels_empty_body),
                    )
                }
            } else if (state.levels.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(24.dp),
                    ) {
                        TotalTile(stringResource(R.string.total_products), state.levels.size.toString())
                        TotalTile(
                            stringResource(R.string.levels_low_badge),
                            state.levels.count { it.isLow }.toString(),
                            emphasis = true,
                        )
                        TotalTile(
                            stringResource(R.string.levels_missing),
                            state.levels.count { (it.lossAtCount ?: 0L) < 0L }.toString(),
                        )
                    }
                }
                items(shown, key = { it.key }) { level ->
                    LevelRow(level = level, onClick = { opened = level })
                }
                item {
                    Text(
                        text = stringResource(R.string.levels_how),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }
    }

    if (writingBack) {
        val plan by viewModel.writeBack.collectAsStateWithLifecycle()
        val writing by viewModel.writing.collectAsStateWithLifecycle()
        val context = androidx.compose.ui.platform.LocalContext.current
        WriteBackDialog(
            plan = plan,
            lastSyncedAt = loyverse?.lastSyncedAt ?: 0L,
            busy = writing || syncing,
            onSync = viewModel::syncLoyverse,
            onDismiss = { writingBack = false },
            onConfirm = { items ->
                viewModel.pushToLoyverse(items) { count ->
                    writingBack = false
                    android.widget.Toast.makeText(
                        context,
                        context.getString(R.string.write_back_done, count),
                        android.widget.Toast.LENGTH_LONG,
                    ).show()
                }
            },
        )
    }

    if (recording) {
        RecordDialog(
            branches = branches,
            restricted = session.profile.branchIds.isNotEmpty(),
            onDismiss = { recording = false },
            onSave = { type, code, quantity, branch, note ->
                viewModel.record(type, code, quantity, branch, note) { recording = false }
            },
        )
    }

    opened?.let { level ->
        LevelDialog(
            level = level,
            movements = state.movementsByKey[level.key].orEmpty(),
            canEdit = viewModel.canRecord,
            onDismiss = { opened = null },
            onSaveReorder = { milli ->
                viewModel.setReorderLevel(level, milli)
                opened = null
            },
            onDelete = viewModel::delete,
        )
    }
}

@Composable
private fun FilterOption(
    current: LevelFilter,
    option: LevelFilter,
    label: Int,
    onPick: (LevelFilter) -> Unit,
) {
    FilterChip(
        selected = current == option,
        onClick = { onPick(option) },
        label = { Text(stringResource(label)) },
    )
}

private fun amount(milli: Long, unit: String): String = Quantity.format(milli) + if (unit.isBlank()) "" else " $unit"

@Composable
private fun LevelRow(level: StockLedger.Level, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(level.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val detail = if (level.counted == null || level.countedAt == null) {
                stringResource(R.string.levels_not_counted)
            } else {
                stringResource(
                    R.string.levels_counted_line,
                    Quantity.format(level.counted),
                    friendlyDate(level.countedAt),
                )
            }
            Text(detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
            level.pos?.let { till ->
                Text(
                    text = stringResource(R.string.levels_pos, amount(till, level.unit)),
                    style = MaterialTheme.typography.labelSmall,
                    // A till that disagrees with the count is worth a look.
                    color = if (!level.shownFromPos && till != level.onHand) {
                        MaterialTheme.colorScheme.tertiary
                    } else {
                        MaterialTheme.colorScheme.outline
                    },
                )
            }
            if (level.inSince != 0L || level.outSince != 0L) {
                Text(
                    text = stringResource(
                        R.string.levels_since,
                        Quantity.format(level.inSince),
                        Quantity.format(level.outSince),
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
            level.lossAtCount?.takeIf { it < 0L }?.let { loss ->
                Text(
                    text = stringResource(R.string.levels_loss, Quantity.format(loss)),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = amount(level.shown, level.unit),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = if (level.isLow) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            )
            if (level.isLow) {
                Text(
                    text = stringResource(R.string.levels_low_badge),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
    HorizontalDivider()
}

@Composable
private fun typeLabel(type: MovementType?): String = stringResource(
    when (type) {
        MovementType.RECEIVE -> R.string.movement_receive
        MovementType.SALE -> R.string.movement_sale
        MovementType.REFUND -> R.string.movement_refund
        MovementType.WRITE_OFF, null -> R.string.movement_write_off
    },
)

@Composable
private fun sourceLabel(source: String): String = when (source) {
    MovementSource.LOYVERSE.name -> "Loyverse"
    MovementSource.POS.name -> "POS"
    MovementSource.FILE.name -> stringResource(R.string.movement_source_file)
    else -> stringResource(R.string.movement_source_manual)
}

@Composable
private fun LevelDialog(
    level: StockLedger.Level,
    movements: List<StockMovement>,
    canEdit: Boolean,
    onDismiss: () -> Unit,
    onSaveReorder: (Long?) -> Unit,
    onDelete: (StockMovement) -> Unit,
) {
    var reorder by remember(level.key) {
        mutableStateOf(level.reorderLevel?.let(Quantity::format).orEmpty())
    }
    val canSetReorder = canEdit && level.barcode.isNotBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(level.label, maxLines = 2, overflow = TextOverflow.Ellipsis) },
        text = {
            Column(modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
                if (level.barcode.isNotBlank()) {
                    Text(level.barcode, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.levels_on_hand) + ": " + amount(level.shown, level.unit),
                    style = MaterialTheme.typography.titleMedium,
                )
                level.pos?.let { till ->
                    Text(stringResource(R.string.levels_pos, amount(till, level.unit)))
                }
                if (level.counted != null && level.countedAt != null) {
                    Text(
                        stringResource(
                            R.string.levels_counted_line,
                            Quantity.format(level.counted),
                            friendlyDate(level.countedAt),
                        ),
                    )
                    level.lossAtCount?.let { loss ->
                        Text(
                            text = stringResource(
                                R.string.level_expected_found,
                                Quantity.format(level.counted - loss),
                                Quantity.format(level.counted),
                            ),
                            color = if (loss < 0L) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                } else {
                    Text(stringResource(R.string.levels_not_counted))
                }

                Spacer(Modifier.height(12.dp))
                Text(stringResource(R.string.level_since_then), style = MaterialTheme.typography.labelLarge)
                if (movements.isEmpty()) {
                    Text(
                        stringResource(R.string.level_nothing_since),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                }
                movements.take(60).forEach { move ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = typeLabel(move.typeEnum) + "  " +
                                    (if (move.signed >= 0) "+" else "") + Quantity.format(move.signed),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Text(
                                text = friendlyDate(move.at) + " · " + sourceLabel(move.source) +
                                    if (move.note.isNotBlank()) " · ${move.note}" else "",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.outline,
                            )
                        }
                        if (canEdit) {
                            IconButton(onClick = { onDelete(move) }) {
                                Icon(
                                    Icons.Filled.Delete,
                                    contentDescription = stringResource(R.string.delete),
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }

                if (canSetReorder) {
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = reorder,
                        onValueChange = { reorder = com.stockcheck.app.model.Quantity.filterInput(it) },
                        label = { Text(stringResource(R.string.level_reorder)) },
                        supportingText = { Text(stringResource(R.string.level_reorder_hint)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            if (canSetReorder) {
                TextButton(onClick = { onSaveReorder(Quantity.parse(reorder)) }) {
                    Text(stringResource(R.string.save))
                }
            } else {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
            }
        },
        dismissButton = {
            if (canSetReorder) TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        },
    )
}

@Composable
private fun RecordDialog(
    branches: List<Branch>,
    restricted: Boolean,
    onDismiss: () -> Unit,
    onSave: (MovementType, String, Long, String, String) -> Unit,
) {
    var type by remember { mutableStateOf(MovementType.RECEIVE) }
    var code by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    // A branch account records for one of its own branches; the rules refuse
    // anything else.
    var branch by remember { mutableStateOf(if (restricted) branches.firstOrNull()?.id.orEmpty() else "") }
    val parsed = Quantity.parse(quantity)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.record_title)) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = type == MovementType.RECEIVE,
                        onClick = { type = MovementType.RECEIVE },
                        label = { Text(stringResource(R.string.record_type_receive)) },
                    )
                    FilterChip(
                        selected = type == MovementType.WRITE_OFF,
                        onClick = { type = MovementType.WRITE_OFF },
                        label = { Text(stringResource(R.string.record_type_write_off)) },
                    )
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    label = { Text(stringResource(R.string.record_product)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { quantity = Quantity.filterInput(it) },
                    label = { Text(stringResource(R.string.record_quantity)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text(stringResource(R.string.record_note)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (branches.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.record_branch), style = MaterialTheme.typography.labelLarge)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!restricted) {
                            item {
                                FilterChip(
                                    selected = branch.isEmpty(),
                                    onClick = { branch = "" },
                                    label = { Text(stringResource(R.string.pos_main_shop)) },
                                )
                            }
                        }
                        items(branches, key = { it.id }) { option ->
                            FilterChip(
                                selected = branch == option.id,
                                onClick = { branch = option.id },
                                label = { Text(option.name) },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(type, code, parsed ?: 0L, branch, note) },
                enabled = code.isNotBlank() && (parsed ?: 0L) > 0L,
            ) { Text(stringResource(R.string.save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}

/**
 * Sending counted figures to Loyverse, product by product, after the person
 * has seen each change. A wrong count written into the till is a wrong
 * figure at every till, so nothing goes without this screen.
 */
@Composable
private fun WriteBackDialog(
    plan: WriteBackPlan,
    lastSyncedAt: Long,
    busy: Boolean,
    onSync: () -> Unit,
    onDismiss: () -> Unit,
    onConfirm: (List<com.stockcheck.app.pos.WriteBack>) -> Unit,
) {
    // Ten minutes: sales rung up since the last sync would otherwise be
    // written over with a figure from before them.
    val stale = System.currentTimeMillis() - lastSyncedAt > 10 * 60 * 1000L
    var unticked by remember { mutableStateOf(setOf<String>()) }
    val chosen = plan.items.filter { it.key !in unticked }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.write_back_title)) },
        text = {
            Column(modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
                Text(stringResource(R.string.write_back_intro), style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                when {
                    stale -> {
                        Text(stringResource(R.string.write_back_sync_first), color = MaterialTheme.colorScheme.error)
                        TextButton(onClick = onSync, enabled = !busy) { Text(stringResource(R.string.pos_sync_now)) }
                    }
                    plan.needsBranch -> Text(stringResource(R.string.write_back_pick_branch))
                    plan.items.isEmpty() -> Text(stringResource(R.string.write_back_nothing))
                    else -> plan.items.forEach { item ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.material3.Checkbox(
                                checked = item.key !in unticked,
                                onCheckedChange = { on -> unticked = if (on) unticked - item.key else unticked + item.key },
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.name, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(
                                    stringResource(
                                        R.string.write_back_change,
                                        Quantity.format(item.fromMilli),
                                        Quantity.format(item.toMilli),
                                    ),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.outline,
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(chosen) },
                enabled = !busy && !stale && !plan.needsBranch && chosen.isNotEmpty(),
            ) { Text(stringResource(R.string.write_back_go, chosen.size)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}
