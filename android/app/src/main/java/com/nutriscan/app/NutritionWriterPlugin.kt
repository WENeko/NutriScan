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

    private fun d(call: PluginCall, key: String): Double {
        val value = call.getDouble(key) ?: 0.0
        return if (value.isFinite() && value >= 0.0) value else 0.0
    }

    /** Mass en grammes, null si valeur nulle (champ optionnel non écrit). */
    private fun g(call: PluginCall, key: String): Mass? {
        val v = d(call, key)
        return if (v > 0.0) Mass.grams(v) else null
    }

    private fun kcal(call: PluginCall, key: String): Energy? {
        val v = d(call, key)
        return if (v > 0.0) Energy.kilocalories(v) else null
    }

    private fun mealTypeOf(value: String?): Int = when (value?.lowercase()) {
        "breakfast" -> MealType.MEAL_TYPE_BREAKFAST
        "lunch" -> MealType.MEAL_TYPE_LUNCH
        "dinner" -> MealType.MEAL_TYPE_DINNER
        "snack" -> MealType.MEAL_TYPE_SNACK
        else -> MealType.MEAL_TYPE_UNKNOWN
    }

    /**
     * Écrit un repas dans Health Connect.
     * Les nutriments arrivent en grammes, l'énergie en kilocalories.
     */
    @PluginMethod
    fun writeMeal(call: PluginCall) {
        val startIso = call.getString("startTime")
            ?: return call.reject("startTime required")
        val c = client()
            ?: return call.resolve(JSObject().put("ok", false).put("error", "unavailable"))
        val endIso = call.getString("endTime")
        val mealId = call.getString("mealId")?.takeIf { it.isNotBlank() }
            ?: return call.reject("mealId required")

        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!c.permissionController.getGrantedPermissions().contains(writePerm)) {
                    call.resolve(JSObject().put("ok", false).put("error", "no_permission"))
                    return@launch
                }
                var start = Instant.parse(startIso)
                val requestedEnd = if (endIso != null) Instant.parse(endIso) else start.plusSeconds(60)
                val now = Instant.now()
                val end = if (requestedEnd.isAfter(now)) now else requestedEnd
                // NutritionRecord exige startTime < endTime.
                if (!start.isBefore(end)) start = end.minusSeconds(60)

                val record = NutritionRecord(
                    startTime = start,
                    startZoneOffset = null,
                    endTime = end,
                    endZoneOffset = null,
                    metadata = Metadata.manualEntry(
                        clientRecordId = "nutriscan_meal_$mealId",
                        clientRecordVersion = System.currentTimeMillis(),
                    ),
                    energy = kcal(call, "kcal"),
                    energyFromFat = kcal(call, "kcalFromFat"),
                    protein = g(call, "proteinGrams"),
                    totalCarbohydrate = g(call, "totalCarbohydrateGrams"),
                    totalFat = g(call, "totalFatGrams"),
                    dietaryFiber = g(call, "dietaryFiberGrams"),
                    sugar = g(call, "sugarGrams"),
                    saturatedFat = g(call, "saturatedFatGrams"),
                    sodium = g(call, "sodiumGrams"),
                    potassium = g(call, "potassiumGrams"),
                    magnesium = g(call, "magnesiumGrams"),
                    calcium = g(call, "calciumGrams"),
                    iron = g(call, "ironGrams"),
                    zinc = g(call, "zincGrams"),
                    vitaminC = g(call, "vitaminCGrams"),
                    vitaminD = g(call, "vitaminDGrams"),
                    folate = g(call, "folateGrams"),
                    vitaminB12 = g(call, "vitaminB12Grams"),
                    vitaminE = g(call, "vitaminEGrams"),
                    name = call.getString("name"),
                    mealType = mealTypeOf(call.getString("mealType")),
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

    @PluginMethod
    fun deleteMealById(call: PluginCall) {
        val mealId = call.getString("mealId") ?: return call.reject("mealId required")
        val c = client() ?: return call.reject("Health Connect unavailable")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                c.deleteRecords(NutritionRecord::class, emptyList(), listOf("nutriscan_meal_$mealId"))
                call.resolve(JSObject().put("ok", true))
            } catch (e: Exception) {
                call.reject(e.message ?: "delete failed", e)
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
