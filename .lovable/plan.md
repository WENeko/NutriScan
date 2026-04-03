
## Phase 1 — Fixes critiques (cette session)
1. **Table `recipe_ingredients`** : Migration SQL pour lier ingrédients ↔ produit, permettre édition post-sauvegarde
2. **Budget Hebdo → Semaine calendaire** : Lundi-Dimanche au lieu de 7j glissants
3. **Radar unifié** : 12 axes identiques (Accueil + Évolution), échelle % objectif, interaction au clic
4. **Morphotypes dans le profil** : Sélecteur + questionnaire + impact sur le MB

## Phase 2 — Logique métier
5. **Portions scanner** : Ne plus forcer 100g, utiliser `serving_size_g` par défaut
6. **Switch Cru/Cuit** (ratio ×2.5) à l'ajout manuel
7. **Priorité calories brutes** : Utiliser `energy-kcal` d'OpenFoodFacts plutôt que recalcul P×4+G×4+L×9
8. **Infobulles pédagogiques** : Mifflin/Katch + niveaux d'activité

## Phase 3 — Fonctionnalités avancées
9. **Phases de prise de masse** : Sélecteur Initiale/Croissance/Stabilisation + estimation gain
10. **Switch compléments** : Saisie par unité/capsule (mg/mcg)

## Phase 4 — Infrastructure (à part)
11. **Migration Capacitor 8** : Changement majeur d'infrastructure, à traiter séparément car impacte tout le build Android
12. **Node 24** : Déjà en place
