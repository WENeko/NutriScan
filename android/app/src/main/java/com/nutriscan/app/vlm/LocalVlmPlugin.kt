package com.nutriscan.app.vlm

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.Uri
import android.os.Bundle
import android.os.HandlerThread
import android.os.IBinder
import android.os.Message
import android.os.Messenger
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Plugin « LocalVlm » : gestion des fichiers GGUF (modèle + projecteur mmproj)
 * et proxy vers LocalVlmService (processus :vlm). Aucune inférence ici.
 */
@CapacitorPlugin(name = "LocalVlm")
class LocalVlmPlugin : Plugin() {

    private fun dir(): File = File(context.filesDir, "vlm").apply { mkdirs() }

    private fun ggufFiles(): List<File> =
        dir().listFiles()?.filter { it.isFile && it.name.lowercase().endsWith(".gguf") } ?: emptyList()

    private fun isMmproj(f: File) = f.name.lowercase().let { it.contains("mmproj") || it.contains("f16") && !it.contains("q4") }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val files = ggufFiles()
        call.resolve(JSObject().put("available", files.any { isMmproj(it) } && files.any { !isMmproj(it) }))
    }

    @PluginMethod
    fun listModels(call: PluginCall) {
        val arr = JSArray()
        ggufFiles().forEach { f ->
            arr.put(JSObject().put("name", f.name).put("size", f.length()).put("kind", if (isMmproj(f)) "mmproj" else "model"))
        }
        call.resolve(JSObject().put("models", arr))
    }

    @PluginMethod
    fun deleteModel(call: PluginCall) {
        val name = call.getString("model")
        if (name.isNullOrBlank() || name.contains("/") || name.contains("..")) { call.reject("Nom invalide."); return }
        call.resolve(JSObject().put("deleted", File(dir(), name).let { it.isFile && it.delete() }))
    }

    @PluginMethod
    fun importModel(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*" }
        startActivityForResult(call, intent, "onPicked")
    }

    @ActivityCallback
    private fun onPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri: Uri = result.data?.data.takeIf { result.resultCode == Activity.RESULT_OK } ?: run { call.reject("Import annulé."); return }
        // Copie de 0,5 à 2 Go : hors du thread principal.
        Thread {
            try {
                var name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                    ?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "model.gguf"
                if (!name.lowercase().endsWith(".gguf")) throw IllegalArgumentException("Fichier .gguf attendu.")
                val kind = call.getString("kind")
                if (kind == "mmproj" && !name.lowercase().contains("mmproj")) name = "mmproj-$name"
                val dest = File(dir(), name)
                val tmp = File(dir(), "$name.part")
                context.contentResolver.openInputStream(uri)?.use { input -> tmp.outputStream().use { input.copyTo(it, 1 shl 20) } }
                    ?: throw IllegalStateException("Fichier illisible.")
                if (!tmp.renameTo(dest)) throw IllegalStateException("Écriture impossible.")
                call.resolve(JSObject().put("model", dest.name).put("size", dest.length()).put("kind", if (isMmproj(dest)) "mmproj" else "model"))
            } catch (t: Throwable) {
                call.reject(t.message ?: "Import impossible.")
            }
        }.start()
    }

    @PluginMethod
    fun analyze(call: PluginCall) {
        val image = call.getString("image") ?: run { call.reject("Aucune image."); return }
        val files = ggufFiles()
        val model = call.getString("model")?.let { n -> files.firstOrNull { it.name == n } } ?: files.firstOrNull { !isMmproj(it) }
        val mmproj = call.getString("mmproj")?.let { n -> files.firstOrNull { it.name == n } } ?: files.firstOrNull { isMmproj(it) }
        if (model == null || mmproj == null) { call.reject("Importez le modèle GGUF ET son projecteur mmproj."); return }

        Thread {
            val img = File(context.cacheDir, "vlm_in_${System.nanoTime()}.jpg")
            val latch = CountDownLatch(1)
            var reply: Bundle? = null
            var error: String? = null
            val replyThread = HandlerThread("vlm-reply").also { it.start() }
            val replyMessenger = Messenger(object : android.os.Handler(replyThread.looper) {
                override fun handleMessage(msg: Message) { reply = msg.data; latch.countDown() }
            })
            val dead = "Le moteur VLM s'est arrêté (mémoire insuffisante ou modèle incompatible)."
            val conn = object : ServiceConnection {
                override fun onServiceConnected(n: ComponentName?, binder: IBinder?) {
                    try {
                        binder?.linkToDeath({ if (reply == null) error = dead; latch.countDown() }, 0)
                        Messenger(binder).send(Message.obtain(null, LocalVlmService.MSG_ANALYZE).apply {
                            replyTo = replyMessenger
                            data = Bundle().apply {
                                putString("modelPath", model.absolutePath)
                                putString("mmprojPath", mmproj.absolutePath)
                                putString("imagePath", img.absolutePath)
                                putString("system", call.getString("system") ?: "")
                                putString("prompt", call.getString("prompt") ?: "")
                                putInt("maxTokens", call.getInt("maxTokens") ?: 384)
                            }
                        })
                    } catch (t: Throwable) { error = t.message ?: "Moteur VLM injoignable."; latch.countDown() }
                }
                override fun onServiceDisconnected(n: ComponentName?) { if (reply == null) error = dead; latch.countDown() }
            }
            try {
                img.writeBytes(Base64.decode(image.substringAfter("base64,", image), Base64.DEFAULT))
                if (!context.bindService(Intent(context, LocalVlmService::class.java), conn, Context.BIND_AUTO_CREATE))
                    throw IllegalStateException("Moteur VLM indisponible.")
                // Premier appel : chargement de ~2 Go → délai large.
                if (!latch.await(180, TimeUnit.SECONDS)) throw IllegalStateException("Analyse VLM trop longue.")
                val r = reply
                if (r == null || r.getString("error") != null) throw IllegalStateException(r?.getString("error") ?: error ?: dead)
                call.resolve(JSObject()
                    .put("text", r.getString("text") ?: "")
                    .put("latencyMs", r.getLong("latencyMs"))
                    .put("loadMs", r.getLong("loadMs"))
                    .put("model", model.name))
            } catch (t: Throwable) {
                call.reject(t.message ?: "Analyse VLM impossible.")
            } finally {
                try { context.unbindService(conn) } catch (_: Throwable) {}
                replyThread.quitSafely()
                img.delete()
            }
        }.start()
    }
}
