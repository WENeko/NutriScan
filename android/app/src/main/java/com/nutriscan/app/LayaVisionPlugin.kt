package com.nutriscan.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
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
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.imageclassifier.ImageClassifier
import java.io.File

/**
 * Plugin Capacitor « LayaVision » — étage 1 du pipeline hybride.
 *
 * Exécute un modèle de DÉCISION non-autorégressif (classifieur d'images
 * `.tflite`, MediaPipe Tasks Vision / LiteRT) directement sur l'appareil.
 * Contrairement à un LLM multimodal qui génère du texte token par token,
 * ce moteur effectue une seule passe et renvoie des labels typés avec leur
 * score de confiance — typiquement 30 à 60 ms.
 *
 * Méthodes exposées côté JS (src/services/hybrid/layaVision.ts) :
 *   isAvailable(): { available }
 *   listModels(): { models }
 *   importModel(): { model, path, size }
 *   classify({ image, model?, maxResults? }): { predictions, latencyMs, model }
 *
 * Comme pour les modèles de langage locaux, le stockage cloisonné d'Android
 * empêche le code natif d'ouvrir un fichier laissé dans Download/ : tout
 * modèle externe est d'abord copié vers le stockage privé (`filesDir/laya`).
 */
@CapacitorPlugin(name = "LayaVision")
class LayaVisionPlugin : Plugin() {

    // Le chargement d'un modèle est coûteux : une instance par chemin est conservée.
    private val classifiers = HashMap<String, ImageClassifier>()


    private val modelExtensions = listOf(".tflite", ".task", ".onnx")


    private fun modelsDir(): File = File(context.filesDir, "laya").apply { mkdirs() }

