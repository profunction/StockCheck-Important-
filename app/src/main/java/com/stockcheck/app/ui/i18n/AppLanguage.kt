package com.stockcheck.app.ui.i18n

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import java.util.Locale

/**
 * The languages this app speaks.
 *
 * [tag] is an IETF language tag and must match the `values-<tag>` resource
 * folder, which is where the actual words live. [label] is written in the
 * language itself: somebody looking for their own language is not helped by
 * seeing it named in one they cannot read.
 *
 * Adding a language is two steps and no code: an entry here, and a
 * `values-<tag>/strings.xml` beside the English one.
 */
enum class AppLanguage(val tag: String, val label: String) {
    ENGLISH("en", "English"),
    CHINESE("zh", "中文"),
    MALAY("ms", "Bahasa Melayu");

    companion object {
        /**
         * The language for a stored tag, or null to follow the phone.
         *
         * An unknown tag resolves to null rather than to English: a language
         * removed in a later version should hand the user back to whatever
         * their phone is set to, not to a language they never chose.
         */
        fun forTag(tag: String?): AppLanguage? =
            entries.firstOrNull { it.tag == tag }
    }
}

/**
 * Which language the app is currently drawn in, and how to change it.
 *
 * Null means follow the phone's own setting, which is the default and the
 * right one for most people — a Malay phone should open in Malay without
 * anybody being asked.
 */
class LanguageSetting internal constructor(
    private val prefs: android.content.SharedPreferences,
    internal val state: MutableState<AppLanguage?>,
) {
    val current: AppLanguage? get() = state.value

    fun set(language: AppLanguage?) {
        state.value = language
        prefs.edit().putString(KEY, language?.tag).apply()
    }

    internal companion object {
        const val KEY = "app_language"

        fun load(context: Context): LanguageSetting {
            val prefs = context.getSharedPreferences("language", Context.MODE_PRIVATE)
            val stored = AppLanguage.forTag(prefs.getString(KEY, null))
            return LanguageSetting(prefs, mutableStateOf(stored))
        }
    }
}

/**
 * Reaches the language setting from anywhere in the tree.
 *
 * Fails loudly rather than defaulting: a screen drawing outside
 * [ProvideAppLanguage] would silently ignore the user's choice, which is
 * worse to debug than a crash on the first run.
 */
val LocalLanguageSetting = compositionLocalOf<LanguageSetting> {
    error("No LanguageSetting — wrap the app in ProvideAppLanguage().")
}

/**
 * Draws [content] in the chosen language.
 *
 * Works by handing the tree a Context configured for that locale, so ordinary
 * `stringResource()` calls resolve against `values-zh` or `values-ms` without
 * any screen knowing a choice was made. Changing the language recomposes
 * immediately — no restart, which matters because the person changing it is
 * usually staring at words they cannot read.
 */
@Composable
fun ProvideAppLanguage(content: @Composable () -> Unit) {
    val base = LocalContext.current
    val setting = remember(base) { LanguageSetting.load(base) }
    val chosen = setting.current

    val localised = remember(base, chosen) {
        if (chosen == null) {
            base
        } else {
            val locale = Locale.forLanguageTag(chosen.tag)
            val configuration = Configuration(base.resources.configuration).apply {
                setLocales(LocaleList(locale))
            }
            base.createConfigurationContext(configuration)
        }
    }

    CompositionLocalProvider(
        LocalLanguageSetting provides setting,
        LocalContext provides localised,
        LocalConfiguration provides localised.resources.configuration,
        content = content,
    )
}
