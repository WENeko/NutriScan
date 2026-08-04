package com.nutriscan.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import android.widget.Toast
import com.nutriscan.app.R
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/** Utilitaires communs aux widgets NutriScan. */
object WidgetCommon {
  const val ACTION_QUICK_LOG = "com.nutriscan.app.widgets.QUICK_LOG"
  const val EXTRA_MEAL_ID = "meal_id"
  const val EXTRA_MEAL_NAME = "meal_name"

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

  /** Teinte un fond arrondi sans perdre son rayon (API 31+). */
  fun tint(views: RemoteViews, viewId: Int, color: Int) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      views.setColorStateList(viewId, "setBackgroundTintList", ColorStateList.valueOf(color))
    }
  }

  fun toast(context: Context, message: String) {
    Handler(Looper.getMainLooper()).post {
      Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }
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
    val t = WidgetDataStore.theme(context)
    ids.forEach { id ->
      val views = RemoteViews(context.packageName, R.layout.widget_scan)
      WidgetCommon.tint(views, R.id.scan_root, t.background)
      WidgetCommon.tint(views, R.id.widget_scan_camera, t.surface)
      WidgetCommon.tint(views, R.id.widget_scan_gallery, t.surface)
      views.setTextColor(R.id.scan_header, t.primary)
      views.setTextColor(R.id.widget_scan_camera, t.foreground)
      views.setTextColor(R.id.widget_scan_gallery, t.foreground)
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

/** B. Widget "Favoris Rapides" (grille 2x2) — duplication en arrière-plan. */
class FavoritesWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    val favorites = WidgetDataStore.favorites(context)
    val t = WidgetDataStore.theme(context)
    val slots = listOf(
      Triple(R.id.fav_slot_1, R.id.fav_label_1, R.id.fav_kcal_1),
      Triple(R.id.fav_slot_2, R.id.fav_label_2, R.id.fav_kcal_2),
      Triple(R.id.fav_slot_3, R.id.fav_label_3, R.id.fav_kcal_3),
      Triple(R.id.fav_slot_4, R.id.fav_label_4, R.id.fav_kcal_4),
    )
    ids.forEach { id ->
      val views = RemoteViews(context.packageName, R.layout.widget_favorites)
      WidgetCommon.tint(views, R.id.fav_root, t.background)
      views.setTextColor(R.id.fav_header, t.primary)
      slots.forEachIndexed { index, (slot, label, kcal) ->
        val fav = favorites.getOrNull(index)
        if (fav == null) {
          views.setViewVisibility(slot, android.view.View.INVISIBLE)
        } else {
          views.setViewVisibility(slot, android.view.View.VISIBLE)
          WidgetCommon.tint(views, slot, t.surface)
          views.setTextColor(label, t.foreground)
          views.setTextColor(kcal, t.mutedForeground)
          views.setTextViewText(label, "${fav.icon} ${fav.name}")
          views.setTextViewText(kcal, "${fav.calories} kcal")
          views.setOnClickPendingIntent(slot, quickLogIntent(context, fav, 200 + index))
        }
      }
      views.setOnClickPendingIntent(
        R.id.fav_header,
        WidgetCommon.deepLink(context, "nutriscan://dashboard", 299)
      )
      mgr.updateAppWidget(id, views)
    }
  }

  /** Broadcast interne : duplique le repas sans ouvrir l'application. */
  private fun quickLogIntent(
    context: Context,
    fav: WidgetDataStore.Favorite,
    requestCode: Int,
  ): PendingIntent {
    val intent = Intent(context, FavoritesWidgetProvider::class.java).apply {
      action = WidgetCommon.ACTION_QUICK_LOG
      putExtra(WidgetCommon.EXTRA_MEAL_ID, fav.id)
      putExtra(WidgetCommon.EXTRA_MEAL_NAME, fav.name)
    }
    return PendingIntent.getBroadcast(
      context, requestCode, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == WidgetCommon.ACTION_QUICK_LOG) {
      val mealId = intent.getStringExtra(WidgetCommon.EXTRA_MEAL_ID)
      val mealName = intent.getStringExtra(WidgetCommon.EXTRA_MEAL_NAME) ?: "Repas"
      if (mealId.isNullOrBlank()) return
      quickLog(context, mealId, mealName)
      return
    }
    super.onReceive(context, intent)
  }

  private fun quickLog(context: Context, mealId: String, mealName: String) {
    val auth = WidgetDataStore.auth(context)
    if (auth == null) {
      WidgetCommon.toast(context, "Ouvre NutriScan une fois pour activer la duplication")
      return
    }
    val app = context.applicationContext
    Thread {
      var ok = false
      try {
        val conn = (URL("${auth.apiUrl}/functions/v1/quick-log-favorite").openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          connectTimeout = 10000
          readTimeout = 15000
          doOutput = true
          setRequestProperty("Content-Type", "application/json")
          setRequestProperty("apikey", auth.anonKey)
          setRequestProperty("Authorization", "Bearer ${auth.accessToken}")
        }
        val body = JSONObject().put("favorite_meal_id", mealId).toString()
        OutputStreamWriter(conn.outputStream).use { it.write(body) }
        ok = conn.responseCode in 200..299
        conn.disconnect()
      } catch (t: Throwable) {
        ok = false
      }
      WidgetCommon.toast(app, if (ok) "$mealName dupliqué ✅" else "Échec de la duplication")
      if (ok) WidgetCommon.refreshAll(app)
    }.start()
  }
}

/** C. Widget "Aperçu Macros du Jour" — mêmes formes/couleurs que le dashboard. */
class MacrosWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    val s = WidgetDataStore.dailySummary(context)
    val t = WidgetDataStore.theme(context)
    val bitmap = MacrosWidgetRenderer.render(s, t)
    ids.forEach { id ->
      val views = RemoteViews(context.packageName, R.layout.widget_macros)
      views.setImageViewBitmap(R.id.macro_canvas, bitmap)
      views.setOnClickPendingIntent(
        R.id.macro_root,
        WidgetCommon.deepLink(context, "nutriscan://dashboard", 300)
      )
      mgr.updateAppWidget(id, views)
    }
  }
}
