package com.stockcheck.app.push

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessaging
import com.stockcheck.app.data.Db

/**
 * Where this phone receives notifications, kept under the signed-in person
 * (workspaces/{ws}/users/{uid}/pushTokens/{token}) so the morning report
 * reaches them. The server removes an address Firebase says is dead.
 */
object PushTokens {

    /** Looks up this phone's address and files it under [uid]. */
    fun register(uid: String) {
        if (uid.isEmpty() || !Db.hasWorkspace) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> save(uid, token) }
    }

    fun save(uid: String, token: String) {
        val workspace = Db.workspaceId
        if (workspace.isEmpty() || uid.isEmpty() || token.isEmpty()) return
        FirebaseFirestore.getInstance()
            .collection("workspaces").document(workspace)
            .collection("users").document(uid)
            .collection("pushTokens").document(token)
            .set(mapOf("platform" to "android", "updatedAt" to System.currentTimeMillis()))
    }
}
