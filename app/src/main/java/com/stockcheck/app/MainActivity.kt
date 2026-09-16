package com.stockcheck.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.stockcheck.app.ui.i18n.ProvideAppLanguage
import com.stockcheck.app.ui.nav.StockCheckRoot
import com.stockcheck.app.ui.theme.StockCheckTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            // Outside the theme: the language decides what the words are, and
            // every screen below reads them through an ordinary
            // stringResource() without knowing a choice was made.
            ProvideAppLanguage {
                StockCheckTheme {
                    StockCheckRoot()
                }
            }
        }
    }
}
