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
 * NEXO Count: the same teal and ink navy as NEXO POS and NEXO Cloud, so
 * the phone and the till look like one product. Every role is set,
 * including the surface containers cards and the bottom bar are drawn on --
 * left out, Material fills them with its own purple-grey. Amber (tertiary)
 * is "look at this": a count that differs, a warning, a count in progress.
 */
private val Teal40 = Color(0xFF0F766E)
private val Teal80 = Color(0xFF5EEAD4)
private val Amber40 = Color(0xFF8A5100)
private val Amber80 = Color(0xFFFFB86E)
private val Red40 = Color(0xFFB3261E)
private val Red80 = Color(0xFFF2B8B5)

private val LightColors = lightColorScheme(
    primary = Teal40,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFCCF0EA),
    onPrimaryContainer = Color(0xFF00201D),
    inversePrimary = Teal80,
    secondary = Color(0xFF475A6C),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD6E2EE),
    onSecondaryContainer = Color(0xFF0B1B2B),
    tertiary = Amber40,
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFDCBD),
    onTertiaryContainer = Color(0xFF2C1600),
    error = Red40,
    onError = Color.White,
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF410E0B),
    background = Color(0xFFF3F5F8),
    onBackground = Color(0xFF13202D),
    surface = Color(0xFFF3F5F8),
    onSurface = Color(0xFF13202D),
    surfaceVariant = Color(0xFFDDE3EA),
    onSurfaceVariant = Color(0xFF414B55),
    surfaceTint = Teal40,
    inverseSurface = Color(0xFF0B1B2B),
    inverseOnSurface = Color(0xFFEAF0F5),
    outline = Color(0xFF6F7A85),
    outlineVariant = Color(0xFFC2CAD3),
    surfaceBright = Color(0xFFF3F5F8),
    surfaceDim = Color(0xFFD5DBE2),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFEEF1F5),
    surfaceContainer = Color(0xFFE8ECF1),
    surfaceContainerHigh = Color(0xFFE2E7ED),
    surfaceContainerHighest = Color(0xFFDCE2E9),
)

private val DarkColors = darkColorScheme(
    primary = Teal80,
    onPrimary = Color(0xFF003732),
    primaryContainer = Color(0xFF0F4C4A),
    onPrimaryContainer = Color(0xFFB7F5EC),
    inversePrimary = Teal40,
    secondary = Color(0xFFB4C7DA),
    onSecondary = Color(0xFF1E3142),
    secondaryContainer = Color(0xFF12385A),
    onSecondaryContainer = Color(0xFFD6E2EE),
    tertiary = Amber80,
    onTertiary = Color(0xFF4A2800),
    tertiaryContainer = Color(0xFF6A3C00),
    onTertiaryContainer = Color(0xFFFFDCBD),
    error = Red80,
    onError = Color(0xFF601410),
    errorContainer = Color(0xFF8C1D18),
    onErrorContainer = Color(0xFFF9DEDC),
    background = Color(0xFF0A121B),
    onBackground = Color(0xFFDDE5EC),
    surface = Color(0xFF0A121B),
    onSurface = Color(0xFFDDE5EC),
    surfaceVariant = Color(0xFF3A4652),
    onSurfaceVariant = Color(0xFFBEC8D2),
    surfaceTint = Teal80,
    inverseSurface = Color(0xFFDDE5EC),
    inverseOnSurface = Color(0xFF1B2733),
    outline = Color(0xFF85919C),
    outlineVariant = Color(0xFF3A4652),
    surfaceBright = Color(0xFF2E3A46),
    surfaceDim = Color(0xFF0A121B),
    surfaceContainerLowest = Color(0xFF060C12),
    surfaceContainerLow = Color(0xFF111B25),
    surfaceContainer = Color(0xFF15202B),
    surfaceContainerHigh = Color(0xFF1F2A35),
    surfaceContainerHighest = Color(0xFF2A3540),
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

/** Corners matching NEXO POS and the website: crisp, not bubbly. */
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
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
