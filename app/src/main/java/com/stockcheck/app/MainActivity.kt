package com.stockcheck.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.stockcheck.app.ui.nav.StockCheckRoot
import com.stockcheck.app.ui.theme.StockCheckTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            StockCheckTheme {
                StockCheckRoot()
            }
        }
    }
}
