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

    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        lifecycleScope.launch {
            if (granted.containsAll(HealthConnectManager.requiredPermissions)) {
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
                if (healthConnectManager.hasRequiredPermissions()) {
                    performSync()
                } else {
                    requestPermissions.launch(HealthConnectManager.requiredPermissions)
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
                stepProviderLabel = snapshot.dataOriginLabel
            )
        }

        return explicitUri ?: AppRoutes.exerciseUri(nativeSource)
    }

    private fun getEntrySource(): String =
        intent.getStringExtra(EXTRA_SOURCE)
            ?.takeUnless { it.isBlank() }
            ?: "health-connect"

    companion object {
        private const val EXTRA_AUTO_START = "extra_auto_start"
        private const val EXTRA_OPEN_AFTER_SYNC_URL = "extra_open_after_sync_url"
        private const val EXTRA_SOURCE = "extra_source"

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
