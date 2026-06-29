package com.nutriscan.app

import android.os.Environment
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import java.io.File

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
 *   generate({ system, prompt, image?, model? }): Promise<{ text: string }>
 *
 * Résolution du modèle (`model`) :
 *   - chemin absolu vers un fichier `.task` → utilisé tel quel,
 *   - sinon un NOM (ex: "gemma-3n") → recherché dans des dossiers connus,
 *     avec ou sans suffixe `.task`.
 */
@CapacitorPlugin(name = "LocalAiGallery")
class LocalAiGalleryPlugin : Plugin() {

    // Cache d'une instance par chemin de modèle (le chargement est coûteux).
    private val engines = HashMap<String, LlmInference>()

    /** Dossiers où chercher un modèle local à partir de son nom. */
    private fun candidateDirs(): List<File> {
        val ctx = context
        val dirs = ArrayList<File>()
        ctx.filesDir?.let { dirs.add(it); dirs.add(File(it, "llm")) }
        ctx.getExternalFilesDir(null)?.let { dirs.add(it); dirs.add(File(it, "llm")) }
        @Suppress("DEPRECATION")
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)?.let { dirs.add(it) }
        dirs.add(File("/data/local/tmp/llm"))
        return dirs
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

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", resolveModelPath(null) != null)
        call.resolve(ret)
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
            val engine = engineFor(path)
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
            call.reject("Échec de l'inférence locale : ${e.message}", e)
        }
    }
}
