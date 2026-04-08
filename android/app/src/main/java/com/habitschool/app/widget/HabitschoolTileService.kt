package com.habitschool.app.widget

import android.app.PendingIntent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.habitschool.app.AppRoutes
import com.habitschool.app.HealthConnectPermissionActivity
import com.habitschool.app.R
import com.habitschool.app.health.HealthConnectSnapshotStore
import com.habitschool.app.health.HealthConnectUiText

class HabitschoolTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        renderTile()
    }

    override fun onClick() {
        super.onClick()

        val intent = HealthConnectPermissionActivity.createSyncIntent(
            context = this,
            source = "qs-tile",
            openAfterSync = AppRoutes.exerciseUri("android-tile"),
            autoStart = true
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(
                PendingIntent.getActivity(
                    this,
                    2001,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    private fun renderTile() {
        val tile = qsTile ?: return
        val snapshot = HealthConnectSnapshotStore(this).read()
        tile.label = getString(R.string.tile_label)
        tile.icon = Icon.createWithResource(this, R.drawable.ic_tile_health)
        tile.state = if (snapshot.permissionGranted) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = HealthConnectUiText.tileSubtitle(this, snapshot)
        }
        tile.updateTile()
    }
}
