import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { readVersionFile, computeVersion } from "./scripts/version.mjs";

// Source de vérité : android/version.properties (généré par scripts/generate-version.mjs)
const { versionName, versionCode } = readVersionFile() ?? computeVersion();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // IMPORTANT: Base relative pour Capacitor (Android/iOS)
  base: mode === 'production' ? './' : '/',
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Injection globale de la version (CalVer)
  define: {
    __APP_VERSION__: JSON.stringify(versionName),
    __APP_VERSION_CODE__: JSON.stringify(String(versionCode)),
  },

  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "pwa-icon-192.png", "pwa-icon-512.png"],
      manifest: {
        name: "NutriScan — Suivi Nutritionnel",
        short_name: "NutriScan",
        description: "Suivi nutritionnel intelligent avec analyse IA et micronutriments",
        theme_color: "#33a06f",
        background_color: "#f5faf7",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "pwa-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
        navigateFallbackDenylist: [/^\/~oauth/],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
