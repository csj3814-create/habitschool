package com.habitschool.app

import android.content.Context
import android.content.Intent
import android.net.Uri

object AppRoutes {
    const val WEB_ORIGIN = "https://habitschool.web.app"
    const val EXTRA_SKIP_AUTO_HEALTH_SYNC = "com.habitschool.app.extra.SKIP_AUTO_HEALTH_SYNC"

    fun homeUri(nativeSource: String = "android-shell"): Uri =
        buildUri("/", mapOf("native" to nativeSource))

    fun exerciseUri(nativeSource: String = "android-shell"): Uri =
        buildUri("/", mapOf("tab" to "exercise", "native" to nativeSource))

    fun dietSharedUploadUri(nativeSource: String = "android-share"): Uri =
        buildUri(
            "/",
            mapOf(
                "tab" to "diet",
                "native" to nativeSource,
                "focus" to "shared-upload"
            )
        )

    fun exerciseImportUri(
        nativeSource: String = "android-shell",
        stepsCount: Long,
        syncedAtEpochMillis: Long,
        stepSource: String = "health_connect",
        stepProviderLabel: String? = null
    ): Uri = withHealthConnectSteps(
        baseUri = exerciseUri(nativeSource),
        nativeSource = nativeSource,
        stepsCount = stepsCount,
        syncedAtEpochMillis = syncedAtEpochMillis,
        stepSource = stepSource,
        stepProviderLabel = stepProviderLabel
    )

    fun withHealthConnectSteps(
        baseUri: Uri,
        nativeSource: String = "android-shell",
        stepsCount: Long,
        syncedAtEpochMillis: Long,
        stepSource: String = "health_connect",
        stepProviderLabel: String? = null
    ): Uri =
        mergeQueryParameters(
            baseUri,
            mapOf(
                "native" to (
                    baseUri.getQueryParameter("native")
                        ?.takeUnless { it.isBlank() }
                        ?: nativeSource
                    ),
                "focus" to "health-connect-steps",
                "stepCount" to stepsCount.toString(),
                "stepSource" to stepSource,
                "stepProvider" to stepProviderLabel,
                "syncedAt" to syncedAtEpochMillis.toString()
            )
        )

    fun dashboardUri(nativeSource: String = "android-shell"): Uri =
        buildUri("/", mapOf("tab" to "dashboard", "native" to nativeSource))

    fun privacyUri(): Uri = Uri.parse("$WEB_ORIGIN/privacy.html")

    fun twaIntent(context: Context, uri: Uri, skipAutoHealthSync: Boolean = false): Intent =
        Intent(Intent.ACTION_VIEW, uri, context, HabitschoolLauncherActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            if (skipAutoHealthSync) {
                putExtra(EXTRA_SKIP_AUTO_HEALTH_SYNC, true)
            }
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

    private fun mergeQueryParameters(baseUri: Uri, overrides: Map<String, String?>): Uri {
        val builder = baseUri.buildUpon().clearQuery()
        baseUri.queryParameterNames.forEach { key ->
            if (overrides.containsKey(key)) return@forEach
            baseUri.getQueryParameters(key).forEach { value ->
                builder.appendQueryParameter(key, value)
            }
        }
        overrides.forEach { (key, value) ->
            if (!value.isNullOrBlank()) {
                builder.appendQueryParameter(key, value)
            }
        }
        return builder.build()
    }
}
