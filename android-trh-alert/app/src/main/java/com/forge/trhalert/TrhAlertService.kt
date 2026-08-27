package com.forge.trhalert

import android.app.Service
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Listens to the encrypted ntfy WebSocket feed.
 * VPS publishes AES-256-GCM envelopes; this service decrypts and notifies.
 */
class TrhAlertService : Service() {
    companion object {
        const val ACTION_STATUS = "com.forge.trhalert.STATUS"
        const val ACTION_ALERT = "com.forge.trhalert.ALERT"
        const val EXTRA_TEXT = "text"
        const val EXTRA_JSON = "json"
        var lastStatus: String = ""
        var lastAlert: String = ""
        var lastAlertJson: String = ""
    }

    private val handler = Handler(Looper.getMainLooper())
    private var ws: WebSocket? = null
    private var reconnectAttempt = 0
    private val seenIds = LinkedHashSet<String>()
    private var lastFingerprint = ""
    private var lastFingerprintAt = 0L

    private val client = OkHttpClient.Builder()
        .pingInterval(45, TimeUnit.SECONDS)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Notify.ensureChannels(this)
        startForeground(Notify.SERVICE_ID, Notify.serviceNotification(this, getString(R.string.status_connecting)))
        connect()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (ws == null) connect()
        return START_STICKY
    }

    override fun onDestroy() {
        ws?.close(1000, "shutdown")
        ws = null
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun connect() {
        ws?.close(1000, "reconnect")
        broadcastStatus(getString(R.string.status_connecting))

        val req = Request.Builder().url(Config.WS_URL).build()
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                reconnectAttempt = 0
                broadcastStatus(getString(R.string.status_connected))
                updateForeground(getString(R.string.status_connected))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleNtfyMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                broadcastStatus(getString(R.string.status_disconnected))
                scheduleReconnect()
            }
        })
    }

    private fun handleNtfyMessage(text: String) {
        try {
            val outer = JSONObject(text)
            val event = outer.optString("event")
            if (event != "message") return

            val id = outer.optString("id")
            if (id.isNotEmpty()) {
                if (seenIds.contains(id)) return
                seenIds.add(id)
                while (seenIds.size > 100) seenIds.remove(seenIds.first())
            }

            val body = outer.optString("message")
            if (body.isEmpty()) return

            // Encrypted envelope from VPS
            if (body.trimStart().startsWith("{") && body.contains("\"iv\"") && body.contains("\"tag\"")) {
                val envelope = JSONObject(body)
                if (envelope.optString("type") == "alert") {
                    val payload = Crypto.decryptEnvelope(envelope)
                    if (!isTrustedVpsAlert(payload, payload.optString("message"))) {
                        broadcastStatus("Ignored non-VPS alert")
                        return
                    }
                    onAlert(payload)
                    return
                }
            }

            // Plaintext backup — only FOREXCOM VPS format with ENTRY TIME (reject Yahoo/GH)
            val title = outer.optString("title", "TRH Setup")
            if (body.contains("TRH") || title.contains("TRH")) {
                val plain = JSONObject().put("title", title).put("message", body)
                if (!isTrustedVpsAlert(plain, body)) {
                    broadcastStatus("Ignored old/Yahoo alert")
                    return
                }
                onAlert(plain)
            }
        } catch (e: Exception) {
            broadcastStatus("Parse error: ${e.message}")
        }
    }

    /**
     * Accept only VPS FOREXCOM alerts (new format with ENTRY TIME).
     * Rejects Yahoo GC=F / GitHub Actions false alarms on the same ntfy topic.
     */
    private fun isTrustedVpsAlert(payload: JSONObject, body: String): Boolean {
        val source = payload.optString("source")
        if (source.equals("mongo-forexcom", ignoreCase = true)) return true
        if (payload.has("entryTime") || payload.optString("entryTimeIso").isNotBlank()) {
            val msg = body.ifBlank { payload.optString("message") }
            if (msg.contains("FOREXCOM", ignoreCase = true)) return true
            if (msg.contains("ENTRY TIME", ignoreCase = true)) return true
        }
        val msg = body.ifBlank { payload.optString("message") }
        val hasForex = msg.contains("FOREXCOM", ignoreCase = true)
        val hasTimes = msg.contains("ENTRY TIME", ignoreCase = true) &&
            msg.contains("EXPIRY", ignoreCase = true)
        return hasForex && hasTimes
    }

    private fun fingerprint(payload: JSONObject, message: String): String {
        val side = payload.optString("side").ifBlank {
            when {
                message.contains("LONG", true) -> "LONG"
                message.contains("SHORT", true) -> "SHORT"
                else -> "X"
            }
        }
        val entry = if (payload.has("entry")) payload.getDouble("entry").toString()
        else Regex("""ENTRY\s+([0-9.]+)""", RegexOption.IGNORE_CASE).find(message)?.groupValues?.get(1) ?: ""
        val et = payload.optString("entryTimeIso").ifBlank {
            if (payload.has("entryTime")) payload.getLong("entryTime").toString()
            else Regex("""ENTRY TIME\s+(.+)""", RegexOption.IGNORE_CASE).find(message)?.groupValues?.get(1)?.trim() ?: ""
        }
        return "$side|$entry|$et"
    }

    private fun onAlert(payload: JSONObject) {
        val title = payload.optString("title", "TRH Setup")
        var message = payload.optString("message", "")
        if (message.isBlank()) {
            // Build from structured fields if message missing
            val side = payload.optString("side", "SETUP")
            val entry = payload.optDouble("entry", Double.NaN)
            val sl = payload.optDouble("sl", Double.NaN)
            val tp = payload.optDouble("tp", Double.NaN)
            val entryIso = payload.optString("entryTimeIso")
            val expiryIso = payload.optString("expiryTimeIso")
            message = buildString {
                append("TRH $side\n")
                if (!entry.isNaN()) append("ENTRY ${"%.2f".format(entry)}\n")
                if (!sl.isNaN()) append("SL ${"%.2f".format(sl)}\n")
                if (!tp.isNaN()) append("TP ${"%.2f".format(tp)}\n")
                if (entryIso.isNotBlank()) append("ENTRY TIME $entryIso\n")
                if (expiryIso.isNotBlank()) append("EXPIRY $expiryIso")
            }.trim()
        }
        // Ensure times appear in notification even on older plaintext path
        if (!message.contains("ENTRY TIME", ignoreCase = true)) {
            val entryIso = payload.optString("entryTimeIso")
            val expiryIso = payload.optString("expiryTimeIso")
            if (entryIso.isNotBlank()) message += "\nENTRY TIME $entryIso"
            if (expiryIso.isNotBlank()) message += "\nEXPIRY $expiryIso"
        }

        val fp = fingerprint(payload, message)
        val now = System.currentTimeMillis()
        if (fp == lastFingerprint && now - lastFingerprintAt < 120_000L) {
            // Encrypted + plaintext duplicate (or double push) — keep first only
            return
        }
        lastFingerprint = fp
        lastFingerprintAt = now

        lastAlert = message
        lastAlertJson = payload.toString()
        Notify.showTradeAlert(this, title, message, lastAlertJson)
        sendBroadcast(
            Intent(ACTION_ALERT)
                .putExtra(EXTRA_TEXT, message)
                .putExtra(EXTRA_JSON, lastAlertJson)
                .setPackage(packageName),
        )
        updateForeground(getString(R.string.status_connected))
    }

    private fun broadcastStatus(status: String) {
        lastStatus = status
        sendBroadcast(Intent(ACTION_STATUS).putExtra(EXTRA_TEXT, status).setPackage(packageName))
    }

    private fun updateForeground(status: String) {
        val mgr = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        mgr.notify(Notify.SERVICE_ID, Notify.serviceNotification(this, status))
    }

    private fun scheduleReconnect(delayMs: Long = nextBackoff()) {
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ connect() }, delayMs)
    }

    private fun nextBackoff(): Long {
        reconnectAttempt++
        val sec = minOf(5L * reconnectAttempt, 60L)
        return sec * 1000
    }
}
