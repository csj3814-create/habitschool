package com.habitschool.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import com.habitschool.app.health.HealthConnectActivityCodec
import com.habitschool.app.health.HealthConnectAvailabilityState
import com.habitschool.app.health.HealthConnectManager
import com.habitschool.app.health.HealthConnectSnapshot
import com.habitschool.app.health.HealthConnectSnapshotStore
import com.habitschool.app.health.HealthConnectUiText
import com.habitschool.app.widget.NativeSurfaceUpdater
import kotlinx.coroutines.launch

class HealthConnectPermissionActivity : AppCompatActivity() {
    private val healthConnectManager by lazy { HealthConnectManager(this) }
    private val snapshotStore by lazy { HealthConnectSnapshotStore(this) }

    private lateinit var titleView: TextView
    private lateinit var bodyView: TextView
    private lateinit var primaryButton: Button
    private lateinit var secondaryButton: Button
    private lateinit var loadingView: ProgressBar

    // 이번 동기화에서 읽은 수면·운동. 걸음수와 같은 주소에 실려 간다.
    private var activityJson: String? = null

    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        lifecycleScope.launch {
            // 걸음수를 이미 허락한 사람에게 수면·운동만 더 물었을 때는 결과에 걸음수가
            // 빠져 있을 수 있다. 결과가 아니라 지금 상태로 판단한다.
            if (granted.containsAll(HealthConnectManager.requiredPermissions) ||
                healthConnectManager.hasRequiredPermissions()
            ) {
                performSync()
            } else {
                renderIdleState()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_health_connect)

        titleView = findViewById(R.id.native_health_title)
        bodyView = findViewById(R.id.native_health_body)
        primaryButton = findViewById(R.id.native_health_primary)
        secondaryButton = findViewById(R.id.native_health_secondary)
        loadingView = findViewById(R.id.native_health_progress)

        primaryButton.setOnClickListener {
            lifecycleScope.launch {
                continueFlow()
            }
        }

        renderIdleState()

        if (intent.getBooleanExtra(EXTRA_AUTO_START, false)) {
            window.decorView.post {
                lifecycleScope.launch {
                    continueFlow()
                }
            }
        }
    }

    private suspend fun continueFlow() {
        when (healthConnectManager.getAvailability()) {
            HealthConnectAvailabilityState.AVAILABLE -> {
                val activityPermissions = healthConnectManager.declaredActivityPermissions()
                if (!healthConnectManager.hasRequiredPermissions()) {
                    if (activityPermissions.isNotEmpty()) markActivityPermissionsAsked()
                    requestPermissions.launch(HealthConnectManager.requiredPermissions + activityPermissions)
                } else if (shouldAskActivityPermissions(activityPermissions)) {
                    // 걸음수만 허락한 기존 회원에게 수면·운동을 한 번만 묻는다. 거절하면
                    // 다시 묻지 않는다 — 동기화 버튼을 누를 때마다 권한 창이 뜨면 안 된다.
                    markActivityPermissionsAsked()
                    requestPermissions.launch(HealthConnectManager.requiredPermissions + activityPermissions)
                } else {
                    performSync()
                }
            }

            HealthConnectAvailabilityState.UPDATE_REQUIRED -> {
                healthConnectManager.buildProviderInstallIntent()?.let(::startActivity)
                renderIdleState()
            }

            HealthConnectAvailabilityState.UNAVAILABLE -> {
                openExercise(snapshotStore.read().copy(availabilityState = HealthConnectAvailabilityState.UNAVAILABLE))
            }
        }
    }

    private suspend fun performSync() {
        setLoading(true)
        val previousSnapshot = snapshotStore.read()
        val snapshot = try {
            healthConnectManager.syncTodaySteps()
        } catch (error: Exception) {
            Log.e("HealthConnectSync", "manual sync failed", error)
            setLoading(false)
            renderSyncFailure(previousSnapshot)
            return
        }

        // 수면·운동은 곁다리다. 실패해도 걸음수 동기화는 성공으로 끝난다.
        activityJson = runCatching {
            HealthConnectActivityCodec.toJson(healthConnectManager.readTodayActivity())
        }.onFailure { Log.w("HealthConnectSync", "activity read failed", it) }.getOrNull()

        snapshotStore.write(snapshot)
        NativeSurfaceUpdater.refresh(this)
        setLoading(false)
        renderSnapshot(snapshot)

        val openAfterSync = getOpenAfterSyncUri()
        if (intent.getBooleanExtra(EXTRA_AUTO_START, false) &&
            openAfterSync != null &&
            snapshot.permissionGranted &&
            snapshot.availabilityState == HealthConnectAvailabilityState.AVAILABLE
        ) {
            openExercise(snapshot)
        }
    }

    private fun renderSyncFailure(snapshot: HealthConnectSnapshot) {
        titleView.text = "Health Connect 동기화에 실패했어요"
        bodyView.text = "지금은 걸음수를 가져오지 못했습니다. 잠시 후 다시 시도하거나 Health Connect 앱 상태를 확인해 주세요."
        primaryButton.text = getString(R.string.native_health_sync_again)
        secondaryButton.text = getString(R.string.native_health_open_exercise)
        secondaryButton.setOnClickListener {
            openExercise(snapshot)
        }
    }

