package com.nutriscan.app

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Plugin Capacitor custom pour lire BoneMassRecord depuis Health Connect.
 * Le plugin @capgo/capacitor-health ne supporte pas ce record nativement.
 */
@CapacitorPlugin(name = "BoneMass")
class BoneMassPlugin : Plugin() {

    private val readPermission = HealthPermission.getReadPermission(BoneMassRecord::class)

    private fun client(): HealthConnectClient? = try {
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE)
            HealthConnectClient.getOrCreate(context) else null
    } catch (e: Exception) { null }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", client() != null)
        call.resolve(ret)
    }

    @PluginMethod
    fun hasPermission(call: PluginCall) {
        val c = client() ?: return call.resolve(JSObject().put("granted", false))
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = c.permissionController.getGrantedPermissions().contains(readPermission)
                call.resolve(JSObject().put("granted", granted))
            } catch (e: Exception) {
                call.resolve(JSObject().put("granted", false))
            }
        }
    }

    @PluginMethod
    fun readSamples(call: PluginCall) {
        val start = call.getString("startDate") ?: return call.reject("startDate required")
        val end = call.getString("endDate") ?: return call.reject("endDate required")
        val c = client() ?: return call.resolve(JSObject().put("samples", JSArray()))

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = c.permissionController.getGrantedPermissions().contains(readPermission)
                if (!granted) {
                    call.resolve(JSObject().put("samples", JSArray()))
                    return@launch
                }
                val req = ReadRecordsRequest(
                    recordType = BoneMassRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(Instant.parse(start), Instant.parse(end))
                )
                val response = c.readRecords(req)
                val arr = JSArray()
                response.records.forEach { r ->
                    val obj = JSObject()
                    obj.put("value", r.mass.inKilograms)
                    obj.put("startDate", r.time.toString())
                    obj.put("endDate", r.time.toString())
                    arr.put(obj)
                }
                call.resolve(JSObject().put("samples", arr))
            } catch (e: Exception) {
                call.reject(e.message ?: "BoneMass read failed", e)
            }
        }
    }
}
