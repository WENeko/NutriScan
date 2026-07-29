package com.nutriscan.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.nutriscan.app.R

/** Utilitaires communs aux widgets NutriScan. */
object WidgetCommon {
  fun deepLink(context: Context, url: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context, requestCode, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** Force le redessin de tous les widgets NutriScan. */
  fun refreshAll(context: Context) {
    val mgr = AppWidgetManager.getInstance(context)
    listOf(
      ScanWidgetProvider::class.java,
      FavoritesWidgetProvider::class.java,
      MacrosWidgetProvider::class.java
    ).forEach { cls ->
      val ids = mgr.getAppWidgetIds(ComponentName(context, cls))
      if (ids.isNotEmpty()) {
        context.sendBroadcast(
          Intent(context, cls).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
          }
        )
      }
    }
  }
}

/** A. Widget "Caméra / Bibliothèque Express". */
class ScanWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    ids.forEach { id ->
      val views = RemoteViews(context.packageName, R.layout.widget_scan)
      views.setOnClickPendingIntent(
        R.id.widget_scan_camera,
        WidgetCommon.deepLink(context, "nutriscan://scan?source=camera", 101)
      )
      views.setOnClickPendingIntent(
        R.id.widget_scan_gallery,
        WidgetCommon.deepLink(context, "nutriscan://scan?source=gallery", 102)
      )
      mgr.updateAppWidget(id, views)
    }
  }
}

/** B. Widget "Favoris Rapides" (grille 2x2). */
class FavoritesWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    val favorites = WidgetDataStore.favorites(context)
    val slots = listOf(
      Triple(R.id.fav_slot_1, R.id.fav_label_1, R.id.fav_kcal_1),
      Triple(R.id.fav_slot_2, R.id.fav_label_2, R.id.fav_kcal_2),
      Triple(R.id.fav_slot_3, R.id.fav_label_3, R.id.fav_kcal_3),
      Triple(R.id.fav_slot_4, R.id.fav_label_4, R.id.fav_kcal_4),
    )
    ids.forEach { id ->
      val views = RemoteViews(context.packageName, R.layout.widget_favorites)
      slots.forEachIndexed { index, (slot, label, kcal) ->
        val fav = favorites.getOrNull(index)
        if (fav == null) {
          views.setViewVisibility(slot, android.view.View.INVISIBLE)
        } else {
          views.setViewVisibility(slot, android.view.View.VISIBLE)
          views.setTextViewText(label, "${fav.icon} ${fav.name}")
          views.setTextViewText(kcal, "${fav.calories} kcal")
          views.setOnClickPendingIntent(
            slot,
            WidgetCommon.deepLink(context, "nutriscan://quicklog?meal_id=${fav.id}", 200 + index)
          )
        }
      }
      views.setOnClickPendingIntent(
        R.id.fav_header,
        WidgetCommon.deepLink(context, "nutriscan://dashboard", 299)
      )
      mgr.updateAppWidget(id, views)
    }
  }
}

/** C. Widget "Aperçu Macros du Jour". */
class MacrosWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    val s = WidgetDataStore.dailySummary(context)
    fun pct(v: Int, t: Int) = if (t <= 0) 0 else minOf(100, (v * 100) / t)
    ids.forEach { id ->
      val views = RemoteViews(context.packageName, R.layout.widget_macros)
      views.setTextViewText(R.id.macro_kcal, "${s.caloriesConsumed} / ${s.caloriesTarget} kcal")
      views.setProgressBar(R.id.macro_kcal_bar, 100, pct(s.caloriesConsumed, s.caloriesTarget), false)
      views.setTextViewText(R.id.macro_p, "P ${s.proteinConsumed}/${s.proteinTarget}g")
      views.setProgressBar(R.id.macro_p_bar, 100, pct(s.proteinConsumed, s.proteinTarget), false)
      views.setTextViewText(R.id.macro_c, "G ${s.carbsConsumed}/${s.carbsTarget}g")
      views.setProgressBar(R.id.macro_c_bar, 100, pct(s.carbsConsumed, s.carbsTarget), false)
      views.setTextViewText(R.id.macro_f, "L ${s.fatConsumed}/${s.fatTarget}g")
      views.setProgressBar(R.id.macro_f_bar, 100, pct(s.fatConsumed, s.fatTarget), false)
      views.setOnClickPendingIntent(
        R.id.macro_root,
        WidgetCommon.deepLink(context, "nutriscan://dashboard", 300)
      )
      mgr.updateAppWidget(id, views)
    }
  }
}
