package com.habitschool.app

import android.app.Activity
import android.os.Bundle

class NativeEntryActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val data = intent?.data
        val source = data?.getQueryParameter("source")
            ?.takeUnless { it.isNullOrBlank() }
            ?: "android-web-sync"
        val returnToUri = data?.getQueryParameter("returnTo")
            ?.takeUnless { it.isBlank() }
            ?.let { raw ->
                runCatching { android.net.Uri.parse(raw) }.getOrNull()
            }
            ?.takeIf { uri ->
                uri.scheme == "https" && uri.host == android.net.Uri.parse(AppRoutes.WEB_ORIGIN).host
            }

        when {
            data?.scheme == "habitschool" &&
                data.host == "health-connect" &&
                data.path == "/sync" -> {
                startActivity(
                    HealthConnectPermissionActivity.createSyncIntent(
                        context = this,
                        source = source,
                        openAfterSync = returnToUri ?: AppRoutes.exerciseUri(source),
                        autoStart = true
                    )
                )
            }

            else -> {
                startActivity(AppRoutes.twaIntent(this, AppRoutes.homeUri(source)))
            }
        }

        finish()
    }
}
