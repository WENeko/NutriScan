# Widgets d'écran d'accueil NutriScan

3 widgets : **Caméra / Bibliothèque**, **Favoris rapides**, **Aperçu macros du jour**.

## Données partagées

Le web écrit via `src/services/widgetSyncService.ts` :

- clé `widget_data`, groupe `NutriScanWidget`
- Android : `SharedPreferences` fichier `NutriScanWidget`
- iOS : App Group `group.com.nutriscan.app`

Structure : `{ daily_summary: {...}, favorite_meals: [...], updated_at }`.

La synchronisation est déclenchée à chaque `fetchData()` du Dashboard (ajout/suppression de repas, changement d'objectifs, bascule d'un favori).

## Deep links

| URL | Action |
| --- | --- |
| `nutriscan://scan?source=camera` | ouvre l'appareil photo |
| `nutriscan://scan?source=gallery` | ouvre le sélecteur de photos |
| `nutriscan://quicklog?meal_id=<uuid>` | enregistre le favori via l'edge function `quick-log-favorite` |
| `nutriscan://dashboard` | ouvre le journal de bord |

Équivalent web/PWA : `?widget=scan&source=camera`, `?widget=quicklog&meal_id=...`.

## Android (déjà intégré)

- `android/app/src/main/java/com/nutriscan/app/widgets/` : `WidgetDataStore.kt`, `NutriScanWidgets.kt` (3 `AppWidgetProvider`)
- `NutriScanWidgetsPlugin.kt` : méthode `refresh()` appelée depuis le web
- layouts `res/layout/widget_*.xml`, métadonnées `res/xml/widget_*_info.xml`
- receivers + intent-filter `nutriscan://` déclarés dans `AndroidManifest.xml`

Après `git pull` : `npm install && npx cap sync android`.

## iOS (structure prête, à finaliser dans Xcode)

1. `npx cap add ios`
2. Xcode → File → New → Target → **Widget Extension**, nom `NutriScanWidgets`, décocher "Include Configuration Intent".
3. Remplacer le fichier généré par `ios/App/NutriScanWidgets/NutriScanWidgets.swift`.
4. Ajouter la capability **App Groups** (`group.com.nutriscan.app`) sur la cible **App** *et* sur la cible **NutriScanWidgets**.
5. Dans `capacitor.config.ts`, le plugin Preferences est configuré avec le groupe `NutriScanWidget` ; côté iOS, mapper ce groupe sur le suite name `group.com.nutriscan.app`.
6. Déclarer le scheme `nutriscan` dans `Info.plist` (`CFBundleURLTypes`).
7. Pour rafraîchir depuis le web, implémenter le plugin `NutriScanWidgets.refresh()` en Swift avec `WidgetCenter.shared.reloadAllTimelines()`.
