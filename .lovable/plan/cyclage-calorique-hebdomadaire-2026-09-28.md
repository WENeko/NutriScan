# Cyclage calorique hebdomadaire

&nbsp;

## Objectif

Permettre à l'utilisateur de répartir son budget calorique différemment selon les jours de la semaine (ex. jours d'entraînement plus hauts, jours de repos plus bas), tout en gardant la moyenne hebdomadaire identique à son objectif calculé. Simple : un interrupteur, un réglage par jour, tout le reste est automatique.

&nbsp;

## Principe

- L'objectif de base (calculé ou manuel) reste la **moyenne hebdomadaire**.

- L'utilisateur ajuste chaque jour avec un curseur ou des presets ; l'app **re-normalise automatiquement** pour que la somme des 7 jours = 7 × objectif de base. Pas de calcul mental.

- Les protéines restent strictes et fixes (g/kg). Le delta calorique du jour ($ON$ vs $OFF$) est absorbé à **80 % par les glucides** et **20 % par les lipides**, afin de privilégier la recharge en glycogène les jours d'entraînement et le contrôle de la sensibilité à l'insuline.

&nbsp;

## Modifications

&nbsp;

### 1. Base de données — `profiles`

Nouvelle colonne `calorie_cycling` jsonb (défaut `{enabled: false, multipliers: [1,1,1,1,1,1,1]}`) :

- `enabled` : cyclage actif ou non

- `multipliers` : 7 coefficients pour l'indexation ISO (Index 0 = Lundi, Index 6 = Dimanche), normalisés à moyenne 1.0.

&nbsp;

*Note : La colonne est ajoutée sur la table existante, les RLS policies déjà en place couvrent l'accès.*

&nbsp;

### 2. Logique — `src/utils/goals-calc.ts`

- `getIsoDayIndex(date: Date)` : convertit le jour JavaScript (`0` = Dimanche) vers l'indexation ISO (`0` = Lundi ... `6` = Dimanche) via `(date.getDay() + 6) % 7`.

- `normalizeMultipliers(m: number[])` : ramène la moyenne du tableau à 1.0 après édition.

- `applyCycling(baseGoals, cycling, date)` :

  1. Si `cycling.enabled` est `false`, renvoie `baseGoals`.

  2. Multiplie la cible calorique par le coefficient du jour ISO : `targetCalories = baseGoals.calories * multiplier`.

  3. Maintient `targetProtein = baseGoals.protein`.

  4. Répartit le delta calorique par rapport au jour de base ($\Delta \text{kcal} = \text{targetCalories} - \text{baseGoals.calories}$) :

     - $\Delta \text{carbs} = \frac{\Delta \text{kcal} \times 0.8}{4}$

     - $\Delta \text{fat} = \frac{\Delta \text{kcal} \times 0.2}{9}$

  5. Calcule les cibles finales de glucides et lipides en appliquant ce delta aux cibles de base (avec un plancher minimal de sécurité à $0.5\,\text{g/kg}$ pour les lipides).

&nbsp;

### 3. Réglages — `CyclingEditor.tsx` (section Objectifs du profil)

- Interrupteur « Cyclage calorique ».

- 7 lignes (Lundi → Dimanche) avec slider −30 % → +30 % et valeur en kcal affichée en direct.

- **Gestion UX du Drag :** La normalisation dynamique du tableau s'applique à la fin du mouvement (`onChangeEnd` / `onValueCommit`) pour éviter les sautements visuels sur les autres sliders pendant le glissement.

- Presets en 1-tap :

  - *« Training / Repos »* : jours de sport prédéfinis à +15 %, jours OFF ajustés.

  - *« 5/2 léger »* : 5 jours à +5 %, 2 jours à −12.5 %.

  - *« Réinitialiser »* : tous les coefficients remis à 1.0.

- Bandeau de contrôle : « Moyenne hebdo : 2 450 kcal ✓ » recalculée en direct.

- Mise en valeur visuelle du jour de pesée configuré.

&nbsp;

### 4. Application au quotidien & Traçabilité

- Dashboard, anneau de progression, widget Android et budget hebdo utilisent l'objectif **du jour** via `applyCycling`.

- `goals_history` enregistre l'objectif réellement appliqué lors de l'initialisation du journal quotidien (ce qui scelle l'historique des jours passés sans rétroactivité non désirée en cas de modification ultérieure du profil de cyclage).

- Coach IA : intègre l'objectif cyclé spécifique au jour dans le contexte repas.

&nbsp;

### 5. Widget Android

- `WidgetDataStore` reçoit la cible calorique du jour déjà calculée côté JS lors de la synchronisation (aucune duplication de la logique de cyclage en native/Kotlin).

&nbsp;

## Vérification

- Activer le cyclage et ajuster un slider → vérifier que la moyenne globale reste strictement égale à la valeur cible du profil.

- Déplacer la date courante sur l'application / changer de jour dans l'historique → vérifier la bonne correspondance de l'index ISO (ex: le dimanche correspond à l'index 6).

- Désactiver le cyclage → retour immédiat au comportement standard à objectifs fixes (aucune régression).

&nbsp;

&nbsp;

- Détecte automatiquement les jours habituels des séances de sport enregistrées à l'activation du mode cyclage calorique.

##Hors périmètre 

- Pas de cyclage sur les micronutriments.