package com.nutriscan.app.widgets

import android.content.Context
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
