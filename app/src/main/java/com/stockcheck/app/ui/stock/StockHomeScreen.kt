package com.stockcheck.app.ui.stock

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.model.Template
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.StatusChip
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class StockHomeViewModel(private val session: Session) : ViewModel() {

    private val stock = ServiceLocator.stock
    private val templateRepo = ServiceLocator.templates

    val openChecks: StateFlow<List<StockCheck>> = stock.observeStockChecks(session)
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val templates: StateFlow<List<Template>> = templateRepo.observeTemplates(activeOnly = true)
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** Creates a check and hands its id back so the caller can navigate. */
    fun createCheck(template: Template, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            runCatching { stock.createStockCheck(session, template) }
                .onSuccess(onCreated)
                .onFailure { _error.value = it.message }
        }
    }

    /** Ensures the template picker is never empty on a brand-new workspace. */
    fun seedTemplatesIfNeeded() {
        viewModelScope.launch { runCatching { templateRepo.seedDefaults(session) } }
    }

    fun clearError() {
        _error.value = null
    }

    companion object {
        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                StockHomeViewModel(session) as T
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockHomeScreen(
    session: Session,
    onOpenCheck: (String) -> Unit,
) {
    val viewModel: StockHomeViewModel = viewModel(
        factory = StockHomeViewModel.factory(session),
    )
    val checks by viewModel.openChecks.collectAsStateWithLifecycle()
    val templates by viewModel.templates.collectAsStateWithLifecycle()
    var picking by remember { mutableStateOf(false) }

    // Anything not yet reviewed is still "on the floor" and belongs here; the
    // finished ones live on the History tab.
    val active = checks.filter {
        it.statusEnum == StockStatus.DRAFT || it.statusEnum == StockStatus.IN_PROGRESS
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Stock check") }) },
        floatingActionButton = {
            if (session.role.permissionSet.has(Permission.CREATE_STOCK_CHECK) ||
                session.role.id == "admin"
            ) {
                ExtendedFloatingActionButton(
                    onClick = {
                        viewModel.seedTemplatesIfNeeded()
                        picking = true
                    },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("New stock check") },
                )
            }
        },
    ) { padding ->
        if (active.isEmpty()) {
            EmptyState(
                icon = Icons.Filled.QrCodeScanner,
                title = "No stock check in progress",
                message = "Start one, pick a template, then scan barcodes and " +
                    "call out the quantities.",
                modifier = Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(active, key = { it.id }) { check ->
                    StockCheckCard(check = check, onClick = { onOpenCheck(check.id) })
                }
            }
        }
    }

    if (picking) {
        TemplatePickerDialog(
            templates = templates,
            onDismiss = { picking = false },
            onPick = { template ->
                picking = false
                viewModel.createCheck(template, onOpenCheck)
            },
        )
    }
}

@Composable
private fun TemplatePickerDialog(
    templates: List<Template>,
    onDismiss: () -> Unit,
    onPick: (Template) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose a template") },
        text = {
            if (templates.isEmpty()) {
                Text("No active templates yet. Create one on the Templates tab.")
            } else {
                Column {
                    templates.forEach { template ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onPick(template) }
                                .padding(vertical = 10.dp),
                        ) {
                            Text(template.name, style = MaterialTheme.typography.titleMedium)
                            if (template.description.isNotEmpty()) {
                                Text(
                                    text = template.description,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                text = "${template.fields.size} extra field" +
                                    (if (template.fields.size == 1) "" else "s") +
                                    if (template.photoRequired) " · photo required" else "",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.outline,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun StockCheckCard(check: StockCheck, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(check.refNo, style = MaterialTheme.typography.titleMedium)
                StatusChip(check.statusEnum)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = check.templateName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "${check.itemCount} products · ${check.totalQuantity} total · " +
                    "${check.photoCount} photos",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "${check.createdByName} · ${friendlyDate(check.createdAt)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

private val dayFormat = SimpleDateFormat("d MMM yyyy, HH:mm", Locale.getDefault())

internal fun friendlyDate(millis: Long): String =
    if (millis <= 0L) "—" else dayFormat.format(Date(millis))
