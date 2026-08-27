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
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class MainActivity : AppCompatActivity() {
    private lateinit var statusText: TextView
    private lateinit var statusDot: View
    private lateinit var lastAlertText: TextView
    private lateinit var sideBadge: TextView
    private lateinit var levelsRow: View
    private lateinit var timesRow: View
    private lateinit var entryValue: TextView
    private lateinit var slValue: TextView
    private lateinit var tpValue: TextView
    private lateinit var entryTimeValue: TextView
    private lateinit var expiryTimeValue: TextView

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                TrhAlertService.ACTION_STATUS -> {
                    val status = intent.getStringExtra(TrhAlertService.EXTRA_TEXT) ?: ""
                    applyStatus(status)
                }
                TrhAlertService.ACTION_ALERT -> {
                    val body = intent.getStringExtra(TrhAlertService.EXTRA_TEXT) ?: ""
                    val json = intent.getStringExtra(TrhAlertService.EXTRA_JSON)
                    applyAlert(body, json)
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
        timesRow = findViewById(R.id.timesRow)
        entryValue = findViewById(R.id.entryValue)
        slValue = findViewById(R.id.slValue)
        tpValue = findViewById(R.id.tpValue)
        entryTimeValue = findViewById(R.id.entryTimeValue)
        expiryTimeValue = findViewById(R.id.expiryTimeValue)

        findViewById<Button>(R.id.testSoundBtn).setOnClickListener {
            Notify.playTestSound(this)
        }

        requestNotificationPermission()
        ContextCompat.startForegroundService(this, Intent(this, TrhAlertService::class.java))

        applyStatus(TrhAlertService.lastStatus.ifEmpty { getString(R.string.status_connecting) })
        if (TrhAlertService.lastAlert.isNotEmpty()) {
            applyAlert(TrhAlertService.lastAlert, TrhAlertService.lastAlertJson)
        }

        intent?.getStringExtra("alert_body")?.let {
            applyAlert(it, intent.getStringExtra("alert_json"))
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("alert_body")?.let {
            applyAlert(it, intent.getStringExtra("alert_json"))
        }
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

    private fun applyAlert(body: String, json: String? = null) {
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

        var entry = Regex("""ENTRY\s+([0-9.]+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
        var sl = Regex("""SL\s+([0-9.]+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
        var tp = Regex("""TP\s+([0-9.]+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
        var entryTime = Regex("""ENTRY TIME\s+(.+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)?.trim()
        var expiryTime = Regex("""EXPIRY\s+(.+)""", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)?.trim()

        var entryEpoch = 0L
        var expiryEpoch = 0L
        var expiryBars = 0

        // Prefer structured encrypted payload fields when present
        if (!json.isNullOrBlank()) {
            try {
                val p = JSONObject(json)
                if (p.has("entry")) entry = formatPrice(p.getDouble("entry"))
                if (p.has("sl")) sl = formatPrice(p.getDouble("sl"))
                if (p.has("tp")) tp = formatPrice(p.getDouble("tp"))
                if (p.has("entryTime")) entryEpoch = p.getLong("entryTime")
                if (p.has("expiryTime")) expiryEpoch = p.getLong("expiryTime")
                expiryBars = p.optInt("expiryBars", 0)
                val et = p.optString("entryTimeIso").ifBlank {
                    if (entryEpoch > 0) fmtUtc(entryEpoch) else ""
                }
                val xt = p.optString("expiryTimeIso").ifBlank {
                    if (expiryEpoch > 0) fmtUtc(expiryEpoch) else ""
                }
                if (et.isNotBlank()) entryTime = et
                if (xt.isNotBlank()) expiryTime = xt
                val side = p.optString("side")
                if (side.equals("LONG", true) || side.equals("SHORT", true)) {
                    sideBadge.text = side.uppercase(Locale.US)
                    if (side.equals("LONG", true)) {
                        sideBadge.setTextColor(ContextCompat.getColor(this, R.color.long_green))
                        sideBadge.setBackgroundResource(R.drawable.bg_badge_long)
                    } else {
                        sideBadge.setTextColor(ContextCompat.getColor(this, R.color.short_red))
                        sideBadge.setBackgroundResource(R.drawable.bg_badge_short)
                    }
                }
            } catch (_: Exception) {
            }
        }

        if (entryEpoch <= 0) entryEpoch = parseUtcEpoch(entryTime)
        if (expiryEpoch <= 0) expiryEpoch = parseUtcEpoch(expiryTime)

        if (entry != null || sl != null || tp != null) {
            levelsRow.visibility = View.VISIBLE
            entryValue.text = entry ?: "—"
            slValue.text = sl ?: "—"
            tpValue.text = tp ?: "—"
        }

        if (!entryTime.isNullOrBlank() || !expiryTime.isNullOrBlank() || entryEpoch > 0 || expiryEpoch > 0) {
            timesRow.visibility = View.VISIBLE
            entryTimeValue.text = formatExactTime(entryEpoch, entryTime)
            val expiryLabel = formatExactTime(expiryEpoch, expiryTime)
            expiryTimeValue.text = if (expiryBars > 0) "$expiryLabel  ·  ${expiryBars}m window" else expiryLabel
        }
    }

    private fun formatPrice(v: Double): String = String.format(Locale.US, "%.2f", v)

    /** Exact clock: UTC + device local so you can compare to chart / phone time. */
    private fun formatExactTime(epochSec: Long, fallbackIso: String?): String {
        if (epochSec > 0) {
            return "${fmtUtc(epochSec)}\n${fmtLocal(epochSec)}"
        }
        return fallbackIso?.ifBlank { "—" } ?: "—"
    }

    private fun fmtUtc(epochSec: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss 'UTC'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(epochSec * 1000L))
    }

    private fun fmtLocal(epochSec: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss z", Locale.getDefault())
        sdf.timeZone = TimeZone.getDefault()
        return sdf.format(Date(epochSec * 1000L))
    }

    /** Parse "yyyy-MM-dd HH:mm:ss UTC" from alert text when JSON epoch is missing. */
    private fun parseUtcEpoch(text: String?): Long {
        if (text.isNullOrBlank()) return 0L
        val cleaned = text.replace(Regex("""\s*\(\d+m window\).*""", RegexOption.IGNORE_CASE), "").trim()
        return try {
            val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss 'UTC'", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            (sdf.parse(cleaned)?.time ?: 0L) / 1000L
        } catch (_: Exception) {
            0L
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
