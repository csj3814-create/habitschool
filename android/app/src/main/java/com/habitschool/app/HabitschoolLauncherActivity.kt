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
import androidx.lifecycle.lifecycleScope
import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata
import com.google.androidbrowserhelper.trusted.TwaLauncher
import com.google.androidbrowserhelper.trusted.WebViewFallbackActivity
import com.habitschool.app.health.HealthConnectAvailabilityState
import com.habitschool.app.health.HealthConnectManager
import com.habitschool.app.health.HealthConnectSnapshotDecider
import com.habitschool.app.health.HealthConnectSnapshotStore
import com.habitschool.app.widget.NativeSurfaceUpdater
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

class HabitschoolLauncherActivity : AppCompatActivity() {
    private val snapshotStore by lazy { HealthConnectSnapshotStore(this) }
    private val healthConnectManager by lazy { HealthConnectManager(this) }
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
        // 캐시 폴백을 먼저 세워 둔다. 아래 자동 읽기가 늦거나 실패해도 지금까지와
        // 똑같이 동작한다 — 이 자리는 흰 화면으로 여러 번 고친 곳이라, 새로 넣는
        // 것이 실행을 막을 수 있는 유일한 경로가 되면 안 된다.
        launchUrlOverride = resolveFreshHealthConnectLaunchUrl(launchingUrl)

        window.decorView.post {
            lifecycleScope.launch {
                refreshHealthConnectLaunchUrl(launchingUrl)
                launchResolvedSurface()
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

    private fun launchResolvedSurface() {
        if (isFinishing || isDestroyed || launchRequested || browserFallbackOpened) return
        val targetUrl = requireLaunchingUrl()
        if (shouldLaunchTrustedSurface(targetUrl)) {
            launchTrustedSurface(targetUrl)
        } else {
            openBrowserSurface(targetUrl, "direct-browser-launch")
        }
    }

    // 앱을 열 때마다 오늘 걸음수를 직접 읽는다. 캐시(15분 창)만 보던 예전에는
    // 동기화 버튼을 누른 직후가 아니면 거의 항상 비어 있었다.
    // 포그라운드 읽기라 새 권한이 필요 없다. 권한이 없으면 여기서 권한 창을
    // 띄우지 않는다 — 사용자가 요청한 적 없는 개입이고, 그 일은 동기화 버튼이 한다.
    private suspend fun refreshHealthConnectLaunchUrl(launchingUrl: Uri) {
        if (!isAutoHealthSyncEligible(launchingUrl)) return
        if (healthConnectManager.getAvailability() != HealthConnectAvailabilityState.AVAILABLE) return

        val permissionGranted = runCatching { healthConnectManager.hasRequiredPermissions() }
            .getOrDefault(false)
        if (!permissionGranted) return

        val snapshot = withTimeoutOrNull(AUTO_HEALTH_SYNC_TIMEOUT_MS) {
            runCatching { healthConnectManager.syncTodaySteps() }
                .onFailure { error -> Log.w(TAG, "Launch health sync failed", error) }
                .getOrNull()
        }

        if (snapshot == null) {
            Log.w(TAG, "Launch health sync did not finish in time, keeping cached snapshot")
            return
        }
        val stepsCount = snapshot.stepsCount
        if (!snapshot.permissionGranted || stepsCount == null) return

        snapshotStore.write(snapshot)
        NativeSurfaceUpdater.refresh(this)

        launchUrlOverride = AppRoutes.withHealthConnectSteps(
            baseUri = launchingUrl,
            nativeSource = launchingUrl.getQueryParameter("native")
                ?.takeUnless { it.isBlank() }
                ?: "android-shell",
            stepsCount = stepsCount,
            syncedAtEpochMillis = snapshot.syncedAtEpochMillis,
            stepProviderLabel = snapshot.dataOriginLabel
        )
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

    // 자동 걸음수 주입을 해도 되는 실행인가. 캐시 폴백과 실행 시 자동 읽기가
    // 같은 판정을 써야, 한쪽만 조건이 바뀌어 어긋나는 일이 없다.
    private fun isAutoHealthSyncEligible(launchingUrl: Uri): Boolean {
        val action = intent?.action
        if (action == Intent.ACTION_SEND || action == Intent.ACTION_SEND_MULTIPLE) return false
        if (launchingUrl.scheme != "https") return false
        if (launchingUrl.host != Uri.parse(AppRoutes.WEB_ORIGIN).host) return false
        if (launchingUrl.encodedPath == "/share-target") return false
        if (launchingUrl.getQueryParameter("focus") == "shared-upload") return false
        // 이미 동기화를 거쳐 온 URL 이면 그 값이 최신이다. 다시 읽지 않는다.
        if (launchingUrl.getQueryParameter("focus") == "health-connect-steps") return false
        return true
    }

    private fun resolveFreshHealthConnectLaunchUrl(launchingUrl: Uri): Uri? {
        if (!isAutoHealthSyncEligible(launchingUrl)) {
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

        // 실행을 붙잡아 두는 상한. 집계 읽기는 보통 수백 ms 라 실제로 걸릴 일은
        // 드물고, 넘으면 캐시 값으로 그냥 연다. 로딩 화면이 이 시간을 덮는다.
        private const val AUTO_HEALTH_SYNC_TIMEOUT_MS = 1500L
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
