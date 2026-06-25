-- Étape 1/2 : consolider tous les micronutriments dans les colonnes JSON (non destructif)

-- recipe_ingredients n'a pas encore de colonnes JSON : on les ajoute
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS nutrients_std jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nutrients_custom jsonb NOT NULL DEFAULT '{}'::jsonb;

-- meal_items : backfill nutrients_std depuis les colonnes individuelles (valeurs absolues)
-- On ne remplit que les lignes dont le JSON est vide pour ne pas écraser des données plus récentes.
UPDATE public.meal_items SET nutrients_std =
  jsonb_strip_nulls(jsonb_build_object(
    'fiber', NULLIF(fiber,0), 'sugar', NULLIF(sugar,0), 'saturated_fat', NULLIF(saturated_fat,0),
    'omega3_mg', NULLIF(omega3_mg,0), 'sodium_mg', NULLIF(sodium_mg,0), 'potassium_mg', NULLIF(potassium_mg,0),
    'magnesium_mg', NULLIF(magnesium_mg,0), 'calcium_mg', NULLIF(calcium_mg,0), 'iron_mg', NULLIF(iron_mg,0),
    'zinc_mg', NULLIF(zinc_mg,0), 'vitamin_c_mg', NULLIF(vitamin_c_mg,0), 'vitamin_d_mcg', NULLIF(vitamin_d_mcg,0),
    'vitamin_b9_mcg', NULLIF(vitamin_b9_mcg,0), 'vitamin_b12_mcg', NULLIF(vitamin_b12_mcg,0),
    'vitamin_e_mg', NULLIF(vitamin_e_mg,0), 'vitamin_b_mg', NULLIF(vitamin_b_mg,0)
  ))
WHERE nutrients_std IS NULL OR nutrients_std = '{}'::jsonb;

-- custom_foods : fusionner colonnes per_100g -> nutrients_std (le JSON existant a priorité)
UPDATE public.custom_foods SET nutrients_std =
  jsonb_strip_nulls(jsonb_build_object(
    'fiber', NULLIF(fiber_per_100g,0), 'sugar', NULLIF(sugar_per_100g,0), 'saturated_fat', NULLIF(saturated_fat_per_100g,0),
    'omega3_mg', NULLIF(omega3_mg_per_100g,0), 'sodium_mg', NULLIF(sodium_mg_per_100g,0), 'potassium_mg', NULLIF(potassium_mg_per_100g,0),
    'magnesium_mg', NULLIF(magnesium_mg_per_100g,0), 'calcium_mg', NULLIF(calcium_mg_per_100g,0), 'iron_mg', NULLIF(iron_mg_per_100g,0),
    'zinc_mg', NULLIF(zinc_mg_per_100g,0), 'vitamin_c_mg', NULLIF(vitamin_c_per_100g,0), 'vitamin_d_mcg', NULLIF(vitamin_d_per_100g,0),
    'vitamin_b9_mcg', NULLIF(vitamin_b9_mcg_per_100g,0), 'vitamin_b12_mcg', NULLIF(vitamin_b12_mcg_per_100g,0),
    'vitamin_e_mg', NULLIF(vitamin_e_per_100g,0), 'vitamin_b_mg', NULLIF(vitamin_b_per_100g,0)
  )) || COALESCE(nutrients_std, '{}'::jsonb);

-- recipe_ingredients : backfill nutrients_std depuis les colonnes per_100g
UPDATE public.recipe_ingredients SET nutrients_std =
  jsonb_strip_nulls(jsonb_build_object(
    'fiber', NULLIF(fiber_per_100g,0), 'sugar', NULLIF(sugar_per_100g,0), 'saturated_fat', NULLIF(saturated_fat_per_100g,0),
    'omega3_mg', NULLIF(omega3_mg_per_100g,0), 'sodium_mg', NULLIF(sodium_mg_per_100g,0), 'potassium_mg', NULLIF(potassium_mg_per_100g,0),
    'magnesium_mg', NULLIF(magnesium_mg_per_100g,0), 'calcium_mg', NULLIF(calcium_mg_per_100g,0), 'iron_mg', NULLIF(iron_mg_per_100g,0),
    'zinc_mg', NULLIF(zinc_mg_per_100g,0), 'vitamin_c_mg', NULLIF(vitamin_c_per_100g,0), 'vitamin_d_mcg', NULLIF(vitamin_d_per_100g,0),
    'vitamin_b9_mcg', NULLIF(vitamin_b9_mcg_per_100g,0), 'vitamin_b12_mcg', NULLIF(vitamin_b12_mcg_per_100g,0),
    'vitamin_e_mg', NULLIF(vitamin_e_per_100g,0), 'vitamin_b_mg', NULLIF(vitamin_b_per_100g,0)
  ))
WHERE nutrients_std IS NULL OR nutrients_std = '{}'::jsonb;