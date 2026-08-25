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

class TrhAlertService : Service() {
    companion object {
        const val ACTION_STATUS = "com.forge.trhalert.STATUS"
        const val ACTION_ALERT = "com.forge.trhalert.ALERT"
        const val EXTRA_TEXT = "text"
        var lastStatus: String = ""
        var lastAlert: String = ""
    }

    private val handler = Handler(Looper.getMainLooper())
    private var ws: WebSocket? = null
    private var reconnectAttempt = 0

    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
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
                webSocket.send(JSONObject().put("type", "auth").put("token", Config.APP_TOKEN).toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
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

    private fun handleMessage(text: String) {
        try {
            val json = JSONObject(text)
            when (json.optString("type")) {
                "hello" -> Unit
                "auth_ok" -> {
                    broadcastStatus(getString(R.string.status_connected))
                    updateForeground(getString(R.string.status_connected))
                }
                "auth_fail" -> {
                    broadcastStatus("Auth failed — check app build")
                    scheduleReconnect(30_000)
                }
                "alert" -> {
                    val payload = Crypto.decryptEnvelope(json)
                    onAlert(payload)
                }
            }
        } catch (e: Exception) {
            broadcastStatus("Decrypt error: ${e.message}")
        }
    }

    private fun onAlert(payload: JSONObject) {
        val title = payload.optString("title", "TRH Setup")
        val message = payload.optString("message", payload.toString())
        lastAlert = message
        Notify.showTradeAlert(this, title, message)
        sendBroadcast(Intent(ACTION_ALERT).putExtra(EXTRA_TEXT, message).setPackage(packageName))
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
