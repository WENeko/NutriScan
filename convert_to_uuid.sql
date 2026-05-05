-- ============================================================
-- CONVERSION DES COLONNES user_id de TEXT à UUID
-- ⚠️ Sauvegardez vos données avant d'exécuter !
-- ============================================================

-- 1. Désactiver RLS temporairement
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE body_composition DISABLE ROW LEVEL SECURITY;
ALTER TABLE custom_foods DISABLE ROW LEVEL SECURITY;

-- 2. Supprimer les contraintes de clé étrangère si elles existent (pour éviter les erreurs de conversion)
-- Note: Les noms des contraintes peuvent varier, ajustez si nécessaire

-- 3. Convertir les colonnes user_id de TEXT à UUID
ALTER TABLE meals ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE profiles ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE sleep_logs ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE water_logs ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE body_composition ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE custom_foods ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- meal_items n'a pas de user_id direct (seulement meal_id via FK)

-- 4. Réactiver RLS
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_composition ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_foods ENABLE ROW LEVEL SECURITY;

-- 5. Supprimer les anciennes policies
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON meals;
DROP POLICY IF EXISTS "Enable select for own meals" ON meals;
DROP POLICY IF EXISTS "Enable update for own meals" ON meals;
DROP POLICY IF EXISTS "Enable insert for meal owners" ON meal_items;
DROP POLICY IF EXISTS "Enable select for meal owners" ON meal_items;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- 6. Recréer les policies SANS cast ::uuid (car maintenant c'est déjà uuid)
CREATE POLICY "Enable insert for authenticated users only" 
ON meals FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable select for own meals" 
ON meals FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Enable update for own meals" 
ON meals FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable insert for meal owners" 
ON meal_items FOR INSERT 
TO authenticated 
WITH CHECK (
  meal_id IN (
    SELECT id FROM meals WHERE auth.uid() = user_id
  )
);

CREATE POLICY "Enable select for meal owners" 
ON meal_items FOR SELECT 
TO authenticated 
USING (
  meal_id IN (
    SELECT id FROM meals WHERE auth.uid() = user_id
  )
);

-- Policies pour profiles
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies pour sleep_logs
CREATE POLICY "Users can view own sleep logs" 
ON sleep_logs FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sleep logs" 
ON sleep_logs FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Policies pour water_logs
CREATE POLICY "Users can view own water logs" 
ON water_logs FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own water logs" 
ON water_logs FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Policies pour body_composition
CREATE POLICY "Users can view own body composition" 
ON body_composition FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own body composition" 
ON body_composition FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Policies pour custom_foods
CREATE POLICY "Users can view own custom foods" 
ON custom_foods FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own custom foods" 
ON custom_foods FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom foods" 
ON custom_foods FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- VÉRIFICATION
-- ============================================================
-- Vérifiez que les types ont bien été modifiés :
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'meals' AND column_name = 'user_id';
