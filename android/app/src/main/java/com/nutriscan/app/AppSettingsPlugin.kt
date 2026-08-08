package com.nutriscan.app

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Ouverture des écrans de réglages système propres à l'application
 * et gestion de l'autorisation de notifications (Android 13+).
 */
@CapacitorPlugin(
  name = "AppSettings",
  permissions = [
    Permission(alias = "notifications", strings = ["android.permission.POST_NOTIFICATIONS"])
  ]
)
class AppSettingsPlugin : Plugin() {

  @PluginMethod
  fun openAppSettings(call: PluginCall) {
    try {
      val ctx = context
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.fromParts("package", ctx.packageName, null)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
      call.resolve()
    } catch (t: Throwable) {
      // Repli : écran générique de la liste des applications.
      try {
        val fallback = Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(fallback)
        call.resolve()
      } catch (e: Throwable) {
        val ex = e as? Exception ?: Exception(e)
        call.reject(ex.message ?: "Impossible d'ouvrir les réglages", ex)
      }
    }
  }

  /** Écran Health Connect (autorisations santé) si disponible. */
  @PluginMethod
  fun openHealthConnectSettings(call: PluginCall) {
    try {
      val intent = Intent("android.health.connect.action.HEALTH_HOME_SETTINGS")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      call.resolve()
    } catch (t: Throwable) {
      openAppSettings(call)
    }
  }

  /** Écran des notifications de l'application (Android 8+). */
  @PluginMethod
  fun openNotificationSettings(call: PluginCall) {
    try {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
          .setData(Uri.fromParts("package", context.packageName, null))
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      call.resolve()
    } catch (t: Throwable) {
      openAppSettings(call)
    }
  }

  private fun notificationsEnabled(): Boolean =
    try {
      NotificationManagerCompat.from(context).areNotificationsEnabled()
    } catch (t: Throwable) {
      false
    }

  /** État réel côté système : "granted" ou "denied". */
  @PluginMethod
  fun checkNotifications(call: PluginCall) {
    val res = JSObject()
    res.put("status", if (notificationsEnabled()) "granted" else "denied")
    call.resolve(res)
  }

  /** Demande POST_NOTIFICATIONS (Android 13+) ; sinon renvoie l'état système. */
  @PluginMethod
  fun requestNotifications(call: PluginCall) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      checkNotifications(call)
      return
    }
    if (getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED) {
      checkNotifications(call)
      return
    }
    requestPermissionForAlias("notifications", call, "notificationsCallback")
  }

  @PermissionCallback
  private fun notificationsCallback(call: PluginCall) {
    val granted = getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED &&
      notificationsEnabled()
    val res = JSObject()
    res.put("status", if (granted) "granted" else "denied")
    call.resolve(res)
  }

  @Suppress("unused")
  private fun unusedManifestReference() = Manifest.permission.INTERNET
}
