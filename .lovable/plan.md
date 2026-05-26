# Optimisation des calories sportives (Mode Scientifique)

## Objectif

Éliminer les doublons inter-applis (Strava, Garmin, Samsung Health, Google Fit…), lisser la dépense sportive sur 7 jours glissants, et clarifier l'ajustement de phase (% ou kcal absolu).

---

## 1. Schéma BDD (migration)

### Nouvelle table `sport_activity_samples`

Stocke les échantillons bruts importés (1 ligne / créneau / source), nécessaire pour le filtrage dynamique et la déduplication temporelle.


| colonne        | type        | rôle                                                |
| -------------- | ----------- | --------------------------------------------------- |
| id             | uuid PK     | &nbsp;                                              |
| user_id        | uuid        | RLS                                                 |
| source_package | text        | ex. `com.strava`, `com.google.android.apps.fitness` |
| source_name    | text        | nom lisible si fourni par HC                        |
| start_time     | timestamptz | début créneau                                       |
| end_time       | timestamptz | fin créneau                                         |
| value_kcal     | numeric     | brut                                                |
| recorded_date  | date        | jour local (index)                                  |
| created_at     | timestamptz | &nbsp;                                              |


UNIQUE (user_id, source_package, start_time, end_time) pour upsert idempotent.
RLS standard (auth.uid() = user_id).

### Profil

Ajouter dans `profiles` :

- `sport_allowed_sources` text[] DEFAULT '{}' — packages cochés
- `phase_adjust_mode` text DEFAULT 'percent' — `percent` | `absolute`
- `phase_adjust_value` numeric DEFAULT 0 — % ou kcal selon mode

Note : `body_composition.active_calories_kcal` reste la valeur **agrégée filtrée et lissée** du jour (source unique de vérité côté affichage). Les samples bruts servent au calcul.

---

## 2. Lecture Health Connect

`src/services/health-connect.ts` :

- Élargir `fetchSamples` pour conserver `sourcePackage` / `sourceName` (déjà retournés par `@capgo/capacitor-health` dans `sample.sourceBundleId` / `sourceName`).
- Nouveau type `ActiveCalorieSample { source_package, source_name, start, end, value_kcal }`.
- Lecture sur 30 jours (suffisant pour 7 jours glissants + buffer).
- Supprimer la logique "max(steps, totalCalories)" qui masquait le doublonnage : on n'utilise plus les pas comme proxy calorique (les apps de sport déclarent déjà leurs kcal).

## 3. Synchronisation

- Upsert tous les samples dans `sport_activity_samples`.
- Extraire la liste des `source_package` uniques rencontrés sur 30 j → exposée à l'UI.
- Recalcule des agrégats par jour : voir §4.

## 4. Logique de filtrage + dédup temporelle

Helper `aggregateSportCalories(samples, allowedSources, dayLocal)` :

