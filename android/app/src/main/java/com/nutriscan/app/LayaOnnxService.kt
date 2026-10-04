package com.nutriscan.app

import android.app.Service
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Message
import android.os.Messenger
import java.io.File

/**
 * Service exécuté dans un processus séparé (`android:process=":laya"`).
 * Reçoit { modelPath, imagePath, maxResults, angle?, distance? } et répond
 * { json } ou { error }. Si ONNX Runtime plante (code natif, mémoire),
 * seul ce processus meurt : l'app reste ouverte et bascule sur le repli.
 */
class LayaOnnxService : Service() {
    companion object { const val MSG_CLASSIFY = 1 }

    private lateinit var thread: HandlerThread
    private lateinit var messenger: Messenger

    override fun onCreate() {
        super.onCreate()
        thread = HandlerThread("laya-onnx").also { it.start() }
        messenger = Messenger(object : Handler(thread.looper) {
            override fun handleMessage(msg: Message) {
                if (msg.what != MSG_CLASSIFY) return
                val replyTo = msg.replyTo ?: return
                val data = msg.data
                val out = Bundle()
                try {
                    val imageFile = File(data.getString("imagePath") ?: throw IllegalArgumentException("image manquante"))
                    val bytes = imageFile.readBytes()
                    imageFile.delete()
                    val res = LayaOnnxEngine.classify(
                        File(data.getString("modelPath") ?: throw IllegalArgumentException("modèle manquant")),
                        bytes,
                        data.getInt("maxResults", 5),
                        if (data.containsKey("angle")) data.getDouble("angle") else null,
                        if (data.containsKey("distance")) data.getDouble("distance") else null,
                    )
                    out.putString("json", res.toString())
                } catch (t: Throwable) {
                    out.putString("error", t.message ?: t.javaClass.simpleName)
                }
                try {
                    replyTo.send(Message.obtain(null, MSG_CLASSIFY).apply { this.data = out })
                } catch (_: Throwable) {}
            }
        })
    }

    override fun onBind(intent: Intent?): IBinder = messenger.binder

    override fun onDestroy() {
        thread.quitSafely()
        super.onDestroy()
    }
}
