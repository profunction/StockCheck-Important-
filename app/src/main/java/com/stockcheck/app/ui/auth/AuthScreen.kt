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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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

/**
 * Sign-in and registration.
 *
 * Registration is open because the first account to register becomes the
 * workspace admin; afterwards every new account lands on Worker with no
 * ability to see anyone else's counts, and an admin promotes from Page 5.
 */
@Composable
fun AuthScreen(
    busy: Boolean,
    error: String?,
    onSignIn: (email: String, password: String) -> Unit,
    onRegister: (email: String, password: String, displayName: String, joinCode: String) -> Unit,
    onResetPassword: (email: String) -> Unit,
    onClearError: () -> Unit,
) {
    var registering by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var joinCode by remember { mutableStateOf("") }

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
            Text("Stock Check", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                text = if (registering) {
                    "Create an account for this workspace"
                } else {
                    "Sign in to continue counting"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))

            if (error != null) {
                NoticeBar(text = error, tone = NoticeTone.ERROR)
                Spacer(Modifier.height(16.dp))
            }

            val fieldModifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 420.dp)

            if (registering) {
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
                    imeAction = ImeAction.Done,
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

            if (registering) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = joinCode,
                    onValueChange = { joinCode = it.uppercase(); onClearError() },
                    label = { Text("Company code") },
                    supportingText = {
                        Text("Ask your administrator. It is not the same as your password.")
                    },
                    singleLine = true,
                    modifier = fieldModifier,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Done,
                    ),
                )
            }

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = {
                    if (registering) onRegister(email, password, displayName, joinCode)
                    else onSignIn(email, password)
                },
                enabled = !busy,
                modifier = fieldModifier.height(50.dp),
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(if (registering) "Create account" else "Sign in")
                }
            }

            Spacer(Modifier.height(8.dp))

            TextButton(
                onClick = {
                    registering = !registering
                    onClearError()
                },
                enabled = !busy,
            ) {
                Text(
                    if (registering) {
                        "I already have an account"
                    } else {
                        "Create a new account"
                    },
                )
            }

            if (!registering) {
                TextButton(onClick = { onResetPassword(email) }, enabled = !busy) {
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
