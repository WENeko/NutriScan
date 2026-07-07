package com.nutriscan.app

import android.app.Activity
import android.content.ContentUris
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
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

    /**
     * Extensions de modèles locaux supportées. Le format moderne LiteRT-LM
     * `.litertlm` (utilisé par les Gemma récents dans Google AI Edge Gallery)
     * est prioritaire ; `.task` reste accepté pour la rétro-compatibilité.
     */
    private val modelExtensions = listOf(".litertlm", ".task")
    private val defaultExtension = ".litertlm"

    private data class DownloadModelRef(val name: String, val uri: Uri, val size: Long?)

    private fun isModelFileName(name: String?): Boolean =
        !name.isNullOrBlank() && modelExtensions.any { name.endsWith(it, ignoreCase = true) }

    private fun isModelFile(f: File): Boolean = f.isFile && isModelFileName(f.name)

    @Suppress("DEPRECATION")
    private fun publicDownloadsDir(): File? =
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)

    private fun isPublicDownloadsFile(file: File): Boolean {
        val downloads = publicDownloadsDir() ?: return false
        return isInside(downloads, file)
    }

    /** Dossiers où chercher un modèle local à partir de son nom. */
    private fun candidateDirs(): List<File> {
        val ctx = context
        val dirs = ArrayList<File>()
        ctx.filesDir?.let { dirs.add(File(it, "llm")); dirs.add(it) }
        ctx.getExternalFilesDir(null)?.let { dirs.add(File(it, "llm")); dirs.add(it) }
        publicDownloadsDir()?.let { dirs.add(it) }
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
        val hasExt = modelExtensions.any { clean.endsWith(it, ignoreCase = true) }
        return if (hasExt) clean else "$clean$defaultExtension"
    }

    private fun modelNameFromFile(file: File): String =
        file.name.replace(Regex("\\.(litertlm|task)$", RegexOption.IGNORE_CASE), "")

    private fun displayName(uri: Uri): String? {
        return runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }.getOrNull()
    }

    private fun copyUriToPrivateModel(uri: Uri, preferredName: String?, expectedSize: Long? = null): File {
        val safeName = sanitizeTaskFileName(preferredName ?: "model-${System.currentTimeMillis()}.litertlm")
        val dest = File(privateModelDir(), safeName)
        if (expectedSize != null && expectedSize > 0L && dest.isFile && dest.length() == expectedSize) {
            return dest
        }
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
     * Android 10+ bloque les accès FileInputStream directs à Download/ pour les
     * fichiers non-média. Quand c'est possible, on passe donc par MediaStore puis
     * on recopie le modèle dans le stockage privé avant l'inférence native.
     */
    private fun downloadModelRefs(displayName: String? = null): List<DownloadModelRef> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return emptyList()
        val out = ArrayList<DownloadModelRef>()
        val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.Downloads._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.SIZE,
        )
        val selection = displayName?.let { "${MediaStore.MediaColumns.DISPLAY_NAME} = ?" }
        val args = displayName?.let { arrayOf(it) }
        try {
            context.contentResolver.query(collection, projection, selection, args, null)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE)
                while (cursor.moveToNext()) {
                    val name = cursor.getString(nameCol) ?: continue
                    if (!isModelFileName(name)) continue
                    val id = cursor.getLong(idCol)
                    val size = if (sizeCol >= 0 && !cursor.isNull(sizeCol)) cursor.getLong(sizeCol) else null
                    out.add(DownloadModelRef(name, ContentUris.withAppendedId(collection, id), size))
                }
            }
        } catch (_: Exception) {
            // Certains constructeurs restreignent MediaStore.Downloads. Le flux
            // d'import SAF reste alors le chemin garanti.
        }
        return out
    }

    private fun copyDownloadModelByName(displayName: String): File? {
        for (ref in downloadModelRefs(displayName)) {
            try {
                return copyUriToPrivateModel(ref.uri, ref.name, ref.size)
            } catch (_: Exception) {
                // Essayer une autre entrée homonyme si MediaStore en expose plusieurs.
            }
        }
        return null
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

        if (isPublicDownloadsFile(source)) {
            copyDownloadModelByName(source.name)?.let { return it }
        }

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
                    "Importez-le avec le bouton Importer un modèle, ou placez le fichier .litertlm dans $appFolder/llm puis relancez l'analyse.",
                e
            )
        }
    }

    /** Résout un identifiant de modèle vers un fichier `.litertlm`/`.task` existant. */
    private fun resolveModelPath(model: String?): File? {
        if (model.isNullOrBlank()) {
            // Aucun nom fourni : prendre le premier modèle trouvé.
            for (dir in candidateDirs()) {
                if (publicDownloadsDir()?.let { isInside(it, dir) } == true) continue
                val found = dir.listFiles { f -> isModelFile(f) }?.firstOrNull()
                if (found != null) return found
            }
            downloadModelRefs().firstOrNull()?.let { ref ->
                runCatching { copyUriToPrivateModel(ref.uri, ref.name, ref.size) }.getOrNull()?.let { return it }
            }
            return null
        }
        // Chemin absolu direct.
        val direct = File(model)
        if (direct.isAbsolute && direct.isFile) {
            if (isPublicDownloadsFile(direct)) {
                copyDownloadModelByName(direct.name)?.let { return it }
            } else {
                return direct
            }
        }

        val names = LinkedHashSet<String>().apply {
            add(model)
            if (!isModelFileName(model)) modelExtensions.forEach { add("$model$it") }
        }.toList()
        for (dir in candidateDirs()) {
            val isDownloads = publicDownloadsDir()?.let { isInside(it, dir) } == true
            for (n in names) {
                val f = File(dir, n)
                if (f.isFile) {
                    if (isDownloads) copyDownloadModelByName(f.name)?.let { return it } else return f
                }
            }
            // Recherche tolérante (insensible à la casse / suffixe).
            dir.listFiles { f -> isModelFile(f) }?.forEach { f ->
                val base = modelNameFromFile(f)
                if (base.equals(model, ignoreCase = true) || f.name.equals(model, ignoreCase = true)) {
                    if (isDownloads) copyDownloadModelByName(f.name)?.let { return it } else return f
                }
            }
        }
        for (n in names) {
            if (isModelFileName(n)) copyDownloadModelByName(n)?.let { return it }
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
            msg.contains("-web.task", ignoreCase = true) ->
                "Ce fichier ressemble à une variante Web (-web.task). Utilisez un modèle .litertlm (ou .task) Android compatible LLM Inference/LiteRT, puis importez-le dans l'app."
            msg.contains("open() failed", ignoreCase = true) || msg.contains("scoped_file", ignoreCase = true) ->
                "MediaPipe n'a pas pu ouvrir le fichier modèle. Placez-le dans le dossier privé de l'app (filesDir/llm) ou dans Android/data/${context.packageName}/files/llm."
            msg.contains("Failed to initialize engine", ignoreCase = true) ->
                "MediaPipe n'a pas pu initialiser ce modèle. Vérifiez que c'est un fichier .litertlm (ou .task) Android compatible LLM Inference/LiteRT récent et qu'il tient en mémoire."
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
     * Analyse tous les dossiers connus et renvoie la liste des modèles `.task`
     * compatibles trouvés (déduplication par nom sans suffixe).
     */
    @PluginMethod
    fun listModels(call: PluginCall) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val found = LinkedHashSet<String>()
                val warnings = ArrayList<String>()
                val downloads = publicDownloadsDir()
                for (dir in candidateDirs()) {
                    if (downloads != null && isInside(downloads, dir)) continue
                    dir.listFiles { f -> isModelFile(f) }?.forEach { f ->
                        found.add(modelNameFromFile(f))
                    }
                }
                for (ref in downloadModelRefs()) {
                    try {
                        val imported = copyUriToPrivateModel(ref.uri, ref.name, ref.size)
                        found.add(modelNameFromFile(imported))
                    } catch (e: Exception) {
                        warnings.add("${ref.name}: ${e.message ?: "import impossible"}")
                    }
                }
                val arr = com.getcapacitor.JSArray()
                found.forEach { arr.put(it) }
                val warnArr = com.getcapacitor.JSArray()
                warnings.forEach { warnArr.put(it) }
                val ret = JSObject()
                ret.put("models", arr)
                ret.put("warnings", warnArr)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Recherche des modèles impossible : ${e.message}", e)
            }
        }
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

        CoroutineScope(Dispatchers.Default).launch {
            val path = resolveModelPath(model)
            if (path == null) {
                call.reject(
                    "Aucun modèle local introuvable" +
                        (if (model.isNullOrBlank()) "" else " pour « $model »") +
                        ". Utilisez Importer un modèle, ou placez un fichier .litertlm dans le dossier de l'app (filesDir/llm)."
                )
                return@launch
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
}
