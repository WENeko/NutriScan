package com.nutriscan.app.vlm

import android.app.ActivityManager
import android.app.Service
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Message
import android.os.Messenger
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Inférence VLM isolée dans le processus « :vlm ».
 * Garde-fous mémoire : contrôle pré-vol de la RAM libre, mode dégradé automatique,
 * refus propre si saturation, déchargement immédiat sur onTrimMemory.
 */
class LocalVlmService : Service() {
    companion object {
        const val MSG_ANALYZE = 1
        private const val TAG = "NutriVlm"
        private const val IDLE_UNLOAD_MS = 5 * 60 * 1000L
        private const val DEGRADED_UNLOAD_MS = 20 * 1000L
        private const val MAX_SIDE = 448
        private const val MAX_SIDE_DEGRADED = 448
        private const val MB = 1024L * 1024L
        private const val FULL_MIN_AVAIL = 1800 * MB
        private const val REFUSE_BELOW = 700 * MB
    }

    private enum class MemTier { FULL, DEGRADED, REFUSE }

    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private lateinit var messenger: Messenger
    @Volatile private var loadedKey: String? = null
    private var loadedThreads = 0
    private val unloadTask = Runnable { unloadModels(); stopSelf() }

    private fun unloadModels() {
        try { NutriVlmNative.unload() } catch (_: Throwable) {}
        loadedKey = null
        loadedThreads = 0
    }

