package com.example.android_ellie

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.android_ellie.server.ServerViewModel
import com.example.android_ellie.ui.EllieApp
import com.example.android_ellie.ui.theme.Android_ellieTheme

class MainActivity : ComponentActivity() {

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Android_ellieTheme {
                val vm: ServerViewModel = viewModel()

                LaunchedEffect(Unit) {
                    requestPermissionLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                            Manifest.permission.READ_PHONE_STATE,
                            Manifest.permission.READ_CONTACTS,
                            Manifest.permission.READ_CALENDAR,
                            Manifest.permission.POST_NOTIFICATIONS,
                            Manifest.permission.BLUETOOTH_SCAN,
                            Manifest.permission.BLUETOOTH_CONNECT
                        )
                    )
                    checkSpecialPermissions()
                }

                EllieApp(viewModel = vm)
            }
        }
    }

    private fun checkSpecialPermissions() {
        // Usage Stats
        val usageStatsManager = getSystemService(USAGE_STATS_SERVICE) as android.app.usage.UsageStatsManager
        val time = System.currentTimeMillis()
        val stats = usageStatsManager.queryUsageStats(android.app.usage.UsageStatsManager.INTERVAL_DAILY, time - 1000 * 10, time)
        if (stats.isEmpty()) {
            runCatching {
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                    data = Uri.fromParts("package", packageName, null)
                })
            }.onFailure {
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            }
        }

        // Notification Listener Access
        val enabledListeners = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        val componentName = android.content.ComponentName(this, com.example.android_ellie.server.EllieNotificationListenerService::class.java)
        val isEnabled = enabledListeners?.contains(componentName.flattenToString()) == true
        if (!isEnabled) {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        // Accessibility Service Access (Optional but recommended for the request)
        // val accessibilityEnabled = Settings.Secure.getInt(contentResolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0)
        // If you want to force navigation to accessibility settings:
        // startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }
}
