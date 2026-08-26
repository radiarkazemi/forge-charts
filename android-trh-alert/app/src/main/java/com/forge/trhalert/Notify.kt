package com.forge.trhalert

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object Notify {
    const val SERVICE_CHANNEL = "trh_service_v2"
    /** New channel id so sound/importance updates apply on upgrade. */
    const val ALERT_CHANNEL = "trh_hunt_alarms_v3"
    const val SERVICE_ID = 1001

    private val ALARM_VIBRATE = longArrayOf(0, 450, 180, 450, 180, 700)

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = ctx.getSystemService(NotificationManager::class.java)

        mgr.createNotificationChannel(
            NotificationChannel(
                SERVICE_CHANNEL,
                ctx.getString(R.string.service_channel),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                setShowBadge(false)
                setSound(null, null)
            },
        )

        val soundUri = Uri.parse("android.resource://${ctx.packageName}/${R.raw.trh_alert}")
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        mgr.createNotificationChannel(
            NotificationChannel(
                ALERT_CHANNEL,
                ctx.getString(R.string.alert_channel),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Loud TRH hunt alarms with custom sound"
                enableVibration(true)
                vibrationPattern = ALARM_VIBRATE
                enableLights(true)
                lightColor = Color.YELLOW
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setSound(soundUri, attrs)
            },
        )
    }

    fun alertSoundUri(ctx: Context): Uri =
        Uri.parse("android.resource://${ctx.packageName}/${R.raw.trh_alert}")

    fun serviceNotification(ctx: Context, status: String): Notification {
        ensureChannels(ctx)
        val open = PendingIntent.getActivity(
            ctx,
            0,
            Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(ctx, SERVICE_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("TRH Alert · Armed")
            .setContentText(status)
            .setOngoing(true)
            .setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .build()
    }

    fun showTradeAlert(ctx: Context, title: String, body: String) {
        ensureChannels(ctx)
        wakeScreen(ctx)

        val openIntent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("from_alert", true)
            putExtra("alert_body", body)
            putExtra("alert_title", title)
        }
        val open = PendingIntent.getActivity(
            ctx,
            1,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val fullScreen = PendingIntent.getActivity(
            ctx,
            2,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val sound = alertSoundUri(ctx)
        val notif = NotificationCompat.Builder(ctx, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body.lines().firstOrNull() ?: body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setFullScreenIntent(fullScreen, true)
            .setSound(sound)
            .setVibrate(ALARM_VIBRATE)
            .setLights(Color.YELLOW, 600, 400)
            .setDefaults(0)
            .setOnlyAlertOnce(false)
            .setTimeoutAfter(120_000)
            .build()

        NotificationManagerCompat.from(ctx)
            .notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notif)

        // Also kick the default alarm stream as a backup on some OEMs
        try {
            val fallback = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_ALARM)
            if (fallback != null) {
                // Channel sound is primary; no second play needed.
            }
        } catch (_: Exception) {
        }
    }

    fun playTestSound(ctx: Context) {
        showTradeAlert(
            ctx,
            "TRH Test Alarm",
            "XAUUSD 1m | TRH TEST\nIf you hear this, hunt alarms work.\nENTRY 0.00\nSL 0.00\nTP 0.00",
        )
    }

    private fun wakeScreen(ctx: Context) {
        try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val wl = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "trhalert:hunt",
            )
            wl.acquire(4_000L)
        } catch (_: Exception) {
        }
    }
}
