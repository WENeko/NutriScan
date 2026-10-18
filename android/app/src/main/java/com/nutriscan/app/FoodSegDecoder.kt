package com.nutriscan.app

import kotlin.math.max
import kotlin.math.min

/** Raw YOLO segment contract: [1,4+classes+maskChannels,anchors], [1,maskChannels,H,W]. */
object FoodSegDecoder {
    data class Detection(val classIndex: Int, val confidence: Float, val box: FloatArray,
                         val areaFraction: Double, val maskRle: IntArray)

    fun decode(rows: Array<FloatArray>, proto: Array<Array<FloatArray>>, classCount: Int,
               size: Int, imageWidth: Int, imageHeight: Int, limit: Int, threshold: Float): List<Detection> {
        require(proto.isNotEmpty() && rows.size == 4 + classCount + proto.size) { "Format YOLO segmentation incompatible." }
        val anchors = rows[0].size
        require(rows.all { it.size == anchors })
        val scale = min(size.toDouble() / imageWidth, size.toDouble() / imageHeight)
        val width = kotlin.math.round(imageWidth * scale).toInt()
        val height = kotlin.math.round(imageHeight * scale).toInt()
        val padX = (size - width) / 2
        val padY = (size - height) / 2
        data class Candidate(val index: Int, val cls: Int, val score: Float, val box: FloatArray)
        val candidates = (0 until anchors).mapNotNull { a ->
            var cls = 0
            for (c in 1 until classCount) if (rows[4 + c][a] > rows[4 + cls][a]) cls = c
            val score = rows[4 + cls][a]
            if (!score.isFinite() || score < threshold) return@mapNotNull null
            val x = rows[0][a]; val y = rows[1][a]; val w = rows[2][a]; val h = rows[3][a]
            if (!x.isFinite() || !y.isFinite() || !w.isFinite() || !h.isFinite() || w <= 0 || h <= 0) return@mapNotNull null
            Candidate(a, cls, score, floatArrayOf(max(padX.toFloat(), x-w/2), max(padY.toFloat(), y-h/2),
                min((padX+width).toFloat(), x+w/2), min((padY+height).toFloat(), y+h/2)))
        }.sortedByDescending { it.score }.take(1000)
        val kept = ArrayList<Candidate>()
        for (c in candidates) {
            if (c.box[2] <= c.box[0] || c.box[3] <= c.box[1]) continue
            if (kept.any { it.cls == c.cls && iou(it.box, c.box) > 0.45f }) continue
            kept.add(c)
            if (kept.size >= limit.coerceIn(1, 30)) break
        }
        val mh = proto[0].size; val mw = proto[0][0].size
        val validPixels = (0 until mh).sumOf { y -> (0 until mw).count { x ->
            val px = (x+0.5)*size/mw; val py = (y+0.5)*size/mh
            px >= padX && px < padX+width && py >= padY && py < padY+height
        } }
        return kept.mapNotNull { c ->
            val runs = ArrayList<Int>(); var previous = false; var run = 0; var area = 0
            for (y in 0 until mh) for (x in 0 until mw) {
                val px = (x+0.5)*size/mw; val py = (y+0.5)*size/mh
                var inside = px >= c.box[0] && px < c.box[2] && py >= c.box[1] && py < c.box[3]
                if (inside) {
                    var value = 0f
                    for (k in proto.indices) value += rows[4+classCount+k][c.index] * proto[k][y][x]
                    inside = value > 0f // sigmoid(value) > 0.5
                }
                if (inside) area++
                if (inside == previous) run++ else { runs.add(run); previous = inside; run = 1 }
            }
            runs.add(run)
            if (area == 0 || validPixels == 0) null else Detection(c.cls, c.score, floatArrayOf(
                ((c.box[0]-padX)/width).coerceIn(0f,1f), ((c.box[1]-padY)/height).coerceIn(0f,1f),
                ((c.box[2]-padX)/width).coerceIn(0f,1f), ((c.box[3]-padY)/height).coerceIn(0f,1f)),
                area.toDouble()/validPixels, runs.toIntArray())
        }
    }

    private fun iou(a: FloatArray, b: FloatArray): Float {
        val intersection = max(0f,min(a[2],b[2])-max(a[0],b[0])) * max(0f,min(a[3],b[3])-max(a[1],b[1]))
        val union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
        return if (union > 0) intersection/union else 0f
    }
}