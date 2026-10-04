package com.stockcheck.app.ui.reports

import android.content.Intent
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.R
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.export.ExportFormat
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Quantity
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockComparison
import com.stockcheck.app.model.StockComparison.Kind
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import com.stockcheck.app.ui.common.StatusChip
import com.stockcheck.app.ui.common.TotalTile
import com.stockcheck.app.ui.stock.friendlyDate
import java.time.YearMonth

/**
 * What changed between last month and this one -- or between any two counts.
 *
 * Only finished counts stand for a month, and a product a later count did not
 * include reads as "not counted", never as a fall to zero: a report that
 * claims forty bags of rice vanished because nobody counted that aisle again
 * is a report a shop owner acts on, wrongly.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportsScreen(session: Session, onBack: () -> Unit) {
    val viewModel: ReportsViewModel = viewModel(factory = ReportsViewModel.factory(session))
    val state by viewModel.state.collectAsStateWithLifecycle()
    val mode by viewModel.mode.collectAsStateWithLifecycle()
    val beforeMonth by viewModel.beforeMonth.collectAsStateWithLifecycle()
    val afterMonth by viewModel.afterMonth.collectAsStateWithLifecycle()
    val branchId by viewModel.branchId.collectAsStateWithLifecycle()
    val branches by viewModel.branches.collectAsStateWithLifecycle()
    val checks by viewModel.checks.collectAsStateWithLifecycle()
    val beforeCheckId by viewModel.beforeCheckId.collectAsStateWithLifecycle()
    val afterCheckId by viewModel.afterCheckId.collectAsStateWithLifecycle()
    val changesOnly by viewModel.changesOnly.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val trend by viewModel.trend.collectAsStateWithLifecycle()
    val lastExport by viewModel.lastExport.collectAsStateWithLifecycle()

    val permissions = session.effectivePermissions
    val context = LocalContext.current
    var picking by remember { mutableStateOf<Side?>(null) }
    var exporting by remember { mutableStateOf(false) }

    LaunchedEffect(lastExport) {
        lastExport?.let { result ->
            context.startActivity(Intent.createChooser(viewModel.shareIntent(result), null))
            viewModel.clearExport()
        }
    }

    val beforeCheck = checks.firstOrNull { it.id == beforeCheckId }
    val afterCheck = checks.firstOrNull { it.id == afterCheckId }
    val branchName = branches.firstOrNull { it.id == branchId }?.name
    val beforeLabel = when (mode) {
        ReportMode.MONTHS -> beforeMonth.toString()
        ReportMode.COUNTS -> beforeCheck?.refNo ?: stringResource(R.string.reports_earlier)
    }
    val afterLabel = when (mode) {
        ReportMode.MONTHS -> afterMonth.toString()
        ReportMode.COUNTS -> afterCheck?.refNo ?: stringResource(R.string.reports_later)
    }
    val shown = if (changesOnly) state.rows.filter { it.kind != Kind.SAME } else state.rows

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.reports_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    if (permissions.has(Permission.VIEW_EXPORT) && state.rows.isNotEmpty()) {
                        IconButton(onClick = { exporting = true }) {
                            Icon(
                                Icons.Filled.FileDownload,
                                contentDescription = stringResource(R.string.reports_export),
                            )
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
            message?.let { text ->
                item { NoticeBar(text = text, tone = NoticeTone.ERROR) }
            }

            item {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(
                        selected = mode == ReportMode.MONTHS,
                        onClick = { viewModel.setMode(ReportMode.MONTHS) },
                        label = { Text(stringResource(R.string.reports_mode_months)) },
                    )
                    FilterChip(
                        selected = mode == ReportMode.COUNTS,
                        onClick = { viewModel.setMode(ReportMode.COUNTS) },
                        label = { Text(stringResource(R.string.reports_mode_counts)) },
                    )
                }
            }

            when (mode) {
                ReportMode.MONTHS -> {
                    item {
                        Column {
                            MonthStepper(
                                label = stringResource(R.string.reports_earlier),
                                month = beforeMonth,
                                onChange = viewModel::setBeforeMonth,
                                canGoForward = true,
                            )
                            MonthStepper(
                                label = stringResource(R.string.reports_later),
                                month = afterMonth,
                                onChange = viewModel::setAfterMonth,
                                canGoForward = afterMonth.isBefore(YearMonth.now()),
                            )
                        }
                    }
                    // Only when there is a choice to make: one branch, or
                    // none, is just the company.
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
                }
                ReportMode.COUNTS -> item {
                    Column {
                        CountChoice(
                            label = stringResource(R.string.reports_earlier),
                            check = beforeCheck,
                            onClick = { picking = Side.BEFORE },
                        )
                        CountChoice(
                            label = stringResource(R.string.reports_later),
                            check = afterCheck,
                            onClick = { picking = Side.AFTER },
                        )
                    }
                }
            }

            item {
                if (state.loading) {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                } else {
                    Spacer(Modifier.height(8.dp))
                }
            }

            val summary = state.summary
            if (summary == null || state.rows.isEmpty()) {
                if (!state.loading) {
                    item {
                        EmptyState(
                            icon = Icons.Filled.History,
                            title = stringResource(R.string.reports_nothing_title),
                            message = when (mode) {
                                ReportMode.MONTHS -> stringResource(
                                    R.string.reports_nothing_months,
                                    beforeLabel,
                                    afterLabel,
                                )
                                ReportMode.COUNTS -> stringResource(R.string.reports_nothing_counts)
                            },
                        )
                    }
                }
            } else {
                item {
                    SummaryCard(
                        summary = summary,
                        beforeLabel = beforeLabel + (branchName?.let { " · $it" } ?: ""),
                        afterLabel = afterLabel,
                        beforeCount = state.before.size,
                        afterCount = state.after.size,
                    )
                }
                // Said plainly, because a side with no counts makes the whole
                // list read as new or missing, which looks like a disaster
                // and is only an empty month.
                val emptySide = when {
                    state.before.isEmpty() -> beforeLabel
                    state.after.isEmpty() -> afterLabel
                    else -> null
                }
                emptySide?.let { side ->
                    item {
                        NoticeBar(text = stringResource(R.string.reports_one_side_empty, side))
                    }
                }
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        FilterChip(
                            selected = changesOnly,
                            onClick = { viewModel.setChangesOnly(!changesOnly) },
                            label = { Text(stringResource(R.string.reports_changes_only)) },
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.reports_trend_hint),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                items(shown, key = { it.key }) { row ->
                    ReportRow(row = row, onClick = { viewModel.openTrend(row) })
                }
                if (mode == ReportMode.MONTHS) {
                    item {
                        Text(
                            text = stringResource(R.string.reports_how_it_works),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }
            }
        }
    }

    picking?.let { side ->
        CountPicker(
            checks = checks,
            onDismiss = { picking = null },
            onPick = { check ->
                picking = null
                if (side == Side.BEFORE) viewModel.pickBefore(check) else viewModel.pickAfter(check)
            },
        )
    }

    trend?.let { current ->
        TrendDialog(trend = current, onDismiss = viewModel::closeTrend)
    }

    if (exporting) {
        val headers = listOf(
            stringResource(R.string.reports_col_product),
            stringResource(R.string.reports_col_barcode),
            stringResource(R.string.reports_col_unit),
            beforeLabel,
            afterLabel,
            stringResource(R.string.reports_col_change),
            stringResource(R.string.reports_col_note),
        )
        val newText = stringResource(R.string.reports_new)
        val notCountedText = stringResource(R.string.reports_not_counted)
        val run = { format: ExportFormat ->
            exporting = false
            viewModel.export(
                format = format,
                fileLabel = "$beforeLabel-vs-$afterLabel" + (branchName?.let { "-$it" } ?: ""),
                headers = headers,
                noteFor = { row ->
                    when (row.kind) {
                        Kind.NEW -> newText
                        Kind.NOT_COUNTED -> notCountedText
                        else -> ""
                    }
                },
            )
        }
        AlertDialog(
            onDismissRequest = { exporting = false },
            title = { Text(stringResource(R.string.reports_export_title)) },
            text = { Text("$beforeLabel → $afterLabel") },
            confirmButton = {
                Row {
                    if (permissions.has(Permission.EXPORT_CSV)) {
                        TextButton(onClick = { run(ExportFormat.CSV) }) { Text("CSV") }
                    }
                    if (permissions.has(Permission.EXPORT_EXCEL)) {
                        TextButton(onClick = { run(ExportFormat.XLSX) }) { Text("Excel") }
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { exporting = false }) { Text(stringResource(R.string.cancel)) }
            },
        )
    }
}

private enum class Side { BEFORE, AFTER }

@Composable
private fun MonthStepper(
    label: String,
    month: YearMonth,
    onChange: (YearMonth) -> Unit,
    canGoForward: Boolean,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.width(72.dp),
        )
        IconButton(onClick = { onChange(month.minusMonths(1)) }) {
            Icon(
                Icons.Filled.KeyboardArrowLeft,
                contentDescription = stringResource(R.string.reports_prev_month),
            )
        }
        Text(
            text = month.toString(),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        IconButton(onClick = { onChange(month.plusMonths(1)) }, enabled = canGoForward) {
            Icon(
                Icons.Filled.KeyboardArrowRight,
                contentDescription = stringResource(R.string.reports_next_month),
            )
        }
    }
}

@Composable
private fun CountChoice(label: String, check: StockCheck?, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            if (check == null) {
                Text(stringResource(R.string.reports_not_chosen), style = MaterialTheme.typography.bodyLarge)
            } else {
                Text(check.refNo, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = describe(check),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        }
    }
}

private fun describe(check: StockCheck): String =
    listOf(friendlyDate(check.createdAt), check.branchName, check.zone, check.templateName)
        .filter { it.isNotBlank() }
        .joinToString(" · ")

@Composable
private fun SummaryCard(
    summary: StockComparison.Summary,
    beforeLabel: String,
    afterLabel: String,
    beforeCount: Int,
    afterCount: Int,
) {
    val change = summary.afterTotal - summary.beforeTotal
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "$beforeLabel → $afterLabel",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = stringResource(R.string.reports_built_from, beforeCount, afterCount),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                TotalTile(stringResource(R.string.reports_total_before), Quantity.format(summary.beforeTotal))
                TotalTile(stringResource(R.string.reports_total_after), Quantity.format(summary.afterTotal))
                TotalTile(
                    stringResource(R.string.reports_total_change),
                    signed(change),
                    emphasis = true,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(
                    R.string.reports_summary,
                    summary.up,
                    summary.down,
                    summary.same,
                    summary.new,
                    summary.notCounted,
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun signed(milli: Long): String =
    if (milli > 0) "+" + Quantity.format(milli) else Quantity.format(milli)

@Composable
private fun ReportRow(row: StockComparison.Row, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(row.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (row.name.isNotEmpty() && row.barcode.isNotEmpty()) {
                Text(
                    text = row.barcode,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.End) {
            val before = row.before?.let(Quantity::format) ?: "—"
            val after = row.after?.let(Quantity::format) ?: "—"
            Text(
                text = "$before → $after" + if (row.unit.isNotBlank()) " ${row.unit}" else "",
                style = MaterialTheme.typography.bodyMedium,
            )
            val (text, color) = when (row.kind) {
                Kind.UP -> signed(row.change ?: 0L) to MaterialTheme.colorScheme.primary
                Kind.DOWN -> signed(row.change ?: 0L) to MaterialTheme.colorScheme.error
                Kind.SAME -> stringResource(R.string.reports_no_change) to MaterialTheme.colorScheme.outline
                Kind.NEW -> stringResource(R.string.reports_new) to MaterialTheme.colorScheme.primary
                Kind.NOT_COUNTED ->
                    stringResource(R.string.reports_not_counted) to MaterialTheme.colorScheme.outline
            }
            Text(
                text = text,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = color,
            )
        }
    }
    HorizontalDivider()
}

@Composable
private fun CountPicker(
    checks: List<StockCheck>,
    onDismiss: () -> Unit,
    onPick: (StockCheck) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.reports_pick_count)) },
        text = {
            LazyColumn(modifier = Modifier.heightIn(max = 440.dp)) {
                items(checks, key = { it.id }) { check ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(check) }
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(check.refNo, style = MaterialTheme.typography.titleSmall)
                            Text(
                                text = describe(check),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.outline,
                            )
                        }
                        StatusChip(check.statusEnum)
                    }
                    HorizontalDivider()
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        },
    )
}

/**
 * Six months as bars. Drawn with plain boxes: one product's monthly figure is
 * six numbers, and a chart library would be a dependency for six rectangles.
 */
@Composable
private fun TrendDialog(trend: TrendState, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(trend.row.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    text = stringResource(R.string.reports_trend_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        },
        text = {
            if (trend.loading) {
                Box(modifier = Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                val peak = trend.points.maxOfOrNull { it.quantity ?: 0L }?.takeIf { it > 0L } ?: 1L
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    trend.points.forEach { point ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = point.month.toString(),
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.width(64.dp),
                            )
                            Box(modifier = Modifier.weight(1f).height(16.dp)) {
                                val quantity = point.quantity
                                if (quantity != null && quantity > 0L) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth((quantity.toFloat() / peak).coerceIn(0.02f, 1f))
                                            .height(16.dp)
                                            .background(
                                                MaterialTheme.colorScheme.primary,
                                                RoundedCornerShape(3.dp),
                                            ),
                                    )
                                }
                            }
                            Text(
                                text = point.quantity?.let(Quantity::format) ?: "—",
                                style = MaterialTheme.typography.labelLarge,
                                modifier = Modifier.width(56.dp).padding(start = 8.dp),
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
        },
    )
}
