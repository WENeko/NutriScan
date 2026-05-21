package com.nutriscan.app;

import android.os.Bundle;

import app.capgo.plugin.health.HealthPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(HealthPlugin.class);
    registerPlugin(BoneMassPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
