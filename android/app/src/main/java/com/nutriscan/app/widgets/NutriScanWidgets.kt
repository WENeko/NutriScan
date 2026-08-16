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

/** B. Widget "Favoris Rapides" — responsive (2 / 4 / 6 favoris) et duplication en arrière-plan. */
class FavoritesWidgetProvider : AppWidgetProvider() {

  private val slots = listOf(
    Triple(R.id.fav_slot_1, R.id.fav_label_1, R.id.fav_kcal_1),
    Triple(R.id.fav_slot_2, R.id.fav_label_2, R.id.fav_kcal_2),
    Triple(R.id.fav_slot_3, R.id.fav_label_3, R.id.fav_kcal_3),
    Triple(R.id.fav_slot_4, R.id.fav_label_4, R.id.fav_kcal_4),
    Triple(R.id.fav_slot_5, R.id.fav_label_5, R.id.fav_kcal_5),
    Triple(R.id.fav_slot_6, R.id.fav_label_6, R.id.fav_kcal_6),
  )

  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> render(context, mgr, id) }
  }

  /** L'utilisateur redimensionne le widget → on recalcule le nombre de favoris. */
  override fun onAppWidgetOptionsChanged(
    context: Context,
    mgr: AppWidgetManager,
    id: Int,
    newOptions: android.os.Bundle?,
  ) {
    super.onAppWidgetOptionsChanged(context, mgr, id, newOptions)
    render(context, mgr, id)
  }

  /** Nombre de favoris selon la hauteur disponible (1 ligne = 2, 2 lignes = 4, 3+ = 6). */
  private fun visibleCount(mgr: AppWidgetManager, id: Int): Int {
    val minHeight = try {
      mgr.getAppWidgetOptions(id)?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
    } catch (t: Throwable) {
      0
    }
    return when {
      minHeight <= 0 -> 4
      minHeight < 110 -> 2
      minHeight < 180 -> 4
      else -> 6
    }
  }

  private fun render(context: Context, mgr: AppWidgetManager, id: Int) {
    val favorites = WidgetDataStore.favorites(context)
    val t = WidgetDataStore.theme(context)
    val count = visibleCount(mgr, id)
    val views = RemoteViews(context.packageName, R.layout.widget_favorites)
    WidgetCommon.tint(views, R.id.fav_root, t.background)
    views.setTextColor(R.id.fav_header, t.primary)

    // Lignes affichées selon la taille choisie.
    views.setViewVisibility(R.id.fav_row_2, if (count >= 4) android.view.View.VISIBLE else android.view.View.GONE)
    views.setViewVisibility(R.id.fav_row_3, if (count >= 6) android.view.View.VISIBLE else android.view.View.GONE)

    slots.forEachIndexed { index, (slot, label, kcal) ->
      val fav = if (index < count) favorites.getOrNull(index) else null
      if (fav == null) {
        views.setViewVisibility(slot, android.view.View.INVISIBLE)
      } else {
        views.setViewVisibility(slot, android.view.View.VISIBLE)
        WidgetCommon.tint(views, slot, t.surface)
        views.setTextColor(label, t.foreground)
        views.setTextColor(kcal, t.mutedForeground)
        views.setTextViewText(label, "${fav.icon} ${fav.name}")
        views.setTextViewText(kcal, "${fav.calories} kcal")
        views.setOnClickPendingIntent(slot, quickLogIntent(context, fav, id, index))
      }
    }
    views.setOnClickPendingIntent(
      R.id.fav_header,
      WidgetCommon.deepLink(context, "nutriscan://dashboard", 299)
    )
    mgr.updateAppWidget(id, views)
  }

  /**
   * Démarre le service au premier plan : contrairement à un broadcast, il n'est
   * pas tué au bout de quelques secondes (cause des échecs aléatoires).
   * `data` unique + requestCode unique => aucun PendingIntent partagé entre slots.
   */
  private fun quickLogIntent(
    context: Context,
    fav: WidgetDataStore.Favorite,
    widgetId: Int,
    index: Int,
  ): PendingIntent {
    val intent = QuickLogService.intent(context, fav.id, fav.name).apply {
      action = WidgetCommon.ACTION_QUICK_LOG
      data = Uri.parse("nutriscan://quicklog/$widgetId/$index/${fav.id}")
    }
    val requestCode = 200_000 + widgetId * 10 + index
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      PendingIntent.getForegroundService(context, requestCode, intent, flags)
    } else {
      PendingIntent.getService(context, requestCode, intent, flags)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    // Repli : anciens PendingIntent de type broadcast encore épinglés au launcher.
    if (intent.action == WidgetCommon.ACTION_QUICK_LOG) {
      val mealId = intent.getStringExtra(WidgetCommon.EXTRA_MEAL_ID)
      val mealName = intent.getStringExtra(WidgetCommon.EXTRA_MEAL_NAME) ?: "Repas"
      if (!mealId.isNullOrBlank()) {
        QuickLogService.start(context.applicationContext, mealId, mealName)
      }
      return
    }
    super.onReceive(context, intent)
  }
}


/** Renouvellement du jeton Supabase depuis les widgets (app fermée). */
object WidgetAuthRefresher {

  /** Retourne un contexte d'auth avec un access_token valide, ou null. */
  fun ensureFreshToken(context: Context, auth: WidgetDataStore.Auth): WidgetDataStore.Auth? {
    val now = System.currentTimeMillis() / 1000
    val expiresSoon = auth.expiresAt in 1..(now + 120)
    if (!expiresSoon) return auth
    val refreshed = refresh(auth) ?: return null
    WidgetDataStore.updateAuth(context, refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt)
    return refreshed
  }

  private fun refresh(auth: WidgetDataStore.Auth): WidgetDataStore.Auth? {
    val refreshToken = auth.refreshToken ?: return null
    return try {
      val (code, body) = post(
        "${auth.apiUrl}/auth/v1/token?grant_type=refresh_token",
        JSONObject().put("refresh_token", refreshToken).toString(),
        auth,
        useBearer = false,
      )
      if (code !in 200..299 || body.isNullOrBlank()) return null
      val o = JSONObject(body)
      val access = o.optString("access_token")
      if (access.isBlank()) return null
      val expiresIn = o.optLong("expires_in", 3600)
      val expiresAt = o.optLong("expires_at", System.currentTimeMillis() / 1000 + expiresIn)
      auth.copy(
        accessToken = access,
        refreshToken = o.optString("refresh_token", refreshToken),
        expiresAt = expiresAt,
      )
    } catch (t: Throwable) {
      null
    }
  }

  fun post(
    url: String,
    body: String,
    auth: WidgetDataStore.Auth,
    useBearer: Boolean = true,
  ): Pair<Int, String?> {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 10000
      readTimeout = 20000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("apikey", auth.anonKey)
      setRequestProperty(
        "Authorization",
        if (useBearer) "Bearer ${auth.accessToken}" else "Bearer ${auth.anonKey}",
      )
    }
    return try {
      OutputStreamWriter(conn.outputStream).use { it.write(body) }
      val code = conn.responseCode
      val stream = if (code in 200..299) conn.inputStream else conn.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() }
      code to text
    } finally {
      conn.disconnect()
    }
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

/**
 * Redessine les widgets au démarrage du téléphone (app non lancée) à partir
 * des dernières données persistées par WidgetDataStore.
 */
class WidgetBootReceiver : android.content.BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      "android.intent.action.QUICKBOOT_POWERON",
      Intent.ACTION_MY_PACKAGE_REPLACED,
      -> WidgetCommon.refreshAll(context.applicationContext)
    }
  }
}
