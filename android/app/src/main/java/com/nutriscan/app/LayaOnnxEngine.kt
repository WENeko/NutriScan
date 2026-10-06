package com.nutriscan.app

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.exp

/**
 * Inférence ONNX Laya-Vision (DINOv2 MoE : entrées image+angle, sorties
 * classes / masses / uncertainties). Exécuté UNIQUEMENT dans le processus
 * isolé `:laya` (LayaOnnxService).
 */
object LayaOnnxEngine {
    private const val DEFAULT_SIZE = 518
    private val mean = floatArrayOf(0.485f, 0.456f, 0.406f)
    private val std = floatArrayOf(0.229f, 0.224f, 0.225f)

    private val env: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }
    private var sessionKey: String? = null
    private var session: OrtSession? = null

    @Synchronized
    private fun sessionFor(file: File): OrtSession {
        val key = "${file.absolutePath}#${file.lastModified()}#${file.length()}"
        session?.let { if (sessionKey == key) return it }

        try { session?.close() } catch (_: Throwable) {}
        session = null

        // Configuration SessionOptions stable pour Android CPU
        val opts = OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(Runtime.getRuntime().availableProcessors().coerceIn(1, 4))
            setInterOpNumThreads(1)
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT)
        }

        val s = env.createSession(file.absolutePath, opts)
        session = s
        sessionKey = key
        return s
    }

    fun decode(bytes: ByteArray, minSide: Int): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= minSide) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
            ?: throw IllegalArgumentException("Image illisible.")
    }

    private const val REF_DISTANCE_M = 0.40

    private fun toTensorBuffer(bitmap: Bitmap, size: Int, distanceM: Double?): FloatBuffer {
        val side = minOf(bitmap.width, bitmap.height)
        val s = distanceM?.takeIf { it.isFinite() && it > 0.03 }?.let { (it / REF_DISTANCE_M).coerceIn(0.25, 3.0) } ?: 1.0
        val cropSide = if (s > 1.0) (side / s).toInt().coerceAtLeast(16) else side
        val square = Bitmap.createBitmap(bitmap, (bitmap.width - cropSide) / 2, (bitmap.height - cropSide) / 2, cropSide, cropSide)
        val inner = if (s < 1.0) (size * s).toInt().coerceAtLeast(16) else size
        val scaledInner = Bitmap.createScaledBitmap(square, inner, inner, true)
        if (square !== bitmap && square !== scaledInner) square.recycle()

        val scaled = if (inner == size) scaledInner else {
            val canvasBmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(canvasBmp)
            canvas.drawColor(android.graphics.Color.rgb(124, 116, 104))
            val off = ((size - inner) / 2).toFloat()
            canvas.drawBitmap(scaledInner, off, off, null)
            scaledInner.recycle()
            canvasBmp
        }

        val pixels = IntArray(size * size)
        scaled.getPixels(pixels, 0, size, 0, 0, size, size)
        if (scaled !== bitmap) scaled.recycle()

        val buf = ByteBuffer.allocateDirect(3 * size * size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        for (c in 0 until 3) {
            val shift = when (c) { 0 -> 16; 1 -> 8; else -> 0 }
            for (p in pixels) buf.put((((p shr shift) and 0xFF) / 255f - mean[c]) / std[c])
        }
        buf.rewind()
        return buf
    }

    private fun scalar(v: Float): FloatBuffer =
        ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(v); rewind() }

    private fun flatten(value: Any?): FloatArray? = when (value) {
        is FloatArray -> value
        is Array<*> -> value.mapNotNull { flatten(it) }.takeIf { it.isNotEmpty() }?.reduce { a, b -> a + b }
        else -> null
    }

    private fun softmax(logits: FloatArray): FloatArray {
        val max = logits.maxOrNull() ?: 0f
        val out = FloatArray(logits.size) { exp(logits[it] - max) }
        val sum = out.sum()
        if (sum > 0f) for (i in out.indices) out[i] /= sum
        return out
    }

    fun classify(modelFile: File, imageBytes: ByteArray, maxResults: Int, angleDeg: Double?, distanceM: Double?): JSONObject {
        val s = sessionFor(modelFile)
        val names = s.inputNames.toList()

        // Identification stricte du nom du tenseur d'entrée
        val imageName = names.firstOrNull { 
            val n = it.lowercase()
            n.contains("image") || n.contains("pixel") || n.contains("input") || n == "x"
        } ?: names.firstOrNull() ?: "image"

        // Extraction sécurisée de la dimension spatiale (ignore les canaux <= 3)
        val size = try {
            val shape = (s.inputInfo[imageName]?.info as? TensorInfo)?.shape
            shape?.filter { it > 3 }?.lastOrNull()?.toInt() ?: DEFAULT_SIZE
        } catch (_: Throwable) { DEFAULT_SIZE }

        val distanceName = names.firstOrNull { it != imageName && it.lowercase().contains("dist") }
        val angleName = names.firstOrNull { it != imageName && it != distanceName && it.lowercase().contains("angle") }

        val bitmap = decode(imageBytes, size)
        val inputs = HashMap<String, OnnxTensor>()

        try {
            val normDistance = if (distanceName == null) distanceM else null
            inputs[imageName] = OnnxTensor.createTensor(
                env, 
                toTensorBuffer(bitmap, size, normDistance), 
                longArrayOf(1, 3, size.toLong(), size.toLong())
            )
            bitmap.recycle()

            // Gestion dynamique de la forme du tenseur Angle ([1, 1] ou [1])
            if (angleName != null) {
                val angleShape = try {
                    val rank = (s.inputInfo[angleName]?.info as? TensorInfo)?.shape?.size ?: 2
                    if (rank == 1) longArrayOf(1) else longArrayOf(1, 1)
                } catch (_: Throwable) { longArrayOf(1, 1) }

                inputs[angleName] = OnnxTensor.createTensor(
                    env, 
                    scalar((angleDeg ?: 90.0).coerceIn(45.0, 90.0).toFloat()), 
                    angleShape
                )
            }

            if (distanceName != null) {
                inputs[distanceName] = OnnxTensor.createTensor(
                    env, 
                    scalar((distanceM ?: 0.0).toFloat()), 
                    longArrayOf(1, 1)
                )
            }

            val predictions = JSONArray()
            s.run(inputs).use { results ->
                var logits: FloatArray? = null
                var masses: FloatArray? = null
                var sigmas: FloatArray? = null

                for (entry in results) {
                    val n = entry.key.lowercase()
                    val arr = try { flatten((entry.value as? OnnxTensor)?.value) } catch (_: Throwable) { null } ?: continue
                    when {
                        n.contains("uncert") || n.contains("sigma") || n.contains("std") -> sigmas = arr
                        n.contains("mass") -> masses = arr
                        n.contains("class") || logits == null -> logits = arr
                    }
                }

                val probs = softmax(logits ?: throw IllegalStateException("Sortie de classes introuvable dans le modèle ONNX."))
                for (idx in probs.indices.sortedByDescending { probs[it] }.take(maxResults)) {
                    val e = JSONObject()
                    e.put("label", "class_$idx")
                    e.put("classIndex", idx)
                    e.put("confidence", probs[idx].toDouble())
                    masses?.getOrNull(idx)?.takeIf { it.isFinite() && it > 0f }?.let { e.put("massG", it.toDouble()) }
                    sigmas?.getOrNull(idx)?.takeIf { it.isFinite() && it >= 0f }?.let { e.put("massSigmaG", it.toDouble()) }
                    predictions.put(e)
                }
            }
            return JSONObject().put("predictions", predictions).put("angleUsed", angleName != null && angleDeg != null)
        } finally {
            inputs.values.forEach { try { it.close() } catch (_: Throwable) {} }
        }
    }
}
