package com.nutriscan.app

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord.ENERGY_TOTAL
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateRequest
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
 * Plugin Capacitor custom pour lire les échantillons de calories actives
 * Health Connect AVEC leur source d'origine (packageName), ce que
 * @capgo/capacitor-health n'expose pas. Indispensable pour le dédoublonnage
 * par source dans NutriScan.
 */
@CapacitorPlugin(name = "SportSamples")
class SportSamplesPlugin : Plugin() {

    private val activePerm = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
    private val totalPerm  = HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class)
    private val exoPerm    = HealthPermission.getReadPermission(ExerciseSessionRecord::class)

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
        val c = client() ?: return call.resolve(JSObject().put("granted", false))
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val g = c.permissionController.getGrantedPermissions()
                call.resolve(JSObject().put("granted",
                    g.contains(activePerm) || g.contains(totalPerm) || g.contains(exoPerm)))
            } catch (e: Exception) {
                call.resolve(JSObject().put("granted", false))
            }
        }
    }

    private suspend fun detectOrigins(c: HealthConnectClient, range: TimeRangeFilter): Set<DataOrigin> {
        val origins = mutableSetOf<DataOrigin>()
        try {
            if (c.permissionController.getGrantedPermissions().contains(activePerm)) {
                c.readRecords(ReadRecordsRequest(recordType = ActiveCaloriesBurnedRecord::class, timeRangeFilter = range))
                    .records.forEach { origins.add(it.metadata.dataOrigin) }
            }
        } catch (_: Exception) {}
        try {
            if (c.permissionController.getGrantedPermissions().contains(totalPerm)) {
                c.readRecords(ReadRecordsRequest(recordType = TotalCaloriesBurnedRecord::class, timeRangeFilter = range))
                    .records.forEach { origins.add(it.metadata.dataOrigin) }
            }
        } catch (_: Exception) {}
        try {
            if (c.permissionController.getGrantedPermissions().contains(exoPerm)) {
                c.readRecords(ReadRecordsRequest(recordType = ExerciseSessionRecord::class, timeRangeFilter = range))
                    .records.forEach { origins.add(it.metadata.dataOrigin) }
            }
        } catch (_: Exception) {}
        return origins
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent = contract.createIntent(context, setOf(activePerm, totalPerm, exoPerm))
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
            val g = contract.parseResult(result.resultCode, result.data)
            call.resolve(JSObject().put("granted",
                g.contains(activePerm) || g.contains(totalPerm) || g.contains(exoPerm)))
        } catch (e: Exception) {
            call.resolve(JSObject().put("granted", false))
        }
    }

    /**
     * Retourne un échantillon par enregistrement avec sa source :
     *   { samples: [{ source_package, source_name, start_time, end_time, value_kcal, type }] }
     * Les types lus :
     *   - "active"   = ActiveCaloriesBurnedRecord
     *   - "exercise" = ExerciseSessionRecord (kcal absentes : reportés à 0,
     *                  utile pour identifier les fenêtres d'exercice)
     */
    @PluginMethod
    fun readSamples(call: PluginCall) {
        val start = call.getString("startDate") ?: return call.reject("startDate required")
        val end   = call.getString("endDate")   ?: return call.reject("endDate required")
        val c = client() ?: return call.resolve(JSObject().put("samples", JSArray()))

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = c.permissionController.getGrantedPermissions()
                val range = TimeRangeFilter.between(Instant.parse(start), Instant.parse(end))
                val out = JSArray()

                if (granted.contains(activePerm)) {
                    val resp = c.readRecords(
                        ReadRecordsRequest(recordType = ActiveCaloriesBurnedRecord::class, timeRangeFilter = range)
                    )
                    resp.records.forEach { r ->
                        out.put(JSObject()
                            .put("source_package", r.metadata.dataOrigin.packageName)
                            .put("source_name",   r.metadata.dataOrigin.packageName)
                            .put("start_time",    r.startTime.toString())
                            .put("end_time",      r.endTime.toString())
                            .put("value_kcal",    r.energy.inKilocalories)
                            .put("type",          "active"))
                    }
                }

                if (granted.contains(totalPerm)) {
                    val resp = c.readRecords(
                        ReadRecordsRequest(recordType = TotalCaloriesBurnedRecord::class, timeRangeFilter = range)
                    )
                    resp.records.forEach { r ->
                        out.put(JSObject()
                            .put("source_package", r.metadata.dataOrigin.packageName)
                            .put("source_name",   r.metadata.dataOrigin.packageName)
                            .put("start_time",    r.startTime.toString())
                            .put("end_time",      r.endTime.toString())
                            .put("value_kcal",    r.energy.inKilocalories)
                            .put("type",          "total"))
                    }
                }

                if (granted.contains(activePerm) || granted.contains(totalPerm)) {
                    val origins = detectOrigins(c, range)
                    origins.forEach { origin ->
                        if (granted.contains(activePerm)) {
                            try {
                                val agg = c.aggregate(AggregateRequest(
                                    metrics = setOf(ACTIVE_CALORIES_TOTAL),
                                    timeRangeFilter = range,
                                    dataOriginFilter = setOf(origin)
                                ))
                                val kcal = agg[ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0
                                if (kcal > 0.0) {
                                    out.put(JSObject()
                                        .put("source_package", origin.packageName)
                                        .put("source_name", origin.packageName)
                                        .put("start_time", start)
                                        .put("end_time", end)
                                        .put("value_kcal", kcal)
                                        .put("type", "active_aggregate"))
                                }
                            } catch (_: Exception) {}
                        }

                        if (granted.contains(totalPerm)) {
                            try {
                                val agg = c.aggregate(AggregateRequest(
                                    metrics = setOf(ENERGY_TOTAL),
                                    timeRangeFilter = range,
                                    dataOriginFilter = setOf(origin)
                                ))
                                val kcal = agg[ENERGY_TOTAL]?.inKilocalories ?: 0.0
                                if (kcal > 0.0) {
                                    out.put(JSObject()
                                        .put("source_package", origin.packageName)
                                        .put("source_name", origin.packageName)
                                        .put("start_time", start)
                                        .put("end_time", end)
                                        .put("value_kcal", kcal)
                                        .put("type", "total_aggregate"))
                                }
                            } catch (_: Exception) {}
                        }
                    }
                }

                if (granted.contains(exoPerm)) {
                    val resp = c.readRecords(
                        ReadRecordsRequest(recordType = ExerciseSessionRecord::class, timeRangeFilter = range)
                    )
                    resp.records.forEach { r ->
                        out.put(JSObject()
                            .put("source_package", r.metadata.dataOrigin.packageName)
                            .put("source_name",   r.title ?: r.metadata.dataOrigin.packageName)
                            .put("start_time",    r.startTime.toString())
                            .put("end_time",      r.endTime.toString())
                            .put("value_kcal",    0)
                            .put("type",          "exercise"))
                    }
                }

                call.resolve(JSObject().put("samples", out))
            } catch (e: Exception) {
                call.reject(e.message ?: "read failed", e)
            }
        }
    }
}