    private fun memTier(): Pair<MemTier, Long> {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        // Si le modèle est déjà mappé, ses pages comptent déjà : on tolère un seuil plus bas.
        val bonus = if (loadedKey != null) 600 * MB else 0L
        val avail = mi.availMem + bonus
        val tier = when {
            mi.lowMemory || avail < REFUSE_BELOW -> MemTier.REFUSE
            avail < FULL_MIN_AVAIL -> MemTier.DEGRADED
            else -> MemTier.FULL
        }
        return tier to mi.availMem
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
                var degraded = false
                try {
                    val d = msg.data
                    val model = d.getString("modelPath") ?: throw IllegalArgumentException("modèle manquant")
                    val mmproj = d.getString("mmprojPath") ?: throw IllegalArgumentException("projecteur manquant")
                    val imageFile = File(d.getString("imagePath") ?: throw IllegalArgumentException("image manquante"))
                    val raw = imageFile.readBytes()
                    imageFile.delete()

                    var (tier, avail) = memTier()
                    if (tier == MemTier.REFUSE && loadedKey != null) {
                        unloadModels(); System.gc()
                        val again = memTier(); tier = again.first; avail = again.second
                    }
                    out.putLong("availMemMb", avail / MB)
                    if (tier == MemTier.REFUSE) {
                        out.putString("memoryTier", "refused")
                        throw IllegalStateException(
                            "Mémoire insuffisante (${avail / MB} Mo libres) : analyse locale annulée pour éviter un plantage. Fermez des applis ou utilisez l'analyse cloud."
                        )
                    }
                    degraded = tier == MemTier.DEGRADED
                    out.putString("memoryTier", if (degraded) "degraded" else "full")

                    val threads = if (degraded) 2 else performanceCores()
                    // Consignes expertes partagées (~1000 tokens) + image : 2048 évite tout débordement.
                    val nCtx = if (degraded) 1536 else 2048
                    val p = prefs()
                    // Un arrêt forcé pour délai dépassé n'est PAS un plantage GPU.
                    val timeoutMarker = File(filesDir, "vlm/timeout.flag")
                    if (p.getBoolean("gpuPending", false)) {
                        if (timeoutMarker.exists()) {
                            Log.w(TAG, "Arrêt précédent dû au délai : GPU conservé")
                        } else {
                            Log.w(TAG, "Plantage GPU précédent détecté : Vulkan désactivé sur cet appareil")
                            p.edit().putBoolean("gpuBroken", true).putInt("gpuBrokenVersion", appVersion()).commit()
                        }
                        p.edit().putBoolean("gpuPending", false).commit()
                    }
                    timeoutMarker.delete()
                    // Une mise à jour de l'appli redonne une chance au GPU.
                    if (p.getBoolean("gpuBroken", false) && p.getInt("gpuBrokenVersion", -1) != appVersion())
                        p.edit().putBoolean("gpuBroken", false).commit()
                    val decision = gpuDecision(degraded)
                    val useGpu = decision.first
                    out.putString("gpuReason", decision.second)
                    val key = "$model|$mmproj|$nCtx|$useGpu"
                    var loadMs = 0L
                    if (loadedKey != key || loadedThreads != threads) {
                        val t0 = System.currentTimeMillis()
                        if (useGpu) p.edit().putBoolean("gpuPending", true).commit()
                        val ok = NutriVlmNative.loadModels(model, mmproj, threads, nCtx, useGpu)
                        if (!ok) {
                            p.edit().putBoolean("gpuPending", false).commit()
                            loadedKey = null
                            throw IllegalStateException(NutriVlmNative.lastError().ifBlank { "Chargement impossible" })
                        }
                        loadedKey = key
                        loadedThreads = threads
                        loadMs = System.currentTimeMillis() - t0
                    }
                    val backend = NutriVlmNative.backend()
                    out.putString("backend", backend)
                    out.putString("gpuName", if (backend == "vulkan") NutriVlmNative.gpuDeviceName() else "")
                    val side = if (degraded) MAX_SIDE_DEGRADED else adaptiveSide()
                    val maxTokens = d.getInt("maxTokens", 768).coerceIn(128, 1024)                  // Prompt adapté à l'accélérateur réellement actif : expert (GPU) ou court (CPU).
                    val onGpu = backend == "vulkan"
                    val system = (if (onGpu) d.getString("systemGpu") else d.getString("systemCpu")) ?: d.getString("system") ?: ""
                    out.putString("promptVariant", if (onGpu) "expert" else "court")
                    val tInf = System.currentTimeMillis()
                    val text = NutriVlmNative.analyze(
                        downscale(raw, side),
                        system,
                        d.getString("prompt") ?: "",
                        maxTokens,
                    ) ?: throw IllegalStateException(NutriVlmNative.lastError().ifBlank { "Analyse impossible" })
                    prefs().edit().putBoolean("gpuPending", false).apply()
                    if (!degraded) learn(side, System.currentTimeMillis() - tInf)
                    out.putString("text", text)
                    out.putBoolean("promptCached", NutriVlmNative.lastPrefixCached())
                    out.putInt("promptTokens", NutriVlmNative.lastPromptTokens())
                    out.putLong("loadMs", loadMs)
                    out.putInt("imageSide", side)
                    out.putInt("threads", threads)
                    out.putLong("latencyMs", System.currentTimeMillis() - started)
                    prefs().edit().putLong("lastLatencyMs", System.currentTimeMillis() - started).apply()
                } catch (t: Throwable) {
                    out.putString("error", t.message ?: t.javaClass.simpleName)
                    // Si l'analyse échoue ou dépasse le temps, on rétrograde automatiquement à 448 px pour la suivante
                    prefs().edit().putInt("side", MAX_SIDE_DEGRADED).apply()
                }
                
                try { replyTo.send(Message.obtain(null, MSG_ANALYZE).apply { data = out }) } catch (_: Throwable) {}
                postDelayed(unloadTask, if (degraded) DEGRADED_UNLOAD_MS else IDLE_UNLOAD_MS)
            }
        }
        messenger = Messenger(handler)
    }

    /** Pression mémoire signalée par le système : on libère les modèles tout de suite. */
    @Suppress("DEPRECATION")
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW && loadedKey != null) {
            Log.w(TAG, "onTrimMemory($level) : déchargement des modèles")
            handler.removeCallbacks(unloadTask)
            handler.post { unloadModels() }
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        handler.post { unloadModels() }
    }

    @Suppress("DEPRECATION")
    private fun prefs() = getSharedPreferences("vlm_profile", Context.MODE_MULTI_PROCESS)

    @Suppress("DEPRECATION")
    private fun appVersion(): Int = try { packageManager.getPackageInfo(packageName, 0).versionCode } catch (_: Throwable) { 0 }

    /**
     * Compatibilité GPU décidée à chaque analyse : Vulkan 1.1+ déclaré par le système,
     * ≥ 6 Go de RAM (mémoire unifiée partagée avec le GPU), pas de pression mémoire,
     * aucun plantage GPU enregistré sur cette version, et un GPU réellement vu par ggml.
     */
    private fun gpuDecision(degraded: Boolean): Pair<Boolean, String> {
        if (prefs().getBoolean("gpuBroken", false)) return false to "GPU désactivé après un plantage"
        val vk11 = 0x00401000 // VK_API_VERSION_1_1
        if (!packageManager.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_VERSION, vk11))
            return false to "Vulkan 1.1 non supporté"
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val total = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }.totalMem
        if (total < 5500 * MB) return false to "RAM < 6 Go"
        if (degraded) return false to "mémoire libre insuffisante"
        val name = try { NutriVlmNative.gpuDeviceName() } catch (_: Throwable) { "" }
        if (name.isBlank()) return false to "aucun GPU Vulkan détecté"
        return true to name
    }

    /** Cœurs « performance » uniquement (fréquence max ≥ 80 % du plus rapide) : les petits cœurs ralentissent llama.cpp. */
    private fun performanceCores(): Int {
        val n = Runtime.getRuntime().availableProcessors()
        val freqs = (0 until n).mapNotNull {
            try { File("/sys/devices/system/cpu/cpu$it/cpufreq/cpuinfo_max_freq").readText().trim().toLong() } catch (_: Throwable) { null }
        }
        if (freqs.isEmpty()) return (n / 2).coerceIn(2, 4)
        val top = freqs.max()
        return freqs.count { it >= top * 0.8 }.coerceIn(2, 6)
    }

    /**
     * Résolution adaptée au profil du téléphone : part de la RAM totale, puis apprend
     * de la latence réelle (descend si > 90 s, remonte si < 30 s). Jamais sous 448 px.
     */
    private fun adaptiveSide(): Int = MAX_SIDE

    private fun learn(side: Int, inferMs: Long) {
        val steps = listOf(MAX_SIDE_DEGRADED, 672, MAX_SIDE)
        val i = steps.indexOf(side).takeIf { it >= 0 } ?: return
        val next = when {
            inferMs > 90_000 && i > 0 -> steps[i - 1]
            inferMs < 30_000 && i < steps.lastIndex -> steps[i + 1]
            else -> side
        }
        prefs().edit().putInt("side", next).apply()
        Log.i(TAG, "Profil VLM : ${side}px en ${inferMs} ms → prochain ${next}px")
    }

    /** Réduit la photo avant l'encodeur visuel : moins de RAM et de tokens visuels. */
    private fun downscale(bytes: ByteArray, maxSide: Int): ByteArray {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (maxOf(bounds.outWidth, bounds.outHeight) <= maxSide) return bytes
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: return bytes
        val scale = maxSide.toFloat() / maxOf(bmp.width, bmp.height)
        val scaled = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
        val res = ByteArrayOutputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 90, it); it.toByteArray() }
        if (scaled !== bmp) scaled.recycle()
        bmp.recycle()
        return res
    }

    override fun onBind(intent: Intent?): IBinder = messenger.binder

    override fun onDestroy() {
        unloadModels()
        thread.quitSafely()
        super.onDestroy()
    }
}
