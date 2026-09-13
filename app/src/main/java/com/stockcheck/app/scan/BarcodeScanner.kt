package com.stockcheck.app.scan

import android.annotation.SuppressLint
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.concurrent.futures.await
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** A barcode the camera read, with the symbology so the UI can label it. */
data class ScannedCode(val value: String, val format: String)

/**
 * Live camera preview that reports barcodes as they are recognised.
 *
 * Repeats are suppressed for [debounceMillis] because a barcode sitting in
 * frame is re-detected every analysed frame; without this a single item under
 * the lens would be reported dozens of times a second.
 */
@Composable
fun BarcodeScannerPreview(
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    debounceMillis: Long = 1_500L,
    onScanned: (ScannedCode) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnScanned by rememberUpdatedState(onScanned)

    val executor: ExecutorService = remember { Executors.newSingleThreadExecutor() }
    val scanner: BarcodeScanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                // Retail and warehouse symbologies only. Narrowing the set makes
                // detection measurably faster and stops the scanner locking onto
                // QR codes printed on unrelated packaging.
                .setBarcodeFormats(
                    Barcode.FORMAT_EAN_13,
                    Barcode.FORMAT_EAN_8,
                    Barcode.FORMAT_UPC_A,
                    Barcode.FORMAT_UPC_E,
                    Barcode.FORMAT_CODE_128,
                    Barcode.FORMAT_CODE_39,
                    Barcode.FORMAT_ITF,
                    Barcode.FORMAT_QR_CODE,
                    Barcode.FORMAT_DATA_MATRIX,
                )
                .build(),
        )
    }
    val analyzer = remember {
        DebouncingBarcodeAnalyzer(scanner, debounceMillis) { currentOnScanned(it) }
    }

    DisposableEffect(Unit) {
        onDispose {
            analyzer.close()
            scanner.close()
            executor.shutdown()
        }
    }

    val previewView = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }

    // Bound from a coroutine so the provider is awaited without blocking and
    // without a nested listener callback; `await()` comes from
    // androidx.concurrent:concurrent-futures-ktx.
    LaunchedEffect(enabled, lifecycleOwner) {
        val provider = runCatching { ProcessCameraProvider.getInstance(context).await() }
            .getOrNull() ?: return@LaunchedEffect

        provider.unbindAll()
        if (!enabled) return@LaunchedEffect

        val preview = Preview.Builder().build().apply {
            surfaceProvider = previewView.surfaceProvider
        }
        val analysis = ImageAnalysis.Builder()
            // Dropping stale frames keeps the preview responsive; a barcode
            // missed on one frame is caught on the next.
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .apply { setAnalyzer(executor, analyzer) }

        runCatching {
            provider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analysis,
            )
        }
    }

    AndroidView(modifier = modifier, factory = { previewView })
}

/**
 * Feeds camera frames to ML Kit and forwards distinct results.
 *
 * The same value is not reported again until [debounceMillis] has passed, so
 * an item left in frame produces one scan, not a stream of them.
 */
private class DebouncingBarcodeAnalyzer(
    private val scanner: BarcodeScanner,
    private val debounceMillis: Long,
    private val onScanned: (ScannedCode) -> Unit,
) : ImageAnalysis.Analyzer {

    private var lastValue: String? = null
    private var lastAtMillis: Long = 0L
    @Volatile private var closed = false

    @SuppressLint("UnsafeOptInUsageError")
    @ExperimentalGetImage
    override fun analyze(imageProxy: ImageProxy) {
        if (closed) {
            imageProxy.close()
            return
        }
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }
        val input = InputImage.fromMediaImage(
            mediaImage,
            imageProxy.imageInfo.rotationDegrees,
        )
        scanner.process(input)
            .addOnSuccessListener { barcodes ->
                val raw = barcodes.firstNotNullOfOrNull { it.rawValue?.takeIf(String::isNotBlank) }
                if (raw != null) emit(raw, barcodes.first().format)
            }
            // The frame must be closed on every path or the camera pipeline
            // stalls after a handful of frames.
            .addOnCompleteListener { imageProxy.close() }
    }

    private fun emit(value: String, format: Int) {
        val now = System.currentTimeMillis()
        if (value == lastValue && now - lastAtMillis < debounceMillis) return
        lastValue = value
        lastAtMillis = now
        onScanned(ScannedCode(value, formatName(format)))
    }

    fun close() {
        closed = true
    }

    private fun formatName(format: Int): String = when (format) {
        Barcode.FORMAT_EAN_13 -> "EAN-13"
        Barcode.FORMAT_EAN_8 -> "EAN-8"
        Barcode.FORMAT_UPC_A -> "UPC-A"
        Barcode.FORMAT_UPC_E -> "UPC-E"
        Barcode.FORMAT_CODE_128 -> "Code 128"
        Barcode.FORMAT_CODE_39 -> "Code 39"
        Barcode.FORMAT_ITF -> "ITF"
        Barcode.FORMAT_QR_CODE -> "QR"
        Barcode.FORMAT_DATA_MATRIX -> "Data Matrix"
        else -> "Barcode"
    }
}
