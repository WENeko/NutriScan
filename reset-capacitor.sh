#!/bin/bash
# RESET COMPLET CAPACITOR - Résolution écran blanc
# Usage: chmod +x reset-capacitor.sh && ./reset-capacitor.sh

echo "🧹 NETTOYAGE COMPLET DU PROJET CAPACITOR"
echo "=========================================="

# 1. Nettoyage complet
echo "📁 Suppression des dossiers générés..."
rm -rf node_modules
rm -rf dist
rm -rf android
rm -rf ios
rm -rf build
rm -rf .capacitor
rm -f package-lock.json
rm -f yarn.lock
rm -f bun.lockb

# 2. Réinstallation des dépendances
echo "📦 Réinstallation des dépendances..."
npm install

# 3. Build web avec base relative
echo "🔨 Build production avec chemins relatifs..."
npm run build

# 4. Vérification du build
echo "🔍 Vérification du dossier dist/..."
if [ ! -d "dist" ]; then
    echo "❌ ERREUR: Le dossier dist n'a pas été généré!"
    exit 1
fi

if [ ! -f "dist/index.html" ]; then
    echo "❌ ERREUR: dist/index.html manquant!"
    exit 1
fi

echo "✅ Contenu de dist/:"
ls -la dist/

echo ""
echo "📄 Premieres lignes de dist/index.html:"
head -30 dist/index.html

# 5. Ajout Android
echo ""
echo "🤖 Initialisation Android..."
npx cap add android

# 6. Synchronisation
echo ""
echo "🔄 Synchronisation Capacitor..."
npx cap sync android

# 7. Vérification des assets Android
echo ""
echo "📂 Vérification assets Android..."
ls -la android/app/src/main/assets/public/ 2>/dev/null || echo "⚠️  Dossier public/ vide ou inexistant"

echo ""
echo "=========================================="
echo "✅ RESET TERMINE!"
echo ""
echo "Prochaines étapes:"
echo "1. Ouvrir Android Studio: npx cap open android"
echo "2. Build > Build Bundle(s) / APK(s) > Build APK(s)"
echo "3. Run sur émulateur ou device"
echo ""
echo "Si écran blanc persiste, vérifiez:"
echo "- Logcat dans Android Studio ( View > Tool Windows > Logcat )"
echo "- L'erreur s'affichera en rouge sur l'écran grâce au script de debug"
echo "=========================================="
