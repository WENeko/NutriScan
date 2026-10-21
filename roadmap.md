# Roadmap

- [ ] Terminer le switch hybride cloud indépendant et réutiliser la cascade cloud existante
- [ ] Ajouter USDA après bibliothèque / CIQUAL / OFF et conserver les listes de micros dynamiques
- [ ] Déployer la détection cloud dédiée et vérifier switch, résolution et complétion

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