    private fun renderIdleState() {
        val availability = healthConnectManager.getAvailability()
        val snapshot = snapshotStore.read().copy(availabilityState = availability)

        secondaryButton.setOnClickListener {
            openExercise(snapshot)
        }

        when (availability) {
            HealthConnectAvailabilityState.AVAILABLE -> {
                if (snapshot.permissionGranted) {
                    renderSnapshot(snapshot)
                } else {
                    titleView.text = getString(R.string.native_health_title)
                    bodyView.text = getString(R.string.native_health_permission_copy)
                    primaryButton.text = getString(R.string.native_health_grant_permission)
                    secondaryButton.text = getString(R.string.native_health_open_exercise)
                }
            }

            HealthConnectAvailabilityState.UPDATE_REQUIRED -> {
                titleView.text = getString(R.string.native_health_install_title)
                bodyView.text = getString(R.string.native_health_install_copy)
                primaryButton.text = getString(R.string.native_health_install_cta)
                secondaryButton.text = getString(R.string.native_health_open_exercise)
            }

            HealthConnectAvailabilityState.UNAVAILABLE -> {
                titleView.text = getString(R.string.native_health_unavailable_title)
                bodyView.text = getString(R.string.native_health_unavailable_copy)
                primaryButton.text = getString(R.string.native_health_open_exercise)
                secondaryButton.text = getString(R.string.native_health_close)
                secondaryButton.setOnClickListener { finish() }
            }
        }
    }

    private fun renderSnapshot(snapshot: HealthConnectSnapshot) {
        titleView.text = HealthConnectUiText.headline(this, snapshot)
        bodyView.text = HealthConnectUiText.detail(this, snapshot)
        primaryButton.text = getString(R.string.native_health_sync_again)
        secondaryButton.text = getString(R.string.native_health_open_exercise)
        secondaryButton.setOnClickListener {
            openExercise(snapshot)
        }
    }

    private fun setLoading(isLoading: Boolean) {
        loadingView.visibility = if (isLoading) View.VISIBLE else View.GONE
        primaryButton.isEnabled = !isLoading
        secondaryButton.isEnabled = !isLoading
    }

    private fun getOpenAfterSyncUri(): Uri? {
        val raw = intent.getStringExtra(EXTRA_OPEN_AFTER_SYNC_URL)
        return raw?.let(Uri::parse)
    }

    private fun openExercise(snapshot: HealthConnectSnapshot = snapshotStore.read()) {
        startActivity(
            AppRoutes.twaIntent(
                this,
                resolveOpenUri(snapshot),
                skipAutoHealthSync = true
            )
        )
        finish()
    }

    private fun resolveOpenUri(snapshot: HealthConnectSnapshot): Uri {
        val explicitUri = getOpenAfterSyncUri()
        val nativeSource = explicitUri?.getQueryParameter("native")
            ?.takeUnless { it.isNullOrBlank() }
            ?: getEntrySource()

        if (
            snapshot.permissionGranted &&
            snapshot.availabilityState == HealthConnectAvailabilityState.AVAILABLE &&
            snapshot.stepsCount != null
        ) {
            return AppRoutes.withHealthConnectSteps(
                baseUri = explicitUri ?: AppRoutes.exerciseUri(nativeSource),
                nativeSource = nativeSource,
                stepsCount = snapshot.stepsCount,
                syncedAtEpochMillis = snapshot.syncedAtEpochMillis,
                stepProviderLabel = snapshot.dataOriginLabel,
                activityJson = activityJson
            )
        }

        return explicitUri ?: AppRoutes.exerciseUri(nativeSource)
    }

    private suspend fun shouldAskActivityPermissions(declared: Set<String>): Boolean {
        if (declared.isEmpty()) return false
        if (promptPrefs().getBoolean(KEY_ACTIVITY_PERMISSIONS_ASKED, false)) return false
        return !healthConnectManager.hasAllDeclaredActivityPermissions()
    }

    private fun markActivityPermissionsAsked() {
        promptPrefs().edit().putBoolean(KEY_ACTIVITY_PERMISSIONS_ASKED, true).apply()
    }

    private fun promptPrefs() = getSharedPreferences(PROMPT_PREFS_NAME, MODE_PRIVATE)

    private fun getEntrySource(): String =
        intent.getStringExtra(EXTRA_SOURCE)
            ?.takeUnless { it.isBlank() }
            ?: "health-connect"

    companion object {
        private const val EXTRA_AUTO_START = "extra_auto_start"
        private const val EXTRA_OPEN_AFTER_SYNC_URL = "extra_open_after_sync_url"
        private const val EXTRA_SOURCE = "extra_source"
        private const val PROMPT_PREFS_NAME = "habitschool_health_prompts"
        private const val KEY_ACTIVITY_PERMISSIONS_ASKED = "activity_permissions_asked_v1"

        fun createSyncIntent(
            context: Context,
            source: String,
            openAfterSync: Uri? = null,
            autoStart: Boolean = true
        ): Intent =
            Intent(context, HealthConnectPermissionActivity::class.java).apply {
                putExtra(EXTRA_SOURCE, source)
                putExtra(EXTRA_AUTO_START, autoStart)
                putExtra(EXTRA_OPEN_AFTER_SYNC_URL, openAfterSync?.toString())
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
    }
}
