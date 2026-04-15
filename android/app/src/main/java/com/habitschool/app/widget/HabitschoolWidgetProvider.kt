package com.habitschool.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import com.habitschool.app.AppRoutes
import com.habitschool.app.HealthConnectPermissionActivity
import com.habitschool.app.R
import com.habitschool.app.health.HealthConnectSnapshot
import com.habitschool.app.health.HealthConnectSnapshotDecider
import com.habitschool.app.health.HealthConnectSnapshotStore
import com.habitschool.app.health.HealthConnectUiText

class HabitschoolWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        appWidgetIds.forEach { appWidgetId ->
            appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context))
        }
    }

    companion object {
        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, HabitschoolWidgetProvider::class.java)
            val ids = manager.getAppWidgetIds(component)
            if (ids.isEmpty()) return
            ids.forEach { appWidgetId ->
                manager.updateAppWidget(appWidgetId, buildRemoteViews(context))
            }
        }

        private fun buildRemoteViews(context: Context): RemoteViews {
            val snapshot = HealthConnectSnapshotStore(context).read()
            val views = RemoteViews(context.packageName, R.layout.widget_habitschool_summary)
            views.setTextViewText(R.id.widget_steps, HealthConnectUiText.widgetPrimary(context, snapshot))
            views.setTextViewText(R.id.widget_status, HealthConnectUiText.widgetStatus(context, snapshot))

            val openIntent = PendingIntent.getActivity(
                context,
                1001,
                AppRoutes.twaIntent(context, buildExerciseUri(snapshot)),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val syncIntent = PendingIntent.getActivity(
                context,
                1002,
                HealthConnectPermissionActivity.createSyncIntent(
                    context = context,
                    source = "widget",
                    openAfterSync = null,
                    autoStart = true
                ),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            views.setOnClickPendingIntent(R.id.widget_root, openIntent)
            views.setOnClickPendingIntent(R.id.widget_sync_button, syncIntent)
            return views
        }

        private fun buildExerciseUri(snapshot: HealthConnectSnapshot): android.net.Uri {
            val stepsCount = snapshot.stepsCount
            return if (stepsCount != null && HealthConnectSnapshotDecider.canPrefillForToday(snapshot)) {
                AppRoutes.exerciseImportUri(
                    nativeSource = "android-widget",
                    stepsCount = stepsCount,
                    syncedAtEpochMillis = snapshot.syncedAtEpochMillis,
                    stepProviderLabel = snapshot.dataOriginLabel
                )
            } else {
                AppRoutes.exerciseUri("android-widget")
            }
        }
    }
}
