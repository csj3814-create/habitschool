package com.habitschool.app

import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity

class OnboardingActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_health_connect_onboarding)

        findViewById<Button>(R.id.native_health_onboarding_primary).setOnClickListener {
            startActivity(
                HealthConnectPermissionActivity.createSyncIntent(
                    context = this,
                    source = "health-connect-onboarding",
                    openAfterSync = AppRoutes.exerciseUri("health-connect-onboarding"),
                    autoStart = true
                )
            )
            finish()
        }

        findViewById<Button>(R.id.native_health_onboarding_secondary).setOnClickListener {
            startActivity(AppRoutes.twaIntent(this, AppRoutes.exerciseUri("health-connect-onboarding")))
            finish()
        }
    }
}
