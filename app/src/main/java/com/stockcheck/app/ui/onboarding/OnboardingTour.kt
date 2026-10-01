package com.stockcheck.app.ui.onboarding

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.annotation.StringRes
import com.stockcheck.app.R

/**
 * Whether this account has already dismissed the first-run tour, on this
 * device.
 *
 * Keyed by uid rather than kept as one flag for the phone: several of this
 * app's customers hand one phone between several workers, each signing in
 * under their own account, and a tour one worker already saw is not one the
 * next worker has.
 */
object OnboardingSeen {
    private const val PREFS = "onboarding"

    fun wasSeen(context: Context, uid: String): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(uid, false)

    fun markSeen(context: Context, uid: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(uid, true)
            .apply()
    }
}

private data class Step(
    val icon: ImageVector,
    @StringRes val title: Int,
    @StringRes val body: Int,
)

private val steps = listOf(
    Step(Icons.Filled.Inventory2, R.string.onboarding_step1_title, R.string.onboarding_step1_body),
    Step(Icons.Filled.QrCodeScanner, R.string.onboarding_step2_title, R.string.onboarding_step2_body),
    Step(Icons.Filled.Remove, R.string.onboarding_step3_title, R.string.onboarding_step3_body),
    Step(Icons.Filled.Mic, R.string.onboarding_step4_title, R.string.onboarding_step4_body),
    Step(Icons.Filled.Check, R.string.onboarding_step5_title, R.string.onboarding_step5_body),
)

/**
 * A short, full-screen tour: what scanning does, how to undo a mis-scan, and
 * where a finished count ends up.
 *
 * Shown once automatically after sign-in, and reachable again any time from
 * Profile -- a founder teaching this app to a new hire by voice, over and
 * over, is the thing this screen exists to save them from doing.
 */
@Composable
fun OnboardingTour(onDone: () -> Unit) {
    var index by remember { mutableIntStateOf(0) }
    val step = steps[index]
    val last = index == steps.lastIndex

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (!last) {
                    TextButton(onClick = onDone) { Text(stringResource(R.string.onboarding_skip)) }
                }
            }

            Column(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(96.dp),
                ) {
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                        Icon(
                            imageVector = step.icon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.size(44.dp),
                        )
                    }
                }
                Spacer(Modifier.height(28.dp))
                Text(
                    text = stringResource(step.title),
                    style = MaterialTheme.typography.headlineSmall,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(step.body),
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                steps.indices.forEach { i ->
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .size(if (i == index) 10.dp else 8.dp)
                            .background(
                                color = if (i == index) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                                shape = CircleShape,
                            ),
                    )
                }
            }
            Spacer(Modifier.height(20.dp))

            Button(
                onClick = { if (last) onDone() else index++ },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(if (last) R.string.onboarding_done else R.string.onboarding_next))
            }
        }
    }
}
