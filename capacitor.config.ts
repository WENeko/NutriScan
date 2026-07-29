import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nutriscan.app',
  appName: 'NutriScan',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Preferences: {
      // Stockage partagé lu par les widgets d'écran d'accueil
      group: 'NutriScanWidget'
    }
  }
};


export default config;
