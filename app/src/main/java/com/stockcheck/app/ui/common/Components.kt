package com.stockcheck.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.PermissionSet
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.ui.theme.StatusColors

/**
 * Renders [content] only when [permission] is granted.
 *
 * Hiding rather than disabling is deliberate: a worker who can never delete
 * should not spend the shift looking at a greyed-out Delete button. Controls
 * that are merely unavailable *right now* — locked record, nothing selected —
 * stay visible and disabled instead, because that state is temporary and the
 * user needs to know the action exists.
 */
@Composable
fun IfAllowed(
    permissions: PermissionSet,
    permission: Permission,
    content: @Composable () -> Unit,
) {
    if (permissions.has(permission)) content()
}

@Composable
fun IfAnyAllowed(
    permissions: PermissionSet,
    vararg anyOf: Permission,
    content: @Composable () -> Unit,
) {
    if (permissions.hasAny(*anyOf)) content()
}

/** Coloured pill showing where a stock check sits in the workflow. */
@Composable
fun StatusChip(status: StockStatus, modifier: Modifier = Modifier) {
    val color = when (status) {
        StockStatus.DRAFT -> StatusColors.draft()
        StockStatus.IN_PROGRESS -> StatusColors.inProgress()
        StockStatus.COMPLETED -> StatusColors.completed()
        StockStatus.REVIEWED -> StatusColors.reviewed()
        StockStatus.LOCKED -> StatusColors.locked()
    }
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (status == StockStatus.LOCKED) {
            Icon(
                imageVector = Icons.Filled.Lock,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(13.dp),
            )
            Spacer(Modifier.width(4.dp))
        }
        Text(
            text = status.label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
    }
}

/** Large, centred message for a screen with nothing to show yet. */
@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(52.dp),
            tint = MaterialTheme.colorScheme.outline,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (action != null) {
            Spacer(Modifier.height(20.dp))
            action()
        }
    }
}

/** One figure in the running-totals bar at the foot of the counting screen. */
@Composable
fun TotalTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    emphasis: Boolean = false,
) {
    Column(
        modifier = modifier.padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = value,
            style = if (emphasis) {
                MaterialTheme.typography.headlineSmall
            } else {
                MaterialTheme.typography.titleMedium
            },
            color = if (emphasis) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurface
            },
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Banner used for offline notices and permission refusals. */
@Composable
fun NoticeBar(
    text: String,
    modifier: Modifier = Modifier,
    tone: NoticeTone = NoticeTone.INFO,
) {
    val background: Color
    val foreground: Color
    when (tone) {
        NoticeTone.INFO -> {
            background = MaterialTheme.colorScheme.secondaryContainer
            foreground = MaterialTheme.colorScheme.onSecondaryContainer
        }
        NoticeTone.ERROR -> {
            background = MaterialTheme.colorScheme.errorContainer
            foreground = MaterialTheme.colorScheme.onErrorContainer
        }
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(background)
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = foreground)
    }
}

enum class NoticeTone { INFO, ERROR }

/** Standard content padding so every screen lines up with every other. */
val ScreenPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
