import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nutriscan.app',
  appName: 'NutriScan',
  webDir: 'dist',
  // DESACTIVE pour test build statique pur (pas de live reload)
  // server: {
  //   androidScheme: 'https'
  // },
  plugins: {}
};

export default config;
