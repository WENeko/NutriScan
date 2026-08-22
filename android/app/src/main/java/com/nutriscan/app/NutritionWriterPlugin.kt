package com.nutriscan.app

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
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
 * Plugin Capacitor custom pour ÉCRIRE les nutriments d'un repas dans
 * Health Connect via NutritionRecord. @capgo/capacitor-health n'expose
 * pas l'écriture des nutriments — d'où ce plugin natif.
 *
 * Stratégie de mise à jour : delete-then-insert (indépendant de la
 * version de l'API). deleteMealWindow ne supprime que les records
 * appartenant à cette application (garanti par Health Connect).
 */
@CapacitorPlugin(name = "NutritionWriter")
class NutritionWriterPlugin : Plugin() {

    private val writePerm = HealthPermission.getWritePermission(NutritionRecord::class)

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
                call.resolve(JSObject().put("granted", g.contains(writePerm)))
            } catch (e: Exception) {
                call.resolve(JSObject().put("granted", false))
            }
        }
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent = contract.createIntent(context, setOf(writePerm))
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
            call.resolve(JSObject().put("granted", g.contains(writePerm)))
        } catch (e: Exception) {
            call.resolve(JSObject().put("granted", false))
        }
    }

    private fun d(call: PluginCall, key: String): Double = call.getDouble(key) ?: 0.0

    /**
     * Écrit (upsert) un repas dans Health Connect.
     * Tous les champs nutriments sont en grammes (kcal en kilocalories),
     * conformément au constructeur data-class NutritionRecord.
     */
    @PluginMethod
    fun writeMeal(call: PluginCall) {
        val startIso = call.getString("startTime")
            ?: return call.reject("startTime required")
        val c = client()
            ?: return call.resolve(JSObject().put("ok", false).put("error", "unavailable"))
        val endIso = call.getString("endTime") ?: startIso

        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!c.permissionController.getGrantedPermissions().contains(writePerm)) {
                    call.resolve(JSObject().put("ok", false).put("error", "no_permission"))
                    return@launch
                }
                val start = Instant.parse(startIso)
                val end = Instant.parse(endIso)

                val record = NutritionRecord(
                    startTime = start,
                    endTime = end,
                    startZoneOffset = null,
                    endZoneOffset = null,
                    kcal = d(call, "kcal"),
                    kcalFromFat = d(call, "kcalFromFat"),
                    proteinGrams = d(call, "proteinGrams"),
                    totalCarbohydrateGrams = d(call, "totalCarbohydrateGrams"),
                    totalFatGrams = d(call, "totalFatGrams"),
                    dietaryFiberGrams = d(call, "dietaryFiberGrams"),
                    sugarGrams = d(call, "sugarGrams"),
                    saturatedFatGrams = d(call, "saturatedFatGrams"),
                    sodiumGrams = d(call, "sodiumGrams"),
                    potassiumGrams = d(call, "potassiumGrams"),
                    magnesiumGrams = d(call, "magnesiumGrams"),
                    calciumGrams = d(call, "calciumGrams"),
                    ironGrams = d(call, "ironGrams"),
                    zincGrams = d(call, "zincGrams"),
                    vitaminCGrams = d(call, "vitaminCGrams"),
                    vitaminDGrams = d(call, "vitaminDGrams"),
                    folateGrams = d(call, "folateGrams"),
                    vitaminB12Grams = d(call, "vitaminB12Grams"),
                    vitaminEGrams = d(call, "vitaminEGrams"),
                    name = call.getString("name"),
                    mealType = call.getString("mealType") ?: MealType.UNKNOWN,
                )
                c.insertRecords(listOf(record))
                call.resolve(JSObject().put("ok", true))
            } catch (e: Exception) {
                call.resolve(
                    JSObject().put("ok", false).put("error", e.message ?: "write failed")
                )
            }
        }
    }

    /**
     * Supprime les NutritionRecord de cette app dans la fenêtre temporelle
     * [startDate, endDate]. Health Connect filtre automatiquement pour ne
     * toucher que les records écrits par l'application appelante.
     */
    @PluginMethod
    fun deleteMealWindow(call: PluginCall) {
        val startIso = call.getString("startDate")
            ?: return call.reject("startDate required")
        val endIso = call.getString("endDate")
            ?: return call.reject("endDate required")
        val c = client()
            ?: return call.resolve(JSObject().put("ok", false).put("error", "unavailable"))

        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!c.permissionController.getGrantedPermissions().contains(writePerm)) {
                    call.resolve(JSObject().put("ok", false).put("error", "no_permission"))
                    return@launch
                }
                val range = TimeRangeFilter.between(Instant.parse(startIso), Instant.parse(endIso))
                c.deleteRecords(NutritionRecord::class, range)
                call.resolve(JSObject().put("ok", true))
            } catch (e: Exception) {
                call.resolve(
                    JSObject().put("ok", false).put("error", e.message ?: "delete failed")
                )
            }
        }
    }
}
