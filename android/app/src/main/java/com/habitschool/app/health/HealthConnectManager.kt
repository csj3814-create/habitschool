package com.habitschool.app.health

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

enum class HealthConnectAvailabilityState {
    AVAILABLE,
    UPDATE_REQUIRED,
    UNAVAILABLE
}

data class HealthConnectSnapshot(
    val stepsCount: Long? = null,
    val syncedAtEpochMillis: Long = 0L,
    val availabilityState: HealthConnectAvailabilityState = HealthConnectAvailabilityState.UNAVAILABLE,
    val permissionGranted: Boolean = false
)

class HealthConnectManager(private val context: Context) {
    fun getAvailability(): HealthConnectAvailabilityState =
        when (HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE_NAME)) {
            HealthConnectClient.SDK_AVAILABLE -> HealthConnectAvailabilityState.AVAILABLE
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthConnectAvailabilityState.UPDATE_REQUIRED
            else -> HealthConnectAvailabilityState.UNAVAILABLE
        }

    fun buildProviderInstallIntent(): Intent? {
        if (getAvailability() != HealthConnectAvailabilityState.UPDATE_REQUIRED) return null
        val uriString = "market://details?id=$PROVIDER_PACKAGE_NAME&url=healthconnect%3A%2F%2Fonboarding"
        return Intent(Intent.ACTION_VIEW).apply {
            setPackage("com.android.vending")
            data = Uri.parse(uriString)
            putExtra("overlay", true)
            putExtra("callerId", context.packageName)
        }
    }

    suspend fun hasRequiredPermissions(): Boolean {
        val client = getClientOrNull() ?: return false
        return client.permissionController.getGrantedPermissions().containsAll(requiredPermissions)
    }

    suspend fun syncTodaySteps(): HealthConnectSnapshot {
        val availability = getAvailability()
        if (availability != HealthConnectAvailabilityState.AVAILABLE) {
            return HealthConnectSnapshot(availabilityState = availability)
        }

        val client = getClientOrNull() ?: return HealthConnectSnapshot(availabilityState = availability)
        val permissionGranted = client.permissionController.getGrantedPermissions().containsAll(requiredPermissions)
        if (!permissionGranted) {
            return HealthConnectSnapshot(
                availabilityState = availability,
                permissionGranted = false
            )
        }

        val zoneId = ZoneId.systemDefault()
        val startTime = LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant()
        val endTime = Instant.now()
        val response = client.aggregate(
            AggregateRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(startTime, endTime)
            )
        )

        return HealthConnectSnapshot(
            stepsCount = response[StepsRecord.COUNT_TOTAL] ?: 0L,
            syncedAtEpochMillis = System.currentTimeMillis(),
            availabilityState = availability,
            permissionGranted = true
        )
    }

    private fun getClientOrNull(): HealthConnectClient? {
        if (getAvailability() != HealthConnectAvailabilityState.AVAILABLE) return null
        return HealthConnectClient.getOrCreate(context)
    }

    companion object {
        const val PROVIDER_PACKAGE_NAME = "com.google.android.apps.healthdata"

        val requiredPermissions: Set<String> = setOf(
            HealthPermission.getReadPermission(StepsRecord::class)
        )
    }
}
