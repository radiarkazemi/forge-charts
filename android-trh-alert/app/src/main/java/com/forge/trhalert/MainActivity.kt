package com.forge.trhalert

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var statusText: TextView
    private lateinit var lastAlertText: TextView

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                TrhAlertService.ACTION_STATUS -> {
                    statusText.text = intent.getStringExtra(TrhAlertService.EXTRA_TEXT) ?: ""
                }
                TrhAlertService.ACTION_ALERT -> {
                    lastAlertText.text = intent.getStringExtra(TrhAlertService.EXTRA_TEXT) ?: ""
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        statusText = findViewById(R.id.statusText)
        lastAlertText = findViewById(R.id.lastAlertText)

        requestNotificationPermission()
        ContextCompat.startForegroundService(this, Intent(this, TrhAlertService::class.java))

        statusText.text = TrhAlertService.lastStatus.ifEmpty { getString(R.string.status_connecting) }
        lastAlertText.text = TrhAlertService.lastAlert.ifEmpty { "No alerts yet" }
    }

    override fun onStart() {
        super.onStart()
        val filter = IntentFilter().apply {
            addAction(TrhAlertService.ACTION_STATUS)
            addAction(TrhAlertService.ACTION_ALERT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(receiver, filter)
        }
    }

    override fun onStop() {
        unregisterReceiver(receiver)
        super.onStop()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }
}
