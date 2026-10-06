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
                    val imagePath = data.getString("imagePath") ?: throw IllegalArgumentException("image manquante")
                    val modelPath = data.getString("modelPath") ?: throw IllegalArgumentException("modèle manquant")
                    
                    val imageFile = File(imagePath)
                    val bytes = imageFile.readBytes()
                    imageFile.delete()

                    // Extraction sécurisée des types Float/Double
                    val angle = if (data.containsKey("angle")) {
                        data.getFloat("angle").takeIf { it != 0f }?.toDouble() ?: data.getDouble("angle")
                    } else null

                    val distance = if (data.containsKey("distance")) {
                        data.getFloat("distance").takeIf { it != 0f }?.toDouble() ?: data.getDouble("distance")
                    } else null

                    val res = LayaOnnxEngine.classify(
                        modelFile = File(modelPath),
                        imageBytes = bytes,
                        maxResults = data.getInt("maxResults", 5),
                        angleDeg = angle,
                        distanceM = distance
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
