package com.habitschool.app.health

import android.content.Context

class HealthConnectSnapshotStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun read(): HealthConnectSnapshot {
        val availability = runCatching {
            HealthConnectAvailabilityState.valueOf(
                prefs.getString(KEY_AVAILABILITY, HealthConnectAvailabilityState.UNAVAILABLE.name)
                    ?: HealthConnectAvailabilityState.UNAVAILABLE.name
            )
        }.getOrDefault(HealthConnectAvailabilityState.UNAVAILABLE)

        return HealthConnectSnapshot(
            stepsCount = if (prefs.contains(KEY_STEPS_COUNT)) prefs.getLong(KEY_STEPS_COUNT, 0L) else null,
            syncedAtEpochMillis = prefs.getLong(KEY_SYNCED_AT, 0L),
            availabilityState = availability,
            permissionGranted = prefs.getBoolean(KEY_PERMISSION_GRANTED, false)
        )
    }

    fun write(snapshot: HealthConnectSnapshot) {
        prefs.edit()
            .putString(KEY_AVAILABILITY, snapshot.availabilityState.name)
            .putBoolean(KEY_PERMISSION_GRANTED, snapshot.permissionGranted)
            .putLong(KEY_SYNCED_AT, snapshot.syncedAtEpochMillis)
            .apply {
                if (snapshot.stepsCount != null) {
                    putLong(KEY_STEPS_COUNT, snapshot.stepsCount)
                } else {
                    remove(KEY_STEPS_COUNT)
                }
            }
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "habitschool_native_summary"
        private const val KEY_STEPS_COUNT = "steps_count"
        private const val KEY_SYNCED_AT = "synced_at"
        private const val KEY_AVAILABILITY = "availability"
        private const val KEY_PERMISSION_GRANTED = "permission_granted"
    }
}
