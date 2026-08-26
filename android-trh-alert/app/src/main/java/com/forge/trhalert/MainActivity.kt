package com.forge.trhalert

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var statusText: TextView
    private lateinit var statusDot: View
    private lateinit var lastAlertText: TextView
    private lateinit var sideBadge: TextView
    private lateinit var levelsRow: View
    private lateinit var entryValue: TextView
    private lateinit var slValue: TextView
    private lateinit var tpValue: TextView

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                TrhAlertService.ACTION_STATUS -> {
                    val status = intent.getStringExtra(TrhAlertService.EXTRA_TEXT) ?: ""
                    applyStatus(status)
                }
                TrhAlertService.ACTION_ALERT -> {
                    val body = intent.getStringExtra(TrhAlertService.EXTRA_TEXT) ?: ""
                    applyAlert(body)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        statusDot = findViewById(R.id.statusDot)
        lastAlertText = findViewById(R.id.lastAlertText)
        sideBadge = findViewById(R.id.sideBadge)
        levelsRow = findViewById(R.id.levelsRow)
        entryValue = findViewById(R.id.entryValue)
        slValue = findViewById(R.id.slValue)
        tpValue = findViewById(R.id.tpValue)

        findViewById<Button>(R.id.testSoundBtn).setOnClickListener {
            Notify.playTestSound(this)
        }

        requestNotificationPermission()
        ContextCompat.startForegroundService(this, Intent(this, TrhAlertService::class.java))

        applyStatus(TrhAlertService.lastStatus.ifEmpty { getString(R.string.status_connecting) })
        if (TrhAlertService.lastAlert.isNotEmpty()) {
            applyAlert(TrhAlertService.lastAlert)
        }

        intent?.getStringExtra("alert_body")?.let { applyAlert(it) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("alert_body")?.let { applyAlert(it) }
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

    private fun applyStatus(status: String) {
        statusText.text = status
        val connected = status.contains("Armed", ignoreCase = true) ||
            status.contains("Connected", ignoreCase = true) ||
            status.contains("live", ignoreCase = true)
        val disconnected = status.contains("Disconnected", ignoreCase = true) ||
            status.contains("Offline", ignoreCase = true) ||
            status.contains("retry", ignoreCase = true)
        statusDot.setBackgroundResource(
            when {
                connected -> R.drawable.dot_connected
                disconnected -> R.drawable.dot_disconnected
                else -> R.drawable.dot_connecting
            },
        )
    }

    private fun applyAlert(body: String) {
        lastAlertText.text = body
        val upper = body.uppercase()
        when {
            upper.contains("LONG") -> {
                sideBadge.text = "LONG"
                sideBadge.setTextColor(ContextCompat.getColor(this, R.color.long_green))
                sideBadge.setBackgroundResource(R.drawable.bg_badge_long)
            }
            upper.contains("SHORT") -> {
                sideBadge.text = "SHORT"
                sideBadge.setTextColor(ContextCompat.getColor(this, R.color.short_red))
                sideBadge.setBackgroundResource(R.drawable.bg_badge_short)
            }
            else -> {
                sideBadge.text = "ALERT"
                sideBadge.setTextColor(ContextCompat.getColor(this, R.color.text_muted))
                sideBadge.setBackgroundResource(R.drawable.bg_badge_neutral)
            }
        }

        val entry = Regex("""ENTRY\s+([0-9.]+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
        val sl = Regex("""SL\s+([0-9.]+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
        val tp = Regex("""TP\s+([0-9.]+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
        if (entry != null || sl != null || tp != null) {
            levelsRow.visibility = View.VISIBLE
            entryValue.text = entry ?: "—"
            slValue.text = sl ?: "—"
            tpValue.text = tp ?: "—"
        }
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
