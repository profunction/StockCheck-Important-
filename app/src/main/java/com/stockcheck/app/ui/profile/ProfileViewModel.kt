package com.stockcheck.app.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.stockcheck.app.data.Db
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.data.can
import com.stockcheck.app.data.getAs
import com.stockcheck.app.export.BackupResult
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.Licence
import com.stockcheck.app.model.AuditEntry
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Role
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.UserProfile
import com.stockcheck.app.model.WorkspaceConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ProfileViewModel(private val session: Session) : ViewModel() {

    private val userRepo = ServiceLocator.users
    private val auditRepo = ServiceLocator.audit
    private val backupService = ServiceLocator.backups

    /** What the company has paid for. Read-only everywhere in the app. */
    val licence: StateFlow<Licence?> = ServiceLocator.licences.observeLicence()
        .catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val roles: StateFlow<List<Role>> = userRepo.observeRoles()
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /**
     * Only subscribed when the role may read these collections.
     *
     * A denied Firestore listener fails the whole flow rather than returning an
     * empty list, so an unauthorised subscription would surface as an error
     * banner instead of a simply-absent section.
     */
    val users: StateFlow<List<UserProfile>> = if (session.can(Permission.VIEW_USERS)) {
        userRepo.observeUsers()
            .catch { emit(emptyList()) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    } else {
        flowOf(emptyList<UserProfile>())
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    }

    val auditEntries: StateFlow<List<AuditEntry>> =
        if (session.can(Permission.VIEW_AUDIT_LOG)) {
            auditRepo.observeAll()
                .catch { emit(emptyList()) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
        } else {
            flowOf(emptyList<AuditEntry>())
                .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
        }

    val config: StateFlow<WorkspaceConfig?> = userRepo.observeConfig()
        .catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _roleDraft = MutableStateFlow<Role?>(null)
    val roleDraft: StateFlow<Role?> = _roleDraft.asStateFlow()

    // ----------------------------------------------------------------- users

    private val _lastCreated = MutableStateFlow<String?>(null)
    val lastCreated: StateFlow<String?> = _lastCreated.asStateFlow()

    fun addTeamMember(
        email: String,
        password: String,
        displayName: String,
        roleId: String,
        onDone: () -> Unit,
    ) {
        viewModelScope.launch {
            runCatching {
                userRepo.createTeamMember(session, email, password, displayName, roleId)
            }.onSuccess {
                _lastCreated.value = email.trim()
                onDone()
            }.onFailure { _message.value = it.message }
        }
    }

    fun clearLastCreated() {
        _lastCreated.value = null
    }

    fun changeRole(target: UserProfile, roleId: String) {
        viewModelScope.launch {
            runCatching { userRepo.changeRole(session, target, roleId) }
                .onFailure { _message.value = it.message }
        }
    }

    fun sendPasswordReset(target: UserProfile) {
        viewModelScope.launch {
            runCatching { userRepo.sendResetFor(session, target) }
                .onSuccess { _message.value = "A reset link was emailed to ${target.email}." }
                .onFailure { _message.value = it.message }
        }
    }

    fun setActive(target: UserProfile, active: Boolean) {
        viewModelScope.launch {
            runCatching { userRepo.setActive(session, target, active) }
                .onFailure { _message.value = it.message }
        }
    }

    fun deleteUser(target: UserProfile) {
        viewModelScope.launch {
            runCatching { userRepo.deleteProfile(session, target) }
                .onFailure { _message.value = it.message }
        }
    }

    fun saveCompanyCode(
        companyName: String,
        joinCode: String,
        exportPassword: String,
        onSaved: () -> Unit,
    ) {
        viewModelScope.launch {
            runCatching { userRepo.saveConfig(session, companyName, joinCode, exportPassword) }
                .onSuccess { onSaved() }
                .onFailure { _message.value = it.message }
        }
    }

    /** Adds a branch, or renames the one whose id is [replacingId]. */
    fun saveBranch(name: String, replacingId: String, onSaved: () -> Unit) {
        viewModelScope.launch {
            runCatching { userRepo.saveBranch(session, name, replacingId) }
                .onSuccess { onSaved() }
                // The message matters here: the likely failure is a name
                // another branch already has, and "it did not save" without
                // saying why is a person retyping the same name.
                .onFailure { _message.value = it.message }
        }
    }

    fun setBranchActive(branch: Branch, active: Boolean) {
        viewModelScope.launch {
            runCatching { userRepo.setBranchActive(session, branch, active) }
                .onFailure { _message.value = it.message }
        }
    }

    // ----------------------------------------------------------------- roles

    fun loadRole(roleId: String) {
        viewModelScope.launch {
            _roleDraft.value = if (roleId == NEW_ROLE) {
                Role(name = "", description = "", permissions = emptyList())
            } else {
                Db.role(roleId).getAs<Role>() ?: Role(id = roleId)
            }
        }
    }

    fun updateRole(transform: (Role) -> Role) {
        _roleDraft.value = _roleDraft.value?.let(transform)
    }

    private val _deletingAccount = MutableStateFlow(false)
    val deletingAccount: StateFlow<Boolean> = _deletingAccount.asStateFlow()

    /**
     * Closing your own account.
     *
     * Signing out happens inside the repository once the deletion lands, and
     * the auth listener takes the app back to the sign-in screen from there,
     * so there is nothing to navigate on success beyond closing the dialog.
     */
    fun deleteOwnAccount(password: String, onDeleted: () -> Unit) {
        viewModelScope.launch {
            _deletingAccount.value = true
            runCatching { userRepo.deleteOwnAccount(session, password) }
                .onSuccess { onDeleted() }
                .onFailure {
                    _message.value = it.message ?: "The account could not be deleted."
                }
            _deletingAccount.value = false
        }
    }

    fun togglePermission(permission: Permission, on: Boolean) {
        _roleDraft.value = _roleDraft.value?.let { role ->
            val next = if (on) {
                (role.permissions + permission.name).distinct()
            } else {
                role.permissions - permission.name
            }
            role.copy(permissions = next.sorted())
        }
    }

    fun saveRole(onSaved: () -> Unit) {
        val role = _roleDraft.value ?: return
        viewModelScope.launch {
            runCatching { userRepo.saveRole(session, role) }
                .onSuccess { onSaved() }
                .onFailure { _message.value = it.message }
        }
    }

    fun deleteRole(onDeleted: () -> Unit) {
        val role = _roleDraft.value ?: return
        viewModelScope.launch {
            runCatching { userRepo.deleteRole(session, role) }
                .onSuccess { onDeleted() }
                .onFailure { _message.value = it.message }
        }
    }

    // ---------------------------------------------------------------- backup

    private val _backupBusy = MutableStateFlow(false)
    val backupBusy: StateFlow<Boolean> = _backupBusy.asStateFlow()

    private val _backupResult = MutableStateFlow<BackupResult?>(null)
    val backupResult: StateFlow<BackupResult?> = _backupResult.asStateFlow()

    /**
     * Reads the whole company into one file.
     *
     * Everything else in this app writes to Firestore and trusts it to still
     * be there. On the free plan nothing backs it up, so this is the only
     * copy of the data that exists anywhere the company controls.
     */
    fun runBackup(includePhotos: Boolean, encrypt: Boolean) {
        if (_backupBusy.value) return
        _backupBusy.value = true
        viewModelScope.launch {
            val password = if (encrypt) {
                config.value?.exportPassword?.takeIf { it.isNotBlank() }
            } else {
                null
            }
            if (encrypt && password == null) {
                _backupBusy.value = false
                _message.value =
                    "No company password is set, so the backup cannot be encrypted. " +
                        "Set one under Company code first, or back up unencrypted."
                return@launch
            }
            runCatching { backupService.backup(session, includePhotos, password) }
                .onSuccess { _backupResult.value = it }
                .onFailure { _message.value = it.message ?: "The backup failed." }
            _backupBusy.value = false
        }
    }

    fun shareBackup(): android.content.Intent? =
        _backupResult.value?.let { backupService.shareIntent(it) }

    fun clearBackupResult() {
        _backupResult.value = null
    }

    fun clearMessage() {
        _message.value = null
    }

    companion object {
        const val NEW_ROLE = "new"

        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                ProfileViewModel(session) as T
        }
    }
}
