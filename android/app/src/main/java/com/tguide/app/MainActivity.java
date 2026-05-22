package com.tguide.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Enable edge-to-edge on Android < 15 so the WebView extends behind the
        // status bar and env(safe-area-inset-top) is correctly reported to CSS.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
        // Programmatic failsafe — hide the action bar regardless of theme resolution.
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
    }
}
