package com.nutriscan.app;
import android.app.Activity;
import android.os.Bundle;

public class HealthConnectPermissionsRationaleActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // On ferme immédiatement, c'est juste pour valider le contrat Android
        finish(); 
    }
}
