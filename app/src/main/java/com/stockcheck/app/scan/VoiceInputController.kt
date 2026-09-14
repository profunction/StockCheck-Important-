package com.stockcheck.app.scan

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

/** What the microphone button is currently doing. */
sealed interface VoiceState {
    data object Idle : VoiceState
    data object Listening : VoiceState
    /** Partial text, shown live so the operator can see they are being heard. */
    data class Hearing(val partial: String) : VoiceState
    data class Failed(val message: String) : VoiceState
}

/**
 * Wraps Android's [SpeechRecognizer] for the counting screen.
 *
 * On-device recognition is preferred so counting keeps working in a warehouse
 * with no signal — the same condition Firestore's offline cache is there for.
 * If the device has no offline language pack the recogniser falls back to the
 * network on its own; nothing here needs to change.
 */
class VoiceInputController(private val context: Context) {

    private val _state = MutableStateFlow<VoiceState>(VoiceState.Idle)
    val state: StateFlow<VoiceState> = _state.asStateFlow()

    private var recognizer: SpeechRecognizer? = null
    private var onResult: ((VoiceCommand) -> Unit)? = null

    val isAvailable: Boolean get() = SpeechRecognizer.isRecognitionAvailable(context)

    /**
     * True once an offline attempt has failed, so the retry asks for the
     * networked recogniser instead.
     */
    private var offlineAttemptFailed = false
    private var lastLanguageTag: String = Locale.getDefault().toLanguageTag()

    fun start(languageTag: String = Locale.getDefault().toLanguageTag(), onCommand: (VoiceCommand) -> Unit) {
        if (!isAvailable) {
            _state.value = VoiceState.Failed("No speech recognition service is installed.")
            return
        }
        offlineAttemptFailed = false
        lastLanguageTag = languageTag
        onResult = onCommand
        // A recogniser instance is single-use in practice: reusing one after an
        // error leaves it wedged, so each session gets a fresh one.
        release()
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(listener)
            startListening(intentFor(languageTag))
        }
        _state.value = VoiceState.Listening
    }

    fun stop() {
        runCatching { recognizer?.stopListening() }
        _state.value = VoiceState.Idle
    }

    fun cancel() {
        runCatching { recognizer?.cancel() }
        _state.value = VoiceState.Idle
    }

    fun release() {
        runCatching { recognizer?.destroy() }
        recognizer = null
    }

    private fun intentFor(languageTag: String) =
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            // Offline is preferred so counting survives a warehouse with no
            // signal, but only as a preference: a device without the language
            // pack installed fails outright when it is demanded, and most
            // phones do not have it until the user downloads it explicitly.
            // The retry below drops this flag.
            if (!offlineAttemptFailed) {
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            }
        }

    private val listener: RecognitionListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            _state.value = VoiceState.Listening
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val text = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
            if (text.isNotEmpty()) _state.value = VoiceState.Hearing(text)
        }

        override fun onResults(results: Bundle?) {
            val candidates = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                .orEmpty()
            _state.value = VoiceState.Idle

            // The recogniser returns alternatives in confidence order. The first
            // one that parses into an actual count wins, which rescues cases
            // where the top guess mis-heard the number but the runner-up did not.
            val parsed = candidates
                .map(VoiceCommandParser::parse)
                .firstOrNull { it !is VoiceCommand.Unrecognised }
                ?: VoiceCommandParser.parse(candidates.firstOrNull().orEmpty())

            onResult?.invoke(parsed)
        }

        override fun onError(error: Int) {
            // An offline-only attempt that fails for any reason other than the
            // user simply not speaking is retried once over the network, since
            // a missing language pack and a genuine failure are reported with
            // the same codes.
            val worthRetryingOnline = !offlineAttemptFailed && error !in setOf(
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS,
            )
            if (worthRetryingOnline) {
                offlineAttemptFailed = true
                val callback = onResult
                release()
                recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
                    setRecognitionListener(this@VoiceInputController.listener)
                    startListening(intentFor(lastLanguageTag))
                }
                onResult = callback
                _state.value = VoiceState.Listening
                return
            }
            _state.value = VoiceState.Failed(describe(error))
        }

        override fun onBeginningOfSpeech() = Unit
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit
    }

    private fun describe(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "Microphone error."
        SpeechRecognizer.ERROR_CLIENT -> "Recognition was interrupted."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
            "No network, and this device has no offline voice pack for this language."
        SpeechRecognizer.ERROR_NO_MATCH -> "Nothing was recognised — try again."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The recogniser is busy."
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech was heard."
        SpeechRecognizer.ERROR_SERVER -> "The speech service rejected the request."
        // Naming the code matters: the unnamed fallback reported only "Voice
        // input failed", which says nothing about whether the microphone, the
        // language pack or the network is at fault.
        else -> "Voice input failed (error code $error). If this keeps happening, " +
            "install the offline speech pack for your language in system settings."
    }
}

/** Remembers a controller and destroys it with the composition. */
@Composable
fun rememberVoiceInputController(): VoiceInputController {
    val context = LocalContext.current
    val controller = remember(context) { VoiceInputController(context) }
    DisposableEffect(controller) {
        onDispose { controller.release() }
    }
    return controller
}
