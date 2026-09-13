package com.stockcheck.app

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.PersistentCacheSettings
import com.google.firebase.firestore.firestoreSettings
import com.stockcheck.app.data.ServiceLocator

class StockCheckApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)

        // Persistent local cache is what gives the app its offline mode and its
        // auto-save: every write lands on disk first and is replayed to the
        // server whenever connectivity returns, so a scan survives a crash, a
        // flat battery or a dead warehouse Wi-Fi without any extra sync code.
        FirebaseFirestore.getInstance().firestoreSettings = firestoreSettings {
            setLocalCacheSettings(
                PersistentCacheSettings.newBuilder()
                    .setSizeBytes(FirebaseFirestoreSettings.CACHE_SIZE_UNLIMITED)
                    .build()
            )
        }

        ServiceLocator.init(this)
    }
}
