package com.habitschool.app

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import com.google.androidbrowserhelper.trusted.TwaLauncher
import com.habitschool.app.health.HealthConnectAvailabilityState
import com.habitschool.app.health.HealthConnectManager
import com.habitschool.app.health.HealthConnectSnapshotDecider
import com.habitschool.app.health.HealthConnectSnapshotStore
import kotlinx.coroutines.runBlocking

class HabitschoolLauncherActivity : AppCompatActivity() {
    private val snapshotStore by lazy { HealthConnectSnapshotStore(this) }
    private val mainHandler = Handler(Looper.getMainLooper())

    private var launchUrlOverride: Uri? = null
    private var twaLauncher: TwaLauncher? = null
    private var launchRequested = false
    private var browserFallbackOpened = false

    private val launchTimeoutRunnable = Runnable {
        if (!launchRequested || browserFallbackOpened || isFinishing || isDestroyed) return@Runnable
        Log.w(TAG, "TWA launch timed out, opening browser surface")
        openBrowserSurface(requireLaunchingUrl(), "launch-timeout")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_launcher_loading)

        val launchingUrl = resolveLaunchingUrl()
        launchUrlOverride = resolveFreshHealthConnectLaunchUrl(launchingUrl)

        if (launchUrlOverride == null && shouldAutoSyncHealthConnect(launchingUrl)) {
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

        window.decorView.post {
            if (isShareIntent()) {
                launchTrustedSurface()
            } else {
                openBrowserSurface(requireLaunchingUrl(), "direct-browser-launch")
            }
        }
    }

    override fun onPause() {
        super.onPause()
        if (launchRequested && !browserFallbackOpened) {
            cancelLaunchTimeout()
            finish()
        }
    }

    override fun onDestroy() {
        cancelLaunchTimeout()
        twaLauncher?.destroy()
        twaLauncher = null
        super.onDestroy()
    }

    private fun launchTrustedSurface() {
        if (launchRequested || isFinishing || isDestroyed) return
        launchRequested = true

        val targetUrl = requireLaunchingUrl()
        val preferredPackage = resolvePreferredTwaProviderPackage()

        if (preferredPackage.isNullOrBlank()) {
            Log.w(TAG, "No preferred TWA provider found, opening browser surface")
            openBrowserSurface(targetUrl, "no-preferred-provider")
            return
        }

        scheduleLaunchTimeout()

        try {
            Log.d(TAG, "Launching TWA with provider=$preferredPackage url=$targetUrl")
            twaLauncher = TwaLauncher(this, preferredPackage)
            twaLauncher?.launch(targetUrl)
        } catch (error: Exception) {
            Log.e(TAG, "TWA launch failed, opening browser surface", error)
            openBrowserSurface(targetUrl, "twa-exception")
        }
    }

    private fun openBrowserSurface(targetUrl: Uri, reason: String) {
        if (browserFallbackOpened || isFinishing || isDestroyed) return
        browserFallbackOpened = true
        cancelLaunchTimeout()
        twaLauncher?.destroy()
        twaLauncher = null

        val preferredPackage = resolvePreferredTwaProviderPackage()
        runCatching {
            startActivity(
                Intent(Intent.ACTION_VIEW, targetUrl).apply {
                    if (!preferredPackage.isNullOrBlank()) {
                        `package` = preferredPackage
                    }
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }.recoverCatching {
            startActivity(
                Intent(Intent.ACTION_VIEW, targetUrl).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }

        Log.w(TAG, "Opened browser surface reason=$reason url=$targetUrl")
        finish()
    }

    private fun scheduleLaunchTimeout() {
        cancelLaunchTimeout()
        mainHandler.postDelayed(launchTimeoutRunnable, TWA_LAUNCH_TIMEOUT_MS)
    }

    private fun cancelLaunchTimeout() {
        mainHandler.removeCallbacks(launchTimeoutRunnable)
    }

    private fun requireLaunchingUrl(): Uri {
        return launchUrlOverride ?: resolveLaunchingUrl()
    }

    private fun resolvePreferredTwaProviderPackage(): String? {
        return PREFERRED_TWA_PACKAGES.firstOrNull(::isEnabledPackageInstalled)
    }

    private fun isShareIntent(): Boolean {
        val action = intent?.action
        return action == Intent.ACTION_SEND || action == Intent.ACTION_SEND_MULTIPLE
    }

    private fun isEnabledPackageInstalled(packageName: String): Boolean {
        return try {
            val appInfo = packageManager.getApplicationInfo(packageName, 0)
            (appInfo.flags and ApplicationInfo.FLAG_INSTALLED) != 0 && appInfo.enabled
        } catch (_: Exception) {
            false
        }
    }

    private fun resolveLaunchingUrl(): Uri {
        val launchingUrl = intent?.data ?: Uri.parse("${AppRoutes.WEB_ORIGIN}/")
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

    private fun resolveFreshHealthConnectLaunchUrl(launchingUrl: Uri): Uri? {
        val action = intent?.action
        if (action == Intent.ACTION_SEND || action == Intent.ACTION_SEND_MULTIPLE) {
            return null
        }
        if (launchingUrl.scheme != "https" || launchingUrl.host != Uri.parse(AppRoutes.WEB_ORIGIN).host) {
            return null
        }
        if (launchingUrl.encodedPath == "/share-target") {
            return null
        }
        if (launchingUrl.getQueryParameter("focus") == "shared-upload") {
            return null
        }
        if (launchingUrl.getQueryParameter("focus") == "health-connect-steps") {
            return null
        }

        val snapshot = snapshotStore.read()
        if (!HealthConnectSnapshotDecider.canReuseForAppLaunch(snapshot)) {
            return null
        }

        val stepsCount = snapshot.stepsCount ?: return null
        val nativeSource = launchingUrl.getQueryParameter("native")
            ?.takeUnless { it.isBlank() }
            ?: "android-shell"

        return AppRoutes.withHealthConnectSteps(
            baseUri = launchingUrl,
            nativeSource = nativeSource,
            stepsCount = stepsCount,
            syncedAtEpochMillis = snapshot.syncedAtEpochMillis,
            stepProviderLabel = snapshot.dataOriginLabel
        )
    }

    companion object {
        private const val TAG = "HabitschoolLauncher"
        private const val TWA_LAUNCH_TIMEOUT_MS = 7000L
        private val PREFERRED_TWA_PACKAGES = listOf(
            "com.android.chrome",
            "com.chrome.beta",
            "com.chrome.dev",
            "com.chrome.canary"
        )
    }
}
