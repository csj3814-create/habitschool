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
            allOriginsStepsCount = if (prefs.contains(KEY_ALL_ORIGINS_STEPS_COUNT)) prefs.getLong(KEY_ALL_ORIGINS_STEPS_COUNT, 0L) else null,
            syncedAtEpochMillis = prefs.getLong(KEY_SYNCED_AT, 0L),
            availabilityState = availability,
            permissionGranted = prefs.getBoolean(KEY_PERMISSION_GRANTED, false),
            dataOriginPackageName = prefs.getString(KEY_DATA_ORIGIN_PACKAGE_NAME, null),
            dataOriginLabel = prefs.getString(KEY_DATA_ORIGIN_LABEL, null)
        )
    }

    fun write(snapshot: HealthConnectSnapshot) {
        prefs.edit()
            .putString(KEY_AVAILABILITY, snapshot.availabilityState.name)
            .putBoolean(KEY_PERMISSION_GRANTED, snapshot.permissionGranted)
            .putLong(KEY_SYNCED_AT, snapshot.syncedAtEpochMillis)
            .apply {
                if (snapshot.allOriginsStepsCount != null) {
                    putLong(KEY_ALL_ORIGINS_STEPS_COUNT, snapshot.allOriginsStepsCount)
                } else {
                    remove(KEY_ALL_ORIGINS_STEPS_COUNT)
                }
            }
            .apply {
                if (!snapshot.dataOriginPackageName.isNullOrBlank()) {
                    putString(KEY_DATA_ORIGIN_PACKAGE_NAME, snapshot.dataOriginPackageName)
                } else {
                    remove(KEY_DATA_ORIGIN_PACKAGE_NAME)
                }
            }
            .apply {
                if (!snapshot.dataOriginLabel.isNullOrBlank()) {
                    putString(KEY_DATA_ORIGIN_LABEL, snapshot.dataOriginLabel)
                } else {
                    remove(KEY_DATA_ORIGIN_LABEL)
                }
            }
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
        private const val KEY_ALL_ORIGINS_STEPS_COUNT = "all_origins_steps_count"
        private const val KEY_SYNCED_AT = "synced_at"
        private const val KEY_AVAILABILITY = "availability"
        private const val KEY_PERMISSION_GRANTED = "permission_granted"
        private const val KEY_DATA_ORIGIN_PACKAGE_NAME = "data_origin_package_name"
        private const val KEY_DATA_ORIGIN_LABEL = "data_origin_label"
    }
}
