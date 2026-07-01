package com.nutriscan.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.io.IOException

/**
 * Plugin Capacitor d'IA locale NATIVE (sur l'appareil), sans clé ni réseau.
 *
 * Embarque le moteur d'inférence MediaPipe LLM (LiteRT) — le même que celui
 * utilisé par l'application Google AI Edge Gallery — directement dans l'app.
 * L'inférence tourne 100% hors-ligne à partir d'un fichier modèle `.task`
 * présent sur l'appareil.
 *
 * Côté JS (voir src/services/localAiBridge.ts), le plugin expose :
 *   isAvailable(): Promise<{ available: boolean }>
 *   importModel(): Promise<{ model: string; path: string; size: number }>
 *   generate({ system, prompt, image?, model? }): Promise<{ text: string }>
 *
 * Résolution du modèle (`model`) :
 *   - chemin absolu vers un fichier `.task` → utilisé tel quel,
 *   - sinon un NOM (ex: "gemma-3n") → recherché dans des dossiers connus,
 *     avec ou sans suffixe `.task`.
 *
 * Important Android scoped storage : MediaPipe/LiteRT ouvre le modèle depuis
 * du code natif POSIX. Même si Kotlin voit un fichier dans Download/, le moteur
 * peut échouer avec `open() failed`. On copie donc tout modèle externe vers le
 * stockage privé de l'app (`filesDir/llm`) avant de l'envoyer à MediaPipe.
 */
@CapacitorPlugin(name = "LocalAiGallery")
class LocalAiGalleryPlugin : Plugin() {

    // Cache d'une instance par chemin de modèle (le chargement est coûteux).
    private val engines = HashMap<String, LlmInference>()

