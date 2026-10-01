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
import androidx.compose.material.icons.filled.Help
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
import android.content.Intent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material.icons.filled.CloudOff
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.Licence
import com.stockcheck.app.model.LicenceStatus
import com.stockcheck.app.model.Plan
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.res.stringResource
import com.stockcheck.app.R
import com.stockcheck.app.ui.i18n.AppLanguage
import com.stockcheck.app.ui.i18n.LocalLanguageSetting
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
    busy: Boolean,
    passwordError: String?,
    onChangePassword: (current: String, new: String, confirm: String, done: () -> Unit) -> Unit,
    onSignOut: () -> Unit,
    onManageUsers: () -> Unit,
    onEditRole: (String) -> Unit,
    onViewAuditLog: () -> Unit,
    onOpenOnboarding: () -> Unit,
) {
    var changingPassword by remember { mutableStateOf(false) }
    var backingUp by remember { mutableStateOf(false) }
    var deletingAccount by remember { mutableStateOf(false) }
    val viewModel: ProfileViewModel = viewModel(factory = ProfileViewModel.factory(session))
    val roles by viewModel.roles.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()

    val permissions = session.effectivePermissions
    val granted = Permission.entries.filter { permissions.has(it) }

    Scaffold(topBar = { TopAppBar(title = { Text(stringResource(R.string.tab_profile)) }) }) { padding ->
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

            val licence by viewModel.licence.collectAsStateWithLifecycle()
            licence?.let { PlanCard(it) }

            ListItem(
                headlineContent = { Text(stringResource(R.string.onboarding_how_to_use)) },
                supportingContent = { Text(stringResource(R.string.onboarding_how_to_use_sub)) },
                leadingContent = { Icon(Icons.Filled.Help, contentDescription = null) },
                modifier = Modifier.clickable(onClick = onOpenOnboarding),
            )
            HorizontalDivider()

            ListItem(
                headlineContent = { Text(stringResource(R.string.change_password)) },
                supportingContent = { Text("You will need your current one") },
                leadingContent = { Icon(Icons.Filled.Badge, contentDescription = null) },
                modifier = Modifier.clickable { changingPassword = true },
            )
            HorizontalDivider()

            // ------------------------------------------------- company code

            if (permissions.has(Permission.CHANGE_PERMISSION)) {
                val config by viewModel.config.collectAsStateWithLifecycle()
                var editingCode by remember { mutableStateOf(false) }

                Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Company code", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "New staff must type this to register. Without one set, " +
                                "anyone who has the app can join this workspace.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text(
                                    text = config?.joinCode?.takeIf { it.isNotEmpty() }
                                        ?: "Not set",
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = if (config?.joinCode.isNullOrEmpty()) {
                                        MaterialTheme.colorScheme.error
                                    } else {
                                        MaterialTheme.colorScheme.primary
                                    },
                                )
                                config?.companyName?.takeIf { it.isNotEmpty() }?.let {
                                    Text(it, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                            TextButton(onClick = { editingCode = true }) {
                                Text(if (config?.joinCode.isNullOrEmpty()) "Set code" else "Change")
                            }
                        }
                    }
                }

                if (editingCode) {
                    CompanyCodeDialog(
                        current = config,
                        onDismiss = { editingCode = false },
                        onSave = { name, code, exportPassword ->
                            viewModel.saveCompanyCode(name, code, exportPassword) {
                                editingCode = false
                            }
                        },
                    )
                }
                Spacer(Modifier.height(8.dp))

                // Branches, for a company that runs more than one place.
                // Deliberately a card that starts empty and says what it is
                // for: most customers have one shop and should never have to
                // think about this, and a list of branches nobody set up
                // would only be a question with no answer.
                var addingBranch by remember { mutableStateOf(false) }
                var renaming by remember { mutableStateOf<Branch?>(null) }
                val branches = config?.branches.orEmpty()

                Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Branches", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = if (branches.isEmpty()) {
                                "Add one for each shop or warehouse. Leave this empty if " +
                                    "you count in one place — nobody will be asked which."
                            } else {
                                "A count records which branch it covered, and a worker can " +
                                    "be limited to their own."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        branches.forEach { branch ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = branch.name,
                                        style = MaterialTheme.typography.bodyLarge,
                                    )
                                    if (!branch.active) {
                                        Text(
                                            text = "Closed — its past counts are still here",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                TextButton(onClick = { renaming = branch }) { Text("Rename") }
                                TextButton(
                                    onClick = {
                                        viewModel.setBranchActive(branch, !branch.active)
                                    },
                                ) { Text(if (branch.active) "Close" else "Reopen") }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        TextButton(onClick = { addingBranch = true }) { Text("Add a branch") }
                    }
                }

                if (addingBranch || renaming != null) {
                    BranchNameDialog(
                        existing = renaming,
                        onDismiss = {
                            addingBranch = false
                            renaming = null
                        },
                        onSave = { name ->
                            viewModel.saveBranch(name, renaming?.id.orEmpty()) {
                                addingBranch = false
                                renaming = null
                            }
                        },
                    )
                }
                Spacer(Modifier.height(8.dp))
            }

            // ---------------------------------------------------- admin actions

            if (permissions.has(Permission.VIEW_USERS)) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.users)) },
                    supportingContent = { Text("Assign roles, activate and deactivate") },
                    leadingContent = { Icon(Icons.Filled.Group, contentDescription = null) },
                    modifier = Modifier.clickable(onClick = onManageUsers),
                )
                HorizontalDivider()
            }
            if (permissions.has(Permission.VIEW_AUDIT_LOG)) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.audit_log)) },
                    supportingContent = { Text("Every change, who made it and when") },
                    leadingContent = { Icon(Icons.Filled.HistoryEdu, contentDescription = null) },
                    modifier = Modifier.clickable(onClick = onViewAuditLog),
                )
                HorizontalDivider()
            }

            // ---------------------------------------------------------- backup

            if (permissions.has(Permission.EXPORT_ALL_DATA)) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.back_up_everything)) },
                    supportingContent = {
                        Text("One file with all records and this phone's photos")
                    },
                    leadingContent = { Icon(Icons.Filled.CloudOff, contentDescription = null) },
                    modifier = Modifier.clickable { backingUp = true },
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

            Spacer(Modifier.height(24.dp))
            LanguageSection()

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(50.dp),
            ) {
                Icon(Icons.Filled.Logout, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.sign_out))
            }
            Spacer(Modifier.height(8.dp))
            // Google Play requires an in-app route to close your own account.
            // Kept plain and below signing out: it is a real door, not one to
            // decorate or to put where a thumb finds it by accident.
            TextButton(
                onClick = { deletingAccount = true },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            ) {
                Text(
                    text = "Delete my account",
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Spacer(Modifier.height(32.dp))
        }
    }

    if (deletingAccount) {
        DeleteAccountDialog(
            busy = viewModel.deletingAccount.collectAsStateWithLifecycle().value,
            onDismiss = { deletingAccount = false },
            onConfirm = { password ->
                viewModel.deleteOwnAccount(password) { deletingAccount = false }
            },
        )
    }

    if (changingPassword) {
        ChangePasswordDialog(
            busy = busy,
            error = passwordError,
            onDismiss = { changingPassword = false },
            onConfirm = { current, next, confirm ->
                onChangePassword(current, next, confirm) { changingPassword = false }
            },
        )
    }

    if (backingUp) {
        BackupDialog(
            viewModel = viewModel,
            onDismiss = { backingUp = false },
        )
    }
}

