UPDATE public.meal_items
SET nutrients_std = (
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'fiber',          NULLIF(COALESCE(fiber,0),0),
    'sugar',          NULLIF(COALESCE(sugar,0),0),
    'saturated_fat',  NULLIF(COALESCE(saturated_fat,0),0),
    'omega3_mg',      NULLIF(COALESCE(omega3_mg,0),0),
    'sodium_mg',      NULLIF(COALESCE(sodium_mg,0),0),
    'potassium_mg',   NULLIF(COALESCE(potassium_mg,0),0),
    'magnesium_mg',   NULLIF(COALESCE(magnesium_mg,0),0),
    'calcium_mg',     NULLIF(COALESCE(calcium_mg,0),0),
    'iron_mg',        NULLIF(COALESCE(iron_mg,0),0),
    'zinc_mg',        NULLIF(COALESCE(zinc_mg,0),0),
    'vitamin_c_mg',   NULLIF(COALESCE(vitamin_c_mg,0),0),
    'vitamin_d_mcg',  NULLIF(COALESCE(vitamin_d_mcg,0),0),
    'vitamin_b9_mcg', NULLIF(COALESCE(vitamin_b9_mcg,0),0),
    'vitamin_b12_mcg',NULLIF(COALESCE(vitamin_b12_mcg,0),0),
    'vitamin_e_mg',   NULLIF(COALESCE(vitamin_e_mg,0),0)
  ))
)
WHERE nutrients_std IS NULL OR nutrients_std = '{}'::jsonb;