-- ============================================================
-- FIX BDD LOVABLE - Colonnes manquantes dans meals et meal_items
-- ============================================================
-- Exécutez ce script dans SQL Editor de votre projet Lovable

-- 1. AJOUTER LES COLONNES DE TOTAUX DANS meals (si manquantes)
ALTER TABLE IF EXISTS public.meals 
  ADD COLUMN IF NOT EXISTS total_fiber DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sugar DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sodium_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_potassium_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_magnesium_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_calcium_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_iron_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_zinc_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_vitamin_c_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_vitamin_d_mcg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_vitamin_b9_mcg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_vitamin_b12_mcg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_vitamin_e_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_omega3_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_saturated_fat DOUBLE PRECISION DEFAULT 0;

-- 2. AJOUTER LES COLONNES DANS meal_items (si manquantes)
ALTER TABLE IF EXISTS public.meal_items 
  ADD COLUMN IF NOT EXISTS fiber DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sugar DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sodium_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS potassium_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS magnesium_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calcium_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iron_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zinc_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_c_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_d_mcg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b9_mcg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b12_mcg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_e_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omega3_mg DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saturated_fat DOUBLE PRECISION DEFAULT 0;

-- 3. Rafraîchir le cache du schéma Supabase
NOTIFY pgrst, 'reload schema';

-- 4. Vérification
SELECT 'Colonnes ajoutées avec succès !' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'meals' AND column_name LIKE 'total_%') as total_columns_in_meals,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'meal_items' AND column_name IN 
   ('fiber', 'sugar', 'sodium_mg', 'potassium_mg', 'magnesium_mg', 'calcium_mg',
    'iron_mg', 'zinc_mg', 'vitamin_c_mg', 'vitamin_d_mcg', 'vitamin_b9_mcg',
    'vitamin_b12_mcg', 'vitamin_e_mg', 'omega3_mg', 'saturated_fat')) as micro_columns_in_items;
