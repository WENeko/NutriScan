package com.nutriscan.app

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Plugin Capacitor custom pour lire les records Health Connect non exposés
 * par @capgo/capacitor-health : BoneMassRecord et LeanBodyMassRecord.
 */
@CapacitorPlugin(name = "BoneMass")
class BoneMassPlugin : Plugin() {

    private val bonePerm = HealthPermission.getReadPermission(BoneMassRecord::class)
    private val leanPerm = HealthPermission.getReadPermission(LeanBodyMassRecord::class)

    private fun client(): HealthConnectClient? = try {
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE)
            HealthConnectClient.getOrCreate(context) else null
    } catch (e: Exception) { null }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", client() != null))
    }

    @PluginMethod
    fun hasPermission(call: PluginCall) {
        val c = client() ?: return call.resolve(
            JSObject().put("bone", false).put("lean", false)
        )
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = c.permissionController.getGrantedPermissions()
                call.resolve(
                    JSObject()
                        .put("bone", granted.contains(bonePerm))
                        .put("lean", granted.contains(leanPerm))
                )
            } catch (e: Exception) {
                call.resolve(JSObject().put("bone", false).put("lean", false))
            }
        }
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent = contract.createIntent(context, setOf(bonePerm, leanPerm))
            startActivityForResult(call, intent, "permResult")
        } catch (e: Exception) {
            call.reject(e.message ?: "request failed", e)
        }
    }

    @ActivityCallback
    private fun permResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val granted = contract.parseResult(result.resultCode, result.data)
            call.resolve(
                JSObject()
                    .put("bone", granted.contains(bonePerm))
                    .put("lean", granted.contains(leanPerm))
            )
        } catch (e: Exception) {
            call.resolve(JSObject().put("bone", false).put("lean", false))
        }
    }

    @PluginMethod
    fun readSamples(call: PluginCall) {
        val start = call.getString("startDate") ?: return call.reject("startDate required")
        val end = call.getString("endDate") ?: return call.reject("endDate required")
        val c = client() ?: return call.resolve(
            JSObject().put("bone", JSArray()).put("lean", JSArray())
        )

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = c.permissionController.getGrantedPermissions()
                val range = TimeRangeFilter.between(Instant.parse(start), Instant.parse(end))

                val boneArr = JSArray()
                if (granted.contains(bonePerm)) {
                    val resp = c.readRecords(
                        ReadRecordsRequest(recordType = BoneMassRecord::class, timeRangeFilter = range)
                    )
                    resp.records.forEach { r ->
                        boneArr.put(
                            JSObject()
                                .put("value", r.mass.inKilograms)
                                .put("startDate", r.time.toString())
                                .put("endDate", r.time.toString())
                        )
                    }
                }

                val leanArr = JSArray()
                if (granted.contains(leanPerm)) {
                    val resp = c.readRecords(
                        ReadRecordsRequest(recordType = LeanBodyMassRecord::class, timeRangeFilter = range)
                    )
                    resp.records.forEach { r ->
                        leanArr.put(
                            JSObject()
                                .put("value", r.mass.inKilograms)
                                .put("startDate", r.time.toString())
                                .put("endDate", r.time.toString())
                        )
                    }
                }

                call.resolve(JSObject().put("bone", boneArr).put("lean", leanArr))
            } catch (e: Exception) {
                call.reject(e.message ?: "read failed", e)
            }
        }
    }
}