/**
 * Takes the whole company's data off the phone.
 *
 * Presented plainly rather than reassuringly: the free Firestore plan has no
 * automatic backup at all, and photos only ever exist on the phone that took
 * them. Someone has to do this deliberately and keep the file somewhere else,
 * so the dialog says that instead of implying the app has it covered.
 */
@Composable
private fun BackupDialog(
    viewModel: ProfileViewModel,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val busy by viewModel.backupBusy.collectAsStateWithLifecycle()
    val result by viewModel.backupResult.collectAsStateWithLifecycle()
    var includePhotos by remember { mutableStateOf(true) }
    var encrypt by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!busy) { viewModel.clearBackupResult(); onDismiss() } },
        title = { Text(if (result == null) "Back up everything" else "Backup ready") },
        text = {
            Column {
                val finished = result
                if (finished == null) {
                    Text(
                        "One zip file containing every stock check, item, product, " +
                            "template, user, role and audit entry - and the photos " +
                            "this phone still holds.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = includePhotos, onCheckedChange = { includePhotos = it })
                        Column(modifier = Modifier.padding(start = 4.dp)) {
                            Text("Include photos", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "Much larger file, but photos exist nowhere else.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = encrypt, onCheckedChange = { encrypt = it })
                        Column(modifier = Modifier.padding(start = 4.dp)) {
                            Text(
                                "Encrypt with the company password",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Text(
                                "AES-256. Without the password the file cannot be opened " +
                                    "at all - including by you.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (busy) {
                        Spacer(Modifier.height(12.dp))
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                        Text(
                            "Reading everything. This can take a while on a big company.",
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                } else {
                    Text(
                        "${finished.stockCheckCount} stock checks, " +
                            "${finished.itemCount} counted lines, " +
                            "${finished.photosIncluded} of ${finished.photoCount} photos.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "${finished.sizeBytes / 1024} KB" +
                            (if (finished.encrypted) " - encrypted" else ""),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (finished.photosIncluded < finished.photoCount) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "${finished.photoCount - finished.photosIncluded} photos were " +
                                "taken on another phone and are not in this file. Run a " +
                                "backup from that phone too.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Send it somewhere off this phone. A backup that stays here is " +
                            "lost with the phone.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            val finished = result
            if (finished == null) {
                TextButton(
                    enabled = !busy,
                    onClick = { viewModel.runBackup(includePhotos, encrypt) },
                ) { Text(if (busy) "Working..." else "Back up") }
            } else {
                TextButton(
                    onClick = {
                        viewModel.shareBackup()?.let { intent ->
                            context.startActivity(
                                Intent.createChooser(intent, "Send backup"),
                            )
                        }
                    },
                ) { Text("Send") }
            }
        },
        dismissButton = {
            TextButton(
                enabled = !busy,
                onClick = {
                    viewModel.clearBackupResult()
                    onDismiss()
                },
            ) { Text(if (result == null) "Cancel" else "Done") }
        },
    )
}

/**
 * Picking the language the app speaks.
 *
 * Each language is named in itself — somebody hunting for their own is not
 * helped by seeing it written in one they cannot read — and the change lands
 * on the next frame rather than after a restart, because the person changing
 * it is usually looking at words they do not understand.
 *
 * "Follow phone" is the default and stays first: a phone already set to Malay
 * should open in Malay without anyone being asked.
 */
@Composable
private fun LanguageSection() {
    val setting = LocalLanguageSetting.current

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(
            text = stringResource(R.string.language),
            style = MaterialTheme.typography.titleSmall,
        )
        Spacer(Modifier.height(4.dp))

        LanguageRow(
            label = stringResource(R.string.language_follow_phone),
            selected = setting.current == null,
            onClick = { setting.set(null) },
        )
        AppLanguage.entries.forEach { language ->
            LanguageRow(
                label = language.label,
                selected = setting.current == language,
                onClick = { setting.set(language) },
            )
        }

        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.language_follow_phone_note),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LanguageRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurface
            },
        )
    }
}

/**
 * Closing your own account, with the two things that stop it being an accident:
 * the password, and a plain statement of what does and does not disappear.
 *
 * The audit entries stay. Saying so here, rather than only in a policy nobody
 * opens, is the difference between a retention someone agreed to and one they
 * find out about later.
 */
@Composable
private fun DeleteAccountDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var password by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(stringResource(R.string.delete_my_account)) },
        text = {
            Column {
                NoticeBar(
                    text = "This cannot be undone.",
                    tone = NoticeTone.ERROR,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "Your sign-in and your profile are deleted: your email, " +
                        "your password and your name on this workspace.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "The stock counts you recorded stay, and so do the audit " +
                        "entries showing what was counted and when. They are the " +
                        "company's record of its own stock, and the trail cannot be " +
                        "edited by anyone, which is what makes it worth keeping.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text(stringResource(R.string.your_password)) },
                    singleLine = true,
                    enabled = !busy,
                    supportingText = { Text("Confirms it is really you") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(password) },
                enabled = !busy && password.isNotBlank(),
            ) {
                Text(
                    text = if (busy) "Deleting…" else "Delete my account",
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text("Keep my account") }
        },
    )
}

/**
 * Changing one's own password.
 *
 * The current password is asked for because Firebase requires a recent login
 * to change one, and because a phone left unlocked on a bench should not be
 * enough to take over the account.
 */
@Composable
private fun ChangePasswordDialog(
    busy: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onConfirm: (current: String, next: String, confirm: String) -> Unit,
) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }

    val matches = next == confirm
    val valid = current.isNotBlank() && next.length >= 6 && matches

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Change password") },
        text = {
            Column {
                error?.let {
                    NoticeBar(text = it, tone = NoticeTone.ERROR)
                    Spacer(Modifier.height(10.dp))
                }
                OutlinedTextField(
                    value = current,
                    onValueChange = { current = it },
                    label = { Text("Current password") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = next,
                    onValueChange = { next = it },
                    label = { Text("New password") },
                    singleLine = true,
                    supportingText = { Text("At least 6 characters") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = confirm,
                    onValueChange = { confirm = it },
                    label = { Text("Confirm new password") },
                    singleLine = true,
                    isError = confirm.isNotEmpty() && !matches,
                    supportingText = {
                        if (confirm.isNotEmpty() && !matches) Text("The two do not match.")
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Nobody, including an administrator, can see this password. " +
                        "Only the fact that you changed it is recorded.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(current, next, confirm) },
                enabled = valid && !busy,
            ) { Text(if (busy) "Saving…" else "Change") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/**
 * Names a shop or warehouse.
 *
 * Renaming rather than deleting-and-adding is the whole point of having it:
 * the id stays, so the counts made there stay attached to it.
 */
@Composable
private fun BranchNameDialog(
    existing: Branch?,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var name by remember { mutableStateOf(existing?.name.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "Add a branch" else "Rename branch") },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Branch name") },
                    singleLine = true,
                    supportingText = { Text("What the people working there call it.") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name) },
                enabled = name.isNotBlank(),
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun CompanyCodeDialog(
    current: com.stockcheck.app.model.WorkspaceConfig?,
    onDismiss: () -> Unit,
    onSave: (companyName: String, joinCode: String, exportPassword: String) -> Unit,
) {
    var name by remember { mutableStateOf(current?.companyName.orEmpty()) }
    var code by remember { mutableStateOf(current?.joinCode.orEmpty()) }
    var exportPassword by remember { mutableStateOf(current?.exportPassword.orEmpty()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Company code") },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Company name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    // Upper-cased as it is typed so what the admin reads out
                    // is exactly what the rules will compare against.
                    value = code,
                    onValueChange = { code = it.uppercase().trim() },
                    label = { Text("Code") },
                    supportingText = { Text("At least 4 characters, e.g. UPOINT") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = exportPassword,
                    onValueChange = { exportPassword = it },
                    label = { Text("Excel protection password") },
                    supportingText = {
                        Text("Applied to exported spreadsheets. Leave empty for the default.")
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "That password stops an accidental edit, not a determined one — " +
                        "Excel's sheet protection is trivially removed. The exported file " +
                        "is a copy; the record that counts is in this app, and the audit " +
                        "log shows every change made to it.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Changing the code does not affect anyone already registered. " +
                        "It only applies to new sign-ups from now on.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name, code, exportPassword) },
                enabled = code.trim().length >= 4,
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
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

    var adding by remember { mutableStateOf(false) }
    val lastCreated by viewModel.lastCreated.collectAsStateWithLifecycle()

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
        floatingActionButton = {
            if (permissions.has(Permission.CREATE_USER)) {
                ExtendedFloatingActionButton(
                    onClick = { adding = true },
                    icon = { Icon(Icons.Filled.Group, contentDescription = null) },
                    text = { Text("Add staff") },
                )
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            message?.let { NoticeBar(text = it, tone = NoticeTone.ERROR) }
            lastCreated?.let {
                NoticeBar(
                    text = "Account created for $it. Give them that email and the " +
                        "password you chose — they sign in with it directly.",
                )
            }
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
                                        // Standing in for "show me their
                                        // password", which is not something
                                        // any system can answer.
                                        TextButton(
                                            onClick = { viewModel.sendPasswordReset(user) },
                                        ) { Text("Reset") }
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

    if (adding) {
        AddStaffDialog(
            roles = roles,
            onDismiss = { adding = false },
            onCreate = { email, password, name, roleId ->
                viewModel.addTeamMember(email, password, name, roleId) { adding = false }
            },
        )
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

@Composable
private fun AddStaffDialog(
    roles: List<Role>,
    onDismiss: () -> Unit,
    onCreate: (email: String, password: String, name: String, roleId: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var roleId by remember { mutableStateOf(BuiltInRoles.WORKER_ID) }

    val matches = password == confirm
    val valid = email.isNotBlank() && password.length >= 6 && matches && roleId.isNotEmpty()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add staff") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    text = "You choose the password and pass it to them. They can change " +
                        "it later with Forgot password.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Their name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it.trim() },
                    label = { Text("Their email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    supportingText = { Text("At least 6 characters") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = confirm,
                    onValueChange = { confirm = it },
                    label = { Text("Confirm password") },
                    singleLine = true,
                    isError = confirm.isNotEmpty() && !matches,
                    supportingText = {
                        if (confirm.isNotEmpty() && !matches) Text("The two do not match.")
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(14.dp))
                Text("Role", style = MaterialTheme.typography.labelLarge)
                roles.forEach { role ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { roleId = role.id }
                            .padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.width(210.dp)) {
                            Text(role.name)
                            Text(
                                text = role.description,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (role.id == roleId) Text("OK")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onCreate(email, password, name, roleId) },
                enabled = valid,
            ) { Text("Create account") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
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

/**
 * What this company is on, and until when.
 *
 * Shown to everyone, not only to admins. A worker told "your plan has ended"
 * by a blocked button should be able to find out what that means without
 * having to ask the person who pays -- and seeing the expiry date is also the
 * cheapest way for a company to notice a renewal it meant to cancel.
 */
@Composable
private fun PlanCard(licence: Licence) {
    val now = System.currentTimeMillis()
    val dateFormat = remember { SimpleDateFormat("d MMM yyyy", Locale.US) }

    val (tone, headline) = when {
        licence.statusEnum == LicenceStatus.SUSPENDED ->
            MaterialTheme.colorScheme.error to "Suspended"
        licence.isExpiredAt(now) ->
            MaterialTheme.colorScheme.error to "Ended"
        licence.isLifetime ->
            MaterialTheme.colorScheme.tertiary to "Lifetime"
        licence.isRunningOut(now) ->
            MaterialTheme.colorScheme.tertiary to "${licence.daysLeft(now)} days left"
        licence.planEnum == Plan.TRIAL ->
            MaterialTheme.colorScheme.primary to "${licence.daysLeft(now)} days left"
        else ->
            MaterialTheme.colorScheme.primary to "Active"
    }

    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "${licence.planEnum.label} plan",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(text = headline, style = MaterialTheme.typography.labelLarge, color = tone)
            }

            Spacer(Modifier.height(6.dp))
            Text(
                text = buildString {
                    append(
                        if (licence.seats >= Int.MAX_VALUE / 2) {
                            "Unlimited accounts"
                        } else {
                            "${licence.seats} accounts"
                        },
                    )
                    if (licence.expiresAt != 0L) {
                        append("  \u00b7  ")
                        append(
                            if (licence.isExpiredAt(now)) "ended " else "until ",
                        )
                        append(dateFormat.format(Date(licence.expiresAt)))
                    }
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (licence.isLifetime) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = if (licence.supportUntil == 0L) {
                        "The app keeps working with no end date."
                    } else if (licence.supportEndedAt(now)) {
                        "The app keeps working. Updates and support ended " +
                            dateFormat.format(Date(licence.supportUntil)) + "."
                    } else {
                        "The app keeps working with no end date. Updates and support " +
                            "included until " + dateFormat.format(Date(licence.supportUntil)) + "."
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (licence.isExpiredAt(now) || licence.statusEnum == LicenceStatus.SUSPENDED) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "New stock checks are paused. Everything already counted stays " +
                        "here and can still be opened, exported and backed up.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
    Spacer(Modifier.height(12.dp))
}
