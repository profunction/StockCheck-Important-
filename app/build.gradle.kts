import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
}

// The release signing key, if this machine has it.
//
// keystore.properties is gitignored and the key file itself lives outside the
// project directory, so a clone of this repository cannot sign a release. That
// is the intended state: the signature IS the app's identity to Android, and a
// key in version control is a key that leaks.
//
// When it is absent the release build falls back to the debug key and says so.
// The alternative -- failing the build -- would stop anyone from compiling a
// release to test R8, which is the reason most release builds get made.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val hasReleaseKey = keystoreProperties.getProperty("storeFile")
    ?.let { file(it).exists() } == true

android {
    namespace = "com.stockcheck.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.stockcheck.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        vectorDrawables { useSupportLibrary = true }
        // Shown on the sign-in screen so a running install can be
        // identified: "did you actually install the new APK?" came up
        // repeatedly while debugging and was unanswerable from a
        // screenshot.
        buildConfigField("String", "BUILD_STAMP", "\"2026-09-15 22:36\"")
    }

    signingConfigs {
        // The real one. Everything that ever reaches a customer is signed
        // with this, and it can never be replaced: Android refuses to install
        // an update signed by a different key, and Play Store refuses the
        // upload. Losing the file or the password ends the app's ability to
        // be updated, for everyone who has it.
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                // Both schemes: v1 for Android 6 and below, v2+ for the
                // faster verification every modern device uses.
                enableV1Signing = true
                enableV2Signing = true
            }
        }

        // Fallback for a machine without the key -- a fresh clone, or CI.
        // Produces an installable APK for testing R8 and nothing more: the
        // debug key ships with every Android SDK, so an app published with it
        // can be impersonated by anyone.
        create("internal") {
            storeFile = file(System.getProperty("user.home") + "/.android/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName(if (hasReleaseKey) "release" else "internal")
        }
        debug {
            // No applicationIdSuffix: the Firebase project registers only
            // com.stockcheck.app, and google-services matches the applicationId
            // exactly. Adding a suffix here would need a second Android app in
            // the Firebase console or the build fails outright. The only thing
            // given up is installing debug and release side by side.
        }
    }

    // Per-ABI splits were tried to shrink the debug APK for easier transfer,
    // but on at least one real test device the 32-bit armeabi-v7a split
    // wouldn't install at all -- modern phones increasingly ship as 64-bit
    // only, with no ARM32 support in the OS to run it against, and Android
    // reports that as a generic "incompatible" dialog rather than naming the
    // ABI mismatch. A single universal APK carries every ABI's native code and
    // always runs, at the cost of size; that trade is worth it for manual
    // sideloading onto a handful of test phones. Play Store delivery would use
    // an Android App Bundle instead, which solves this properly server-side.

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

// Which key a release build just used is not something to discover after
// uploading it.
gradle.taskGraph.whenReady {
    if (allTasks.any { it.name.contains("Release") }) {
        if (hasReleaseKey) {
            logger.lifecycle("Release signing: real key from keystore.properties")
        } else {
            logger.lifecycle(
                "Release signing: DEBUG KEY -- not distributable. " +
                    "keystore.properties is missing or points at a file that is not there.",
            )
        }
    }
}

dependencies {
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.mlkit.barcode.scanning)
    implementation(libs.androidx.concurrent.futures.ktx)
    implementation(libs.guava)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.storage)
    implementation(libs.kotlinx.coroutines.play.services)

    implementation(libs.zip4j)
    implementation(libs.coil.compose)
    implementation(libs.androidx.work.runtime.ktx)

    testImplementation(libs.junit)
}
