package com.stockcheck.app.ui.inventory

import android.app.DatePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.R
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.data.can
import com.stockcheck.app.export.MovementFile
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import com.stockcheck.app.pos.LoyverseSettings
import com.stockcheck.app.pos.SyncResult
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import com.stockcheck.app.ui.stock.friendlyDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

class PosViewModel(private val session: Session) : ViewModel() {

    private val sync = ServiceLocator.loyverse

    val canConnect: Boolean = session.can(Permission.CHANGE_PERMISSION)

    val settings: StateFlow<LoyverseSettings?> = (if (canConnect) sync.observe() else flowOf(null))
        .catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val branches: StateFlow<List<Branch>> = ServiceLocator.users.observeConfig()
        .map { it?.branches.orEmpty() }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _result = MutableStateFlow<SyncResult?>(null)
    val result: StateFlow<SyncResult?> = _result.asStateFlow()

    private fun whileBusy(block: suspend () -> Unit) {
        if (_busy.value) return
        _busy.value = true
        _message.value = null
        viewModelScope.launch {
            runCatching { block() }.onFailure { _message.value = it.message }
            _busy.value = false
        }
    }

    fun connect(token: String, from: LocalDate) = whileBusy { sync.connect(session, token, from) }

    fun setStoreBranch(storeId: String, branchId: String) = whileBusy { sync.setStoreBranch(session, storeId, branchId) }

    fun syncNow() = whileBusy { _result.value = sync.sync(session) }

    fun disconnect() = whileBusy { sync.disconnect(session) }

    companion object {
        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                PosViewModel(session) as T
        }
    }
}

/**
 * Connecting a till, so sales arrive without anyone exporting a file.
 *
 * Loyverse connects directly. The others are listed honestly as what they are
 * today: their sales report, imported as a file, until each provider opens
 * access that has been built against and tested.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosConnectScreen(
    session: Session,
    onBack: () -> Unit,
    onImport: (MovementFile.Kind) -> Unit,
) {
    val viewModel: PosViewModel = viewModel(factory = PosViewModel.factory(session))
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val branches by viewModel.branches.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val result by viewModel.result.collectAsStateWithLifecycle()
    val context = LocalContext.current

    var token by remember { mutableStateOf("") }
    var from by remember { mutableStateOf(LocalDate.now().minusDays(30)) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.pos_title)) },
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
            if (busy) item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }

            item {
                Card {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Loyverse", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(6.dp))
                        val connected = settings?.takeIf { it.token.isNotBlank() }
                        when {
                            !viewModel.canConnect -> Text(
                                stringResource(R.string.pos_admin_only),
                                style = MaterialTheme.typography.bodyMedium,
                            )

                            connected == null -> {
                                Text(stringResource(R.string.pos_loyverse_intro), style = MaterialTheme.typography.bodyMedium)
                                Spacer(Modifier.height(8.dp))
                                OutlinedTextField(
                                    value = token,
                                    onValueChange = { token = it.trim() },
                                    label = { Text(stringResource(R.string.pos_token)) },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        stringResource(R.string.pos_start_from),
                                        modifier = Modifier.weight(1f),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    TextButton(
                                        onClick = {
                                            DatePickerDialog(
                                                context,
                                                { _, year, month, day -> from = LocalDate.of(year, month + 1, day) },
                                                from.year,
                                                from.monthValue - 1,
                                                from.dayOfMonth,
                                            ).show()
                                        },
                                    ) { Text(from.toString()) }
                                }
                                Button(
                                    onClick = { viewModel.connect(token, from) },
                                    enabled = token.isNotBlank() && !busy,
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text(stringResource(R.string.pos_connect)) }
                            }

                            else -> {
                                Text(
                                    stringResource(R.string.pos_connected),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                                Text(
                                    text = if (connected.lastSyncedAt == 0L) {
                                        stringResource(R.string.pos_never_synced)
                                    } else {
                                        stringResource(
                                            R.string.pos_last_sync,
                                            friendlyDate(connected.lastSyncedAt),
                                            connected.lastResult,
                                        )
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.outline,
                                )
                                result?.let {
                                    Text(
                                        stringResource(R.string.pos_sync_done, it.newProducts, it.renamedProducts, it.stockLevels ?: 0, it.productDays),
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                if (branches.isNotEmpty()) {
                                    connected.stores.forEach { (storeId, storeName) ->
                                        Spacer(Modifier.height(8.dp))
                                        Text(storeName, style = MaterialTheme.typography.labelLarge)
                                        val chosen = connected.storeBranches[storeId].orEmpty()
                                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            item {
                                                FilterChip(
                                                    selected = chosen.isEmpty(),
                                                    onClick = { viewModel.setStoreBranch(storeId, "") },
                                                    label = { Text(stringResource(R.string.pos_main_shop)) },
                                                )
                                            }
                                            items(branches, key = { it.id }) { branch ->
                                                FilterChip(
                                                    selected = chosen == branch.id,
                                                    onClick = { viewModel.setStoreBranch(storeId, branch.id) },
                                                    label = { Text(branch.name) },
                                                )
                                            }
                                        }
                                    }
                                }
                                Spacer(Modifier.height(12.dp))
                                Button(
                                    onClick = viewModel::syncNow,
                                    enabled = !busy,
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text(stringResource(R.string.pos_sync_now)) }
                                TextButton(onClick = viewModel::disconnect, enabled = !busy) {
                                    Text(stringResource(R.string.pos_disconnect), color = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }

            item {
                Card {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(stringResource(R.string.pos_others_title), style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(6.dp))
                        Text(stringResource(R.string.pos_others_body), style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = { onImport(MovementFile.Kind.SALES) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(stringResource(R.string.levels_import_sales)) }
                    }
                }
            }
        }
    }
}
