package com.stockcheck.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

/**
 * A deliberately high-contrast palette: this app is used on a warehouse floor,
 * often one-handed, sometimes under poor light. Dynamic colour is not used so
 * that the status colours below always mean the same thing on every device.
 *
 * SuXin Barcode Scan: the same plum on white as the website and
 * every SuXin web app (web/css/pos.css), so the phone and the till look like
 * one product. Every role is set,
 * including the surface containers cards and the bottom bar are drawn on --
 * left out, Material fills them with its own purple-grey. Amber (tertiary)
 * is "look at this": a count that differs, a warning, a count in progress.
 */
private val Plum40 = Color(0xFF714B67)
private val Plum80 = Color(0xFFD3A3C6)
private val Amber40 = Color(0xFF8A5100)
private val Amber80 = Color(0xFFFFB86E)
private val Red40 = Color(0xFFB3261E)
private val Red80 = Color(0xFFF2B8B5)

private val LightColors = lightColorScheme(
    primary = Plum40,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF7EDF4),
    onPrimaryContainer = Color(0xFF2F1029),
    inversePrimary = Plum80,
    secondary = Color(0xFF565E74),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDAE2FD),
    onSecondaryContainer = Color(0xFF12141D),
    tertiary = Amber40,
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFDCBD),
    onTertiaryContainer = Color(0xFF2C1600),
    error = Red40,
    onError = Color.White,
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF410E0B),
    background = Color(0xFFF5F6F8),
    onBackground = Color(0xFF12141D),
    surface = Color(0xFFF5F6F8),
    onSurface = Color(0xFF12141D),
    surfaceVariant = Color(0xFFE2E8F0),
    onSurfaceVariant = Color(0xFF4E444A),
    surfaceTint = Plum40,
    inverseSurface = Color(0xFF12141D),
    inverseOnSurface = Color(0xFFEAF1FF),
    outline = Color(0xFF80747A),
    outlineVariant = Color(0xFFCBD5E1),
    surfaceBright = Color(0xFFF5F6F8),
    surfaceDim = Color(0xFFDCE0E6),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF8FAFC),
    surfaceContainer = Color(0xFFF1F5F9),
    surfaceContainerHigh = Color(0xFFEDF0F4),
    surfaceContainerHighest = Color(0xFFE6EAF0),
)

private val DarkColors = darkColorScheme(
    primary = Plum80,
    onPrimary = Color(0xFF2F1029),
    primaryContainer = Color(0xFF3A2936),
    onPrimaryContainer = Color(0xFFFFD7F1),
    inversePrimary = Plum40,
    secondary = Color(0xFFBEC6E0),
    onSecondary = Color(0xFF283044),
    secondaryContainer = Color(0xFF3F465C),
    onSecondaryContainer = Color(0xFFDAE2FD),
    tertiary = Amber80,
    onTertiary = Color(0xFF4A2800),
    tertiaryContainer = Color(0xFF6A3C00),
    onTertiaryContainer = Color(0xFFFFDCBD),
    error = Red80,
    onError = Color(0xFF601410),
    errorContainer = Color(0xFF8C1D18),
    onErrorContainer = Color(0xFFF9DEDC),
    background = Color(0xFF121016),
    onBackground = Color(0xFFF2EEF5),
    surface = Color(0xFF121016),
    onSurface = Color(0xFFF2EEF5),
    surfaceVariant = Color(0xFF2C2633),
    onSurfaceVariant = Color(0xFFC4B9C9),
    surfaceTint = Plum80,
    inverseSurface = Color(0xFFF2EEF5),
    inverseOnSurface = Color(0xFF231E28),
    outline = Color(0xFF988EA2),
    outlineVariant = Color(0xFF2C2633),
    surfaceBright = Color(0xFF2C2633),
    surfaceDim = Color(0xFF121016),
    surfaceContainerLowest = Color(0xFF0D0B10),
    surfaceContainerLow = Color(0xFF17141B),
    surfaceContainer = Color(0xFF1B1820),
    surfaceContainerHigh = Color(0xFF221E28),
    surfaceContainerHighest = Color(0xFF2C2633),
)

/** Status colours are resolved separately so they survive the dark swap. */
object StatusColors {
    @Composable fun draft() = MaterialTheme.colorScheme.outline
    @Composable fun inProgress() = MaterialTheme.colorScheme.tertiary
    @Composable fun completed() = MaterialTheme.colorScheme.primary
    @Composable fun reviewed() = if (isSystemInDarkTheme()) Color(0xFF82B1FF) else Color(0xFF1A56DB)
    @Composable fun locked() = MaterialTheme.colorScheme.error
}

private val AppTypography = Typography(
    // Counting screens show quantities that must be readable at arm's length.
    displaySmall = TextStyle(fontSize = 40.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    headlineSmall = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp),
    titleLarge = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium),
)

/** Corners matching the website and the SuXin web apps: soft cards, rounder sheets. */
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
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
    MaterialTheme(colorScheme = colors, typography = AppTypography, shapes = AppShapes, content = content)
}
