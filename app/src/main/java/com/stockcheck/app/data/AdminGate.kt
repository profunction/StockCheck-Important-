package com.stockcheck.app.data

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.stockcheck.app.model.BuiltInRoles
import com.stockcheck.app.model.UserProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Asks for an administrator's password before something irreversible.
 *
 * Not a permission check — the role already does that. This is for the case
 * the role cannot see: the phone is in a worker's hand, the worker is signed
 * in, and what is about to happen is deleting a month of counts or carrying
 * the company's stock figures out of the building in a spreadsheet. The
 * question is not "may this account do it" but "is a supervisor standing
 * here", and only a password answers that.
 *
 * The verification runs on a SECOND FirebaseApp. Signing in on the app's own
 * instance would replace the session, so a worker who handed the phone over
 * for one approval would find themselves signed out as somebody else — and
 * the audit trail would then credit the wrong person for everything that
 * followed. The second instance is signed out again the moment it has
 * answered, and the primary one is never touched.
 */
class AdminGate(private val appContext: Context) {

    sealed interface Result {
        /** Verified, and the display name to record against what follows. */
        data class Approved(val uid: String, val name: String) : Result
        data class Refused(val reason: String) : Result
    }

    suspend fun verify(email: String, password: String): Result = withContext(Dispatchers.IO) {
        val address = email.trim()
        if (address.isEmpty() || password.isEmpty()) {
            return@withContext Result.Refused("Enter an administrator's email and password.")
        }

        val secondary = runCatching { verifierApp() }.getOrElse {
            return@withContext Result.Refused("Could not check that just now.")
        }
        val auth = FirebaseAuth.getInstance(secondary)

        try {
            val user = runCatching { auth.signInWithEmailAndPassword(address, password).await() }
                .getOrNull()?.user
                ?: return@withContext Result.Refused("That email and password do not match.")

            // Read the profile as that account, on the same second instance.
            // The worker holding the phone may not be allowed to read anyone
            // else's profile, and asking them to would fail here for a
            // reason that has nothing to do with the password they typed.
            val profile = runCatching {
                FirebaseFirestore.getInstance(secondary)
                    .collection("workspaces")
                    .document(Db.workspaceId)
                    .collection("users")
                    .document(user.uid)
                    .get().await()
                    .toObject(UserProfile::class.java)
            }.getOrNull()
                ?: return@withContext Result.Refused(
                    "That account is not a member of this company.",
                )

            if (!profile.active) {
                return@withContext Result.Refused("That account has been deactivated.")
            }
            if (profile.roleId != BuiltInRoles.ADMIN_ID) {
                // Named plainly. "Wrong password" for a correct password
                // belonging to a non-admin sends somebody to reset a password
                // that was never the problem.
                return@withContext Result.Refused(
                    "That account is not an administrator of this company.",
                )
            }

            Result.Approved(
                uid = user.uid,
                name = profile.displayName.ifBlank { profile.email },
            )
        } finally {
            // Always, including on the refusals above: a signed-in second
            // instance left lying around is a credential nobody is watching.
            runCatching { auth.signOut() }
        }
    }

    /**
     * The second FirebaseApp, created once and reused.
     *
     * Same project and settings as the real one, so it talks to the same
     * database; only the name differs, which is what keeps the two sessions
     * apart.
     */
    private fun verifierApp(): FirebaseApp =
        runCatching { FirebaseApp.getInstance(NAME) }.getOrElse {
            FirebaseApp.initializeApp(
                appContext,
                FirebaseApp.getInstance().options,
                NAME,
            )
        }

    private companion object {
        const val NAME = "admin-verifier"
    }
}
