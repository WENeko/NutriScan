package com.nutriscan.app

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import androidx.activity.result.ActivityResult
import java.io.File

@CapacitorPlugin(name = "ReportDownload")
class ReportDownloadPlugin : Plugin() {
    @PluginMethod
    fun save(call: PluginCall) {
        val name = call.getString("filename")
        val mime = call.getString("mimeType")
        val source = call.getString("uri")
        if (name == null || mime == null || source == null ||
            !name.matches(Regex("[A-Za-z0-9._-]+")) ||
            mime !in listOf("application/pdf", "text/csv")) {
            call.reject("Fichier invalide")
            return
        }
        try {
            val file = File(Uri.parse(source).path ?: "").canonicalFile
            val root = File(context.cacheDir, "reports").canonicalFile
            if (!file.isFile || !file.path.startsWith(root.path + File.separator)) {
                call.reject("Fichier hors du cache des bilans")
                return
            }
        } catch (e: Exception) {
            call.reject("Fichier inaccessible", e)
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = mime
                putExtra(Intent.EXTRA_TITLE, name)
            }
            startActivityForResult(call, intent, "documentSelected")
            return
        }
        Thread {
            var destination: Uri? = null
            try {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/NutriScan")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("Destination indisponible")
                destination = uri
                copyReport(call, uri)
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                context.contentResolver.update(uri, values, null, null)
                call.resolve(JSObject().put("saved", true).put("location", "Téléchargements/NutriScan"))
            } catch (e: Exception) {
                destination?.let { context.contentResolver.delete(it, null, null) }
                call.reject("Enregistrement impossible", e)
            }
        }.start()
    }

    @ActivityCallback
    private fun documentSelected(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }
        Thread {
            try {
                copyReport(call, uri)
                call.resolve(JSObject().put("saved", true).put("location", "le dossier choisi"))
            } catch (e: Exception) {
                call.reject("Enregistrement impossible", e)
            }
        }.start()
    }

    private fun copyReport(call: PluginCall, destination: Uri) {
        val source = File(Uri.parse(call.getString("uri") ?: "").path ?: "").canonicalFile
        val root = File(context.cacheDir, "reports").canonicalFile
        require(source.isFile && source.path.startsWith(root.path + File.separator))
        val output = context.contentResolver.openOutputStream(destination)
            ?: throw IllegalStateException("Destination inaccessible")
        output.use { target -> source.inputStream().use { it.copyTo(target) } }
    }
}