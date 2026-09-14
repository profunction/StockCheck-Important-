package com.stockcheck.app.data

import com.google.firebase.auth.EmailAuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.stockcheck.app.model.BuiltInRoles
import com.stockcheck.app.model.PermissionSet
import com.stockcheck.app.model.Role
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.UserProfile
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.tasks.await

sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    /** Signed in with Firebase but no profile document exists yet. */
    data class NoProfile(val uid: String, val email: String) : AuthState
    /** Profile exists but an admin has deactivated the account. */
    data class Deactivated(val profile: UserProfile) : AuthState

    /**
     * Signed in, but the account belongs to no company.
     *
     * Happens to an account created before companies existed, or one whose
     * registration failed after the Auth account was made. Offering to join
     * or create one from here beats stranding them on a sign-in screen that
     * accepts their password and then does nothing.
     */
    data class NoWorkspace(val uid: String, val email: String) : AuthState

    /**
     * Signed in, but resolving the session failed — a denied Firestore
     * listener, most often.
     *
     * This used to collapse into [SignedOut], which put the user back on the
     * sign-in screen with no message: credentials accepted, same screen
     * again, indistinguishable from the button doing nothing. Whatever went
     * wrong is now carried to the UI and shown.
     */
    data class Failed(val message: String, val uid: String) : AuthState
    data class SignedIn(val session: Session) : AuthState
}

class AuthRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val users: UserRepository,
    private val workspaces: WorkspaceRepository,
) {

    val currentUid: String? get() = auth.currentUser?.uid

    private fun firebaseUserFlow(): Flow<FirebaseUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { trySend(it.currentUser) }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }

    /**
     * The single source of truth for "who is using the app and what may they do".
     *
     * Profile and role are watched rather than read once, so an admin revoking
     * a permission takes effect on the worker's phone without a restart.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun authState(): Flow<AuthState> = firebaseUserFlow().flatMapLatest { user ->
        if (user == null) {
            workspaces.clearWorkspace()
            // Typed explicitly: without it the branch fixes the lambda's type
            // to Flow<SignedOut> and the workspace branch below cannot emit
            // any other state into it.
            return@flatMapLatest flowOf<AuthState>(AuthState.SignedOut)
        }

        // Which company this account belongs to has to be settled before any
        // per-company path is touched; Db.workspaceId is what every query
        // below hangs off.
        flow<AuthState> {
            val workspaceId = workspaces.workspaceOf(user.uid)
            if (workspaceId.isNullOrEmpty()) {
                Db.workspaceId = ""
                emit(AuthState.NoWorkspace(user.uid, user.email.orEmpty()))
                return@flow
            }
            Db.workspaceId = workspaceId
            emitAll(sessionFor(user))
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun sessionFor(user: FirebaseUser): Flow<AuthState> =
        users.observeProfile(user.uid)
            .flatMapLatest { profile ->
                when {
                    profile == null ->
                        flowOf(AuthState.NoProfile(user.uid, user.email.orEmpty()))
                    !profile.active ->
                        flowOf(AuthState.Deactivated(profile))
                    // Typed as AuthState rather than inferred: the catch below
                    // emits a different subtype, which a Flow<SignedIn> cannot
                    // carry.
                    else -> users.observeRole(profile.roleId)
                        .map<Role?, AuthState> { role ->
                            // A missing role document is not fatal: Admin
                            // resolves its permissions from code regardless,
                            // and any other role simply has none until an
                            // admin fixes it. Better a session with nothing
                            // enabled, which says so on the Profile tab, than
                            // a dead sign-in button.
                            val resolved = role ?: Role(id = profile.roleId, name = profile.roleName)
                            AuthState.SignedIn(Session(profile, resolved))
                        }
                        .catch { error ->
                            emit(
                                AuthState.Failed(
                                    "Signed in, but your role could not be read: " +
                                        (error.message ?: error.toString()),
                                    user.uid,
                                ),
                            )
                        }
                }
            }
            // Scoped to the profile listener specifically, so a denied read
            // here reports itself instead of unwinding to the sign-in screen.
            .catch { error ->
                emit(
                    AuthState.Failed(
                        "Signed in, but your profile could not be read: " +
                            (error.message ?: error.toString()),
                        user.uid,
                    ),
                )
            }

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
        val uid = auth.currentUser?.uid.orEmpty()
        // Every path in Db hangs off the workspace, so it must be resolved
        // before anything reads. An account with no company falls through to
        // AuthState.NoWorkspace rather than querying workspaces/"".
        val workspaceId = workspaces.workspaceOf(uid)
        Db.workspaceId = workspaceId.orEmpty()
        if (workspaceId != null) users.touchLastSeen(uid)
    }

    /**
     * Creates the Firebase account and its profile document.
     *
     * The very first account in a workspace becomes the Admin and seeds the
     * built-in roles; every later self-registration lands on Worker.
     *
     * "First" is decided by attempting [UserRepository.trySeedBuiltInRoles]
     * and checking whether it succeeded, not by reading the users collection
     * beforehand — a brand-new account has no profile yet, and every read
     * that could answer "is this workspace empty" requires one. See the
     * comment on that function for the full reasoning.
     */
    /**
     * Joins an existing company using the code its admin handed out.
     *
     * The code is resolved to a company BEFORE the account is created, so an
     * unknown code costs nothing and leaves nothing behind.
     */
    suspend fun joinCompany(
        email: String,
        password: String,
        displayName: String,
        joinCode: String,
    ) {
        val target = workspaces.resolveCode(joinCode)
            ?: throw IllegalStateException(
                "That company code was not recognised. Check it with your " +
                    "administrator — codes are not case sensitive.",
            )

        val result = auth.createUserWithEmailAndPassword(email.trim(), password).await()
        val uid = result.user?.uid ?: error("Registration returned no user")
        Db.workspaceId = target.workspaceId

        runCatching {
            workspaces.linkUserToWorkspace(uid, target.workspaceId)
            users.createProfile(
                uid = uid,
                email = email.trim(),
                displayName = displayName.trim().ifEmpty { email.substringBefore('@') },
                roleId = BuiltInRoles.WORKER_ID,
                joinCode = joinCode,
            )
        }.onFailure { error ->
            rollbackAccount()
            throw IllegalStateException(
                "Could not join ${target.companyName}: ${error.message}",
                error,
            )
        }
    }

    /**
     * Creates a brand-new company and makes this account its admin.
     *
     * The code is claimed as part of creation, so whoever gets there first
     * owns it and a second attempt on the same code is refused.
     */
    suspend fun createCompany(
        email: String,
        password: String,
        displayName: String,
        companyName: String,
        joinCode: String,
    ) {
        val result = auth.createUserWithEmailAndPassword(email.trim(), password).await()
        val uid = result.user?.uid ?: error("Registration returned no user")

        runCatching {
            workspaces.createWorkspace(uid, companyName, joinCode)
            users.createProfile(
                uid = uid,
                email = email.trim(),
                displayName = displayName.trim().ifEmpty { email.substringBefore('@') },
                roleId = BuiltInRoles.ADMIN_ID,
                joinCode = joinCode,
            )
        }.onFailure { error ->
            rollbackAccount()
            throw IllegalStateException(
                error.message ?: "The company could not be created.",
                error,
            )
        }
    }

    /**
     * Removes the half-made account after a failed registration.
     *
     * Without this the person is left holding an Auth account with nothing
     * behind it: every retry answers "email already in use" and there is no
     * way forward short of an admin deleting it in the Firebase console.
     */
    private suspend fun rollbackAccount() {
        runCatching { auth.currentUser?.delete()?.await() }
        auth.signOut()
        Db.workspaceId = ""
    }

    /**
     * Builds the missing profile for an account that is already signed in.
     *
     * Registration is two steps — create the Firebase Auth account, then write
     * the Firestore profile — and only the first is atomic with itself. If the
     * second fails (denied by rules, offline, app killed), the account exists
     * and signs in perfectly well but has nothing behind it, which surfaces as
     * [AuthState.NoProfile]. Without a repair path the only escape is deleting
     * the account from the Firebase console, which is not something an
     * operator can be expected to do.
     */
    suspend fun completeSetup() {
        val user = auth.currentUser ?: error("You are not signed in.")
        val isFirstUser = users.trySeedBuiltInRoles()
        val roleId = if (isFirstUser) BuiltInRoles.ADMIN_ID else BuiltInRoles.WORKER_ID
        users.createProfile(
            uid = user.uid,
            email = user.email.orEmpty(),
            displayName = user.displayName?.takeIf { it.isNotBlank() }
                ?: user.email.orEmpty().substringBefore('@'),
            roleId = roleId,
        )
    }

    suspend fun sendPasswordReset(email: String) {
        auth.sendPasswordResetEmail(email.trim()).await()
    }

    /**
     * Changes the signed-in user's own password.
     *
     * The current password is required and re-checked against Firebase rather
     * than trusted: `updatePassword` refuses unless the session is recent, and
     * asking for it also means a phone left unlocked on a bench cannot be used
     * to take over someone's account.
     *
     * Nothing about the password itself is recorded anywhere. Firebase stores
     * only a hash and there is no way to read one back — by design, and the
     * reason an administrator cannot be shown what a member of staff chose.
     * What IS recorded is that a change happened, by whom and when.
     */
    suspend fun changeOwnPassword(currentPassword: String, newPassword: String) {
        val user = auth.currentUser ?: error("You are not signed in.")
        val email = user.email ?: error("This account has no email address.")
        require(newPassword.length >= 6) { "The new password must be at least 6 characters." }
        require(newPassword != currentPassword) { "The new password is the same as the old one." }

        runCatching {
            user.reauthenticate(EmailAuthProvider.getCredential(email, currentPassword)).await()
        }.onFailure {
            throw IllegalStateException("Your current password is not correct.", it)
        }
        user.updatePassword(newPassword).await()
        users.recordPasswordChange(user.uid)
    }

    fun signOut() {
        workspaces.clearWorkspace()
        auth.signOut()
    }
}

/** Convenience for screens: the permissions of the current session, or none. */
val AuthState.permissions: PermissionSet
    get() = when (this) {
        is AuthState.SignedIn -> BuiltInRoles.permissionsFor(session.role)
        else -> PermissionSet.EMPTY
    }

val AuthState.sessionOrNull: Session?
    get() = (this as? AuthState.SignedIn)?.session
