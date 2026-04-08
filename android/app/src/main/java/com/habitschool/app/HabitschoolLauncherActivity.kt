package com.habitschool.app

import android.net.Uri
import com.google.androidbrowserhelper.trusted.LauncherActivity

class HabitschoolLauncherActivity : LauncherActivity() {
    override fun getLaunchingUrl(): Uri {
        val launchingUrl = super.getLaunchingUrl()
        if (launchingUrl.scheme != "https" || launchingUrl.host != Uri.parse(AppRoutes.WEB_ORIGIN).host) {
            return launchingUrl
        }
        if (!launchingUrl.getQueryParameter("native").isNullOrBlank()) {
            return launchingUrl
        }

        return launchingUrl.buildUpon()
            .appendQueryParameter("native", "android-shell")
            .build()
    }
}
