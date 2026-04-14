package com.habitschool.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.google.androidbrowserhelper.trusted.LauncherActivity
import com.habitschool.app.health.HealthConnectAvailabilityState
import com.habitschool.app.health.HealthConnectManager
import kotlinx.coroutines.runBlocking

class HabitschoolLauncherActivity : LauncherActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val launchingUrl = resolveLaunchingUrl()
        if (shouldAutoSyncHealthConnect(launchingUrl)) {
            startActivity(
                HealthConnectPermissionActivity.createSyncIntent(
                    context = this,
                    source = "android-launch-sync",
                    openAfterSync = launchingUrl,
                    autoStart = true
                )
            )
            finish()
            return
        }

        super.onCreate(savedInstanceState)
    }

    override fun getLaunchingUrl(): Uri {
        return resolveLaunchingUrl()
    }

    private fun resolveLaunchingUrl(): Uri {
        val launchingUrl = super.getLaunchingUrl()
        val action = intent?.action
        if (action == Intent.ACTION_SEND || action == Intent.ACTION_SEND_MULTIPLE) {
            if (launchingUrl.scheme == "https"
                && launchingUrl.host == Uri.parse(AppRoutes.WEB_ORIGIN).host
                && (launchingUrl.encodedPath == "/share-target"
                    || (launchingUrl.getQueryParameter("tab") == "diet"
                        && launchingUrl.getQueryParameter("focus") == "shared-upload"))
            ) {
                return launchingUrl
            }

            // Fallback for cases where the browser does not hand the share intent
            // to the PWA share target endpoint and would otherwise open the home tab.
            return AppRoutes.dietSharedUploadUri(nativeSource = "android-share")
        }
        if (launchingUrl.scheme != "https" || launchingUrl.host != Uri.parse(AppRoutes.WEB_ORIGIN).host) {
            return launchingUrl
        }
        if (launchingUrl.encodedPath == "/share-target") {
            return launchingUrl
        }
        if (!launchingUrl.getQueryParameter("native").isNullOrBlank()) {
            return launchingUrl
        }

        return launchingUrl.buildUpon()
            .appendQueryParameter("native", "android-shell")
            .build()
    }

    private fun shouldAutoSyncHealthConnect(launchingUrl: Uri): Boolean {
        if (intent?.getBooleanExtra(AppRoutes.EXTRA_SKIP_AUTO_HEALTH_SYNC, false) == true) {
            return false
        }
        val action = intent?.action
        if (action == Intent.ACTION_SEND || action == Intent.ACTION_SEND_MULTIPLE) {
            return false
        }
        if (launchingUrl.scheme != "https" || launchingUrl.host != Uri.parse(AppRoutes.WEB_ORIGIN).host) {
            return false
        }
        if (launchingUrl.encodedPath == "/share-target") {
            return false
        }
        if (launchingUrl.getQueryParameter("focus") == "shared-upload") {
            return false
        }
        if (launchingUrl.getQueryParameter("focus") == "health-connect-steps") {
            return false
        }

        val healthConnectManager = HealthConnectManager(this)
        if (healthConnectManager.getAvailability() != HealthConnectAvailabilityState.AVAILABLE) {
            return false
        }

        return runBlocking {
            healthConnectManager.hasRequiredPermissions()
        }
    }
}
