package com.stockcheck.app.ui.template

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.model.FieldType
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Role
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.Template
import com.stockcheck.app.model.TemplateField
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class TemplateViewModel(private val session: Session) : ViewModel() {

    private val repo = ServiceLocator.templates
    private val users = ServiceLocator.users

    val templates: StateFlow<List<Template>> = repo.observeTemplates()
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val roles: StateFlow<List<Role>> = users.observeRoles()
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _editing = MutableStateFlow<Template?>(null)
    val editing: StateFlow<Template?> = _editing.asStateFlow()

    fun load(templateId: String) {
        viewModelScope.launch {
            _editing.value = if (templateId == NEW_TEMPLATE) {
                Template(name = "", fields = listOf(blankField(0)))
            } else {
                repo.getTemplate(templateId) ?: Template(name = "", fields = listOf(blankField(0)))
            }
        }
    }

    fun update(transform: (Template) -> Template) {
        _editing.value = _editing.value?.let(transform)
    }

    fun save(onSaved: () -> Unit) {
        val template = _editing.value ?: return
        viewModelScope.launch {
            runCatching { repo.save(session, template) }
                .onSuccess { onSaved() }
                .onFailure { _message.value = it.message }
        }
    }

    fun setActive(template: Template, active: Boolean) {
        viewModelScope.launch {
            runCatching { repo.setActive(session, template, active) }
                .onFailure { _message.value = it.message }
        }
    }

    fun delete(template: Template) {
        viewModelScope.launch {
            runCatching { repo.delete(session, template) }
                .onFailure { _message.value = it.message }
        }
    }

    fun clearMessage() {
        _message.value = null
    }

    companion object {
        const val NEW_TEMPLATE = "new"

        fun blankField(order: Int) = TemplateField(
            key = "field_${order + 1}",
            label = "",
            type = FieldType.TEXT.name,
            order = order,
        )

        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                TemplateViewModel(session) as T
        }
    }
}

