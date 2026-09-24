package com.nutriscan.app;

import android.os.Bundle;

import app.capgo.plugin.health.HealthPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(HealthPlugin.class);
    registerPlugin(BoneMassPlugin.class);
    registerPlugin(SportSamplesPlugin.class);
    registerPlugin(LocalAiGalleryPlugin.class);
    registerPlugin(NutriScanWidgetsPlugin.class);
    registerPlugin(AppSettingsPlugin.class);
    registerPlugin(NutritionWriterPlugin.class);
    registerPlugin(ApkUpdaterPlugin.class);
    registerPlugin(LayaVisionPlugin.class);

    super.onCreate(savedInstanceState);
  }
}
