package com.nutriscan.app.widgets

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import kotlin.math.max
import kotlin.math.min

/**
 * Rendu du widget « Aperçu Macros du Jour » : reprend exactement les codes
 * visuels du dashboard de la page d'accueil (anneau kcal restantes + 3 anneaux
 * macros + jauge 💪 g/kg), avec les couleurs synchronisées depuis l'app.
 */
object MacrosWidgetRenderer {

  private const val W = 560
  private const val H = 460

  fun render(s: WidgetDataStore.DailySummary, t: WidgetDataStore.Theme): Bitmap {
    val bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)

    // Fond : carte arrondie (bg-card + rounded-2xl du dashboard)
    val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = t.background }
    c.drawRoundRect(RectF(0f, 0f, W.toFloat(), H.toFloat()), 40f, 40f, bg)

    val remaining = max(0, s.caloriesTarget - s.caloriesConsumed)

    // ---- Anneau principal : kcal restantes ----
    val cx = W / 2f
    val cy = 150f
    val ringR = 105f
    drawRing(c, cx, cy, ringR, 20f, t.surface, t.primary, ratio(s.caloriesConsumed, s.caloriesTarget))

    drawText(c, remaining.toString(), cx, cy + 4f, 58f, t.foreground, bold = true)
    drawText(c, "kcal restantes", cx, cy + 38f, 22f, t.mutedForeground)
    drawText(c, "${s.caloriesConsumed} consommées", cx, cy + 66f, 19f, withAlpha(t.mutedForeground, 160))

    // ---- Anneaux macros + g/kg ----
    data class Macro(val label: String, val consumed: Int, val target: Int, val color: Int)
    val macros = listOf(
      Macro("Protéines", s.proteinConsumed, s.proteinTarget, t.protein),
      Macro("Glucides", s.carbsConsumed, s.carbsTarget, t.carb),
      Macro("Lipides", s.fatConsumed, s.fatTarget, t.fat),
    )

    val slots = 4
    val slotW = W / slots.toFloat()
    val my = 330f
    val mr = 42f

    macros.forEachIndexed { i, m ->
      val mx = slotW * (i + 0.5f)
      drawRing(c, mx, my, mr, 11f, t.surface, m.color, ratio(m.consumed, m.target))
      val rest = max(0, m.target - m.consumed)
      drawText(c, "${rest}g", mx, my + mr + 32f, 24f, t.foreground, bold = true)
      drawText(c, m.label, mx, my + mr + 58f, 20f, t.mutedForeground)
    }

    // 4e emplacement : jauge 💪 g/kg (secondaire), comme sur le dashboard
    val gx = slotW * 3.5f
    val perKgRatio = ratio(s.proteinConsumed, s.proteinTarget)
    drawRing(c, gx, my, mr, 11f, t.surface, t.secondary, perKgRatio)
    drawText(c, "💪", gx, my + 12f, 34f, t.foreground)
    drawText(c, "${pct(perKgRatio)}%", gx, my + mr + 32f, 24f, t.foreground, bold = true)
    drawText(c, "protéines", gx, my + mr + 58f, 20f, t.mutedForeground)

    return bmp
  }

  private fun ratio(v: Int, target: Int): Float =
    if (target <= 0) 0f else min(1f, max(0f, v.toFloat() / target.toFloat()))

  private fun pct(r: Float) = (r * 100).toInt()

  private fun withAlpha(color: Int, alpha: Int) =
    Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))

  private fun drawRing(
    c: Canvas,
    cx: Float,
    cy: Float,
    radius: Float,
    stroke: Float,
    trackColor: Int,
    progressColor: Int,
    progress: Float,
  ) {
    val rect = RectF(cx - radius, cy - radius, cx + radius, cy + radius)
    val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = stroke
      color = trackColor
    }
    c.drawArc(rect, 0f, 360f, false, track)
    if (progress <= 0f) return
    val bar = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = stroke
      strokeCap = Paint.Cap.ROUND
      color = progressColor
    }
    c.drawArc(rect, -90f, 360f * progress, false, bar)
  }

  private fun drawText(
    c: Canvas,
    text: String,
    cx: Float,
    baseline: Float,
    size: Float,
    color: Int,
    bold: Boolean = false,
  ) {
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = size
      textAlign = Paint.Align.CENTER
      typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }
    c.drawText(text, cx, baseline, p)
  }
}
