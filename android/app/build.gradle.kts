import org.gradle.api.GradleException
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun loadReleaseSigningProperties(): Map<String, String?> {
    val properties = Properties()
    listOf(
        rootProject.file("release-signing.properties"),
        rootProject.file("release-signing.local.properties")
    ).forEach { file ->
        if (file.exists()) {
            file.inputStream().use(properties::load)
        }
    }

    fun value(propertyKey: String, envKey: String): String? =
        System.getenv(envKey)?.takeIf { it.isNotBlank() }
            ?: properties.getProperty(propertyKey)?.takeIf { it.isNotBlank() }

    return mapOf(
        "storeFile" to value("storeFile", "HABITSCHOOL_ANDROID_STORE_FILE"),
        "storePassword" to value("storePassword", "HABITSCHOOL_ANDROID_STORE_PASSWORD"),
        "keyAlias" to value("keyAlias", "HABITSCHOOL_ANDROID_KEY_ALIAS"),
        "keyPassword" to value("keyPassword", "HABITSCHOOL_ANDROID_KEY_PASSWORD")
    )
}

val releaseSigning = loadReleaseSigningProperties()
val hasReleaseSigning =
    releaseSigning.values.all { !it.isNullOrBlank() }

android {
    namespace = "com.habitschool.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.habitschool.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseSigning.getValue("storeFile")!!)
                storePassword = releaseSigning.getValue("storePassword")
                keyAlias = releaseSigning.getValue("keyAlias")
                keyPassword = releaseSigning.getValue("keyPassword")
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

tasks.register("printReleaseSigningStatus") {
    doLast {
        if (hasReleaseSigning) {
            println("Release signing configured:")
            println(" - storeFile: ${releaseSigning.getValue("storeFile")}")
            println(" - keyAlias: ${releaseSigning.getValue("keyAlias")}")
        } else {
            println("Release signing is not configured. Add android/release-signing.properties or env vars.")
        }
    }
}

gradle.taskGraph.whenReady {
    val needsReleaseSigning = allTasks.any { task ->
        task.path.contains("Release", ignoreCase = false) &&
            (task.path.contains("assemble", ignoreCase = true) ||
                task.path.contains("bundle", ignoreCase = true))
    }

    if (needsReleaseSigning && !hasReleaseSigning) {
        throw GradleException(
            "Release signing is not configured. Add android/release-signing.properties " +
                "or HABITSCHOOL_ANDROID_* environment variables before building release artifacts."
        )
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.6.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
