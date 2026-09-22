# Roadmap NutriScan

## Mode Hybride ultra-rapide (Laya + Base locale + Micro-LLM)

- [x] Pipeline de détection Laya (plugin natif Android `LayaVision` + pont JS)
- [x] Table de référence nutritionnelle embarquée (macros + 15 micros standards)
- [x] Résolveur hybride : bibliothèque perso → table locale → Open Food Facts → micro-LLM local
- [x] Complétion des micronutriments custom par micro-LLM textuel ciblé
- [x] Mode hybride pour l'analyse **photo**
- [x] Mode hybride pour l'analyse **texte** (parseur déterministe de la saisie)
- [x] Intégration dans le moteur de routage (nouveau step `hybrid`, cascade + fallback)
- [x] Réglages : activation et priorité du mode hybride

## En attente / à valider sur appareil

- [ ] Test runtime sur Android : import d'un modèle de classification `.tflite` et mesure des latences
- [ ] Vérifier FileProvider + `file_paths.xml` pour le programme de mise à jour APK
