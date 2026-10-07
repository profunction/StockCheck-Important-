/*
 * The website's apps as Android apps: JEXO (the app centre), JEXO POS,
 * JEXO Warehouse and JEXO Cloud. JEXO Count is the native app in :app.
 *
 * Each is a Trusted Web Activity: the phone's Chrome shows the website full
 * screen, with no address bar, as its own app with its own icon. Everything
 * the website does works the same -- offline selling, the camera, printers,
 * updates the moment the website changes -- and there is no second copy of
 * the code to keep in step.
 *
 * Chrome hides the address bar only for an app the website vouches for:
 * web/.well-known/assetlinks.json names these package names and this key's
 * fingerprint. A copy signed with another key still opens, but as a browser
 * tab with the address bar showing.
 *
 * The key (jexo-webapps.keystore) is kept in this private repository so
 * every build is signed the same way and an installed app takes updates.
 * These apps hold no data of their own -- sign-in and data live in Chrome
 * under the website's address -- so the key protects only the right to
 * show the website without an address bar. For Google Play, Play signs
 * with its own key; add Play's fingerprint to assetlinks.json then.
 */
plugins {
    alias(libs.plugins.android.application)
}

val site = "https://stockcheck-fb58e.web.app"

android {
    namespace = "com.jexo.webapps"
    compileSdk = 36

    defaultConfig {
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    flavorDimensions += "app"
    productFlavors {
        // id, package, name on the phone, where it opens
        listOf(
            listOf("hub", "com.jexo.apps", "JEXO", "$site/app/"),
            listOf("pos", "com.jexo.pos", "JEXO POS", "$site/pos/"),
            listOf("warehouse", "com.jexo.warehouse", "JEXO Warehouse", "$site/warehouse/"),
            listOf("cloud", "com.jexo.cloud", "JEXO Cloud", "$site/pos/#/cloud"),
        ).forEach { (id, pkg, label, url) ->
            create(id) {
                dimension = "app"
                applicationId = pkg
                resValue("string", "app_name", label)
                manifestPlaceholders["launchUrl"] = url
            }
        }
    }

    signingConfigs {
        create("jexo") {
            storeFile = file("jexo-webapps.keystore")
            storePassword = "jexo-webapps"
            keyAlias = "jexo"
            keyPassword = "jexo-webapps"
        }
    }

    // Nothing here but a manifest; lint has nothing to say about it.
    lint {
        checkReleaseBuilds = false
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("jexo")
        }
        getByName("debug") {
            signingConfig = signingConfigs.getByName("jexo")
        }
    }
}

dependencies {
    implementation(libs.androidbrowserhelper)
}
