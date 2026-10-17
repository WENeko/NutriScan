# Roadmap

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
