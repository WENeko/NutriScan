package com.nutriscan.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Télécharge un APK de mise à jour (GitHub Releases) puis lance l'écran
 * d'installation d'Android. L'utilisateur doit autoriser une fois
 * l'installation depuis NutriScan (« sources inconnues »).
 */
@CapacitorPlugin(name = "ApkUpdater")
class ApkUpdaterPlugin : Plugin() {

  /** true si l'appli peut déclencher une installation d'APK. */
  @PluginMethod
  fun canInstall(call: PluginCall) {
    val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.packageManager.canRequestPackageInstalls()
    } else true
    call.resolve(JSObject().put("allowed", allowed))
  }

  /** Ouvre les réglages Android pour autoriser l'installation d'applis. */
  @PluginMethod
  fun openInstallSettings(call: PluginCall) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent = Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      call.resolve()
    } catch (t: Throwable) {
      call.reject(t.message ?: "Impossible d'ouvrir les réglages", null as String?)
    }
  }

  @PluginMethod
  fun downloadAndInstall(call: PluginCall) {
    val url = call.getString("url")
    if (url.isNullOrBlank()) {
      call.reject("url requise")
      return
    }
    val fileName = call.getString("fileName") ?: "nutriscan-update.apk"

    Thread {
      try {
        val dir = File(context.cacheDir, "updates").apply {
          mkdirs()
          listFiles()?.forEach { it.delete() }
        }
        val target = File(dir, fileName.replace(Regex("[^A-Za-z0-9._-]"), "_"))

        var current = URL(url)
        var conn: HttpURLConnection
        var redirects = 0
        while (true) {
          conn = (current.openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = 20000
            readTimeout = 60000
            setRequestProperty("Accept", "application/octet-stream")
          }
          val code = conn.responseCode
          if (code in 301..308 && redirects < 5) {
            val next = conn.getHeaderField("Location")
            conn.disconnect()
            if (next.isNullOrBlank()) throw IllegalStateException("Redirection invalide")
            current = URL(current, next)
            redirects++
            continue
          }
          if (code !in 200..299) {
            val msg = "Téléchargement refusé (HTTP $code)"
            conn.disconnect()
            throw IllegalStateException(msg)
          }
          break
        }

        val total = conn.contentLengthLong
        var downloaded = 0L
        var lastPercent = -1
        conn.inputStream.use { input ->
          target.outputStream().use { output ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              val read = input.read(buffer)
              if (read <= 0) break
              output.write(buffer, 0, read)
              downloaded += read
              if (total > 0) {
                val percent = ((downloaded * 100) / total).toInt()
                if (percent != lastPercent) {
                  lastPercent = percent
                  notifyListeners(
                    "downloadProgress",
                    JSObject().put("percent", percent).put("downloaded", downloaded).put("total", total)
                  )
                }
              }
            }
          }
        }
        conn.disconnect()

        val uri = FileProvider.getUriForFile(
          context,
          "${context.packageName}.fileprovider",
          target
        )
        val install = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val act: Activity? = activity
        if (act != null) act.startActivity(install) else context.startActivity(install)

        call.resolve(JSObject().put("installed", true).put("path", target.absolutePath))
      } catch (t: Throwable) {
        call.reject(t.message ?: "Échec de la mise à jour", null as String?)
      }
    }.start()
  }
}
