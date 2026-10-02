package com.nutriscan.app

import android.app.Activity
import android.content.Intent
import android.util.Base64
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/** Pont JS ↔ Camera2CaptureActivity : capture({}) → { base64, distanceM?, focusDiopters?, focalMm?, calibration }. */
@CapacitorPlugin(name = "Camera2")
class Camera2Plugin : Plugin() {

    @PluginMethod
    fun capture(call: PluginCall) {
        startActivityForResult(call, Intent(context, Camera2CaptureActivity::class.java), "onCaptured")
    }

    @ActivityCallback
    private fun onCaptured(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        if (result.resultCode != Activity.RESULT_OK || data == null) {
            call.reject(data?.getStringExtra("error") ?: "cancelled")
            return
        }
        val path = data.getStringExtra("path") ?: return call.reject("no-file")
        val file = File(path)
        val ret = JSObject()
        ret.put("base64", Base64.encodeToString(file.readBytes(), Base64.NO_WRAP))
        file.delete()
        ret.put("calibration", data.getStringExtra("calibration"))
        for (k in listOf("distanceM", "focusDiopters", "focalMm", "sensorWidthMm", "sensorHeightMm")) {
            if (data.hasExtra(k)) ret.put(k, data.getDoubleExtra(k, 0.0))
        }
        call.resolve(ret)
    }
}
