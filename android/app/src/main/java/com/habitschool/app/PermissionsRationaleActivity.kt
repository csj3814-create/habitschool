package com.habitschool.app

import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity

class PermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_permissions_rationale)

        findViewById<Button>(R.id.native_health_privacy_primary).setOnClickListener {
            startActivity(AppRoutes.twaIntent(this, AppRoutes.privacyUri()))
        }

        findViewById<Button>(R.id.native_health_privacy_secondary).setOnClickListener {
            finish()
        }
    }
}
