package com.stockcheck.app.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.Query
import com.stockcheck.app.model.AuditAction
import com.stockcheck.app.model.BuiltInRoles
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Role
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.UserProfile
import com.stockcheck.app.model.WorkspaceConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await

class UserRepository(
    private val audit: AuditRepository,
    private val provisioning: UserProvisioning,
    private val workspaces: WorkspaceRepository,
) {

    // ------------------------------------------------------------- profiles

    fun observeProfile(uid: String): Flow<UserProfile?> = Db.user(uid).asFlow()

    fun observeUsers(): Flow<List<UserProfile>> =
        Db.users().orderBy("displayName", Query.Direction.ASCENDING).asFlow()

    /**
     * The registration flow used to decide "am I the first user?" by reading
     * the users collection first and seeding roles only if it was empty. That
     * read is denied by firestore.rules for a brand-new account: `VIEW_USERS`
     * and `isOwner` both require a profile document to already exist, which is
     * exactly what registration is in the middle of creating — a chicken-and-
     * egg permission deadlock. The read was wrapped in `runCatching { }
     * .getOrDefault(false)`, so the denial was swallowed silently: every
     * registration, including the true first one, always looked like "not
     * first", the built-in roles were never seeded, and the new account ended
     * up with a role id but no matching role document — zero permissions,
     * every tab and button gone.
     *
     * [trySeedBuiltInRoles] replaces that read-then-decide with attempt-then-
     * check: the roles rule already has a bootstrap clause that allows
     * creating the roles ONLY while `roles/admin` does not yet exist, with no
     * profile required. So the write is just attempted, and whether Firestore
     * allowed it tells us whether this is the first registration — the same
     * fact the old code tried and failed to determine by reading first.
     */
    /**
     * Creates an account for a colleague and puts them straight into this
     * workspace with the role chosen for them.
     *
     * Staff do not sign themselves up; an admin issues the account and hands
     * over the password. That removes the shared company code as something
     * that can leak, and means the person's role is decided before they ever
     * open the app rather than defaulting to Worker and needing a promotion.
     */
    suspend fun createTeamMember(
        session: Session,
        email: String,
        password: String,
        displayName: String,
        roleId: String,
    ): String {
        session.require(Permission.CREATE_USER)
        require(email.isNotBlank()) { "Enter an email address." }
        require(password.length >= 6) { "The password must be at least 6 characters." }
        require(roleId.isNotEmpty()) { "Choose a role." }

        val workspaceId = Db.workspaceId
        check(workspaceId.isNotEmpty()) { "No company is selected." }

        val uid = provisioning.createAccount(email, password)
        return try {
            workspaces.linkUserToWorkspace(uid, workspaceId)
            val role = Db.role(roleId).getAs<Role>()
            val now = System.currentTimeMillis()
            Db.user(uid).set(
                UserProfile(
                    uid = uid,
                    email = email.trim(),
                    displayName = displayName.trim().ifEmpty { email.substringBefore('@') },
                    roleId = roleId,
                    roleName = role?.name ?: roleId,
                    active = true,
                    createdAt = now,
                    lastSeenAt = 0L,
                ),
            ).awaitAck()
            audit.record(
                session = session,
                entity = "User",
                entityId = uid,
                entityLabel = displayName.trim().ifEmpty { email.trim() },
                action = AuditAction.CREATE,
                field = "role",
                newValue = role?.name ?: roleId,
            )
            uid
        } catch (error: Throwable) {
            // An Auth account with no profile behind it is worse than none:
            // its email can never be used again and the person it was for
            // cannot sign in. Take it back out before reporting the failure.
            provisioning.deleteLastCreated()
            throw IllegalStateException(
                "The account could not be set up: ${error.message}",
                error,
            )
        }
    }

    /**
     * Notes in the trail that someone changed their own password.
     *
     * Records no value, old or new, on purpose: Firebase keeps only a hash,
     * and storing the plaintext so an administrator could read it would put
     * every member of staff's password — reused elsewhere, as passwords are —
     * into a database. Who and when is the useful part and the safe part.
     */
    suspend fun recordPasswordChange(uid: String) {
        val profile = Db.user(uid).getAs<UserProfile>() ?: return
        val role = Db.role(profile.roleId).getAs<Role>() ?: Role(id = profile.roleId)
        audit.record(
            session = Session(profile, role),
            entity = "User",
            entityId = uid,
            entityLabel = profile.displayName.ifEmpty { profile.email },
            action = AuditAction.UPDATE,
            field = "password",
            newValue = "changed by the account holder",
        )
    }

    /**
     * Emails a reset link to a member of staff who cannot get in.
     *
     * This is what stands in for "show me their password": an admin can never
     * read one, but can always put someone back in control of their account.
     */
    suspend fun sendResetFor(session: Session, target: UserProfile) {
        session.require(Permission.EDIT_USER)
        require(target.email.isNotBlank()) { "That account has no email address." }
        FirebaseAuth.getInstance().sendPasswordResetEmail(target.email).await()
        audit.record(
            session = session,
            entity = "User",
            entityId = target.uid,
            entityLabel = target.displayName.ifEmpty { target.email },
            action = AuditAction.UPDATE,
            field = "password",
            newValue = "reset link sent",
        )
    }

    // -------------------------------------------------- workspace config

    fun observeConfig(): Flow<WorkspaceConfig?> = Db.config().asFlow()

    /**
     * True when this workspace has not been configured yet, which is the only
     * time registration is allowed without a code.
     */
    suspend fun isUnclaimed(): Boolean =
        Db.config().getAs<WorkspaceConfig>()?.joinCode.isNullOrEmpty()

    suspend fun saveConfig(session: Session, companyName: String, joinCode: String) {
        session.require(Permission.CHANGE_PERMISSION)
        val normalised = WorkspaceConfig.normalise(joinCode)
        require(normalised.length >= 4) { "The company code must be at least 4 characters." }
        val previous = Db.config().getAs<WorkspaceConfig>()
        Db.config().set(
            WorkspaceConfig(
                companyName = companyName.trim(),
                joinCode = normalised,
                updatedAt = System.currentTimeMillis(),
                updatedByUid = session.uid,
            ),
        ).awaitAck()
        audit.record(
            session = session,
            entity = "Workspace",
            entityId = "config",
            entityLabel = companyName.trim(),
            action = AuditAction.UPDATE,
            field = "joinCode",
            // The code itself is not written to the trail; the trail is
            // readable by more people than the code should be.
            oldValue = if (previous?.joinCode.isNullOrEmpty()) "not set" else "set",
            newValue = "set",
        )
    }

    suspend fun createProfile(
        uid: String,
        email: String,
        displayName: String,
        roleId: String,
        joinCode: String = "",
    ) {
        val now = System.currentTimeMillis()
        // No Firestore read here either, for the same reason: the role
        // document cannot be read back before the profile exists. The display
        // name is taken from the in-memory seed list instead.
        val roleName = BuiltInRoles.seeds.firstOrNull { it.id == roleId }?.name ?: roleId
        Db.user(uid).set(
            UserProfile(
                uid = uid,
                email = email,
                displayName = displayName,
                roleId = roleId,
                roleName = roleName,
                active = true,
                createdAt = now,
                lastSeenAt = now,
                joinCode = WorkspaceConfig.normalise(joinCode),
            )
        ).awaitAck()
    }

    suspend fun touchLastSeen(uid: String) {
        if (uid.isEmpty()) return
        runCatching {
            Db.user(uid).update("lastSeenAt", System.currentTimeMillis()).awaitAck()
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
        ).awaitAck()
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
        Db.user(target.uid).update("active", active).awaitAck()
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
        Db.user(target.uid).delete().awaitAck()
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

    /**
     * Attempts to write the built-in roles and reports whether it succeeded.
     * See the note on [createProfile] for why this doubles as "is this the
     * first user" — success here IS the definition of "first", per the
     * bootstrap clause in firestore.rules.
     *
     * A second call (from a second user registering, or a retry) correctly
     * returns false: the roles now exist, so Firestore evaluates the same
     * `set()` as an update, `roleId != 'admin'` on the admin document is
     * false, and the whole batch is denied atomically.
     *
     * Order within the batch does not matter: every write is evaluated
     * against the pre-batch state, so all four see the bootstrap clause's
     * `!exists(roles/admin)` as true. rules-test/test.mjs asserts this for
     * both orderings against the real rules.
     */
    suspend fun trySeedBuiltInRoles(): Boolean {
        val batch = Db.batch()
        val now = System.currentTimeMillis()
        BuiltInRoles.seeds.forEach { role ->
            batch.set(Db.role(role.id), role.copy(createdAt = now))
        }
        return runCatching { batch.commit().awaitAck() }.isSuccess
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
        ).awaitAck()

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
        Db.role(role.id).delete().awaitAck()
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