    // ── Disponibilité ────────────────────────────────────────────────────────

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val res = JSObject()
        res.put("available", findAllModels().isNotEmpty())
        call.resolve(res)
    }

    // ── Recherche des modèles ────────────────────────────────────────────────

    private fun hasModelExtension(name: String): Boolean =
        modelExtensions.any { name.lowercase().endsWith(it) }

    /** Modèles déjà copiés dans le stockage privé de l'application. */
    private fun privateModels(): List<File> =
        modelsDir().listFiles()?.filter { it.isFile && hasModelExtension(it.name) } ?: emptyList()

    /** Modèles visibles dans le dossier Téléchargements via MediaStore. */
    private fun downloadModels(): List<Pair<String, Uri>> {
        val out = ArrayList<Pair<String, Uri>>()
        try {
            val collection =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStore.Downloads.EXTERNAL_CONTENT_URI
                else MediaStore.Files.getContentUri("external")
            val projection = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME)
            context.contentResolver.query(collection, projection, null, null, null)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                while (cursor.moveToNext()) {
                    val name = cursor.getString(nameCol) ?: continue
                    if (!hasModelExtension(name)) continue
                    val uri = Uri.withAppendedPath(collection, cursor.getLong(idCol).toString())
                    out.add(name to uri)
                }
            }
        } catch (t: Throwable) {
            // MediaStore indisponible : on se contente du stockage privé.
        }
        // Repli : accès direct au dossier public (fonctionne sur certains appareils).
        try {
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            dir?.listFiles()?.forEach { f ->
                if (f.isFile && hasModelExtension(f.name) && out.none { it.first == f.name }) {
                    out.add(f.name to Uri.fromFile(f))
                }
            }
        } catch (t: Throwable) {
            // Ignoré.
        }
        return out
    }

    private fun findAllModels(): List<String> {
        val names = LinkedHashSet<String>()
        privateModels().forEach { names.add(it.name) }
        downloadModels().forEach { names.add(it.first) }
        return names.toList()
    }

    @PluginMethod
    fun listModels(call: PluginCall) {
        val res = JSObject()
        res.put("models", JSArray(findAllModels()))
        call.resolve(res)
    }

    /** Supprime un modèle importé du stockage privé (le fichier de Téléchargements n'est pas touché). */
    @PluginMethod
    fun deleteModel(call: PluginCall) {
        val name = call.getString("model")
        if (name.isNullOrBlank() || name.contains("/") || name.contains("..")) {
            call.reject("Nom de modèle invalide.", null as String?)
            return
        }
        val file = File(modelsDir(), name)
        // Libère les sessions/classifieurs ouverts sur ce fichier.
        classifiers.keys.filter { it.startsWith(file.absolutePath + "#") }.forEach { k ->
            classifiers.remove(k)?.let { try { it.close() } catch (_: Throwable) {} }
        }
        val deleted = file.isFile && file.delete()
        val res = JSObject()
        res.put("deleted", deleted)
        res.put("stillInDownloads", downloadModels().any { it.first == name })
        call.resolve(res)
    }

    // ── Import via le sélecteur de fichiers ──────────────────────────────────

    @PluginMethod
    fun importModel(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        startActivityForResult(call, intent, "onModelPicked")
    }

    @ActivityCallback
    private fun onModelPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) {
            call.reject("Import annulé.", null as String?)
            return
        }
        val uri = result.data?.data
        if (uri == null) {
            call.reject("Aucun fichier sélectionné.", null as String?)
            return
        }
        try {
            val name = queryDisplayName(uri) ?: "laya-model.tflite"
            val dest = File(modelsDir(), name)
            copyUriTo(uri, dest)
            val res = JSObject()
            res.put("model", dest.name)
            res.put("path", dest.absolutePath)
            res.put("size", dest.length())
            call.resolve(res)
        } catch (t: Throwable) {
            call.reject(t.message ?: "Import impossible.", null as String?)
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        return try {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            }
        } catch (t: Throwable) {
            null
        }
    }

    private fun copyUriTo(uri: Uri, dest: File) {
        context.contentResolver.openInputStream(uri)?.use { input ->
            dest.outputStream().use { output -> input.copyTo(output) }
        } ?: throw IllegalStateException("Fichier illisible.")
    }

    // ── Résolution du modèle demandé ─────────────────────────────────────────

    private fun resolveModelFile(requested: String?): File {
        val privates = privateModels()

        // 1) Chemin absolu déjà valide.
        if (!requested.isNullOrBlank() && requested.startsWith("/")) {
            val f = File(requested)
            if (f.isFile) return ensurePrivate(f)
        }

        // 2) Nom exact (avec ou sans extension) dans le stockage privé.
        if (!requested.isNullOrBlank()) {
            privates.firstOrNull { it.name == requested }?.let { return it }
            privates.firstOrNull { it.nameWithoutExtension == requested }?.let { return it }
        }

        // 3) Nom exact dans Téléchargements → copie vers le stockage privé.
        if (!requested.isNullOrBlank()) {
            downloadModels().firstOrNull {
                it.first == requested || it.first.substringBeforeLast('.') == requested
            }?.let { (name, uri) ->
                val dest = File(modelsDir(), name)
                if (!dest.isFile || dest.length() == 0L) copyUriTo(uri, dest)
                return dest
            }
        }

        // 4) Aucun nom demandé : premier modèle trouvé.
        privates.firstOrNull()?.let { return it }
        downloadModels().firstOrNull()?.let { (name, uri) ->
            val dest = File(modelsDir(), name)
            if (!dest.isFile || dest.length() == 0L) copyUriTo(uri, dest)
            return dest
        }

        throw IllegalStateException(
            "Aucun modèle de détection trouvé. Importez un modèle .onnx ou .tflite dans les réglages d'IA."
        )
    }

    /** MediaPipe ouvre le modèle en natif : il doit vivre dans le stockage privé. */
    private fun ensurePrivate(file: File): File {
        if (file.absolutePath.startsWith(context.filesDir.absolutePath)) return file
        val dest = File(modelsDir(), file.name)
        if (!dest.isFile || dest.length() != file.length()) {
            file.inputStream().use { input -> dest.outputStream().use { output -> input.copyTo(output) } }
        }
        return dest
    }

    private fun classifierFor(file: File, maxResults: Int): ImageClassifier {
        val cacheKey = "${file.absolutePath}#$maxResults"
        classifiers[cacheKey]?.let { return it }
        val options = ImageClassifier.ImageClassifierOptions.builder()
            .setBaseOptions(BaseOptions.builder().setModelAssetPath(file.absolutePath).build())
            .setRunningMode(RunningMode.IMAGE)
            .setMaxResults(maxResults)
            .build()
        val classifier = ImageClassifier.createFromOptions(context, options)
        classifiers[cacheKey] = classifier
        return classifier
    }

    // ── Classification ───────────────────────────────────────────────────────

    private fun decodeImage(image: String): Bitmap {
        val base64 = image.substringAfter("base64,", image)
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        // Décodage sous-échantillonné : un JPEG 12 MP plein format (~48 Mo) peut tuer l'app.
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1036) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
            ?: throw IllegalArgumentException("Image illisible.")
    }

    @PluginMethod
    fun classify(call: PluginCall) {
        val image = call.getString("image")
        if (image.isNullOrBlank()) {
            call.reject("Aucune image fournie.", null as String?)
            return
        }
        val maxResults = call.getInt("maxResults") ?: 5
        try {
            val started = System.currentTimeMillis()
            val modelFile = resolveModelFile(call.getString("model"))
            val predictions = JSArray()
            var angleUsed = false
            // Angle caméra/table en degrés (90 = dessus), mesuré par les capteurs.
            val angle = call.getDouble("angle")
            if (modelFile.extension.lowercase() == "onnx") {
                val bytes = Base64.decode(image.substringAfter("base64,", image), Base64.DEFAULT)
                angleUsed = classifyOnnxRemote(modelFile, bytes, maxResults, predictions, angle, call.getDouble("distance"))
            } else {
                val bitmap = decodeImage(image)
                val softwareBitmap =
                    if (bitmap.config == Bitmap.Config.HARDWARE) bitmap.copy(Bitmap.Config.ARGB_8888, false)
                    else bitmap
                val classifier = classifierFor(modelFile, maxResults)
                val mpImage = BitmapImageBuilder(softwareBitmap).build()
                val result = classifier.classify(mpImage)
                result.classificationResult().classifications().forEach { classification ->
                    classification.categories().forEach { category ->
                        val entry = JSObject()
                        val label = category.displayName()?.takeIf { it.isNotBlank() } ?: category.categoryName()
                        entry.put("label", label ?: "inconnu")
                        entry.put("confidence", category.score().toDouble())
                        predictions.put(entry)
                    }
                }
            }

            val res = JSObject()
            res.put("predictions", predictions)
            res.put("latencyMs", System.currentTimeMillis() - started)
            res.put("model", modelFile.name)
            res.put("angleUsed", angleUsed)
            call.resolve(res)
        } catch (t: Throwable) {
            call.reject(t.message ?: "Détection impossible.", null as String?)
        }
    }

    // ── Inférence ONNX isolée (processus :laya) ─────────────────────────────

    /**
     * Exécute le modèle ONNX dans LayaOnnxService (processus séparé). Si le
     * processus d'inférence meurt (crash natif / mémoire), on rejette proprement
     * au lieu de fermer toute l'application.
     */
    private fun classifyOnnxRemote(
        modelFile: File, imageBytes: ByteArray, maxResults: Int, predictions: JSArray, angle: Double?, distance: Double?
    ): Boolean {
        val imgFile = File(context.cacheDir, "laya_in_${System.nanoTime()}.jpg").apply { writeBytes(imageBytes) }
        val latch = java.util.concurrent.CountDownLatch(1)
        var json: String? = null
        var error: String? = null
        val replyThread = android.os.HandlerThread("laya-reply").also { it.start() }
        val reply = android.os.Messenger(object : android.os.Handler(replyThread.looper) {
            override fun handleMessage(msg: android.os.Message) {
                json = msg.data.getString("json")
                error = msg.data.getString("error")
                latch.countDown()
            }
        })
        val conn = object : android.content.ServiceConnection {
            override fun onServiceConnected(name: android.content.ComponentName?, binder: android.os.IBinder?) {
                try {
                    binder?.linkToDeath({
                        if (error == null && json == null) error = "Le moteur local s'est arrêté (mémoire insuffisante ou modèle incompatible)."
                        latch.countDown()
                    }, 0)
                    val msg = android.os.Message.obtain(null, LayaOnnxService.MSG_CLASSIFY)
                    msg.replyTo = reply
                    msg.data = android.os.Bundle().apply {
                        putString("modelPath", modelFile.absolutePath)
                        putString("imagePath", imgFile.absolutePath)
                        putInt("maxResults", maxResults)
                        angle?.let { putDouble("angle", it) }
                        distance?.let { putDouble("distance", it) }
                    }
                    android.os.Messenger(binder).send(msg)
                } catch (t: Throwable) {
                    error = t.message ?: "Moteur local injoignable."
                    latch.countDown()
                }
            }
            override fun onServiceDisconnected(name: android.content.ComponentName?) {
                if (error == null && json == null) error = "Le moteur local s'est arrêté (mémoire insuffisante ou modèle incompatible)."
                latch.countDown()
            }
        }
        val intent = Intent(context, LayaOnnxService::class.java)
        try {
            if (!context.bindService(intent, conn, Context.BIND_AUTO_CREATE)) throw IllegalStateException("Moteur local indisponible.")
            if (!latch.await(90, java.util.concurrent.TimeUnit.SECONDS)) throw IllegalStateException("Analyse locale trop longue.")
        } finally {
            try { context.unbindService(conn) } catch (_: Throwable) {}
            replyThread.quitSafely()
            imgFile.delete()
        }
        error?.let { throw IllegalStateException(it) }
        val obj = org.json.JSONObject(json ?: throw IllegalStateException("Réponse vide du moteur local."))
        val arr = obj.optJSONArray("predictions") ?: org.json.JSONArray()
        for (i in 0 until arr.length()) predictions.put(JSObject(arr.getJSONObject(i).toString()))
        return obj.optBoolean("angleUsed", false)
    }

    override fun handleOnDestroy() {
        classifiers.values.forEach {
            try {
                it.close()
            } catch (t: Throwable) {
                // Ignoré.
            }
        }
        classifiers.clear()
        super.handleOnDestroy()
    }
}
