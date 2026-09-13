package com.stockcheck.app.ui.profile

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.HistoryEdu
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.model.BuiltInRoles
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.PermissionGroup
import com.stockcheck.app.model.Role
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.UserProfile
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import com.stockcheck.app.ui.stock.friendlyDate

/**
 * Page 5 — who you are and what that lets you do.
 *
 * The permission list is shown to every user, not just admins: a worker who
 * can see exactly which actions their role covers stops guessing why a button
 * is missing, and stops asking.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    session: Session,
    onSignOut: () -> Unit,
    onManageUsers: () -> Unit,
    onEditRole: (String) -> Unit,
    onViewAuditLog: () -> Unit,
) {
    val viewModel: ProfileViewModel = viewModel(factory = ProfileViewModel.factory(session))
    val roles by viewModel.roles.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()

    val permissions = session.effectivePermissions
    val granted = Permission.entries.filter { permissions.has(it) }

    Scaffold(topBar = { TopAppBar(title = { Text("Profile") }) }) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            message?.let { NoticeBar(text = it, tone = NoticeTone.ERROR) }

            Card(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = session.profile.displayName.ifEmpty { session.profile.email },
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        text = session.profile.email,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Badge, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = session.role.name.ifEmpty { session.profile.roleName },
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                    if (session.role.description.isNotEmpty()) {
                        Text(
                            text = session.role.description,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // ---------------------------------------------------- admin actions

            if (permissions.has(Permission.VIEW_USERS)) {
                ListItem(
                    headlineContent = { Text("Users") },
                    supportingContent = { Text("Assign roles, activate and deactivate") },
                    leadingContent = { Icon(Icons.Filled.Group, contentDescription = null) },
                    modifier = Modifier.clickable(onClick = onManageUsers),
                )
                HorizontalDivider()
            }
            if (permissions.has(Permission.VIEW_AUDIT_LOG)) {
                ListItem(
                    headlineContent = { Text("Audit log") },
                    supportingContent = { Text("Every change, who made it and when") },
                    leadingContent = { Icon(Icons.Filled.HistoryEdu, contentDescription = null) },
                    modifier = Modifier.clickable(onClick = onViewAuditLog),
                )
                HorizontalDivider()
            }

            // ----------------------------------------------------------- roles

            if (permissions.hasAny(Permission.CREATE_ROLE, Permission.EDIT_ROLE)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Roles", style = MaterialTheme.typography.titleMedium)
                    if (permissions.has(Permission.CREATE_ROLE)) {
                        TextButton(onClick = { onEditRole(ProfileViewModel.NEW_ROLE) }) {
                            Text("New role")
                        }
                    }
                }
                roles.forEach { role ->
                    ListItem(
                        headlineContent = { Text(role.name) },
                        supportingContent = {
                            Text(
                                if (role.id == BuiltInRoles.ADMIN_ID) {
                                    "Full control — cannot be edited"
                                } else {
                                    "${role.permissions.size} permissions"
                                },
                            )
                        },
                        leadingContent = {
                            Icon(Icons.Filled.AdminPanelSettings, contentDescription = null)
                        },
                        modifier = Modifier.clickable(
                            enabled = role.id != BuiltInRoles.ADMIN_ID,
                        ) { onEditRole(role.id) },
                    )
                    HorizontalDivider()
                }
            }

            // ------------------------------------------------ my own permissions

            Text(
                text = "What your role allows",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(16.dp),
            )
            PermissionGroup.entries.forEach { group ->
                val inGroup = granted.filter { it.group == group }
                if (inGroup.isEmpty()) return@forEach
                Text(
                    text = group.label,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
                inGroup.forEach { permission ->
                    Text(
                        text = "• ${permission.label}",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 24.dp, vertical = 2.dp),
                    )
                }
                Spacer(Modifier.height(8.dp))
            }

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(50.dp),
            ) {
                Icon(Icons.Filled.Logout, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Sign out")
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

// ------------------------------------------------------------ user admin

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserAdminScreen(session: Session, onBack: () -> Unit) {
    val viewModel: ProfileViewModel = viewModel(factory = ProfileViewModel.factory(session))
    val users by viewModel.users.collectAsStateWithLifecycle()
    val roles by viewModel.roles.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()

    val permissions = session.effectivePermissions
    var assigning by remember { mutableStateOf<UserProfile?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Users") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            message?.let { NoticeBar(text = it, tone = NoticeTone.ERROR) }
            NoticeBar(
                text = "New accounts register themselves and start as Worker. " +
                    "Promote them here.",
            )
            if (users.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.Group,
                    title = "No users",
                    message = "Ask your team to register from the sign-in screen.",
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
                    items(users, key = { it.uid }) { user ->
                        ListItem(
                            headlineContent = {
                                Text(user.displayName.ifEmpty { user.email })
                            },
                            supportingContent = {
                                Column {
                                    Text(user.email)
                                    Text(
                                        text = "Last seen ${friendlyDate(user.lastSeenAt)}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.outline,
                                    )
                                }
                            },
                            trailingContent = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    AssistChip(
                                        onClick = {
                                            if (permissions.has(Permission.CHANGE_PERMISSION)) {
                                                assigning = user
                                            }
                                        },
                                        label = { Text(user.roleName) },
                                    )
                                    if (permissions.has(Permission.EDIT_USER)) {
                                        Switch(
                                            checked = user.active,
                                            onCheckedChange = { viewModel.setActive(user, it) },
                                        )
                                    }
                                }
                            },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    assigning?.let { user ->
        AlertDialog(
            onDismissRequest = { assigning = null },
            title = { Text("Role for ${user.displayName.ifEmpty { user.email }}") },
            text = {
                Column {
                    roles.forEach { role ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    assigning = null
                                    viewModel.changeRole(user, role.id)
                                }
                                .padding(vertical = 12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(modifier = Modifier.width(220.dp)) {
                                Text(role.name)
                                Text(
                                    text = role.description,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (role.id == user.roleId) Text("✓")
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { assigning = null }) { Text("Cancel") } },
        )
    }
}

// ----------------------------------------------------------- role editor

/**
 * The permission matrix.
 *
 * Grouped by area rather than listed flat, because the question an admin
 * actually asks is "what may this role do with exports?", not "is
 * EXPORT_ALL_DATA on?".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoleEditorScreen(session: Session, roleId: String, onBack: () -> Unit) {
    val viewModel: ProfileViewModel = viewModel(factory = ProfileViewModel.factory(session))
    val draft by viewModel.roleDraft.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()

    LaunchedEffect(roleId) { viewModel.loadRole(roleId) }
    val role = draft

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (roleId == ProfileViewModel.NEW_ROLE) "New role" else "Edit role") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { viewModel.saveRole(onBack) }) { Text("Save") }
                },
            )
        },
        floatingActionButton = {
            if (role != null && !role.builtIn && roleId != ProfileViewModel.NEW_ROLE &&
                session.effectivePermissions.has(Permission.DELETE_ROLE)
            ) {
                ExtendedFloatingActionButton(
                    onClick = { viewModel.deleteRole(onBack) },
                    text = { Text("Delete role") },
                    icon = { Icon(Icons.Filled.AdminPanelSettings, contentDescription = null) },
                )
            }
        },
    ) { padding ->
        if (role == null) {
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
                value = role.name,
                onValueChange = { name -> viewModel.updateRole { it.copy(name = name) } },
                label = { Text("Role name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = role.description,
                onValueChange = { text -> viewModel.updateRole { it.copy(description = text) } },
                label = { Text("Description") },
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(20.dp))
            val granted = role.permissions.toSet()

            PermissionGroup.entries.forEach { group ->
                Text(
                    text = group.label,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
                Permission.entries.filter { it.group == group }.forEach { permission ->
                    val on = permission.name in granted
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { viewModel.togglePermission(permission, !on) }
                            .padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = permission.label,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.weight(1f),
                        )
                        Switch(
                            checked = on,
                            onCheckedChange = { viewModel.togglePermission(permission, it) },
                        )
                    }
                }
                HorizontalDivider()
            }
            Spacer(Modifier.height(80.dp))
        }
    }
}

// ------------------------------------------------------------- audit log

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuditLogScreen(session: Session, onBack: () -> Unit) {
    val viewModel: ProfileViewModel = viewModel(factory = ProfileViewModel.factory(session))
    val entries by viewModel.auditEntries.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Audit log") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        if (entries.isEmpty()) {
            EmptyState(
                icon = Icons.Filled.HistoryEdu,
                title = "Nothing recorded yet",
                message = "Every create, edit, delete, status change and export " +
                    "will be listed here.",
                modifier = Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                modifier = Modifier.padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(entries, key = { it.id }) { entry ->
                    Column {
                        Text(
                            text = "${entry.actorName} · ${friendlyDate(entry.at)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                        )
                        Text(
                            text = buildString {
                                append(entry.actionEnum.label)
                                append(' ')
                                append(entry.entity)
                                if (entry.entityLabel.isNotEmpty()) {
                                    append(" \"${entry.entityLabel}\"")
                                }
                            },
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        if (entry.field.isNotEmpty()) {
                            Text(
                                text = "${entry.field}: " +
                                    entry.oldValue.ifEmpty { "—" } +
                                    " → " +
                                    entry.newValue.ifEmpty { "—" },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        HorizontalDivider(modifier = Modifier.padding(top = 8.dp))
                    }
                }
            }
        }
    }
}
