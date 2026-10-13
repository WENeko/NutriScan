package com.nutriscan.app.vlm

import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Message
import android.os.Messenger
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Inférence VLM isolée dans le processus « :vlm ».
 * Les modèles restent en mémoire 5 min après la dernière analyse, puis sont libérés.
 */
class LocalVlmService : Service() {
    companion object {
        const val MSG_ANALYZE = 1
        private const val IDLE_UNLOAD_MS = 5 * 60 * 1000L
        private const val MAX_SIDE = 896
    }

    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private lateinit var messenger: Messenger
    private var loadedKey: String? = null
    private val unloadTask = Runnable {
        try { NutriVlmNative.unload() } catch (_: Throwable) {}
        loadedKey = null
        stopSelf()
    }

    override fun onCreate() {
        super.onCreate()
        thread = HandlerThread("nutri-vlm").also { it.start() }
        handler = object : Handler(thread.looper) {
            override fun handleMessage(msg: Message) {
                if (msg.what != MSG_ANALYZE) return
                val replyTo = msg.replyTo ?: return
                removeCallbacks(unloadTask)
                val out = Bundle()
                val started = System.currentTimeMillis()
                try {
                    val d = msg.data
                    val model = d.getString("modelPath") ?: throw IllegalArgumentException("modèle manquant")
                    val mmproj = d.getString("mmprojPath") ?: throw IllegalArgumentException("projecteur manquant")
                    val imageFile = File(d.getString("imagePath") ?: throw IllegalArgumentException("image manquante"))
                    val raw = imageFile.readBytes()
                    imageFile.delete()

                    val key = "$model|$mmproj"
                    var loadMs = 0L
                    if (loadedKey != key) {
                        val t0 = System.currentTimeMillis()
                        val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 6)
                        if (!NutriVlmNative.loadModels(model, mmproj, threads, 4096)) {
                            loadedKey = null
                            throw IllegalStateException(NutriVlmNative.lastError().ifBlank { "Chargement impossible" })
                        }
                        loadedKey = key
                        loadMs = System.currentTimeMillis() - t0
                    }
                    val text = NutriVlmNative.analyze(
                        downscale(raw),
                        d.getString("system") ?: "",
                        d.getString("prompt") ?: "",
                        d.getInt("maxTokens", 384),
                    ) ?: throw IllegalStateException(NutriVlmNative.lastError().ifBlank { "Analyse impossible" })
                    out.putString("text", text)
                    out.putLong("loadMs", loadMs)
                    out.putLong("latencyMs", System.currentTimeMillis() - started)
                } catch (t: Throwable) {
                    out.putString("error", t.message ?: t.javaClass.simpleName)
                }
                try { replyTo.send(Message.obtain(null, MSG_ANALYZE).apply { data = out }) } catch (_: Throwable) {}
                postDelayed(unloadTask, IDLE_UNLOAD_MS)
            }
        }
        messenger = Messenger(handler)
    }

    /** Réduit la photo (≤ 896 px) avant l'encodeur visuel : moins de RAM, même précision utile. */
    private fun downscale(bytes: ByteArray): ByteArray {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (maxOf(bounds.outWidth, bounds.outHeight) <= MAX_SIDE) return bytes
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: return bytes
        val scale = MAX_SIDE.toFloat() / maxOf(bmp.width, bmp.height)
        val scaled = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
        return ByteArrayOutputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 90, it); it.toByteArray() }
    }

    override fun onBind(intent: Intent?): IBinder = messenger.binder

    override fun onDestroy() {
        try { NutriVlmNative.unload() } catch (_: Throwable) {}
        thread.quitSafely()
        super.onDestroy()
    }
}
