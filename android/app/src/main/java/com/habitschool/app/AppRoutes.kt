package com.habitschool.app

import android.content.Context
import android.content.Intent
import android.net.Uri

object AppRoutes {
    const val WEB_ORIGIN = "https://habitschool.web.app"

    fun homeUri(nativeSource: String = "android-shell"): Uri =
        buildUri("/", mapOf("native" to nativeSource))

    fun exerciseUri(nativeSource: String = "android-shell"): Uri =
        buildUri("/", mapOf("tab" to "exercise", "native" to nativeSource))

    fun exerciseImportUri(
        nativeSource: String = "android-shell",
        stepsCount: Long,
        syncedAtEpochMillis: Long,
        stepSource: String = "health_connect"
    ): Uri =
        buildUri(
            "/",
            mapOf(
                "tab" to "exercise",
                "native" to nativeSource,
                "focus" to "health-connect-steps",
                "stepCount" to stepsCount.toString(),
                "stepSource" to stepSource,
                "syncedAt" to syncedAtEpochMillis.toString()
            )
        )

    fun dashboardUri(nativeSource: String = "android-shell"): Uri =
        buildUri("/", mapOf("tab" to "dashboard", "native" to nativeSource))

    fun privacyUri(): Uri = Uri.parse("$WEB_ORIGIN/privacy.html")

    fun twaIntent(context: Context, uri: Uri): Intent =
        Intent(Intent.ACTION_VIEW, uri, context, HabitschoolLauncherActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }

    private fun buildUri(path: String, query: Map<String, String?>): Uri {
        val builder = Uri.parse("$WEB_ORIGIN$path").buildUpon().clearQuery()
        query.forEach { (key, value) ->
            if (!value.isNullOrBlank()) {
                builder.appendQueryParameter(key, value)
            }
        }
        return builder.build()
    }
}
