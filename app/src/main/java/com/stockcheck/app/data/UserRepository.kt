package com.stockcheck.app.data

import com.google.firebase.firestore.Query
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.BuiltInRoles
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Role
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await

class UserRepository(private val audit: AuditRepository) {

    // ------------------------------------------------------------- profiles

    fun observeProfile(uid: String): Flow<UserProfile?> = Db.user(uid).asFlow()

    fun observeUsers(): Flow<List<UserProfile>> =
        Db.users().orderBy("displayName", Query.Direction.ASCENDING).asFlow()

    suspend fun isWorkspaceEmpty(): Boolean =
        runCatching { Db.users().limit(1).get().await().isEmpty }.getOrDefault(false)

    suspend fun createProfile(uid: String, email: String, displayName: String, roleId: String) {
        val role = Db.role(roleId).getAs<Role>()
        val now = System.currentTimeMillis()
        Db.user(uid).set(
            UserProfile(
                uid = uid,
                email = email,
                displayName = displayName,
                roleId = roleId,
                roleName = role?.name ?: roleId,
                active = true,
                createdAt = now,
                lastSeenAt = now,
            )
        ).await()
    }

    suspend fun touchLastSeen(uid: String) {
        if (uid.isEmpty()) return
        runCatching {
            Db.user(uid).update("lastSeenAt", System.currentTimeMillis()).await()
        }
    }

    /**
     * Moves a user to a different role.
     *
     * Reassigning the last admin away from Admin is refused — otherwise nobody
     * could ever manage the workspace again.
     */
    suspend fun changeRole(session: Session, target: UserProfile, newRoleId: String) {
        session.require(Permission.CHANGE_PERMISSION)
        if (target.roleId == BuiltInRoles.ADMIN_ID && newRoleId != BuiltInRoles.ADMIN_ID) {
            require(countAdmins() > 1) { "The workspace must keep at least one admin." }
        }
        val role = Db.role(newRoleId).getAs<Role>() ?: error("Role not found: $newRoleId")
        Db.user(target.uid).update(
            mapOf("roleId" to role.id, "roleName" to role.name)
        ).await()
        audit.record(
            session = session,
            entity = "User",
            entityId = target.uid,
            entityLabel = target.displayName,
            action = AuditAction.PERMISSION_CHANGE,
            field = "role",
            oldValue = target.roleName,
            newValue = role.name,
        )
    }

    suspend fun setActive(session: Session, target: UserProfile, active: Boolean) {
        session.require(Permission.EDIT_USER)
        if (!active && target.roleId == BuiltInRoles.ADMIN_ID) {
            require(countAdmins() > 1) { "The workspace must keep at least one active admin." }
        }
        Db.user(target.uid).update("active", active).await()
        audit.record(
            session = session,
            entity = "User",
            entityId = target.uid,
            entityLabel = target.displayName,
            action = AuditAction.UPDATE,
            field = "active",
            oldValue = target.active.toString(),
            newValue = active.toString(),
        )
    }

    suspend fun deleteProfile(session: Session, target: UserProfile) {
        session.require(Permission.DELETE_USER)
        require(target.uid != session.uid) { "You cannot delete your own account." }
        if (target.roleId == BuiltInRoles.ADMIN_ID) {
            require(countAdmins() > 1) { "The workspace must keep at least one admin." }
        }
        Db.user(target.uid).delete().await()
        audit.record(
            session = session,
            entity = "User",
            entityId = target.uid,
            entityLabel = target.displayName,
            action = AuditAction.DELETE,
        )
    }

    private suspend fun countAdmins(): Int = runCatching {
        Db.users()
            .whereEqualTo("roleId", BuiltInRoles.ADMIN_ID)
            .whereEqualTo("active", true)
            .get().await().size()
    }.getOrDefault(1)

    // ---------------------------------------------------------------- roles

    fun observeRole(roleId: String): Flow<Role?> = Db.role(roleId).asFlow()

    fun observeRoles(): Flow<List<Role>> =
        Db.roles().orderBy("name", Query.Direction.ASCENDING).asFlow()

    suspend fun seedBuiltInRoles() {
        val batch = Db.batch()
        BuiltInRoles.seeds.forEach { role ->
            batch.set(Db.role(role.id), role.copy(createdAt = System.currentTimeMillis()))
        }
        batch.commit().await()
    }

    suspend fun saveRole(session: Session, role: Role) {
        val isNew = role.id.isEmpty() || Db.role(role.id).getAs<Role>() == null
        session.require(if (isNew) Permission.CREATE_ROLE else Permission.EDIT_ROLE)
        require(role.name.isNotBlank()) { "Role name cannot be empty." }
        require(!BuiltInRoles.isProtected(role.id)) { "The Admin role cannot be edited." }

        val id = role.id.ifEmpty { Db.roles().document().id }
        val existing = if (isNew) null else Db.role(id).getAs<Role>()
        Db.role(id).set(
            role.copy(
                id = id,
                createdByUid = existing?.createdByUid ?: session.uid,
                createdAt = existing?.createdAt ?: System.currentTimeMillis(),
            )
        ).await()

        if (existing != null && existing.permissions.toSet() != role.permissions.toSet()) {
            audit.record(
                session = session,
                entity = "Role",
                entityId = id,
                entityLabel = role.name,
                action = AuditAction.PERMISSION_CHANGE,
                field = "permissions",
                oldValue = describePermissions(existing.permissions),
                newValue = describePermissions(role.permissions),
            )
        } else if (existing == null) {
            audit.record(
                session = session,
                entity = "Role",
                entityId = id,
                entityLabel = role.name,
                action = AuditAction.CREATE,
            )
        }
    }

    suspend fun deleteRole(session: Session, role: Role) {
        session.require(Permission.DELETE_ROLE)
        require(!role.builtIn) { "Built-in roles cannot be deleted." }
        val inUse = Db.users().whereEqualTo("roleId", role.id).limit(1).get().await()
        require(inUse.isEmpty) { "This role is still assigned to a user." }
        Db.role(role.id).delete().await()
        audit.record(
            session = session,
            entity = "Role",
            entityId = role.id,
            entityLabel = role.name,
            action = AuditAction.DELETE,
        )
    }

    /** Renders a permission list as a short, diffable summary for the audit log. */
    private fun describePermissions(stored: List<String>): String =
        stored.size.toString() + " permissions: " +
            stored.sorted().joinToString(", ") { name ->
                Permission.byNameOrNull(name)?.label ?: name
            }
}
