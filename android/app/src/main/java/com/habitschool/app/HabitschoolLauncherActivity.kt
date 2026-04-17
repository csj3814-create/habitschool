package com.habitschool.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata
import com.google.androidbrowserhelper.trusted.TwaLauncher
import com.google.androidbrowserhelper.trusted.WebViewFallbackActivity
import com.habitschool.app.health.HealthConnectSnapshotDecider
import com.habitschool.app.health.HealthConnectSnapshotStore

class HabitschoolLauncherActivity : AppCompatActivity() {
    private val snapshotStore by lazy { HealthConnectSnapshotStore(this) }
    private val launcherMetadata by lazy { LauncherActivityMetadata.parse(this) }
    private val mainHandler = Handler(Looper.getMainLooper())

    private var launchUrlOverride: Uri? = null
    private var manualBrowserFallbackHint: TextView? = null
    private var manualBrowserFallbackButton: Button? = null
    private var twaLauncher: TwaLauncher? = null
    private var launchRequested = false
    private var browserFallbackOpened = false

    private val launchTimeoutRunnable = Runnable {
        if (!launchRequested || browserFallbackOpened || isFinishing || isDestroyed) return@Runnable
        if (isPrimaryLauncherEntry()) {
            Log.w(TAG, "TWA launch timed out for launcher entry, opening WebView fallback")
            openWebViewFallback(requireLaunchingUrl(), "launcher-timeout-webview")
            return@Runnable
        }
        val targetUrl = requireLaunchingUrl()
        if (shouldLaunchTrustedSurface(targetUrl)) {
            Log.w(TAG, "TWA launch timed out for trusted surface, opening WebView fallback")
            openWebViewFallback(targetUrl, "trusted-surface-timeout-webview")
        } else {
            Log.w(TAG, "TWA launch timed out, opening browser surface")
            openBrowserSurface(targetUrl, "launch-timeout")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_launcher_loading)
        manualBrowserFallbackHint = findViewById(R.id.launcher_timeout_hint)
        manualBrowserFallbackButton = findViewById<Button?>(R.id.launcher_open_browser_button).also { button ->
            button?.setOnClickListener {
                openBrowserSurface(requireLaunchingUrl(), "manual-launcher-timeout")
            }
        }

        val launchingUrl = resolveLaunchingUrl()
        launchUrlOverride = resolveFreshHealthConnectLaunchUrl(launchingUrl)

        window.decorView.post {
            val targetUrl = requireLaunchingUrl()
            if (shouldLaunchTrustedSurface(targetUrl)) {
                launchTrustedSurface(targetUrl)
            } else {
                openBrowserSurface(targetUrl, "direct-browser-launch")
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

    private fun launchTrustedSurface(targetUrl: Uri) {
        if (launchRequested || isFinishing || isDestroyed) return

        launchRequested = true
        manualBrowserFallbackHint?.visibility = View.GONE
        manualBrowserFallbackButton?.visibility = View.GONE

        try {
            val preferredPackage = resolvePreferredTwaProviderPackage()
            val launchBuilder = TrustedWebActivityIntentBuilder(targetUrl)
            val additionalTrustedOrigins = launcherMetadata.additionalTrustedOrigins
            if (!additionalTrustedOrigins.isNullOrEmpty()) {
                launchBuilder.setAdditionalTrustedOrigins(additionalTrustedOrigins)
            }

            twaLauncher = if (preferredPackage.isNullOrBlank()) {
                Log.w(TAG, "No preferred TWA provider found, using helper picker with WebView fallback")
                TwaLauncher(this)
            } else {
                Log.d(TAG, "Launching TWA with provider=$preferredPackage url=$targetUrl")
                TwaLauncher(this, preferredPackage)
            }

            twaLauncher?.launch(
                launchBuilder,
                null,
                null,
                Runnable {
                    Log.d(TAG, "Trusted surface launch callback completed")
                },
                TwaLauncher.WEBVIEW_FALLBACK_STRATEGY
            )
            scheduleLaunchTimeout()
        } catch (error: Exception) {
            Log.e(TAG, "TWA launch failed, opening WebView fallback", error)
            openWebViewFallback(targetUrl, "twa-exception-webview")
        }
    }

    private fun openBrowserSurface(targetUrl: Uri, reason: String) {
        if (browserFallbackOpened || isFinishing || isDestroyed) return
        browserFallbackOpened = true
        cancelLaunchTimeout()
        twaLauncher?.destroy()
        twaLauncher = null

        val browserPackage = resolveExternalBrowserPackage(targetUrl)
        runCatching {
            startActivity(
                Intent(Intent.ACTION_VIEW, targetUrl).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    if (!browserPackage.isNullOrBlank()) {
                        `package` = browserPackage
                    }
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }.onFailure { error ->
            Log.e(TAG, "Browser fallback launch failed", error)
        }

        Log.w(TAG, "Opened browser surface reason=$reason package=$browserPackage url=$targetUrl")
        finish()
    }

    private fun openWebViewFallback(targetUrl: Uri, reason: String) {
        if (browserFallbackOpened || isFinishing || isDestroyed) return
        browserFallbackOpened = true
        cancelLaunchTimeout()
        twaLauncher?.destroy()
        twaLauncher = null

        val launchIntent = runCatching {
            WebViewFallbackActivity.createLaunchIntent(this, targetUrl, launcherMetadata).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }.getOrElse { error ->
            browserFallbackOpened = false
            Log.e(TAG, "Unable to build WebView fallback intent", error)
            showLauncherTimeoutFallbackUi()
            return
        }

        runCatching {
            startActivity(launchIntent)
        }.onFailure { error ->
            browserFallbackOpened = false
            Log.e(TAG, "WebView fallback launch failed", error)
            showLauncherTimeoutFallbackUi()
            return
        }

        Log.w(TAG, "Opened WebView fallback reason=$reason url=$targetUrl")
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

    private fun isPrimaryLauncherEntry(): Boolean {
        val categories = intent?.categories ?: emptySet()
        return intent?.action == Intent.ACTION_MAIN && categories.contains(Intent.CATEGORY_LAUNCHER)
    }

    private fun resolveExternalBrowserPackage(targetUrl: Uri): String? {
        val browserIntent = Intent(Intent.ACTION_VIEW, targetUrl).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
        }
        val candidatePackages = packageManager.queryIntentActivities(browserIntent, 0)
            .mapNotNull { it.activityInfo?.packageName }
            .filter { it.isNotBlank() && it != packageName }
            .distinct()

        val preferredProvider = resolvePreferredTwaProviderPackage()
            ?.takeIf(candidatePackages::contains)

        return preferredProvider
            ?: PREFERRED_BROWSER_PACKAGES.firstOrNull(candidatePackages::contains)
            ?: candidatePackages.firstOrNull()
    }

    private fun isShareIntent(): Boolean {
        val action = intent?.action
        return action == Intent.ACTION_SEND || action == Intent.ACTION_SEND_MULTIPLE
    }

    private fun shouldLaunchTrustedSurface(targetUrl: Uri): Boolean {
        if (isShareIntent()) {
            return true
        }
        val appOrigin = Uri.parse(AppRoutes.WEB_ORIGIN)
        return targetUrl.scheme == "https" && targetUrl.host == appOrigin.host
    }

    private fun isEnabledPackageInstalled(packageName: String): Boolean {
        return try {
            packageManager.getApplicationInfo(packageName, 0).enabled
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

    private fun showLauncherTimeoutFallbackUi() {
        manualBrowserFallbackHint?.visibility = View.VISIBLE
        manualBrowserFallbackButton?.visibility = View.VISIBLE
    }

    companion object {
        private const val TAG = "HabitschoolLauncher"
        private const val TWA_LAUNCH_TIMEOUT_MS = 20000L
        private val PREFERRED_TWA_PACKAGES = listOf(
            "com.android.chrome",
            "com.chrome.beta",
            "com.chrome.dev",
            "com.chrome.canary"
        )
        private val PREFERRED_BROWSER_PACKAGES = listOf(
            "com.sec.android.app.sbrowser",
            "com.android.chrome",
            "com.chrome.beta",
            "com.chrome.dev",
            "com.chrome.canary",
            "org.mozilla.firefox"
        )
    }
}
