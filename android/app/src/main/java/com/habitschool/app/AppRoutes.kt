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

    /**
     * 서버에 올려 둔 공유 파일을 웹이 받아 가게 한다 ([SharedUploadClient]).
     * 웹의 공유 흐름(focus=shared-upload)을 그대로 타고, 파일만 서버에서 온다.
     */
    fun sharedUploadUri(ids: List<String>, shareFrom: String? = null): Uri =
        withNativeVersion(
            buildUri(
                "/",
                mapOf(
                    "tab" to "diet",
                    "native" to "android-share",
                    "focus" to "shared-upload",
                    "sharedUploads" to ids.joinToString(","),
                    "shareFrom" to shareFrom
                )
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

    fun profileUri(nativeSource: String = "android-shell"): Uri =
        buildUri("/", mapOf("tab" to "profile", "native" to nativeSource))

    /**
     * Health Connect 에서 읽은 최신 체성분을 웹의 프로필 체성분 칸으로 넘긴다.
     * 걸음수와 같은 방식 — 값은 주소에 실려 가고, 웹이 칸을 채운 뒤 회원이 저장한다.
     * 값이 없거나 권한이 없으면 hcStatus 로 그 사실만 넘긴다.
     */
    fun withHealthConnectBody(
        baseUri: Uri,
        nativeSource: String,
        status: String,
        weightKg: Double? = null,
        bodyFatPercent: Double? = null,
        basalKcalPerDay: Double? = null,
        leanMassKg: Double? = null,
        measuredAtEpochMillis: Long? = null,
        originPackage: String? = null
    ): Uri =
        mergeQueryParameters(
            baseUri,
            mapOf(
                "native" to (
                    baseUri.getQueryParameter("native")
                        ?.takeUnless { it.isBlank() }
                        ?: nativeSource
                    ),
                "tab" to "profile",
                "focus" to "health-connect-body",
                "hcStatus" to status,
                "hcWeight" to weightKg?.let { "%.2f".format(java.util.Locale.US, it) },
                "hcBodyFat" to bodyFatPercent?.let { "%.1f".format(java.util.Locale.US, it) },
                "hcBmr" to basalKcalPerDay?.let { "%.0f".format(java.util.Locale.US, it) },
                "hcLeanMass" to leanMassKg?.let { "%.2f".format(java.util.Locale.US, it) },
                "hcMeasuredAt" to measuredAtEpochMillis?.toString(),
                "hcOrigin" to originPackage
            )
        )

    /**
     * 웹이 지금 어느 셸 안에서 열렸는지 알게 한다. 웹은 이 번호로 이 셸에 있는 기능만
     * 보여 준다 — 예전 셸에서 Health Connect 체성분 버튼을 누르면 아무 일도 안 일어난다.
     */
    fun withNativeVersion(uri: Uri): Uri {
        if (uri.scheme != "https" || uri.host != Uri.parse(WEB_ORIGIN).host) return uri
        if (!uri.getQueryParameter("nativeVersion").isNullOrBlank()) return uri
        return uri.buildUpon()
            .appendQueryParameter("nativeVersion", BuildConfig.VERSION_CODE.toString())
            .build()
    }

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
