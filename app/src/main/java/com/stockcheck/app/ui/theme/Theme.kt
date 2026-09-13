package com.stockcheck.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

/**
 * A deliberately high-contrast palette: this app is used on a warehouse floor,
 * often one-handed, sometimes under poor light. Dynamic colour is not used so
 * that the status colours below always mean the same thing on every device.
 */
private val Green40 = Color(0xFF0F5132)
private val Green80 = Color(0xFF7BD3A4)
private val Sand40 = Color(0xFF7A5A00)
private val Sand80 = Color(0xFFF2C94C)
private val Red40 = Color(0xFFB3261E)
private val Red80 = Color(0xFFF2B8B5)

private val LightColors = lightColorScheme(
    primary = Green40,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFC7F0D8),
    onPrimaryContainer = Color(0xFF002110),
    secondary = Sand40,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE9A8),
    onSecondaryContainer = Color(0xFF261A00),
    error = Red40,
    onError = Color.White,
    background = Color(0xFFFBFDF8),
    onBackground = Color(0xFF191C1A),
    surface = Color(0xFFFBFDF8),
    onSurface = Color(0xFF191C1A),
    surfaceVariant = Color(0xFFDCE5DC),
    onSurfaceVariant = Color(0xFF404942),
    outline = Color(0xFF707972),
)

private val DarkColors = darkColorScheme(
    primary = Green80,
    onPrimary = Color(0xFF003920),
    primaryContainer = Color(0xFF00522F),
    onPrimaryContainer = Color(0xFFC7F0D8),
    secondary = Sand80,
    onSecondary = Color(0xFF3F2E00),
    secondaryContainer = Color(0xFF5B4300),
    onSecondaryContainer = Color(0xFFFFE9A8),
    error = Red80,
    onError = Color(0xFF601410),
    background = Color(0xFF191C1A),
    onBackground = Color(0xFFE1E3DF),
    surface = Color(0xFF191C1A),
    onSurface = Color(0xFFE1E3DF),
    surfaceVariant = Color(0xFF404942),
    onSurfaceVariant = Color(0xFFC0C9C0),
    outline = Color(0xFF8A938B),
)

/** Status colours are resolved separately so they survive the dark swap. */
object StatusColors {
    @Composable fun draft() = MaterialTheme.colorScheme.outline
    @Composable fun inProgress() = MaterialTheme.colorScheme.secondary
    @Composable fun completed() = MaterialTheme.colorScheme.primary
    @Composable fun reviewed() = if (isSystemInDarkTheme()) Color(0xFF82B1FF) else Color(0xFF1A56DB)
    @Composable fun locked() = MaterialTheme.colorScheme.error
}

private val AppTypography = Typography(
    // Counting screens show quantities that must be readable at arm's length.
    displaySmall = TextStyle(fontSize = 40.sp, fontWeight = FontWeight.Bold),
    headlineSmall = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun StockCheckTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }
    MaterialTheme(colorScheme = colors, typography = AppTypography, content = content)
}
