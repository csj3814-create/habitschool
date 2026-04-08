package com.habitschool.app.health

import android.content.Context
import android.text.format.DateUtils
import com.habitschool.app.R
import java.text.NumberFormat

object HealthConnectUiText {
    fun headline(context: Context, snapshot: HealthConnectSnapshot): String =
        when {
            snapshot.permissionGranted && snapshot.stepsCount != null ->
                context.getString(R.string.native_health_synced_title, formatSteps(snapshot.stepsCount))

            snapshot.availabilityState == HealthConnectAvailabilityState.UPDATE_REQUIRED ->
                context.getString(R.string.native_health_install_title)

            snapshot.availabilityState == HealthConnectAvailabilityState.UNAVAILABLE ->
                context.getString(R.string.native_health_unavailable_title)

            else -> context.getString(R.string.native_health_title)
        }

    fun detail(context: Context, snapshot: HealthConnectSnapshot): String =
        when {
            snapshot.permissionGranted && snapshot.stepsCount != null ->
                context.getString(
                    R.string.native_health_synced_copy,
                    formatSteps(snapshot.stepsCount),
                    relativeTime(context, snapshot.syncedAtEpochMillis)
                )

            snapshot.availabilityState == HealthConnectAvailabilityState.UPDATE_REQUIRED ->
                context.getString(R.string.native_health_install_copy)

            snapshot.availabilityState == HealthConnectAvailabilityState.UNAVAILABLE ->
                context.getString(R.string.native_health_unavailable_copy)

            else -> context.getString(R.string.native_health_permission_copy)
        }

    fun widgetPrimary(context: Context, snapshot: HealthConnectSnapshot): String =
        when {
            snapshot.permissionGranted && snapshot.stepsCount != null ->
                context.getString(R.string.widget_steps_value, formatSteps(snapshot.stepsCount))

            snapshot.availabilityState == HealthConnectAvailabilityState.UPDATE_REQUIRED ->
                context.getString(R.string.widget_install_required)

            else -> context.getString(R.string.widget_connect_required)
        }

    fun widgetStatus(context: Context, snapshot: HealthConnectSnapshot): String =
        when {
            snapshot.permissionGranted && snapshot.syncedAtEpochMillis > 0L ->
                context.getString(R.string.widget_synced_at, relativeTime(context, snapshot.syncedAtEpochMillis))

            snapshot.availabilityState == HealthConnectAvailabilityState.UPDATE_REQUIRED ->
                context.getString(R.string.widget_install_copy)

            snapshot.availabilityState == HealthConnectAvailabilityState.UNAVAILABLE ->
                context.getString(R.string.widget_unavailable_copy)

            else -> context.getString(R.string.widget_permission_copy)
        }

    fun tileSubtitle(context: Context, snapshot: HealthConnectSnapshot): String =
        when {
            snapshot.permissionGranted && snapshot.stepsCount != null ->
                context.getString(R.string.tile_steps_value, formatSteps(snapshot.stepsCount))

            snapshot.availabilityState == HealthConnectAvailabilityState.UPDATE_REQUIRED ->
                context.getString(R.string.tile_install_required)

            else -> context.getString(R.string.tile_connect_required)
        }

    private fun formatSteps(count: Long): String = NumberFormat.getIntegerInstance().format(count)

    private fun relativeTime(context: Context, epochMillis: Long): String {
        if (epochMillis <= 0L) return context.getString(R.string.native_health_not_synced)
        return DateUtils.getRelativeTimeSpanString(
            epochMillis,
            System.currentTimeMillis(),
            DateUtils.MINUTE_IN_MILLIS,
            DateUtils.FORMAT_ABBREV_RELATIVE
        ).toString()
    }
}
