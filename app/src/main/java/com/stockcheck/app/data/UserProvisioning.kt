package com.stockcheck.app.data

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await

/**
 * Creates Firebase Auth accounts on someone else's behalf.
 *
 * `createUserWithEmailAndPassword` signs the new account in on whichever
 * FirebaseAuth instance it is called on — so calling it from the admin's own
 * instance would drop the admin's session and leave them logged in as the
 * colleague they just created. The account has to be made somewhere the
 * current session is not.
 *
 * A second [FirebaseApp] with the same options gives exactly that: its own
 * auth instance, its own session, discarded immediately afterwards. The
 * admin's session is untouched throughout.
 *
 * The tidy alternative is the Admin SDK in a Cloud Function, which needs a
 * billing-enabled project; this stays on the free plan.
 */
class UserProvisioning(private val appContext: Context) {

    private companion object {
        const val SECONDARY_APP_NAME = "provisioning"
    }

    private fun secondaryApp(): FirebaseApp {
        FirebaseApp.getApps(appContext)
            .firstOrNull { it.name == SECONDARY_APP_NAME }
            ?.let { return it }

        val primary = FirebaseApp.getInstance()
        val options = FirebaseOptions.Builder()
            .setApiKey(primary.options.apiKey)
            .setApplicationId(primary.options.applicationId)
            .setProjectId(primary.options.projectId)
            .apply {
                primary.options.gcmSenderId?.let { setGcmSenderId(it) }
                primary.options.storageBucket?.let { setStorageBucket(it) }
                primary.options.databaseUrl?.let { setDatabaseUrl(it) }
            }
            .build()
        return FirebaseApp.initializeApp(appContext, options, SECONDARY_APP_NAME)
    }

    /**
     * Creates an account and returns its uid, leaving the caller signed in as
     * themselves.
     *
     * The new account is signed out of the secondary instance before
     * returning, so nothing is left holding a session for it.
     */
    suspend fun createAccount(email: String, password: String): String {
        val auth = FirebaseAuth.getInstance(secondaryApp())
        return try {
            val result = auth.createUserWithEmailAndPassword(email.trim(), password).await()
            result.user?.uid ?: error("The account was created but returned no id.")
        } finally {
            runCatching { auth.signOut() }
        }
    }

    /**
     * Removes an account created moments ago, for when the Firestore writes
     * that should have followed it failed.
     *
     * Only works while the secondary instance still holds that account's
     * session, which is why it is called before [createAccount]'s sign-out
     * takes effect on the next call. An account left behind here is not
     * catastrophic — the admin can delete it in the Firebase console — but it
     * would block that email address from being used again.
     */
    suspend fun deleteLastCreated() {
        val auth = FirebaseAuth.getInstance(secondaryApp())
        runCatching { auth.currentUser?.delete()?.await() }
        runCatching { auth.signOut() }
    }
}
