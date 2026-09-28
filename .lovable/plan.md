# Cyclage calorique hebdomadaire

## Objectif
Permettre à l'utilisateur de répartir son budget calorique différemment selon les jours de la semaine (ex. jours d'entraînement plus hauts, jours de repos plus bas), tout en gardant la moyenne hebdomadaire identique à son objectif calculé. Simple : un interrupteur, un réglage par jour, tout le reste est automatique.

## Principe
- L'objectif de base (calculé ou manuel) reste la **moyenne hebdomadaire**.
- L'utilisateur ajuste chaque jour avec un curseur ou des presets ; l'app **re-normalise automatiquement** pour que la somme des 7 jours = 7 × objectif de base. Pas de calcul mental.
- Les macros (protéines/glucides/lipides) suivent la même proportion que le jour de base, sauf les protéines qui restent fixes (g/kg) — c'est la pratique standard du cyclage.

## Modifications

### 1. Base de données — `profiles`
Nouvelle colonne `calorie_cycling` jsonb (défaut `{enabled: false, multipliers: [1,1,1,1,1,1,1]}`) :
- `enabled` : cyclage actif ou non
- `multipliers` : 7 coefficients (lundi→dimanche), normalisés à moyenne 1.0

Migration avec GRANTs inutile (colonne sur table existante, policies déjà en place).

### 2. Logique — `src/utils/goals-calc.ts`
- `applyCycling(baseGoals, cycling, dayOfWeek)` : retourne les objectifs du jour (calories × coefficient du jour, protéines inchangées, glucides/lipides ajustés proportionnellement au reste calorique).
- `normalizeMultipliers(m)` : ramène la moyenne à 1.0.

### 3. Réglages — nouveau `CyclingEditor.tsx` (dans la section Objectifs du profil)
- Interrupteur « Cyclage calorique ».
- 7 lignes (Lun→Dim) avec slider −30 % → +30 % et valeur en kcal affichée en direct.
- Presets en un tap : « Training/Repos » (jours de sport +20 %), « 5/2 léger », « Réinitialiser ».
- Bandeau de contrôle : « Moyenne hebdo : 2 450 kcal ✓ » toujours exacte grâce à la normalisation.
- Le jour de pesée configuré est mis en évidence visuellement.

### 4. Application au quotidien
- Dashboard, anneau de progression, widget Android et budget hebdo utilisent l'objectif **du jour** via `applyCycling`.
- `goals_history` continue d'enregistrer l'objectif réellement appliqué chaque jour (traçabilité déjà en place).
- Coach IA : le contexte repas inclut l'objectif du jour cyclé.

### 5. Widget Android
- `WidgetDataStore` reçoit l'objectif du jour déjà calculé côté JS (aucune logique native à dupliquer).

## Vérification
- Activer le cyclage, modifier un jour → la moyenne hebdo reste exactement égale à l'objectif de base.
- Changer de jour dans l'historique → l'anneau affiche l'objectif du jour correspondant.
- Cyclage désactivé → comportement identique à aujourd'hui (aucune régression).

## Hors périmètre
- Pas de cyclage automatique basé sur les séances sport détectées (évolution future possible).
- Pas de cyclage des micronutriments.
