package com.habitschool.app.widget

import android.content.ComponentName
import android.content.Context
import android.service.quicksettings.TileService

object NativeSurfaceUpdater {
    fun refresh(context: Context) {
        HabitschoolWidgetProvider.refreshAll(context)
        TileService.requestListeningState(context, ComponentName(context, HabitschoolTileService::class.java))
    }
}
