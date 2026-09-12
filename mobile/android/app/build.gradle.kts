import java.io.FileInputStream
import java.util.Properties

// Release signing. The keystore itself and this properties file both live
// OUTSIDE the repo (android/key.properties is gitignored) — losing the
// keystore means never being able to ship an update to anyone who installed
// a build signed with it.
//
// The fallback to debug keys is deliberate: a machine or CI runner without
// key.properties can still produce an installable build. Be aware that debug
// keystores are generated per-machine, so two machines produce two different
// signatures and Android refuses to install one over the other.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        FileInputStream(keystorePropertiesFile).use { load(it) }
    }
}

// Firebase config for the shipping flavour. The file is NOT in the repository
// (it carries a live key and the ignore rules exclude it); drop it at
//
//     mobile/android/app/src/prod/google-services.json
//
// before building `prod`. The plugin is applied only when it is there, so a
// `--flavor dev` build — and CI, which has no Firebase project — still works:
// PushService already degrades to "no push" when Firebase.initializeApp fails.
val googleServicesFile = file("src/prod/google-services.json")

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

if (googleServicesFile.exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "org.botvy.botvy"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications: it uses java.time to work
        // out when an alarm should fire, which needs desugaring on the older
        // API levels Botvy still supports.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "org.botvy.botvy"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. Bump the build number on
        // every release: Android compares versionCode, and two APKs sharing it
        // can silently fail to replace each other.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Two flavours so a developer build installs alongside the shipping one
    // rather than replacing it — different applicationId, different data.
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
        }
        create("prod") {
            dimension = "env"
        }
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