// ------------------------------------------------------------------- list

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TemplateListScreen(
    session: Session,
    onSeedDefaults: () -> Unit,
    onEdit: (String) -> Unit,
) {
    val viewModel: TemplateViewModel = viewModel(factory = TemplateViewModel.factory(session))
    val templates by viewModel.templates.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val permissions = session.effectivePermissions

    LaunchedEffect(Unit) { onSeedDefaults() }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Templates") }) },
        floatingActionButton = {
            if (permissions.has(Permission.CREATE_TEMPLATE)) {
                ExtendedFloatingActionButton(
                    onClick = { onEdit(TemplateViewModel.NEW_TEMPLATE) },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("New template") },
                )
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            message?.let {
                NoticeBar(text = it, tone = NoticeTone.ERROR)
            }
            if (templates.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.Description,
                    title = "No templates",
                    message = "A template decides which fields a stock check collects " +
                        "and whether photos are compulsory.",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(templates, key = { it.id }) { template ->
                        TemplateCard(
                            template = template,
                            canEdit = permissions.has(Permission.EDIT_TEMPLATE),
                            canDelete = permissions.has(Permission.DELETE_TEMPLATE),
                            onEdit = { onEdit(template.id) },
                            onToggleActive = { viewModel.setActive(template, it) },
                            onDelete = { viewModel.delete(template) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TemplateCard(
    template: Template,
    canEdit: Boolean,
    canDelete: Boolean,
    onEdit: () -> Unit,
    onToggleActive: (Boolean) -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(enabled = canEdit, onClick = onEdit)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(template.name, style = MaterialTheme.typography.titleMedium)
                if (canEdit) {
                    Switch(checked = template.active, onCheckedChange = onToggleActive)
                }
            }
            if (template.description.isNotEmpty()) {
                Text(
                    text = template.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AssistChip(
                    onClick = {},
                    label = { Text("${template.fields.size} fields") },
                )
                if (template.photoRequired) {
                    AssistChip(
                        onClick = {},
                        label = { Text("${template.minPhotos} photo min") },
                    )
                }
                if (!template.active) {
                    AssistChip(onClick = {}, label = { Text("Inactive") })
                }
            }
            if (canDelete) {
                TextButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text("Delete")
                }
            }
        }
    }
}

// ----------------------------------------------------------------- editor

/**
 * Page 3 — the template editor.
 *
 * Two settings here reach into other pages: `photoRequired` is what stops a
 * check being completed without evidence on Page 2, and each field's
 * `lockedForRoleIds` is what greys a column out for a role on Page 4 and
 * locks the corresponding cell in the exported spreadsheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TemplateEditorScreen(
    session: Session,
    templateId: String,
    onDone: () -> Unit,
) {
    val viewModel: TemplateViewModel = viewModel(factory = TemplateViewModel.factory(session))
    val template by viewModel.editing.collectAsStateWithLifecycle()
    val roles by viewModel.roles.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()

    LaunchedEffect(templateId) { viewModel.load(templateId) }

    val current = template
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (templateId == TemplateViewModel.NEW_TEMPLATE) "New template" else "Edit template")
                },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { viewModel.save(onDone) }) { Text("Save") }
                },
            )
        },
    ) { padding ->
        if (current == null) {
            Spacer(Modifier.fillMaxSize())
            return@Scaffold
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            message?.let {
                NoticeBar(text = it, tone = NoticeTone.ERROR)
                Spacer(Modifier.height(12.dp))
            }

            OutlinedTextField(
                value = current.name,
                onValueChange = { name -> viewModel.update { it.copy(name = name) } },
                label = { Text("Template name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = current.description,
                onValueChange = { text -> viewModel.update { it.copy(description = text) } },
                label = { Text("Description") },
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(20.dp))
            Text("Camera", style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Photo required", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        text = "A check using this template cannot be completed until " +
                            "the photos have been taken.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = current.photoRequired,
                    onCheckedChange = { on -> viewModel.update { it.copy(photoRequired = on) } },
                )
            }
            if (current.photoRequired) {
                OutlinedTextField(
                    value = current.minPhotos.toString(),
                    onValueChange = { raw ->
                        val n = raw.filter(Char::isDigit).toIntOrNull() ?: 1
                        viewModel.update { it.copy(minPhotos = n.coerceIn(1, 20)) }
                    },
                    label = { Text("Minimum photos") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(180.dp),
                )
            }

            Spacer(Modifier.height(20.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Fields", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = "Barcode, product, quantity and unit are always collected. " +
                            "Add the extras this count needs.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(
                    onClick = {
                        viewModel.update { t ->
                            t.copy(
                                fields = t.fields + TemplateViewModel.blankField(t.fields.size),
                            )
                        }
                    },
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "Add field")
                }
            }

            current.fields.forEachIndexed { index, field ->
                FieldEditor(
                    field = field,
                    roles = roles,
                    canMoveUp = index > 0,
                    canMoveDown = index < current.fields.lastIndex,
                    onChange = { updated ->
                        viewModel.update { t ->
                            t.copy(
                                fields = t.fields.toMutableList().also { it[index] = updated },
                            )
                        }
                    },
                    onMove = { delta ->
                        viewModel.update { t ->
                            val list = t.fields.toMutableList()
                            val target = index + delta
                            if (target in list.indices) {
                                val moved = list.removeAt(index)
                                list.add(target, moved)
                            }
                            t.copy(fields = list)
                        }
                    },
                    onRemove = {
                        viewModel.update { t ->
                            t.copy(fields = t.fields.filterIndexed { i, _ -> i != index })
                        }
                    },
                )
            }

            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { viewModel.save(onDone) },
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) { Text("Save template") }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun FieldEditor(
    field: TemplateField,
    roles: List<Role>,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onChange: (TemplateField) -> Unit,
    onMove: (Int) -> Unit,
    onRemove: () -> Unit,
) {
    var typeMenu by remember { mutableStateOf(false) }
    var lockDialog by remember { mutableStateOf(false) }

    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = field.label,
                    onValueChange = { label ->
                        // The stored key is derived from the label but frozen
                        // once set, so renaming a field on screen never orphans
                        // the values already recorded against it.
                        onChange(
                            field.copy(
                                label = label,
                                key = field.key.ifEmpty { slug(label) },
                            ),
                        )
                    },
                    label = { Text("Field name") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { onMove(-1) }, enabled = canMoveUp) {
                    Icon(Icons.Filled.ArrowUpward, contentDescription = "Move up")
                }
                IconButton(onClick = { onMove(1) }, enabled = canMoveDown) {
                    Icon(Icons.Filled.ArrowDownward, contentDescription = "Move down")
                }
                IconButton(onClick = onRemove) {
                    Icon(Icons.Filled.Delete, contentDescription = "Remove field")
                }
            }

            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box {
                    AssistChip(
                        onClick = { typeMenu = true },
                        label = { Text(field.typeEnum.label) },
                    )
                    DropdownMenu(expanded = typeMenu, onDismissRequest = { typeMenu = false }) {
                        FieldType.entries.forEach { type ->
                            DropdownMenuItem(
                                text = { Text(type.label) },
                                onClick = {
                                    typeMenu = false
                                    onChange(field.copy(type = type.name))
                                },
                            )
                        }
                    }
                }
                Spacer(Modifier.width(8.dp))
                FilterChip(
                    selected = field.required,
                    onClick = { onChange(field.copy(required = !field.required)) },
                    label = { Text("Required") },
                )
                Spacer(Modifier.width(8.dp))
                FilterChip(
                    selected = field.includeInExport,
                    onClick = { onChange(field.copy(includeInExport = !field.includeInExport)) },
                    label = { Text("In export") },
                )
            }

            if (field.typeEnum == FieldType.DROPDOWN) {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = field.options.joinToString(", "),
                    onValueChange = { raw ->
                        onChange(
                            field.copy(
                                options = raw.split(',')
                                    .map(String::trim)
                                    .filter(String::isNotEmpty),
                            ),
                        )
                    },
                    label = { Text("Options, comma separated") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { lockDialog = true }) {
                Text(
                    if (field.lockedForRoleIds.isEmpty()) {
                        "Editable by every role"
                    } else {
                        "Locked for ${field.lockedForRoleIds.size} role(s)"
                    },
                )
            }
        }
    }

    if (lockDialog) {
        RoleLockDialog(
            roles = roles,
            lockedIds = field.lockedForRoleIds,
            onDismiss = { lockDialog = false },
            onConfirm = { locked ->
                lockDialog = false
                onChange(field.copy(lockedForRoleIds = locked))
            },
        )
    }
}

@Composable
private fun RoleLockDialog(
    roles: List<Role>,
    lockedIds: List<String>,
    onDismiss: () -> Unit,
    onConfirm: (List<String>) -> Unit,
) {
    var locked by remember { mutableStateOf(lockedIds.toSet()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Who may not edit this field") },
        text = {
            Column {
                Text(
                    text = "A locked field is read-only in the app for these roles, and " +
                        "its cell is locked in the exported spreadsheet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                roles.forEach { role ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                locked = if (role.id in locked) locked - role.id else locked + role.id
                            }
                            .padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(role.name)
                        Switch(
                            checked = role.id in locked,
                            onCheckedChange = { on ->
                                locked = if (on) locked + role.id else locked - role.id
                            },
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(locked.toList()) }) { Text("Done") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Turns a label into a stable storage key. */
private fun slug(label: String): String =
    label.lowercase()
        .map { if (it.isLetterOrDigit()) it else '_' }
        .joinToString("")
        .trim('_')
        .ifEmpty { "field" }
