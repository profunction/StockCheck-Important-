package com.stockcheck.app

import android.content.Context
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Keeps the last crash so somebody can read it back.
 *
 * A crash on a phone in somebody else's hands is otherwise invisible: the app
 * disappears, and what is left is "it closed itself", which is true and says
 * nothing about where. Android keeps the stack trace in logcat, which needs a
 * cable, a laptop and the tools on it — none of which are in a warehouse.
 *
 * So the trace is written to disk on the way down and shown on the way back
 * up, with a button that copies it. One screenshot, or one paste, instead of
 * a round of guessing per attempt.
 *
 * The handler chains to whatever was installed before it, so the process
 * still dies the way Android expects. Swallowing the crash would leave the
 * app in a state nobody has thought about, which is worse than the crash.
 */
object CrashLog {

    private const val PREFS = "crash_log"
    private const val KEY_TRACE = "trace"

    fun install(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previous = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val when_ = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.US).format(Date())
                val stack = StringWriter().also { error.printStackTrace(PrintWriter(it)) }
                prefs.edit()
                    .putString(
                        KEY_TRACE,
                        buildString {
                            appendLine("$when_  on ${thread.name}")
                            appendLine("Stock Check ${BuildConfig.VERSION_NAME}")
                            appendLine()
                            append(stack.toString().take(6_000))
                        },
                    )
                    // commit, not apply: the process is about to end and an
                    // asynchronous write would not survive it.
                    .commit()
            }
            previous?.uncaughtException(thread, error)
        }
    }

    /** The last crash, or null when the app has not fallen over since it was cleared. */
    fun last(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_TRACE, null)
            ?.takeIf { it.isNotBlank() }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove(KEY_TRACE).apply()
    }
}