    /** Dossiers où chercher un modèle local à partir de son nom. */
    private fun candidateDirs(): List<File> {
        val ctx = context
        val dirs = ArrayList<File>()
        ctx.filesDir?.let { dirs.add(File(it, "llm")); dirs.add(it) }
        ctx.getExternalFilesDir(null)?.let { dirs.add(File(it, "llm")); dirs.add(it) }
        @Suppress("DEPRECATION")
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)?.let { dirs.add(it) }
        dirs.add(File("/data/local/tmp/llm"))
        return dirs
    }

    private fun privateModelDir(): File {
        val dir = File(context.filesDir, "llm")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun isInside(parent: File, child: File): Boolean {
        return try {
            val parentPath = parent.canonicalFile.toPath()
            val childPath = child.canonicalFile.toPath()
            childPath.startsWith(parentPath)
        } catch (_: Exception) {
            false
        }
    }

    private fun sanitizeTaskFileName(name: String): String {
        val clean = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
        return if (clean.endsWith(".task", ignoreCase = true)) clean else "$clean.task"
    }

    private fun modelNameFromFile(file: File): String = file.name.replace(Regex("\\.task$", RegexOption.IGNORE_CASE), "")

    private fun displayName(uri: Uri): String? {
        return runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }.getOrNull()
    }

    private fun copyUriToPrivateModel(uri: Uri, preferredName: String?): File {
        val safeName = sanitizeTaskFileName(preferredName ?: "model-${System.currentTimeMillis()}.task")
        val dest = File(privateModelDir(), safeName)
        context.contentResolver.openInputStream(uri).use { input ->
            if (input == null) throw IOException("Impossible d'ouvrir le fichier sélectionné")
            dest.outputStream().use { output -> input.copyTo(output) }
        }
        if (!dest.isFile || dest.length() == 0L) {
            dest.delete()
            throw IOException("Import du modèle vide")
        }
        return dest
    }

    /**
     * Prépare un modèle pour MediaPipe : les chemins publics (Download/,
     * /storage/emulated/0/...) sont recopiés dans filesDir/llm car le moteur
     * natif ne peut pas toujours les ouvrir à cause du scoped storage Android.
     */
    private fun prepareModelForInference(source: File): File {
        val privateRoot = context.filesDir ?: return source
        if (isInside(privateRoot, source)) return source

        val dest = File(privateModelDir(), sanitizeTaskFileName(source.name))
        val sourceLength = runCatching { source.length() }.getOrDefault(-1L)
        if (dest.isFile && sourceLength > 0 && dest.length() == sourceLength) return dest

        try {
            source.inputStream().use { input ->
                dest.outputStream().use { output -> input.copyTo(output) }
            }
            if (!dest.isFile || dest.length() == 0L) {
                throw IOException("copie vide")
            }
            return dest
        } catch (e: Exception) {
            dest.delete()
            val appFolder = context.getExternalFilesDir(null)?.absolutePath ?: "Android/data/${context.packageName}/files"
            throw IOException(
                "Le modèle a été trouvé dans ${source.absolutePath}, mais Android bloque son ouverture directe. " +
                    "Placez le fichier .task dans $appFolder/llm puis relancez l'analyse.",
                e
            )
        }
    }

    /** Résout un identifiant de modèle vers un fichier `.task` existant. */
    private fun resolveModelPath(model: String?): File? {
        if (model.isNullOrBlank()) {
            // Aucun nom fourni : prendre le premier `.task` trouvé.
            for (dir in candidateDirs()) {
                val found = dir.listFiles { f -> f.isFile && f.name.endsWith(".task") }?.firstOrNull()
                if (found != null) return found
            }
            return null
        }
        // Chemin absolu direct.
        val direct = File(model)
        if (direct.isAbsolute && direct.isFile) return direct

        val names = listOf(model, "$model.task")
        for (dir in candidateDirs()) {
            for (n in names) {
                val f = File(dir, n)
                if (f.isFile) return f
            }
            // Recherche tolérante (insensible à la casse / suffixe).
            dir.listFiles { f -> f.isFile && f.name.endsWith(".task") }?.forEach { f ->
                val base = f.name.removeSuffix(".task")
                if (base.equals(model, ignoreCase = true) || f.name.equals(model, ignoreCase = true)) return f
            }
        }
        return null
    }

    private fun engineFor(path: File): LlmInference {
        val key = path.absolutePath
        engines[key]?.let { return it }
        val options = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(path.absolutePath)
            .setMaxTokens(1024)
            .build()
        val engine = LlmInference.createFromOptions(context, options)
        engines[key] = engine
        return engine
    }

    private fun friendlyInferenceError(e: Exception): String {
        val msg = e.message ?: e.javaClass.simpleName
        return when {
            msg.contains("open() failed", ignoreCase = true) || msg.contains("scoped_file", ignoreCase = true) ->
                "MediaPipe n'a pas pu ouvrir le fichier .task. Placez-le dans le dossier privé de l'app (filesDir/llm) ou dans Android/data/${context.packageName}/files/llm."
            msg.contains("Failed to initialize engine", ignoreCase = true) ->
                "MediaPipe n'a pas pu initialiser ce modèle. Vérifiez que c'est un fichier .task Android compatible LLM Inference/LiteRT et qu'il tient en mémoire."
            else -> msg.take(500)
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", resolveModelPath(null) != null)
        call.resolve(ret)
    }

    /**
     * Ouvre le sélecteur de fichiers Android et importe un `.task` dans
     * filesDir/llm. C'est le chemin recommandé pour éviter les erreurs
     * MediaPipe `open() failed` depuis Download/ sous Android scoped storage.
     */
    @PluginMethod
    fun importModel(call: PluginCall) {
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }
            startActivityForResult(call, intent, "importModelResult")
        } catch (e: Exception) {
            call.reject("Impossible d'ouvrir le sélecteur de modèle : ${e.message}", e)
        }
    }

    @ActivityCallback
    private fun importModelResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) {
            call.reject("Import du modèle annulé")
            return
        }
        val uri = result.data?.data
        if (uri == null) {
            call.reject("Aucun fichier sélectionné")
            return
        }
        runCatching {
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val imported = copyUriToPrivateModel(uri, displayName(uri))
                val ret = JSObject()
                ret.put("model", modelNameFromFile(imported))
                ret.put("path", imported.absolutePath)
                ret.put("size", imported.length())
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Import du modèle impossible : ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val system = call.getString("system") ?: ""
        val prompt = call.getString("prompt") ?: ""
        val model = call.getString("model")

        val path = resolveModelPath(model)
        if (path == null) {
            call.reject(
                "Aucun modèle local introuvable" +
                    (if (model.isNullOrBlank()) "" else " pour « $model »") +
                    ". Placez un fichier .task dans le dossier de l'app (filesDir/llm) ou les Téléchargements."
            )
            return
        }

        try {
            val preparedPath = prepareModelForInference(path)
            val engine = engineFor(preparedPath)
            val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTemperature(0.6f)
                .setTopK(40)
                .build()
            val session = LlmInferenceSession.createFromOptions(engine, sessionOptions)
            try {
                val fullPrompt = if (system.isBlank()) prompt else "$system\n\n$prompt"
                session.addQueryChunk(fullPrompt)
                val text = session.generateResponse()
                val ret = JSObject()
                ret.put("text", text ?: "")
                call.resolve(ret)
            } finally {
                session.close()
            }
        } catch (e: Exception) {
            call.reject("Échec de l'inférence locale : ${friendlyInferenceError(e)}", e)
        }
    }
}
