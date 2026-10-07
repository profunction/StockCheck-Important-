package com.stockcheck.app.ui.inventory

import android.app.DatePickerDialog
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.R
import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.export.SheetMapping.Role
import com.stockcheck.app.model.Quantity
import com.stockcheck.app.model.Session
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportMovementsScreen(
    session: Session,
    kind: MovementFile.Kind,
    onBack: () -> Unit,
) {
    val viewModel: ImportMovementsViewModel = viewModel(
        key = "import-${kind.name}",
        factory = ImportMovementsViewModel.factory(session, kind),
    )
    val file by viewModel.file.collectAsStateWithLifecycle()
    val columns by viewModel.columns.collectAsStateWithLifecycle()
    val date by viewModel.date.collectAsStateWithLifecycle()
    val branchId by viewModel.branchId.collectAsStateWithLifecycle()
    val branches by viewModel.branches.collectAsStateWithLifecycle()
    val preview by viewModel.preview.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val done by viewModel.done.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val bytes = runCatching {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        }.getOrNull()
        if (bytes == null || bytes.isEmpty()) viewModel.onFileUnreadable() else viewModel.load(bytes, displayName(context, uri))
    }

    val hasProduct = listOf(Role.BARCODE, Role.SKU, Role.NAME).any { it in columns }
    val hasQuantity = Role.QUANTITY in columns

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(
                            if (kind == MovementFile.Kind.SALES) R.string.import_title_sales else R.string.import_title_received,
                        ),
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = null) }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            message?.let { text -> item { NoticeBar(text = text, tone = NoticeTone.ERROR) } }

            val current = file
            val imported = done
            when {
                imported != null -> item {
                    Column {
                        Text(stringResource(R.string.import_done, imported), style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            stringResource(R.string.import_repeat_note),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.import_back_to_levels))
                        }
                        OutlinedButton(onClick = viewModel::reset, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.import_another))
                        }
                    }
                }

                current == null -> item {
                    Column {
                        Text(stringResource(R.string.import_intro), style = MaterialTheme.typography.bodyLarge)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { picker.launch(arrayOf("*/*")) }, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.import_choose_file))
                        }
                        OutlinedButton(
                            onClick = {
                                context.startActivity(Intent.createChooser(viewModel.sampleIntent(context), null))
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(stringResource(R.string.import_sample)) }
                    }
                }

                else -> {
                    item {
                        Column {
                            Text(current.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                stringResource(R.string.import_header_row, current.headerLine),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.outline,
                            )
                            TextButton(onClick = { picker.launch(arrayOf("*/*")) }) {
                                Text(stringResource(R.string.import_choose_file))
                            }
                        }
                    }

                    item {
                        Card {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(stringResource(R.string.import_columns), style = MaterialTheme.typography.titleSmall)
                                viewModel.roles.forEach { role ->
                                    ColumnPicker(
                                        label = stringResource(roleLabel(role)),
                                        headers = current.headers,
                                        sample = current.rows.firstOrNull(),
                                        selected = columns[role],
                                        onPick = { viewModel.setColumn(role, it) },
                                    )
                                }
                                if (Role.DATE !in columns) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            stringResource(R.string.import_date_for_all),
                                            modifier = Modifier.weight(1f),
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                        TextButton(
                                            onClick = {
                                                DatePickerDialog(
                                                    context,
                                                    { _, year, month, day -> viewModel.setDate(java.time.LocalDate.of(year, month + 1, day)) },
                                                    date.year,
                                                    date.monthValue - 1,
                                                    date.dayOfMonth,
                                                ).show()
                                            },
                                        ) { Text(date.toString()) }
                                    }
                                }
                            }
                        }
                    }

                    if (branches.isNotEmpty()) {
                        item {
                            Column {
                                Text(stringResource(R.string.record_branch), style = MaterialTheme.typography.labelLarge)
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (!viewModel.restricted) {
                                        item {
                                            FilterChip(
                                                selected = branchId.isEmpty(),
                                                onClick = { viewModel.setBranch("") },
                                                label = { Text(stringResource(R.string.pos_main_shop)) },
                                            )
                                        }
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
                    }

                    if (!hasProduct) item { NoticeBar(text = stringResource(R.string.import_need_product), tone = NoticeTone.ERROR) }
                    if (!hasQuantity) item { NoticeBar(text = stringResource(R.string.import_need_quantity), tone = NoticeTone.ERROR) }

                    if (hasProduct && hasQuantity) {
                        item {
                            Card {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(stringResource(R.string.import_preview), style = MaterialTheme.typography.titleSmall)
                                    Text(
                                        stringResource(
                                            R.string.import_summary,
                                            preview.rowsRead,
                                            preview.planned.size,
                                            preview.unmatched,
                                        ),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    if (preview.problems.isNotEmpty()) {
                                        Spacer(Modifier.height(6.dp))
                                        Text(
                                            stringResource(R.string.import_problems, preview.problems.size),
                                            color = MaterialTheme.colorScheme.error,
                                            style = MaterialTheme.typography.labelLarge,
                                        )
                                        preview.problems.take(5).forEach { problem ->
                                            Text(problem, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                        }
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    preview.planned.take(12).forEach { line ->
                                        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    line.name.ifEmpty { line.key.removePrefix("name:") },
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                                Text(
                                                    line.date.toString() + if (!line.matched) " · ?" else "",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.outline,
                                                )
                                            }
                                            Text(
                                                stringResource(movementLabel(line.type(kind))) + " " + Quantity.format(line.quantity),
                                                style = MaterialTheme.typography.bodyMedium,
                                            )
                                        }
                                        HorizontalDivider()
                                    }
                                    if (preview.unmatched > 0) {
                                        Spacer(Modifier.height(6.dp))
                                        Text(
                                            stringResource(R.string.import_unmatched_hint),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                        item {
                            Column {
                                Button(
                                    onClick = viewModel::runImport,
                                    enabled = !busy && preview.planned.isNotEmpty(),
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text(stringResource(R.string.import_go, preview.planned.size)) }
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    stringResource(R.string.import_repeat_note),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** One role's column, chosen from the file's own header names. */
@Composable
private fun ColumnPicker(
    label: String,
    headers: List<String>,
    sample: List<String>?,
    selected: Int?,
    onPick: (Int?) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val none = stringResource(R.string.import_column_none)
    fun describe(index: Int): String {
        val header = headers.getOrNull(index).orEmpty().ifBlank { "#${index + 1}" }
        val example = sample?.getOrNull(index)?.trim().orEmpty()
        return if (example.isEmpty()) header else "$header  (e.g. $example)"
    }
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.width(120.dp), style = MaterialTheme.typography.bodyMedium)
        Box(modifier = Modifier.weight(1f)) {
            TextButton(onClick = { open = true }) {
                Text(
                    text = selected?.let(::describe) ?: none,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = if (selected == null) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.primary,
                )
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                DropdownMenuItem(text = { Text(none) }, onClick = {
                    open = false
                    onPick(null)
                })
                headers.indices.forEach { index ->
                    DropdownMenuItem(text = { Text(describe(index)) }, onClick = {
                        open = false
                        onPick(index)
                    })
                }
            }
        }
    }
}

private fun roleLabel(role: Role): Int = when (role) {
    Role.BARCODE -> R.string.role_barcode
    Role.SKU -> R.string.role_sku
    Role.NAME -> R.string.role_name
    Role.QUANTITY, Role.EXPECTED -> R.string.role_quantity
    Role.DATE -> R.string.role_date
    Role.UNIT -> R.string.role_unit
    Role.EXPIRY -> R.string.role_expiry
}

internal fun movementLabel(type: com.stockcheck.app.model.MovementType): Int = when (type) {
    com.stockcheck.app.model.MovementType.RECEIVE -> R.string.movement_receive
    com.stockcheck.app.model.MovementType.SALE -> R.string.movement_sale
    com.stockcheck.app.model.MovementType.REFUND -> R.string.movement_refund
    com.stockcheck.app.model.MovementType.WRITE_OFF -> R.string.movement_write_off
    com.stockcheck.app.model.MovementType.TRANSFER_OUT -> R.string.movement_transfer_out
    com.stockcheck.app.model.MovementType.TRANSFER_IN -> R.string.movement_transfer_in
}

/** The file's own name, so the import's record says which report it was. */
private fun displayName(context: android.content.Context, uri: Uri): String =
    runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment.orEmpty().ifEmpty { "file" }
