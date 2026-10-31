# Roadmap

- [x] Priorité IQM — Option A : moteur pur de qualité nutritionnelle et tests (ratios, profils, contexte sportif, données manquantes)
- [x] Option A : import santé au démarrage et à chaque reprise, délai de 60 s, aucun import concurrent ; lissage sur J-7 à J-1 en dates locales (40 tests ciblés, contrôle Paris/Los Angeles)
- [ ] Validation de l'import réel sur Android — bloqué : aucun appareil Android disponible ; validation connectée indisponible sans compte utilisateur identifié

## Phase suivante
- [x] Persistance des profils IQM et des contextes pré/intra/post-effort (profil indépendant des objectifs caloriques)
- [x] Suggestions sportives confirmables sans modifier les choix manuels (pré 60 min / post 120 min)
- [x] Badges IQM repas/journée et jauges sucres/fibres/saturés avec données partielles explicites ; fibres séparées pour éviter de mélanger les conventions UE/US
- [x] Recalcul à la création et après modification ; conserver les zéros mesurés sans créer de valeurs manquantes
- [ ] Parcours connecté création/modification/profil — bloqué : aucune session ; la connexion automatique ne trouve pas de compte correspondant au demandeur
- [x] Cibles qualitatives par profil (calcul + tests)
- [x] Objectifs du profil affichés sur le tableau de bord ; glucides prioritaires les jours d’entraînement du cyclage

## Travaux précédents

- [x] Désactiver la génération automatique d’APK à chaque commit ; conserver le lancement manuel GitHub Actions et vérifier les déclencheurs
- [ ] Finaliser le plan nutrition hybride cloud : recherche OFF actuelle, catalogue USDA Survey, références uniquement vérifiées et contrôle gnocchi/plats composés

- [x] Résolveur cloud : sélection tolérante (index/ID), cuisson générique acceptée
- [x] Cyclage : puces jours d'entraînement, détection multi-sources, curseurs verrouillables
- [x] Choix rapides pour aliments incertains (ex. viande) + saisie libre, re-résolution officielle
- [ ] Réorganiser les réglages (déficit/surplus près du budget) — mis de côté à la demande de l'utilisateur
- [ ] Vérifier ces trois points dans l'appli connectée — bloqué : aucune session utilisateur ici


- [x] Préserver les repas hybrides cloud partiellement résolus et afficher les aliments non résolus et le total partiel
- [x] Améliorer les recherches OFF/USDA sans perdre la cuisson lors de la sélection ; ajouter citron et lentilles USDA vérifiés cloud-only
- [x] Tester et déployer le correctif hybride cloud

- [x] Remplacer l’appariement hybride cloud par une sélection sémantique de fiches existantes, sans modifier noms/portions ni le cloud classique
- [x] Tester et déployer la sélection et la complétion sans chiffres générés (sélection IA réelle vérifiée ; parcours connecté bloqué sans compte identifié)

- [x] Terminer le switch hybride cloud indépendant et réutiliser la cascade cloud existante
- [x] Ajouter USDA après bibliothèque / CIQUAL / OFF et conserver les listes de micros dynamiques
- [x] Déployer analyze-meal, resolve-usda et complete-micros ; tests de routage/résolution/complétion réussis
- [ ] Vérifier la persistance du switch et une analyse cloud réelle dans l’interface — bloqué : aucune session utilisateur disponible ; connexion dans l’aperçu nécessaire

- [x] Finaliser les tests FoodSeg103 et vérifier le modèle réel sur la photo du plateau (détections incorrectes constatées)
- [x] Intégrer le décodeur ONNX YOLO26l FoodSeg103 et ses masques dans le processus :laya
- [x] Relier les classes, portions estimatives et sélection du détecteur au mode hybride
- [x] Tester les contrats de détection et résolution ; documenter les limites de validation Android
- [ ] Valider l’import et l’analyse dans l’application Android sur Xiaomi 13T Pro — bloqué : aucun appareil Android disponible ici

- [x] Capture en direct via Camera2 natif (LENS_FOCUS_DISTANCE au déclenchement)
- [x] Badge distance sur la photo (caméra + galerie) avec affichage au clic
- [x] Correction manuelle de la distance par l'utilisateur
- [x] Normalisation optique (recadrage vers ~40 cm Nutrition5k) avant inférence ONNX
- [x] Distance Camera2 transmise même sur capteur « uncalibrated » ; masse ≤ 2 g traitée comme inconnue
- [x] MiniCPM-V 4.6 natif (llama.cpp, process :vlm) comme détecteur du mode hybride
- [x] Complétion micronutriments : sources supplémentaires (USDA FoodData Central, Fichier canadien CNF) puis passe IA ciblée sur les seules cases vides
- [ ] Badge de source par micronutriment dans le détail du repas
- [x] Accélération GPU Vulkan avec détection de compatibilité et repli CPU automatique
- [x] Prompts de détection compressés : expert (GPU) et court (CPU)
