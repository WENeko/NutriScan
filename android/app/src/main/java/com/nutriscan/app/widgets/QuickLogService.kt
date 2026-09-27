package com.nutriscan.app.widgets

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.nutriscan.app.R
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger

/**
 * Enregistrement d'un favori depuis le widget.
 *
 * Un BroadcastReceiver (même avec goAsync) est tué au bout de quelques secondes :
 * c'était la cause du comportement aléatoire des boutons "Favoris rapides".
 * Le travail réseau est désormais exécuté dans un service au premier plan,
 * avec renouvellement du jeton et une nouvelle tentative en cas d'échec réseau / 401.
 */
class QuickLogService : Service() {

  companion object {
    const val EXTRA_MEAL_ID = WidgetCommon.EXTRA_MEAL_ID
    const val EXTRA_MEAL_NAME = WidgetCommon.EXTRA_MEAL_NAME
    private const val CHANNEL_ID = "nutriscan_widget_quicklog"
    private const val NOTIF_ID = 4711

    fun intent(context: Context, mealId: String, mealName: String): Intent =
      Intent(context, QuickLogService::class.java).apply {
        putExtra(EXTRA_MEAL_ID, mealId)
        putExtra(EXTRA_MEAL_NAME, mealName)
      }

    /** Démarre le service (compatible avec les restrictions d'arrière-plan). */
    fun start(context: Context, mealId: String, mealName: String) {
      val i = intent(context, mealId, mealName)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(i)
      } else {
        context.startService(i)
      }
    }
  }

  private val running = AtomicInteger(0)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    promoteToForeground()

    val mealId = intent?.getStringExtra(EXTRA_MEAL_ID)
    val mealName = intent?.getStringExtra(EXTRA_MEAL_NAME) ?: "Repas"
    if (mealId.isNullOrBlank()) {
      stopIfIdle()
      return START_NOT_STICKY
    }

    running.incrementAndGet()
    val app = applicationContext
    WidgetCommon.toast(app, "Ajout de $mealName…")

    Thread {
      val result = runCatching { perform(app, mealId) }
      val error = result.getOrNull() ?: result.exceptionOrNull()?.let {
        it.message ?: it.javaClass.simpleName
      }
      WidgetCommon.toast(app, if (error == null) "$mealName dupliqué ✅" else "Échec : $error")
      if (error == null) WidgetCommon.refreshAll(app)
      running.decrementAndGet()
      stopIfIdle()
    }.start()

    return START_NOT_STICKY
  }

  /** Retourne null en cas de succès, sinon un détail d'erreur lisible. */
  private fun perform(app: Context, mealId: String): String? {
    val stored = WidgetDataStore.auth(app)
      ?: return "ouvre NutriScan une fois"

    var auth = WidgetAuthRefresher.ensureFreshToken(app, stored)
      ?: return "session expirée, ouvre NutriScan"

    val bounds = localDayBounds()
    val payload = JSONObject()
      .put("favorite_meal_id", mealId)
      .put("day_start", bounds.first)
      .put("day_end", bounds.second)
      .toString()
    val url = "${auth.apiUrl}/functions/v1/quick-log-favorite"

    var lastError: String? = null
    // 3 tentatives : réseau instable (Wi-Fi qui se réveille) ou jeton rejeté.
    for (attempt in 0 until 3) {
      try {
        val (code, body) = WidgetAuthRefresher.post(url, payload, auth)
        if (code in 200..299) {
          applyTotals(app, body)
          runCatching { writeToHealthConnect(app, body) }
          return null
        }
        lastError = "HTTP $code"
        if (code == 401 || code == 403) {
          auth = WidgetAuthRefresher.forceRefresh(app, auth) ?: return "session expirée, ouvre NutriScan"
          continue
        }
        if (code < 500) return lastError
      } catch (t: Throwable) {
        lastError = t.message ?: t.javaClass.simpleName
      }
      Thread.sleep(1200L * (attempt + 1))
    }
    return lastError ?: "réseau"
  }

  /**
   * Écrit le repas dupliqué dans Health Connect immédiatement (l'app peut être
   * fermée). La fenêtre écrite est mémorisée pour que l'app la reconnaisse
   * lors de la réconciliation et ne crée pas de doublon.
   */
  private fun writeToHealthConnect(app: Context, body: String?) {
    if (body.isNullOrBlank()) return
    // Respecte le réglage de l'app (stocké dans le localStorage WebView, reflété ici).
    val json = JSONObject(body)
    val mealId = json.optString("meal_id").takeIf { it.isNotBlank() } ?: return
    val meal = json.optJSONObject("meal") ?: return
    if (androidx.health.connect.client.HealthConnectClient.getSdkStatus(app) !=
      androidx.health.connect.client.HealthConnectClient.SDK_AVAILABLE) return
    val client = androidx.health.connect.client.HealthConnectClient.getOrCreate(app)
    val perm = androidx.health.connect.client.permission.HealthPermission
      .getWritePermission(androidx.health.connect.client.records.NutritionRecord::class)
    kotlinx.coroutines.runBlocking {
      if (!client.permissionController.getGrantedPermissions().contains(perm)) return@runBlocking
      val end = java.time.Instant.now()
      val start = end.minusSeconds(60)
      fun g(k: String, div: Double = 1.0): androidx.health.connect.client.units.Mass? {
        val v = meal.optDouble(k, 0.0) / div
        return if (v > 0.0) androidx.health.connect.client.units.Mass.grams(v) else null
      }
      val kcal = meal.optDouble("calories", 0.0)
      val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
      val type = when {
        hour < 11 -> androidx.health.connect.client.records.MealType.MEAL_TYPE_BREAKFAST
        hour < 16 -> androidx.health.connect.client.records.MealType.MEAL_TYPE_LUNCH
        hour < 18 -> androidx.health.connect.client.records.MealType.MEAL_TYPE_SNACK
        else -> androidx.health.connect.client.records.MealType.MEAL_TYPE_DINNER
      }
      val record = androidx.health.connect.client.records.NutritionRecord(
        startTime = start, startZoneOffset = null,
        endTime = end, endZoneOffset = null,
        metadata = androidx.health.connect.client.records.metadata.Metadata.manualEntry(),
        energy = if (kcal > 0) androidx.health.connect.client.units.Energy.kilocalories(kcal) else null,
        protein = g("proteins"),
        totalCarbohydrate = g("carbs"),
        totalFat = g("fats"),
        dietaryFiber = g("fiber"),
        sugar = g("sugar"),
        saturatedFat = g("saturated_fat"),
        sodium = g("sodium_mg", 1000.0),
        name = json.optString("name", "Repas NutriScan"),
        mealType = type,
      )
      client.insertRecords(listOf(record))
      val prefs = app.getSharedPreferences("NutriScanWidget", Context.MODE_PRIVATE)
      val map = runCatching { JSONObject(prefs.getString("hc_written_windows", "{}") ?: "{}") }
        .getOrDefault(JSONObject())
      map.put(mealId, JSONObject().put("startTime", start.toString()))
      prefs.edit().putString("hc_written_windows", map.toString()).apply()
    }
  }

  private fun applyTotals(app: Context, body: String?) {
    if (body.isNullOrBlank()) return
    val totals = runCatching { JSONObject(body).optJSONObject("daily_totals") }.getOrNull() ?: return
    WidgetDataStore.updateConsumed(
      app,
      totals.optInt("calories"),
      totals.optInt("proteins"),
      totals.optInt("carbs"),
      totals.optInt("fats"),
    )
  }

  private fun stopIfIdle() {
    if (running.get() <= 0) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
      else @Suppress("DEPRECATION") stopForeground(true)
      stopSelf()
    }
  }

  private fun promoteToForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIF_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val mgr = getSystemService(NotificationManager::class.java)
      if (mgr?.getNotificationChannel(CHANNEL_ID) == null) {
        mgr?.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Favoris rapides", NotificationManager.IMPORTANCE_LOW)
        )
      }
      return Notification.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("NutriScan")
        .setContentText("Enregistrement du repas favori…")
        .setOngoing(true)
        .build()
    }
    @Suppress("DEPRECATION")
    return Notification.Builder(this)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("NutriScan")
      .setContentText("Enregistrement du repas favori…")
      .build()
  }

  /** Bornes ISO du jour courant dans le fuseau local de l'appareil. */
  private fun localDayBounds(): Pair<String, String> {
    val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
    fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
    val cal = java.util.Calendar.getInstance()
    cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
    cal.set(java.util.Calendar.MINUTE, 0)
    cal.set(java.util.Calendar.SECOND, 0)
    cal.set(java.util.Calendar.MILLISECOND, 0)
    val start = fmt.format(cal.time)
    cal.add(java.util.Calendar.DAY_OF_YEAR, 1)
    return start to fmt.format(cal.time)
  }
}
