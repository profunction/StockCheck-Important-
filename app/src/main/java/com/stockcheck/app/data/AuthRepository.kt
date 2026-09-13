package com.stockcheck.app.data

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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.tasks.await

sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    /** Signed in with Firebase but no profile document exists yet. */
    data class NoProfile(val uid: String, val email: String) : AuthState
    /** Profile exists but an admin has deactivated the account. */
    data class Deactivated(val profile: UserProfile) : AuthState
    data class SignedIn(val session: Session) : AuthState
}

class AuthRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val users: UserRepository,
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
        if (user == null) return@flatMapLatest flowOf(AuthState.SignedOut)

        users.observeProfile(user.uid).flatMapLatest { profile ->
            when {
                profile == null ->
                    flowOf(AuthState.NoProfile(user.uid, user.email.orEmpty()))
                !profile.active ->
                    flowOf(AuthState.Deactivated(profile))
                else -> users.observeRole(profile.roleId).let { roleFlow ->
                    combine(flowOf(profile), roleFlow) { p, role ->
                        val resolved = role ?: Role(id = p.roleId, name = p.roleName)
                        AuthState.SignedIn(Session(p, resolved))
                    }
                }
            }
        }
    }

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
        users.touchLastSeen(auth.currentUser?.uid.orEmpty())
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
    suspend fun register(email: String, password: String, displayName: String) {
        val result = auth.createUserWithEmailAndPassword(email.trim(), password).await()
        val uid = result.user?.uid ?: error("Registration returned no user")
        val isFirstUser = users.trySeedBuiltInRoles()
        val roleId = if (isFirstUser) BuiltInRoles.ADMIN_ID else BuiltInRoles.WORKER_ID
        users.createProfile(
            uid = uid,
            email = email.trim(),
            displayName = displayName.trim().ifEmpty { email.substringBefore('@') },
            roleId = roleId,
        )
    }

    suspend fun sendPasswordReset(email: String) {
        auth.sendPasswordResetEmail(email.trim()).await()
    }

    fun signOut() = auth.signOut()
}

/** Convenience for screens: the permissions of the current session, or none. */
val AuthState.permissions: PermissionSet
    get() = when (this) {
        is AuthState.SignedIn -> BuiltInRoles.permissionsFor(session.role)
        else -> PermissionSet.EMPTY
    }

val AuthState.sessionOrNull: Session?
    get() = (this as? AuthState.SignedIn)?.session
