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
import com.google.androidbrowserhelper.trusted.SharingUtils
import com.google.androidbrowserhelper.trusted.TwaLauncher
import com.google.androidbrowserhelper.trusted.WebViewFallbackActivity
import com.habitschool.app.health.HealthConnectActivityCodec
import com.habitschool.app.health.HealthConnectAvailabilityState
import com.habitschool.app.health.HealthConnectManager
import com.habitschool.app.health.HealthConnectSnapshotDecider
import com.habitschool.app.health.HealthConnectSnapshotStore
import com.habitschool.app.widget.NativeSurfaceUpdater
import androidx.browser.trusted.sharing.ShareData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

class HabitschoolLauncherActivity : AppCompatActivity() {
    private val snapshotStore by lazy { HealthConnectSnapshotStore(this) }
    private val healthConnectManager by lazy { HealthConnectManager(this) }
    private val launcherMetadata by lazy { LauncherActivityMetadata.parse(this) }
    private val mainHandler = Handler(Looper.getMainLooper())

    private var launchUrlOverride: Uri? = null
    // 공유 인텐트일 때 미리 복사해 둔 파일. 크롬에 넘기기 전에 IO 스레드에서 만든다.
    private var preparedShareData: ShareData? = null
    // 공유 파일을 서버에 올렸으면 true. 그때는 크롬에 파일을 넘기지 않는다 — 크롬 153 이
    // 버리기 때문이다. 웹이 주소에 붙은 id 로 서버에서 받아 간다.
    private var shareDeliveredByUpload = false
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
                if (isShareIntent()) {
                    val prepared = withContext(Dispatchers.IO) {
                        runCatching { SharedFileRelay.prepare(this@HabitschoolLauncherActivity, intent) }
                            .onFailure { Log.w(TAG, "Share relay failed, forwarding the intent as is", it) }
                            .getOrNull()
                    }
                    preparedShareData = prepared?.shareData
                    // 크롬을 거치지 않는 길이 먼저다. 실패하면 예전처럼 크롬에 넘긴다.
                    val uploadIds = prepared?.files?.takeIf { it.isNotEmpty() }?.let { files ->
                        withTimeoutOrNull(SHARED_UPLOAD_TIMEOUT_MS) {
                            withContext(Dispatchers.IO) { SharedUploadClient.uploadAll(files) }
                        }
                    }
                    if (!uploadIds.isNullOrEmpty()) {
                        shareDeliveredByUpload = true
                        launchUrlOverride = AppRoutes.sharedUploadUri(uploadIds, prepared?.source)
                        Log.d(TAG, "Share delivered by upload: ${uploadIds.size} file(s)")
                    } else if (prepared?.files?.isNotEmpty() == true) {
                        Log.w(TAG, "Share upload failed, falling back to the Chrome share target")
                    }
                }
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

        // 수면·운동은 걸음수와 나란히 읽는다. 같은 상한 안에 못 끝나면 빼고 연다 —
        // 걸음수까지 늦출 이유가 없다.
        val (snapshot, activityJson) = coroutineScope {
            val activity = async {
                withTimeoutOrNull(AUTO_HEALTH_SYNC_TIMEOUT_MS) {
                    runCatching { HealthConnectActivityCodec.toJson(healthConnectManager.readTodayActivity()) }
                        .onFailure { error -> Log.w(TAG, "Launch activity read failed", error) }
                        .getOrNull()
                }
            }
            val steps = withTimeoutOrNull(AUTO_HEALTH_SYNC_TIMEOUT_MS) {
                runCatching { healthConnectManager.syncTodaySteps() }
                    .onFailure { error -> Log.w(TAG, "Launch health sync failed", error) }
                    .getOrNull()
            }
            steps to activity.await()
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
            stepProviderLabel = snapshot.dataOriginLabel,
            activityJson = activityJson
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
            addShareDataIfPresent(launchBuilder)

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

    /**
     * 다른 앱에서 공유한 파일을 웹의 /share-target 으로 넘긴다.
     *
     * 2026-09-23: Fitdays 에서 공유하면 "사진을 찾지 못했어요". 원인 하나가 여기였다.
     * 기본 LauncherActivity 는 공유 인텐트의 파일을 꺼내 setShareParams 로 크롬에
     * 건네고, 크롬이 그것을 /share-target 에 POST 한다. 이 런처는 그 LauncherActivity 를
     * 쓰지 않고 직접 만든 것이라 그 한 단계가 빠져 있었다 — Play 앱으로 공유하면
     * 식단 사진이든 무엇이든 **파일 없이** 웹만 열렸다.
     *
     * 기본 구현(androidbrowserhelper 2.6.2 LauncherActivity.addShareDataIfPresent)과
     * 같은 일을 한다. 파일 읽기 권한은 TrustedWebActivityIntent 가 크롬에 넘겨준다.
     */
    private fun addShareDataIfPresent(builder: TrustedWebActivityIntentBuilder) {
        if (!isShareIntent() || shareDeliveredByUpload) return
        // 복사해 둔 것이 있으면 그것을, 없으면 인텐트 그대로를 넘긴다.
        val shareData = preparedShareData ?: SharingUtils.retrieveShareDataFromIntent(intent)
        if (shareData == null) {
            Log.w(TAG, "Share intent carried nothing we can forward")
            return
        }
        val shareTargetJson = launcherMetadata.shareTarget
        if (shareTargetJson.isNullOrBlank()) {
            Log.w(TAG, "Share target is not declared in the manifest; files are dropped")
            return
        }
        try {
            builder.setShareParams(SharingUtils.parseShareTargetJson(shareTargetJson), shareData)
            Log.d(TAG, "Forwarding share: uris=${shareData.uris?.size ?: 0} text=${!shareData.text.isNullOrBlank()}")
        } catch (error: Exception) {
            Log.w(TAG, "Failed to parse share target; files are dropped", error)
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
            return AppRoutes.withNativeVersion(launchingUrl)
        }

        return AppRoutes.withNativeVersion(
            launchingUrl.buildUpon()
                .appendQueryParameter("native", "android-shell")
                .build()
        )
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
        // 공유 파일 올리기 상한. 결과 화면 한 장은 보통 1~3초다. 넘으면 크롬 길로 연다.
        private const val SHARED_UPLOAD_TIMEOUT_MS = 20_000L
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
