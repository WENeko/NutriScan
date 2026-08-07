package com.nutriscan.app

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Ouverture des écrans de réglages système propres à l'application.
 * Cible ACTION_APPLICATION_DETAILS_SETTINGS (package:com.nutriscan.app) afin
 * d'arriver directement sur la gestion des autorisations de NutriScan.
 */
@CapacitorPlugin(name = "AppSettings")
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
        call.reject(e.message ?: "Impossible d'ouvrir les réglages", e)
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
}
