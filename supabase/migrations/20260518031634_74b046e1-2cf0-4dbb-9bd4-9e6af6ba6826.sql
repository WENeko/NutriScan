-- 1. Ajout colonnes JSONB sur meal_items
ALTER TABLE public.meal_items
  ADD COLUMN IF NOT EXISTS nutrients_std jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nutrients_custom jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_meal_items_nutrients_std ON public.meal_items USING GIN (nutrients_std);
CREATE INDEX IF NOT EXISTS idx_meal_items_nutrients_custom ON public.meal_items USING GIN (nutrients_custom);

-- 2. Ajout colonne définitions custom sur profiles
-- Format: [{ "key":"choline_mg", "label":"Choline", "unit":"mg", "category":"vitamin", "goal":400 }]
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_nutrients jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Backfill nutrients_std à partir des colonnes existantes
-- Clés alignées sur NUTRIENTS_MASTER_LIST (src/utils/nutrition-logic.ts)
UPDATE public.meal_items
SET nutrients_std = jsonb_strip_nulls(jsonb_build_object(
  'fiber',            NULLIF(COALESCE(fiber,0), 0),
  'sugar',            NULLIF(COALESCE(sugar,0), 0),
  'saturated_fat',    NULLIF(COALESCE(saturated_fat,0), 0),
  'omega3_mg',        NULLIF(COALESCE(omega3_mg,0), 0),
  'sodium_mg',        NULLIF(COALESCE(sodium_mg,0), 0),
  'potassium_mg',     NULLIF(COALESCE(potassium_mg,0), 0),
  'magnesium_mg',     NULLIF(COALESCE(magnesium_mg,0), 0),
  'calcium_mg',       NULLIF(COALESCE(calcium_mg,0), 0),
  'iron_mg',          NULLIF(COALESCE(iron_mg,0), 0),
  'zinc_mg',          NULLIF(COALESCE(zinc_mg,0), 0),
  'vitamin_c_mg',     NULLIF(COALESCE(vitamin_c_mg,0), 0),
  'vitamin_d_mcg',    NULLIF(COALESCE(vitamin_d_mcg,0), 0),
  'vitamin_b9_mcg',   NULLIF(COALESCE(vitamin_b9_mcg,0), 0),
  'vitamin_b12_mcg',  NULLIF(COALESCE(vitamin_b12_mcg,0), 0),
  'vitamin_e_mg',     NULLIF(COALESCE(vitamin_e_mg,0), 0)
))
WHERE nutrients_std = '{}'::jsonb;