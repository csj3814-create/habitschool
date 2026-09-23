package com.habitschool.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import com.habitschool.app.health.HealthConnectAvailabilityState
import com.habitschool.app.health.HealthConnectBodySnapshot
import com.habitschool.app.health.HealthConnectManager
import kotlinx.coroutines.launch

/**
 * 프로필 체성분 칸의 "Health Connect 에서 가져오기".
 *
 * 화면 없이 지나가는 활동이다. 권한이 없으면 Health Connect 의 권한 창을 띄우고,
 * 최신 체중·체지방률·기초대사량·제지방량을 읽어 웹의 프로필 탭으로 돌려보낸다.
 * 걸음수 동기화(HealthConnectPermissionActivity)와 권한을 따로 묻는다 — 체성분을
 * 거절했다고 걸음수까지 멈추면 안 된다.
 *
 * Health Connect 에는 골격근량과 내장지방이 없다. 그 둘은 비어서 간다.
 */
class HealthConnectBodyActivity : ComponentActivity() {
    private val healthConnectManager by lazy { HealthConnectManager(this) }

    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        lifecycleScope.launch {
            if (granted.any { it in HealthConnectManager.bodyPermissions }) {
                readAndReturn()
            } else {
                returnToWeb(STATUS_DENIED)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) return

        lifecycleScope.launch {
            when (healthConnectManager.getAvailability()) {
                HealthConnectAvailabilityState.AVAILABLE -> {
                    if (healthConnectManager.hasAnyBodyPermission()) {
                        readAndReturn()
                    } else {
                        requestPermissions.launch(HealthConnectManager.bodyPermissions)
                    }
                }

                HealthConnectAvailabilityState.UPDATE_REQUIRED -> {
                    healthConnectManager.buildProviderInstallIntent()?.let(::startActivity)
                    returnToWeb(STATUS_UPDATE_REQUIRED)
                }

                HealthConnectAvailabilityState.UNAVAILABLE -> returnToWeb(STATUS_UNAVAILABLE)
            }
        }
    }

    private suspend fun readAndReturn() {
        val snapshot = try {
            healthConnectManager.readLatestBodyComposition()
        } catch (error: Exception) {
            Log.e("HealthConnectBody", "body composition read failed", error)
            returnToWeb(STATUS_FAILED)
            return
        }
        if (!snapshot.hasAnyValue()) {
            returnToWeb(STATUS_EMPTY)
            return
        }
        returnToWeb(STATUS_OK, snapshot)
    }

    private fun returnToWeb(status: String, snapshot: HealthConnectBodySnapshot? = null) {
        val source = intent.getStringExtra(EXTRA_SOURCE)?.takeUnless { it.isBlank() } ?: "health-connect-body"
        val base = intent.getStringExtra(EXTRA_RETURN_TO)?.let(Uri::parse) ?: AppRoutes.profileUri(source)
        val uri = AppRoutes.withHealthConnectBody(
            baseUri = base,
            nativeSource = source,
            status = status,
            weightKg = snapshot?.weightKg,
            bodyFatPercent = snapshot?.bodyFatPercent,
            basalKcalPerDay = snapshot?.basalKcalPerDay,
            leanMassKg = snapshot?.leanMassKg,
            measuredAtEpochMillis = snapshot?.measuredAtEpochMillis,
            originPackage = snapshot?.originPackage
        )
        startActivity(AppRoutes.twaIntent(this, uri, skipAutoHealthSync = true))
        finish()
    }

    companion object {
        const val STATUS_OK = "ok"
        const val STATUS_EMPTY = "empty"
        const val STATUS_DENIED = "denied"
        const val STATUS_UNAVAILABLE = "unavailable"
        const val STATUS_UPDATE_REQUIRED = "update_required"
        const val STATUS_FAILED = "failed"

        private const val EXTRA_SOURCE = "extra_source"
        private const val EXTRA_RETURN_TO = "extra_return_to"

        fun createIntent(context: Context, source: String, returnTo: Uri): Intent =
            Intent(context, HealthConnectBodyActivity::class.java).apply {
                putExtra(EXTRA_SOURCE, source)
                putExtra(EXTRA_RETURN_TO, returnTo.toString())
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
    }
}
