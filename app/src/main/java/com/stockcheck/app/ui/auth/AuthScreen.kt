package com.stockcheck.app.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.stockcheck.app.BuildConfig
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone

/** Which of the three things the form is currently doing. */
private enum class AuthMode(val label: String, val title: String, val action: String) {
    SIGN_IN("Sign in", "Sign in to continue counting", "Sign in"),
    JOIN("Join", "Join your company with its code", "Join company"),
    CREATE("New company", "Set up a new company on JEXO", "Create company"),
}

/**
 * Sign-in, joining an existing company, and creating a new one.
 *
 * All three live on one screen because which one a person needs depends on
 * something only they know — whether their employer is already using the app
 * — and on nothing the app could work out for them.
 */
@Composable
fun AuthScreen(
    busy: Boolean,
    error: String?,
    onSignIn: (email: String, password: String, companyCode: String) -> Unit,
    onCreateCompany: (
        email: String,
        password: String,
        name: String,
        companyName: String,
        code: String,
    ) -> Unit,
    onJoinCompany: (
        email: String,
        password: String,
        name: String,
        code: String,
    ) -> Unit,
    onResetPassword: (email: String, companyCode: String) -> Unit,
    onClearError: () -> Unit,
) {
    var mode by remember { mutableStateOf(AuthMode.SIGN_IN) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var companyName by remember { mutableStateOf("") }
    var joinCode by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    // A typo in a password nobody can see costs an account that cannot be
    // signed into and an email address that cannot be reused, so the mismatch
    // is shown while typing rather than after submitting.
    val creatingAccount = mode != AuthMode.SIGN_IN
    val passwordsMatch = !creatingAccount || confirmPassword == password
    val confirmTouched = confirmPassword.isNotEmpty()

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Inventory2,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(12.dp))
            Text("JEXO Count", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                text = mode.title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(20.dp))

            val fieldModifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 420.dp)

            SingleChoiceSegmentedButtonRow(modifier = fieldModifier) {
                AuthMode.entries.forEachIndexed { index, option ->
                    SegmentedButton(
                        selected = mode == option,
                        onClick = { mode = option; onClearError() },
                        shape = SegmentedButtonDefaults.itemShape(index, AuthMode.entries.size),
                        enabled = !busy,
                    ) {
                        Text(option.label, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            if (error != null) {
                NoticeBar(text = error, tone = NoticeTone.ERROR)
                Spacer(Modifier.height(16.dp))
            }

            if (mode != AuthMode.SIGN_IN) {
                OutlinedTextField(
                    value = displayName,
                    onValueChange = { displayName = it; onClearError() },
                    label = { Text("Your name") },
                    singleLine = true,
                    modifier = fieldModifier,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
                Spacer(Modifier.height(12.dp))
            }

            OutlinedTextField(
                value = email,
                onValueChange = { email = it; onClearError() },
                label = { Text("Email") },
                singleLine = true,
                modifier = fieldModifier,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
            )
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it; onClearError() },
                label = { Text("Password") },
                singleLine = true,
                modifier = fieldModifier,
                visualTransformation = if (passwordVisible) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Next,
                ),
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector = if (passwordVisible) {
                                Icons.Filled.VisibilityOff
                            } else {
                                Icons.Filled.Visibility
                            },
                            contentDescription = if (passwordVisible) {
                                "Hide password"
                            } else {
                                "Show password"
                            },
                        )
                    }
                },
            )

            if (creatingAccount) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; onClearError() },
                    label = { Text("Confirm password") },
                    singleLine = true,
                    modifier = fieldModifier,
                    isError = confirmTouched && !passwordsMatch,
                    supportingText = {
                        when {
                            confirmTouched && !passwordsMatch ->
                                Text("The two passwords do not match.")
                            password.isNotEmpty() && password.length < 6 ->
                                Text("Use at least 6 characters.")
                            else -> Text("Type the same password again.")
                        }
                    },
                    visualTransformation = if (passwordVisible) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Next,
                    ),
                )
            }

            if (mode == AuthMode.CREATE) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = companyName,
                    onValueChange = { companyName = it; onClearError() },
                    label = { Text("Company name") },
                    singleLine = true,
                    modifier = fieldModifier,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
            }

            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = joinCode,
                onValueChange = { joinCode = it.uppercase().trim(); onClearError() },
                label = { Text("Company code") },
                supportingText = {
                    Text(
                        if (mode == AuthMode.CREATE) {
                            "A short identifier for your company, e.g. UPOINT"
                        } else {
                            "The code for your company. Ask your administrator."
                        },
                    )
                },
                singleLine = true,
                modifier = fieldModifier,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            )

            if (mode == AuthMode.CREATE) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Staff join with this code (Join), or you add them from " +
                        "Profile and give each person their password.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = fieldModifier,
                )
            }

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = {
                    when (mode) {
                        AuthMode.SIGN_IN -> onSignIn(email, password, joinCode)
                        AuthMode.JOIN -> onJoinCompany(email, password, displayName, joinCode)
                        AuthMode.CREATE ->
                            onCreateCompany(email, password, displayName, companyName, joinCode)
                    }
                },
                // Blocked outright on a mismatch: submitting would create the
                // account under whichever password was typed first, which is
                // the one the person does not think they chose.
                enabled = !busy && passwordsMatch,
                modifier = fieldModifier.height(50.dp),
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(mode.action)
                }
            }

            if (mode == AuthMode.SIGN_IN) {
                TextButton(onClick = { onResetPassword(email, joinCode) }, enabled = !busy) {
                    Text("Forgot password")
                }
            }

            Spacer(Modifier.height(24.dp))
            Text(
                text = "build ${BuildConfig.BUILD_STAMP}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}
