import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nutriscan.app',
  appName: 'NutriScan', // J'ai mis à jour le nom ici aussi
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // On laisse le bloc plugins vide ou on le supprime 
    // car les permissions sont gérées dans le Manifest.
    // Cela évite les mauvaises configurations de "nom".
  }
};

export default config;
