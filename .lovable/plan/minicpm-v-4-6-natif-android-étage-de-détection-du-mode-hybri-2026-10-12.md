# MiniCPM-V 4.6 natif Android — étage de détection du mode hybride

## Objectif
Ajouter MiniCPM-V 4.6 (GGUF + mmproj) comme **détecteur alternatif** dans le mode hybride uniquement. Le VLM ne fait que la perception (aliments + grammes estimés). Nutriments : résolveur existant (bibliothèque → CIQUAL → OFF). Distance : `portionScaling.ts`. Mode local (LiteRT) et autres modes inchangés.

## Ce que l'utilisateur verra
- Réglages > Modèle hybride : choix du détecteur « Laya ONNX » ou « MiniCPM-V (VLM local) ».
- Import en deux étapes : fichier modèle (`MiniCPM-V-4_6-Q4_K_M.gguf`) puis projecteur (`mmproj ... F16.gguf`), avec taille affichée et bouton Supprimer.
- Pendant l'analyse : étape « Détection (VLM) » avec durée réelle ; badge du détecteur sur le résultat.
- Si le VLM échoue/plante : message clair, l'app reste ouverte, repli possible sur Laya.

## Architecture

```text
Photo ─▶ LocalVlmPlugin (process principal, simple proxy)
          └─▶ LocalVlmService (process séparé :vlm)
                └─▶ libnutrivlm.so (JNI) ─▶ llama.cpp + mtmd (mmproj)
          ◀── JSON [{ingredient, weight_g, count?}]
─▶ hybridAnalysisService (étage 1 = VLM)
─▶ portionScaling (distance) ─▶ nutritionResolver ─▶ résultat standard
```

## Détails techniques
1. **Natif (C++)** : llama.cpp en sous-module `android/app/src/main/cpp/llama.cpp` (tag figé), `CMakeLists.txt` + `nutrivlm_jni.cpp` exposant `loadModels(model, mmproj, nThreads, nCtx)`, `analyze(imageBytes, prompt, maxTokens)`, `unload()`. Utilise l'API `mtmd` (multimodal) de llama.cpp. ABI `arm64-v8a` seule, `-O3`, CPU (pas de GPU au départ).
2. **Gradle** : `externalNativeBuild { cmake }`, `ndkVersion` figé, `abiFilters 'arm64-v8a'`. ProGuard : `-keep class com.nutriscan.app.vlm.** { *; }` (méthodes JNI).
3. **Isolation** : `LocalVlmService` dans le process `:vlm` (même règle que Laya ONNX) via Messenger/AIDL ; un crash/OOM natif ne ferme pas l'app. Timeout 60 s, modèles gardés en mémoire 5 min puis libérés.
4. **Plugin Capacitor** `LocalVlm` : `isAvailable`, `importModel({kind:'model'|'mmproj'})`, `listModels`, `deleteModel`, `analyze({image, prompt})`, `getDiagnostics`. Enregistré dans `MainActivity`.
5. **JS** : `src/services/hybrid/localVlm.ts` (bridge + parse JSON tolérant, normalisation noms → `FoodQuery`), réglage du détecteur stocké localement, branchement dans `analyzeMealHybrid` (étage détection), `allowMicroLlm` reste `false`.
6. **Prompt** strict JSON (noms d'aliments en français + grammes + nombre de pièces), température 0, max ~256 tokens.
7. **CI** : `android_build.yml` installe NDK + CMake et initialise le sous-module.
8. **Tests** : parseur JSON VLM (sortie valide, JSON entouré de texte, poids absents → défaut, aliments en double).
9. **AGENTS.md** : règle « inférence VLM uniquement dans le process `:vlm` ».

## Limites connues
- Compilation et test réels uniquement sur téléphone (recompilation APK requise ; build CI plus long, ~+10 min).
- Prévoir ≥ 6–8 Go de RAM ; latence attendue plusieurs secondes, à mesurer.
- Compatibilité exacte du GGUF MiniCPM-V 4.6 avec la version de llama.cpp figée à vérifier au premier essai.

## Complétion des micronutriments manquants
Après le résolveur actuel (bibliothèque → CIQUAL → OFF), pour chaque aliment, seules les cases micronutriments encore vides passent dans une cascade :
1. **USDA FoodData Central** (domaine public, très complet en micros) via une fonction backend avec clé gratuite ; correspondance par nom traduit + catégorie.
2. **Fichier canadien des éléments nutritifs (CNF)** (licence ouverte Canada), même logique.
3. **Passe IA ciblée** : un seul appel par repas, ne recevant que la liste des aliments, leurs grammes et les clés manquantes ; elle ne peut remplir que ces cases (jamais calories/macros ni valeurs déjà résolues). Valeurs bornées (plafonds physiologiques par 100 g) et marquées « estimé IA ».
- Chaque valeur garde sa source (badge par nutriment : CIQUAL, OFF, USDA, CNF, IA).
- La passe IA est un réglage explicite (activé par défaut ou non, à votre choix) et utilise l'IA cloud par défaut, ou le VLM local si sélectionné — sans jamais réactiver le mode local LiteRT.
- Tests : une valeur CIQUAL n'est jamais écrasée ; l'IA ne touche que les clés manquantes ; valeur aberrante rejetée.
