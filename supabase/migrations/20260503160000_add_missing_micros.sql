-- Migration : Ajout des micronutriments manquants selon nutrition-config.ts
-- Colonnes à ajouter : iron_mg, zinc_mg, vitamin_b9_mcg, vitamin_b12_mcg

-- ============================================================
-- 1. TABLE meal_items
-- ============================================================
ALTER TABLE meal_items 
ADD COLUMN IF NOT EXISTS iron_mg numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS zinc_mg numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vitamin_b9_mcg numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vitamin_b12_mcg numeric DEFAULT 0;

COMMENT ON COLUMN meal_items.iron_mg IS 'Fer en mg';
COMMENT ON COLUMN meal_items.zinc_mg IS 'Zinc en mg';
COMMENT ON COLUMN meal_items.vitamin_b9_mcg IS 'Vitamine B9 (Folates) en µg';
COMMENT ON COLUMN meal_items.vitamin_b12_mcg IS 'Vitamine B12 en µg';

-- ============================================================
-- 2. TABLE custom_foods (avec suffixe _per_100g)
-- ============================================================
ALTER TABLE custom_foods 
ADD COLUMN IF NOT EXISTS iron_mg_per_100g numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS zinc_mg_per_100g numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vitamin_b9_mcg_per_100g numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vitamin_b12_mcg_per_100g numeric DEFAULT 0;

COMMENT ON COLUMN custom_foods.iron_mg_per_100g IS 'Fer pour 100g en mg';
COMMENT ON COLUMN custom_foods.zinc_mg_per_100g IS 'Zinc pour 100g en mg';
COMMENT ON COLUMN custom_foods.vitamin_b9_mcg_per_100g IS 'Vitamine B9 pour 100g en µg';
COMMENT ON COLUMN custom_foods.vitamin_b12_mcg_per_100g IS 'Vitamine B12 pour 100g en µg';

-- ============================================================
-- 3. TABLE recipe_ingredients (avec suffixe _per_100g)
-- ============================================================
ALTER TABLE recipe_ingredients 
ADD COLUMN IF NOT EXISTS iron_mg_per_100g numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS zinc_mg_per_100g numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vitamin_b9_mcg_per_100g numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vitamin_b12_mcg_per_100g numeric DEFAULT 0;

COMMENT ON COLUMN recipe_ingredients.iron_mg_per_100g IS 'Fer pour 100g en mg';
COMMENT ON COLUMN recipe_ingredients.zinc_mg_per_100g IS 'Zinc pour 100g en mg';
COMMENT ON COLUMN recipe_ingredients.vitamin_b9_mcg_per_100g IS 'Vitamine B9 pour 100g en µg';
COMMENT ON COLUMN recipe_ingredients.vitamin_b12_mcg_per_100g IS 'Vitamine B12 pour 100g en µg';

-- ============================================================
-- 4. Mise à jour du JSONB nutrients_std dans meal_items (si la colonne existe)
-- ============================================================
-- Note : Ces champs seront automatiquement inclus dans nutrients_std 
-- via l'application lors de l'insertion

-- ============================================================
-- 5. Vérification
-- ============================================================
SELECT 
  'meal_items' as table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns 
WHERE table_name = 'meal_items' 
AND column_name IN ('iron_mg', 'zinc_mg', 'vitamin_b9_mcg', 'vitamin_b12_mcg')
ORDER BY ordinal_position;
