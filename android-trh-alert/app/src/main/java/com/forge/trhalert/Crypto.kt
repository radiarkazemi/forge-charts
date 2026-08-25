package com.forge.trhalert

import android.util.Base64
import org.json.JSONObject
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object Crypto {
    private const val TAG_BITS = 128

    fun decryptEnvelope(json: JSONObject): JSONObject {
        val iv = Base64.decode(json.getString("iv"), Base64.DEFAULT)
        val data = Base64.decode(json.getString("data"), Base64.DEFAULT)
        val tag = Base64.decode(json.getString("tag"), Base64.DEFAULT)
        val key = hexToBytes(Config.SECRET_KEY_HEX)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(key, "AES"),
            GCMParameterSpec(TAG_BITS, iv),
        )

        val combined = data + tag
        val plain = cipher.doFinal(combined)
        return JSONObject(String(plain, Charsets.UTF_8))
    }

    private fun hexToBytes(hex: String): ByteArray {
        val len = hex.length
        val out = ByteArray(len / 2)
        for (i in 0 until len step 2) {
            out[i / 2] = hex.substring(i, i + 2).toInt(16).toByte()
        }
        return out
    }
}
