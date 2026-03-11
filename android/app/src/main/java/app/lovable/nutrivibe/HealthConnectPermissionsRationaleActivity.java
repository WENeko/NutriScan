package app.lovable.nutrivibe;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

/**
 * This activity is launched when Health Connect needs to show
 * a permissions rationale to the user.
 */
public class HealthConnectPermissionsRationaleActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Simply finish — the rationale is handled in the WebView UI
        finish();
    }
}
