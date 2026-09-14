package com.stockcheck.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockcheck.app.data.AuthState
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.data.sessionOrNull
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Holds the signed-in session for the whole app.
 *
 * Scoped to the activity so every screen reads the same permissions, and so a
 * role change pushed from Firestore re-composes every screen at once rather
 * than leaving a stale tab with buttons the user may no longer use.
 */
class SessionViewModel : ViewModel() {

    private val auth = ServiceLocator.auth
    private val templates = ServiceLocator.templates

    val authState: StateFlow<AuthState> = auth.authState()
        // Anything that escapes the repository's own handling is reported, not
        // turned into SignedOut. Collapsing errors into "signed out" is what
        // made a failing session look like a sign-in button that did nothing.
        .catch { error ->
            emit(AuthState.Failed(error.message ?: error.toString(), auth.currentUid.orEmpty()))
        }
        .stateIn(viewModelScope, SharingStarted.Eagerly, AuthState.Loading)

    private val _formError = MutableStateFlow<String?>(null)
    val formError: StateFlow<String?> = _formError.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    fun signIn(email: String, password: String, companyCode: String) = runForm {
        require(email.isNotBlank()) { "Enter your email address." }
        require(password.isNotBlank()) { "Enter your password." }
        require(companyCode.isNotBlank()) { "Enter your company code." }
        auth.signIn(email, password, companyCode)
    }

    fun joinCompany(
        email: String,
        password: String,
        displayName: String,
        joinCode: String,
    ) = runForm {
        require(email.isNotBlank()) { "Enter an email address." }
        require(password.length >= 6) { "The password must be at least 6 characters." }
        require(joinCode.isNotBlank()) { "Enter the company code your administrator gave you." }
        auth.joinCompany(email, password, displayName, joinCode)
    }

    fun createCompany(
        email: String,
        password: String,
        displayName: String,
        companyName: String,
        joinCode: String,
    ) = runForm {
        require(email.isNotBlank()) { "Enter an email address." }
        require(password.length >= 6) { "The password must be at least 6 characters." }
        require(companyName.isNotBlank()) { "Enter your company name." }
        require(joinCode.trim().length >= 4) { "The company code must be at least 4 characters." }
        auth.createCompany(email, password, displayName, companyName, joinCode)
    }

    /** Repairs an account that signed in but has no profile document. */
    fun completeSetup() = runForm {
        auth.completeSetup()
    }

    fun changePassword(current: String, new: String, confirm: String, onDone: () -> Unit) =
        runForm {
            require(current.isNotBlank()) { "Enter your current password." }
            require(new == confirm) { "The two new passwords do not match." }
            auth.changeOwnPassword(current, new)
            onDone()
        }

    fun resetPassword(email: String) = runForm {
        require(email.isNotBlank()) { "Enter your email address first." }
        auth.sendPasswordReset(email)
        _formError.value = "A reset link has been sent to $email."
    }

    fun signOut() {
        auth.signOut()
    }

    fun clearError() {
        _formError.value = null
    }

    /**
     * Writes the starter templates once an admin is present.
     *
     * Called from the templates screen rather than at startup because it needs
     * a session whose permissions allow the write.
     */
    fun seedTemplatesIfNeeded() {
        val session = authState.value.sessionOrNull ?: return
        viewModelScope.launch {
            runCatching { templates.seedDefaults(session) }
        }
    }

    private fun runForm(block: suspend () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            _formError.value = null
            runCatching { block() }.onFailure { error ->
                // Firebase's messages are user-facing enough to show directly,
                // and are far more useful than a generic failure string.
                _formError.value = error.message ?: "Something went wrong."
            }
            _busy.value = false
        }
    }
}
