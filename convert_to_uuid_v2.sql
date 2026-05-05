-- ============================================================
-- CONVERSION DES COLONNES user_id de TEXT à UUID
-- ORDRE CORRECT : Supprimer policies → Convertir → Recréer policies
-- ⚠️ Sauvegardez vos données avant d'exécuter !
-- ============================================================

-- ============================================================
-- ÉTAPE 1 : SUPPRIMER TOUTES LES POLICIES RLS EXISTANTES
-- ============================================================

-- Supprimer les policies sur meals
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON meals;
DROP POLICY IF EXISTS "Enable select for own meals" ON meals;
DROP POLICY IF EXISTS "Enable update for own meals" ON meals;
DROP POLICY IF EXISTS "Enable delete for own meals" ON meals;

-- Supprimer les policies sur meal_items
DROP POLICY IF EXISTS "Enable insert for meal owners" ON meal_items;
DROP POLICY IF EXISTS "Enable select for meal owners" ON meal_items;
DROP POLICY IF EXISTS "Enable update for meal owners" ON meal_items;
DROP POLICY IF EXISTS "Enable delete for meal owners" ON meal_items;

-- Supprimer les policies sur profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

-- Supprimer les policies sur sleep_logs
DROP POLICY IF EXISTS "Users can view own sleep logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can insert own sleep logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can update own sleep logs" ON sleep_logs;
DROP POLICY IF EXISTS "Users can delete own sleep logs" ON sleep_logs;

-- Supprimer les policies sur water_logs
DROP POLICY IF EXISTS "Users can view own water logs" ON water_logs;
DROP POLICY IF EXISTS "Users can insert own water logs" ON water_logs;
DROP POLICY IF EXISTS "Users can update own water logs" ON water_logs;
DROP POLICY IF EXISTS "Users can delete own water logs" ON water_logs;

-- Supprimer les policies sur body_composition
DROP POLICY IF EXISTS "Users can view own body composition" ON body_composition;
DROP POLICY IF EXISTS "Users can insert own body composition" ON body_composition;
DROP POLICY IF EXISTS "Users can update own body composition" ON body_composition;
DROP POLICY IF EXISTS "Users can delete own body composition" ON body_composition;

-- Supprimer les policies sur custom_foods
DROP POLICY IF EXISTS "Users can view own custom foods" ON custom_foods;
DROP POLICY IF EXISTS "Users can insert own custom foods" ON custom_foods;
DROP POLICY IF EXISTS "Users can update own custom foods" ON custom_foods;
DROP POLICY IF EXISTS "Users can delete own custom foods" ON custom_foods;

-- ============================================================
-- ÉTAPE 2 : DÉSACTIVER RLS
-- ============================================================
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE body_composition DISABLE ROW LEVEL SECURITY;
ALTER TABLE custom_foods DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- ÉTAPE 3 : CONVERTIR LES COLONNES user_id de TEXT À UUID
-- ============================================================

-- meals
ALTER TABLE meals ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- profiles
ALTER TABLE profiles ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- sleep_logs
ALTER TABLE sleep_logs ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- water_logs
ALTER TABLE water_logs ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- body_composition
ALTER TABLE body_composition ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- custom_foods
ALTER TABLE custom_foods ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- Note: meal_items n'a pas de user_id direct (seulement meal_id via FK)

-- ============================================================
-- ÉTAPE 4 : RÉACTIVER RLS
-- ============================================================
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_composition ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_foods ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ÉTAPE 5 : RECRÉER LES POLICIES (SANS CAST ::uuid)
-- ============================================================

-- Policies pour meals
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

-- Policies pour meal_items
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

CREATE POLICY "Users can insert own profile" 
ON profiles FOR INSERT 
TO authenticated 
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
-- Doit retourner : uuid
