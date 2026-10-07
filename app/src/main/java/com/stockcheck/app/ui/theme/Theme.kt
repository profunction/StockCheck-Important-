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
 * The same green as the Pos Stock Check website, so the phone and the till
 * look like one product. Every role is set, including the surface
 * containers cards and the bottom bar are drawn on -- left out, Material
 * fills them with its own purple-grey. Amber (tertiary) is "look at this":
 * a count that differs, a warning, a count in progress.
 */
private val Green40 = Color(0xFF1F6B45)
private val Green80 = Color(0xFF8FD8AE)
private val Amber40 = Color(0xFF8A5100)
private val Amber80 = Color(0xFFFFB86E)
private val Red40 = Color(0xFFB3261E)
private val Red80 = Color(0xFFF2B8B5)

private val LightColors = lightColorScheme(
    primary = Green40,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFC6EED6),
    onPrimaryContainer = Color(0xFF00210F),
    inversePrimary = Green80,
    secondary = Color(0xFF4D6356),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD0E8D8),
    onSecondaryContainer = Color(0xFF0A1F14),
    tertiary = Amber40,
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFDCBD),
    onTertiaryContainer = Color(0xFF2C1600),
    error = Red40,
    onError = Color.White,
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF410E0B),
    background = Color(0xFFF6F8F4),
    onBackground = Color(0xFF17201A),
    surface = Color(0xFFF6F8F4),
    onSurface = Color(0xFF17201A),
    surfaceVariant = Color(0xFFDCE5DC),
    onSurfaceVariant = Color(0xFF414942),
    surfaceTint = Green40,
    inverseSurface = Color(0xFF2C322D),
    inverseOnSurface = Color(0xFFEDF2EC),
    outline = Color(0xFF717971),
    outlineVariant = Color(0xFFC1C9C0),
    surfaceBright = Color(0xFFF6F8F4),
    surfaceDim = Color(0xFFD6DBD5),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF0F3EE),
    surfaceContainer = Color(0xFFEAEEE8),
    surfaceContainerHigh = Color(0xFFE4E9E3),
    surfaceContainerHighest = Color(0xFFDFE4DD),
)

private val DarkColors = darkColorScheme(
    primary = Green80,
    onPrimary = Color(0xFF00391F),
    primaryContainer = Color(0xFF005231),
    onPrimaryContainer = Color(0xFFABF4C9),
    inversePrimary = Green40,
    secondary = Color(0xFFB4CCBC),
    onSecondary = Color(0xFF1F3528),
    secondaryContainer = Color(0xFF364B3E),
    onSecondaryContainer = Color(0xFFD0E8D8),
    tertiary = Amber80,
    onTertiary = Color(0xFF4A2800),
    tertiaryContainer = Color(0xFF6A3C00),
    onTertiaryContainer = Color(0xFFFFDCBD),
    error = Red80,
    onError = Color(0xFF601410),
    errorContainer = Color(0xFF8C1D18),
    onErrorContainer = Color(0xFFF9DEDC),
    background = Color(0xFF0F1511),
    onBackground = Color(0xFFDFE4DD),
    surface = Color(0xFF0F1511),
    onSurface = Color(0xFFDFE4DD),
    surfaceVariant = Color(0xFF414942),
    onSurfaceVariant = Color(0xFFC1C9C0),
    surfaceTint = Green80,
    inverseSurface = Color(0xFFDFE4DD),
    inverseOnSurface = Color(0xFF2C322D),
    outline = Color(0xFF8B938A),
    outlineVariant = Color(0xFF414942),
    surfaceBright = Color(0xFF353B36),
    surfaceDim = Color(0xFF0F1511),
    surfaceContainerLowest = Color(0xFF0A0F0C),
    surfaceContainerLow = Color(0xFF171D19),
    surfaceContainer = Color(0xFF1B211D),
    surfaceContainerHigh = Color(0xFF252B27),
    surfaceContainerHighest = Color(0xFF303632),
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

/** Softer corners, matching the website's cards and buttons. */
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
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