1. Filtre `samples` sur `allowedSources`.
2. Trie par `start_time`.
3. Dédup : balayage chronologique, si un sample chevauche le précédent (start < prev.end), on ne garde que celui de plus grande valeur (l'autre est considéré comme doublon multi-appli sur la même séance).
4. Somme les kcal restants pour le jour local.

`smoothedDailySport(userId, today)` :

- Pour chacun des **7 derniers jours révolus** (today-7 … today-1), calcule l'agrégat ci-dessus.
- Moyenne = somme / 7.
- Met à jour `body_composition.active_calories_kcal` du jour `today` avec cette moyenne (pour affichage cohérent dashboard).

## 5. Formule Mode Scientifique

`src/utils/goals-calc.ts` :

```
BMR = Mifflin ou Katch
TDEE_base = BMR * facteur_activité_hors_sport
sport = moyenneSportiveQuotidienne (param, défaut 0)
ajustement = mode === 'percent'
   ? (TDEE_base + sport) * (value/100)
   : value
Calories = round(TDEE_base + sport + ajustement)
```

- Étendre `GoalsInput` avec `sport_daily_avg`, `phase_adjust_mode`, `phase_adjust_value`.
- Garder rétro-compat : si non fournis, retombe sur l'ancien `GOAL_MODIFIERS` actuel.

## 6. Bridage du niveau d'activité

Dans `ProfilePage.tsx` (section Activité) et `DataSourcesSettings.tsx` :

- Si `sport_allowed_sources.length > 0` ET `sync_calories === true` → seules les options `sedentary` (×1.2) et `lightly_active` (×1.4, nouvelle) sont sélectionnables. `moderate` / `athletic` désactivées + tooltip "Désactive l'import sportif pour utiliser ce niveau".
- Ajouter `lightly_active` (1.4) dans `ACTIVITY_LEVELS` (ProfilePage + goals-calc).

## 7. UI

`DataSourcesSettings.tsx` — nouvelle carte **Calories Sportives** sous le switch `sync_calories` :

- Liste les `source_package` détectés sur 30 j (chargés depuis `sport_activity_samples`).
- Switch par source, persisté dans `profiles.sport_allowed_sources`.
- Message vide si aucune source détectée → inviter à synchroniser.

`ProfilePage.tsx` — section "Activité & Objectif" :

- Sélecteur `phase_adjust_mode` (Pourcentage / Kcal absolu).
- Input `phase_adjust_value` (±) avec validation.
- Affichage de la moyenne sportive 7j (lecture seule).
- Bridage des activity levels comme décrit ci-dessus.

## 8. Dashboard

`src/pages/Dashboard.tsx` :

- Remplacer le calcul actuel `smoothedGoal = (baseCalories*7 + weekSportTotal)/7` par : utiliser directement `goals.calories` qui inclut déjà la moyenne 7 j (calculée à la sauvegarde / à la synchro).
- Affiche un petit badge "Sport moyen 7j : X kcal" sous l'objectif calorique.

## 9. Migrations & types

1. Migration SQL (table + colonnes).
2. Régénération auto de `src/integrations/supabase/types.ts` (automatique après migration).
3. Aucune donnée existante détruite ; les valeurs `active_calories_kcal` déjà présentes restent en base mais seront écrasées au prochain calcul lissé.

---

## Fichiers modifiés / créés

- `supabase/migrations/<ts>_sport_sources.sql` (nouveau)
- `src/services/health-connect.ts` (refonte lecture + sync sport)
- `src/services/sport-calories.ts` (nouveau — agrégation/dédup/moyenne 7j)
- `src/utils/goals-calc.ts` (formule étendue)
- `src/components/DataSourcesSettings.tsx` (UI sources)
- `src/components/ProfilePage.tsx` (UI phase + bridage activité)
- `src/pages/Dashboard.tsx` (utilise moyenne lissée déjà stockée)

## Points à confirmer avant code

1. **Bridage activité** : faut-il vraiment retirer `moderate`/`athletic` du sélecteur, ou juste afficher un avertissement ? (le brief dit "bride", je prends "désactive").
  ## Points à confirmer avant code
  1. **Bridage activité** : faut-il vraiment retirer `moderate`/`athletic` du sélecteur, ou juste afficher un avertissement ? (le brief dit "bride", je prends "désactive").
  2. **Pas (steps)** : OK pour les retirer du calcul kcal puisqu'ils créent du double comptage avec les apps de sport ? Oui
  3. **Niveau** `lightly_active` **(×1.4)** : nouveau niveau à ajouter ou suffit `sedentary` seul quand sport activé ?
    &nbsp;
2. **Pas (steps)** : OK pour les retirer du calcul kcal puisqu'ils créent du double comptage avec les apps de sport ? Oui
  &nbsp;
3. **Niveau** `lightly_active` **(×1.35)** : nouveau niveau à ajouter ou suffit `sedentary` seul quand sport activé ?
  Oui, ajoute ce niveau. C'est la "Baseline" indispensable pour les personnes ayant un travail debout (vendeurs, serveurs) qui ont une dépense physique quotidienne de base élevée, mais sans activité sportive.
  Lorsque la synchronisation sportive est active, l'utilisateur doit pouvoir choisir uniquement entre Sédentaire (1.2) et Légèrement actif (1.35).