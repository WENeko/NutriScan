## Objectif

1. Compléter le schéma `profiles` avec les flags personnels qui influencent les objectifs micronutriments en mode scientifique.
2. Exposer ces champs dans l'UI.
3. Découper la page Profil (très longue) en plusieurs sous-pages thématiques.

---

## 1. Base de données — table `profiles`

Ajouter (si absentes) les colonnes :

- `is_athlete boolean DEFAULT false` — surcharge le niveau d'activité pour les micros (Zinc, Mg, B12, Oméga-3…).
- `is_smoker boolean DEFAULT false` — augmente Vit. C et Vit. E.
- `is_pregnant boolean DEFAULT false` — augmente Fer, B9 (folates).
- `is_menopausal boolean DEFAULT false` — ajuste Calcium / Fer chez la femme.

> Migration unique, idempotente (`ADD COLUMN IF NOT EXISTS`). Pas de changement RLS, pas de données existantes touchées.

## 2. Logique de calcul

Mettre à jour `src/utils/nutrition-logic.ts` (`NutritionUserProfile` + `calculateMicroGoals`) et `normalizeUserProfile` pour propager ces nouveaux flags. Les règles déjà en place (`isAthlete`, `isSmoker`, `isPregnant`) deviennent pilotables. Ajout d'ajustements simples `is_menopausal` (Calcium 1200, Fer 8)

## 3. Découpage de la page Profil

Aujourd'hui `ProfilePage.tsx` ≈ 928 lignes, un seul écran scrollable. Proposition : conserver `ProfilePage` comme **menu / hub** et créer 5 sous-pages, chacune dans son propre composant et accessible via une simple navigation interne (state `subPage` + `ArrowLeft` pour revenir, sans changer le router actuel).

```text
Profil (hub)
├── 👤  Identité & Mensurations      → ProfileIdentity
│       date naissance, sexe, taille, poids, masse grasse, muscle
├── 🏃  Activité & Objectif corporel → ProfileActivity
│       activity_level, goal_type, morphotype, mass_gain_phase,
│       targets (poids/masse grasse/muscle), sport_calories_daily
├── ❤️  Santé & Mode de vie          → ProfileHealth      (NOUVEAU)
│       is_athlete, is_smoker, is_pregnant,is_menopausal
├── 🎯  Objectifs nutritionnels      → ProfileGoals
│       switch Scientifique / Manuel / Coach IA, BMR method,
│       édition macros, prompt IA, custom nutrients
└── ⚙️  Préférences & Rappels        → ProfileSettings
        thème, pesée (fréquence/jour/heure), data sources,
        bouton Sauvegarder global
```

Chaque sous-page :

- reçoit `profile` + `setProfile` + `onBack` en props,
- ne sauvegarde pas elle-même : le `Save` reste centralisé via le state partagé persisté au retour ou via un bouton « Enregistrer » présent dans le hub (pattern actuel conservé pour éviter une refonte de la logique `goals_history` / Health Connect).

Le hub liste les cartes cliquables avec icône + libellé + court résumé de la valeur courante (ex. « Activité : Sportif · Prise de muscle »).

## 4. UI nouveaux champs (page Santé & Mode de vie)

- Toggles (Switch) : athlète, fumeur, grossesse, ménopause.
- Chaque champ accompagné d'un `Info` tooltip expliquant l'impact sur les micros.

## 5. Détails techniques

- **Fichiers créés** : `src/components/profile/ProfileIdentity.tsx`, `ProfileActivity.tsx`, `ProfileHealth.tsx`, `ProfileGoals.tsx`, `ProfileSettings.tsx`.
- **Fichiers modifiés** : `src/components/ProfilePage.tsx` (devient hub léger), `src/utils/nutrition-logic.ts`, `src/utils/goals-calc.ts` (lecture des nouveaux flags pour mode scientifique).
- **Migration** : ajout colonnes + valeurs par défaut, aucun backfill nécessaire.
- **Types Supabase** : régénérés automatiquement après migration.
- **Compat** : tous les flags ont des défauts neutres, les calculs existants ne changent pas pour les utilisateurs actuels.

## Hors scope

- Pas de modification des graphiques d'évolution.
- Pas de changement du routeur global ni du `BottomNav`.
- Pas de refonte visuelle des autres pages.