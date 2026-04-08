package com.habitschool.app

import android.content.Intent
import android.net.Uri
import com.google.androidbrowserhelper.trusted.LauncherActivity

class HabitschoolLauncherActivity : LauncherActivity() {
    override fun getLaunchingUrl(): Uri {
        val launchingUrl = super.getLaunchingUrl()
        val action = intent?.action
        if (action == Intent.ACTION_SEND || action == Intent.ACTION_SEND_MULTIPLE) {
            return launchingUrl
        }
        if (launchingUrl.scheme != "https" || launchingUrl.host != Uri.parse(AppRoutes.WEB_ORIGIN).host) {
            return launchingUrl
        }
        if (launchingUrl.encodedPath == "/share-target") {
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
