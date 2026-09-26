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
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.OnnxTensor
import java.io.File
import java.nio.FloatBuffer
import kotlin.math.exp

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

    // Sessions ONNX Runtime (modèle Laya-Vision entraîné sur mesure, INT8).
    private val ortEnv: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }
    private val ortSessions = HashMap<String, OrtSession>()

    private val modelExtensions = listOf(".tflite", ".task", ".onnx")

    // Prétraitement du modèle Laya-Vision : 224×224, normalisation ImageNet.
    private val onnxInputSize = 224
    private val imagenetMean = floatArrayOf(0.485f, 0.456f, 0.406f)
    private val imagenetStd = floatArrayOf(0.229f, 0.224f, 0.225f)

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
            "Aucun modèle de détection trouvé. Importez un classifieur .tflite dans les réglages d'IA."
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
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
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
            val classifier = classifierFor(modelFile, maxResults)

            val bitmap = decodeImage(image)
            val softwareBitmap =
                if (bitmap.config == Bitmap.Config.HARDWARE) bitmap.copy(Bitmap.Config.ARGB_8888, false)
                else bitmap
            val mpImage = BitmapImageBuilder(softwareBitmap).build()
            val result = classifier.classify(mpImage)

            val predictions = JSArray()
            result.classificationResult().classifications().forEach { classification ->
                classification.categories().forEach { category ->
                    val entry = JSObject()
                    val label = category.displayName()?.takeIf { it.isNotBlank() } ?: category.categoryName()
                    entry.put("label", label ?: "inconnu")
                    entry.put("confidence", category.score().toDouble())
                    predictions.put(entry)
                }
            }

            val res = JSObject()
            res.put("predictions", predictions)
            res.put("latencyMs", System.currentTimeMillis() - started)
            res.put("model", modelFile.name)
            call.resolve(res)
        } catch (t: Throwable) {
            call.reject(t.message ?: "Détection impossible.", null as String?)
        }
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
