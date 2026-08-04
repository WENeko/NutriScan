package com.nutriscan.app.widgets

import android.content.Context
import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lecture des données partagées écrites par le web via Capacitor Preferences
 * (group = "NutriScanWidget", key = "widget_data").
 */
object WidgetDataStore {
  private const val PREFS = "NutriScanWidget"
  private const val KEY = "widget_data"

  data class DailySummary(
    val caloriesConsumed: Int = 0,
    val caloriesTarget: Int = 0,
    val proteinConsumed: Int = 0,
    val proteinTarget: Int = 0,
    val carbsConsumed: Int = 0,
    val carbsTarget: Int = 0,
    val fatConsumed: Int = 0,
    val fatTarget: Int = 0,
  )

  data class Favorite(val id: String, val name: String, val calories: Int, val icon: String)

  /** Couleurs issues des tokens CSS de l'app (source unique de vérité). */
  data class Theme(
    val background: Int = Color.parseColor("#111A14"),
    val surface: Int = Color.parseColor("#1D3227"),
    val foreground: Int = Color.parseColor("#F1F6F2"),
    val mutedForeground: Int = Color.parseColor("#9FB8A8"),
    val primary: Int = Color.parseColor("#33B37E"),
    val primaryGlow: Int = Color.parseColor("#40BF8C"),
    val secondary: Int = Color.parseColor("#E6A21A"),
    val protein: Int = Color.parseColor("#3E8FD9"),
    val carb: Int = Color.parseColor("#F59E1F"),
    val fat: Int = Color.parseColor("#D9426B"),
    val accent: Int = Color.parseColor("#1D3227"),
    val accentForeground: Int = Color.parseColor("#A8D6BE"),
    val destructive: Int = Color.parseColor("#E0524F"),
  )

  data class Auth(val apiUrl: String, val anonKey: String, val accessToken: String)

  private fun root(context: Context): JSONObject? = try {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
    if (raw.isNullOrBlank()) null else JSONObject(raw)
  } catch (t: Throwable) {
    null
  }

  fun dailySummary(context: Context): DailySummary {
    val o = root(context)?.optJSONObject("daily_summary") ?: return DailySummary()
    return DailySummary(
      o.optInt("calories_consumed"), o.optInt("calories_target"),
      o.optInt("protein_consumed"), o.optInt("protein_target"),
      o.optInt("carbs_consumed"), o.optInt("carbs_target"),
      o.optInt("fat_consumed"), o.optInt("fat_target"),
    )
  }

  fun theme(context: Context): Theme {
    val d = Theme()
    val o = root(context)?.optJSONObject("theme") ?: return d
    fun c(key: String, fallback: Int): Int = try {
      val hex = o.optString(key, "")
      if (hex.startsWith("#") && (hex.length == 7 || hex.length == 9)) Color.parseColor(hex) else fallback
    } catch (t: Throwable) {
      fallback
    }
    return Theme(
      background = c("background", d.background),
      surface = c("surface", d.surface),
      foreground = c("foreground", d.foreground),
      mutedForeground = c("muted_foreground", d.mutedForeground),
      primary = c("primary", d.primary),
      primaryGlow = c("primary_glow", d.primaryGlow),
      secondary = c("secondary", d.secondary),
      protein = c("protein", d.protein),
      carb = c("carb", d.carb),
      fat = c("fat", d.fat),
      accent = c("accent", d.accent),
      accentForeground = c("accent_foreground", d.accentForeground),
      destructive = c("destructive", d.destructive),
    )
  }

  fun auth(context: Context): Auth? {
    val o = root(context)?.optJSONObject("auth") ?: return null
    val url = o.optString("api_url")
    val key = o.optString("anon_key")
    val token = o.optString("access_token")
    if (url.isBlank() || key.isBlank() || token.isBlank()) return null
    return Auth(url.trimEnd('/'), key, token)
  }

  fun favorites(context: Context): List<Favorite> {
    val arr: JSONArray = root(context)?.optJSONArray("favorite_meals") ?: return emptyList()
    val out = mutableListOf<Favorite>()
    for (i in 0 until minOf(arr.length(), 4)) {
      val o = arr.optJSONObject(i) ?: continue
      out.add(
        Favorite(
          o.optString("id"),
          o.optString("name"),
          o.optInt("calories"),
          o.optString("icon", "🍽️"),
        )
      )
    }
    return out
  }
}
