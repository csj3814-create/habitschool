package com.habitschool.app.health

import java.time.Instant
import java.time.ZoneId

object HealthConnectSnapshotDecider {
    private const val APP_LAUNCH_REUSE_WINDOW_MILLIS = 15 * 60 * 1000L

    fun canReuseForAppLaunch(
        snapshot: HealthConnectSnapshot,
        nowEpochMillis: Long = System.currentTimeMillis()
    ): Boolean =
        hasUsableTodaySnapshot(snapshot, nowEpochMillis) &&
            (nowEpochMillis - snapshot.syncedAtEpochMillis) <= APP_LAUNCH_REUSE_WINDOW_MILLIS

    fun canPrefillForToday(
        snapshot: HealthConnectSnapshot,
        nowEpochMillis: Long = System.currentTimeMillis()
    ): Boolean = hasUsableTodaySnapshot(snapshot, nowEpochMillis)

    private fun hasUsableTodaySnapshot(
        snapshot: HealthConnectSnapshot,
        nowEpochMillis: Long
    ): Boolean {
        if (!snapshot.permissionGranted) return false
        if (snapshot.availabilityState != HealthConnectAvailabilityState.AVAILABLE) return false
        if (snapshot.stepsCount == null) return false
        if (snapshot.syncedAtEpochMillis <= 0L || snapshot.syncedAtEpochMillis > nowEpochMillis) return false
        return isSameLocalDay(snapshot.syncedAtEpochMillis, nowEpochMillis)
    }

    private fun isSameLocalDay(epochMillisA: Long, epochMillisB: Long): Boolean {
        val zoneId = ZoneId.systemDefault()
        val dateA = Instant.ofEpochMilli(epochMillisA).atZone(zoneId).toLocalDate()
        val dateB = Instant.ofEpochMilli(epochMillisB).atZone(zoneId).toLocalDate()
        return dateA == dateB
    }
}
