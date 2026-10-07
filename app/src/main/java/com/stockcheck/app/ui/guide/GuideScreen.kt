package com.stockcheck.app.ui.guide

import android.net.Uri
import android.widget.VideoView
import androidx.annotation.ArrayRes
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.stockcheck.app.R

/** One job in the guide: its steps, and the video that shows it. */
private data class GuideSection(@StringRes val title: Int, @ArrayRes val steps: Int, val video: String)

private val SECTIONS = listOf(
    GuideSection(R.string.guide_count_title, R.array.guide_count_steps, "app-1-count"),
    GuideSection(R.string.guide_stock_title, R.array.guide_stock_steps, "app-2-stock"),
    GuideSection(R.string.guide_team_title, R.array.guide_team_steps, "app-3-team"),
)

/**
 * How to use: each job as numbered steps written into the app (readable with
 * no signal), a short video of it streamed from the website, and the guides
 * for the till and the warehouse system.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuideScreen(onBack: () -> Unit, onOpenTour: () -> Unit) {
    val uri = LocalUriHandler.current
    var playing by remember { mutableStateOf<String?>(null) }
    val open: (String) -> Unit = { url -> runCatching { uri.openUri(url) } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.guide_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Text(stringResource(R.string.guide_intro), style = MaterialTheme.typography.bodyLarge) }
            SECTIONS.forEach { section ->
                item {
                    Card {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(stringResource(section.title), style = MaterialTheme.typography.titleLarge)
                            stringArrayResource(section.steps).forEachIndexed { i, step -> Step(i + 1, step) }
                            Button(onClick = { playing = section.video }, modifier = Modifier.fillMaxWidth()) {
                                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text(stringResource(R.string.guide_play))
                            }
                        }
                    }
                }
            }
            item {
                Card {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.guide_more_title), style = MaterialTheme.typography.titleLarge)
                        Text(stringResource(R.string.guide_more_body), style = MaterialTheme.typography.bodyMedium)
                        OutlinedButton(onClick = { open("${Links.GUIDE}#pos") }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.guide_pos)) }
                        OutlinedButton(onClick = { open("${Links.GUIDE}#warehouse") }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.guide_warehouse)) }
                        OutlinedButton(onClick = onOpenTour, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.guide_tour)) }
                    }
                }
            }
        }
    }

    playing?.let { name -> VideoDialog(Links.video(name), onOpenInBrowser = { open(Links.video(name)) }, onDismiss = { playing = null }) }
}

@Composable
private fun Step(number: Int, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier.size(28.dp).background(MaterialTheme.colorScheme.primary, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(number.toString(), color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.width(12.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 2.dp))
    }
}

/**
 * Plays a guide video over the screen. Android plays WebM itself; when the
 * phone cannot (no signal, an old decoder), it says so and offers the
 * browser instead. Tap the picture to pause or carry on.
 */
@Composable
private fun VideoDialog(url: String, onOpenInBrowser: () -> Unit, onDismiss: () -> Unit) {
    var failed by remember { mutableStateOf(false) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Column {
                if (failed) {
                    Text(
                        stringResource(R.string.guide_video_failed),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                    )
                } else {
                    AndroidView(
                        factory = { ctx ->
                            VideoView(ctx).apply {
                                setVideoURI(Uri.parse(url))
                                setOnPreparedListener { start() }
                                setOnErrorListener { _, _, _ -> failed = true; true }
                                setOnClickListener { if (isPlaying) pause() else start() }
                            }
                        },
                        onRelease = { it.stopPlayback() },
                        modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black),
                    )
                }
                Row(modifier = Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onOpenInBrowser) { Text(stringResource(R.string.guide_open_browser)) }
                    TextButton(onClick = onDismiss) { Text(stringResource(R.string.guide_close)) }
                }
            }
        }
    }
}
