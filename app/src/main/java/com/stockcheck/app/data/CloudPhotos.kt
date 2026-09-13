package com.stockcheck.app.data

/**
 * Controls whether captured photos are pushed to Firebase Storage.
 *
 * Firebase requires a billing-enabled (Blaze) project to use Cloud Storage,
 * even inside its free allowance, so the app ships with cloud photos OFF: the
 * workspace then runs entirely on Firestore and Auth, both of which are usable
 * on the free Spark plan with no card on file.
 *
 * With this off, photos live only in the capturing device's app storage and
 * travel out through the export bundle. Their Firestore records are still
 * written, so captions, timestamps, the linked barcode and the photo count all
 * sync normally — only the image bytes stay local, and another device shows
 * such a photo as "stored on <device owner>'s phone".
 *
 * Turning this on is the single switch needed once billing is enabled; the
 * upload worker will then pick up every photo still marked un-uploaded,
 * including ones captured while it was off.
 */
object CloudPhotos {

    /** Flip to true after enabling the Blaze plan on the Firebase project. */
    const val ENABLED: Boolean = false
}
