package com.stockcheck.app.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.stockcheck.app.model.InkPoint
import com.stockcheck.app.model.SignatureInk

/**
 * Captures a signature by finger.
 *
 * Replaces what used to be a plain text box labelled "Signature": a template
 * could declare the field, someone could type a name into it, and the record
 * carried no more weight than a remark. A field that claims to hold a
 * signature and holds a typed word is worse than no field, because it reads
 * like proof.
 *
 * The strokes themselves are what is stored — see [SignatureInk] — so the
 * signature syncs with the count instead of living on one phone.
 */
@Composable
fun SignaturePad(
    ink: String,
    enabled: Boolean,
    onInkChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Seeded from the stored value, then owned locally: re-decoding on every
    // recomposition would fight the finger currently drawing.
    var strokes by remember(ink.isEmpty()) {
        mutableStateOf(SignatureInk.decode(ink))
    }
    var active by remember { mutableStateOf<List<InkPoint>>(emptyList()) }
    fun publish() {
        onInkChange(SignatureInk.encode(strokes))
    }

    Column(modifier = modifier) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.outline,
                    shape = RoundedCornerShape(8.dp),
                )
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    detectDragGestures(
                        onDragStart = { offset ->
                            active = listOf(normalise(offset, size.width, size.height))
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            active = active + normalise(change.position, size.width, size.height)
                        },
                        onDragEnd = {
                            if (active.size > 1) {
                                strokes = strokes + listOf(SignatureInk.thin(active))
                                publish()
                            }
                            active = emptyList()
                        },
                        onDragCancel = { active = emptyList() },
                    )
                },
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val colour = if (enabled) {
                    androidx.compose.ui.graphics.Color.Black
                } else {
                    androidx.compose.ui.graphics.Color.DarkGray
                }
                (strokes + listOf(active)).forEach { stroke ->
                    if (stroke.size < 2) return@forEach
                    val path = Path().apply {
                        val first = stroke.first()
                        moveTo(first.x * size.width, first.y * size.height)
                        stroke.drop(1).forEach { point ->
                            lineTo(point.x * size.width, point.y * size.height)
                        }
                    }
                    drawPath(
                        path = path,
                        color = colour,
                        style = Stroke(width = 3.dp.toPx()),
                    )
                }
            }

            if (strokes.isEmpty() && active.isEmpty()) {
                Text(
                    text = if (enabled) "Sign here" else "Not signed",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!enabled) {
                Text(
                    text = "Your role cannot sign this field.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
            if (enabled && strokes.isNotEmpty()) {
                TextButton(
                    onClick = {
                        strokes = emptyList()
                        active = emptyList()
                        publish()
                    },
                ) { Text("Clear") }
            }
        }
    }
}

/**
 * Shows a stored signature without allowing changes.
 *
 * Used where a signed record is being reviewed rather than created.
 */
@Composable
fun SignatureView(ink: String, modifier: Modifier = Modifier) {
    val strokes = remember(ink) { SignatureInk.decode(ink) }
    Canvas(modifier = modifier) {
        strokes.forEach { stroke ->
            if (stroke.size < 2) return@forEach
            val path = Path().apply {
                val first = stroke.first()
                moveTo(first.x * size.width, first.y * size.height)
                stroke.drop(1).forEach { point ->
                    lineTo(point.x * size.width, point.y * size.height)
                }
            }
            drawPath(
                path = path,
                color = androidx.compose.ui.graphics.Color.Black,
                style = Stroke(width = 2.dp.toPx()),
            )
        }
    }
}

private fun normalise(offset: Offset, width: Int, height: Int): InkPoint =
    InkPoint(
        x = if (width > 0) (offset.x / width).coerceIn(0f, 1f) else 0f,
        y = if (height > 0) (offset.y / height).coerceIn(0f, 1f) else 0f,
    )
