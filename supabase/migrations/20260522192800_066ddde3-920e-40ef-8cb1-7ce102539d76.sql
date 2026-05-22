
-- 1. Ajouter colonnes manquantes
ALTER TABLE public.body_composition
  ADD COLUMN IF NOT EXISTS bone_mass_kg numeric,
  ADD COLUMN IF NOT EXISTS lean_mass_kg numeric,
  ADD COLUMN IF NOT EXISTS active_calories_kcal numeric;

-- 2. Nettoyer doublons body_composition (garder le plus récent)
DELETE FROM public.body_composition a
USING public.body_composition b
WHERE a.user_id = b.user_id
  AND a.recorded_at = b.recorded_at
  AND a.created_at < b.created_at;

-- 3. Nettoyer doublons goals_history
DELETE FROM public.goals_history a
USING public.goals_history b
WHERE a.user_id = b.user_id
  AND a.recorded_at = b.recorded_at
  AND a.created_at < b.created_at;

-- 4. Contraintes UNIQUE
ALTER TABLE public.body_composition
  DROP CONSTRAINT IF EXISTS body_composition_user_day_unique;
ALTER TABLE public.body_composition
  ADD CONSTRAINT body_composition_user_day_unique UNIQUE (user_id, recorded_at);

ALTER TABLE public.goals_history
  DROP CONSTRAINT IF EXISTS goals_history_user_day_unique;
ALTER TABLE public.goals_history
  ADD CONSTRAINT goals_history_user_day_unique UNIQUE (user_id, recorded_at);
