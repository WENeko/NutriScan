package com.nutriscan.app

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.nutriscan.app.widgets.WidgetCommon

/** Pont JS -> natif pour rafraîchir les widgets après une synchronisation de données. */
@CapacitorPlugin(name = "NutriScanWidgets")
class NutriScanWidgetsPlugin : Plugin() {

  @PluginMethod
  fun refresh(call: PluginCall) {
    try {
      WidgetCommon.refreshAll(context)
      call.resolve()
    } catch (t: Throwable) {
      call.reject(t.message ?: "widget refresh failed")
    }
  }
}
