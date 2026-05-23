-- ============================================================
-- Source unique de vérité : body_composition
-- ============================================================

-- 1. BACKFILL : recopier les valeurs de profiles vers body_composition
--    pour la date du jour si aucune ligne n'existe déjà.
INSERT INTO public.body_composition (
  user_id, recorded_at, weight_kg, body_fat_percent, muscle_mass_kg,
  active_calories_kcal, source
)
SELECT
  p.user_id,
  CURRENT_DATE,
  p.weight_kg,
  p.body_fat_percent,
  p.muscle_mass_kg,
  COALESCE(p.sport_calories_daily, 0),
  'manual'
FROM public.profiles p
WHERE p.weight_kg IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.body_composition b
    WHERE b.user_id = p.user_id AND b.recorded_at = CURRENT_DATE
  );

-- 2. Pour les lignes body_composition existantes où active_calories_kcal
--    est NULL mais sport_calories a une valeur, on consolide.
UPDATE public.body_composition
SET active_calories_kcal = sport_calories
WHERE active_calories_kcal IS NULL AND sport_calories IS NOT NULL AND sport_calories > 0;

-- 3. Suppression des colonnes dupliquées

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS weight_kg,
  DROP COLUMN IF EXISTS body_fat_percent,
  DROP COLUMN IF EXISTS muscle_mass_kg,
  DROP COLUMN IF EXISTS sport_calories_daily;

ALTER TABLE public.goals_history
  DROP COLUMN IF EXISTS weight_kg,
  DROP COLUMN IF EXISTS body_fat_percent;

ALTER TABLE public.body_composition
  DROP COLUMN IF EXISTS sport_calories;