package com.stockcheck.app.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.stockcheck.app.data.Db
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.data.can
import com.stockcheck.app.data.getAs
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

    fun changeRole(target: UserProfile, roleId: String) {
        viewModelScope.launch {
            runCatching { userRepo.changeRole(session, target, roleId) }
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

    fun saveCompanyCode(companyName: String, joinCode: String, onSaved: () -> Unit) {
        viewModelScope.launch {
            runCatching { userRepo.saveConfig(session, companyName, joinCode) }
                .onSuccess { onSaved() }
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
