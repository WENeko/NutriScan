# Roadmap

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
