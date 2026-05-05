-- ============================================================
-- EXPORT DU SCHÉMA - VERSION SIMPLIFIÉE ET FONCTIONNELLE
-- Exécutez ce script dans Supabase SQL Editor
-- Copiez la sortie et exécutez-la dans la nouvelle BDD
-- ============================================================

-- 1. TABLES (structure de base)
-- ============================================================

-- meals
SELECT 'CREATE TABLE IF NOT EXISTS meals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  meal_name text,
  meal_type text DEFAULT ''breakfast'',
  meal_date date DEFAULT CURRENT_DATE,
  logged_at timestamp with time zone DEFAULT now(),
  total_calories numeric(10,2) DEFAULT 0,
  total_protein numeric(10,2) DEFAULT 0,
  total_carbs numeric(10,2) DEFAULT 0,
  total_fat numeric(10,2) DEFAULT 0,
  total_fiber numeric(10,2) DEFAULT 0,
  total_sodium_mg numeric(10,2) DEFAULT 0,
  total_calcium_mg numeric(10,2) DEFAULT 0,
  photo_url text,
  voice_transcript text,
  created_at timestamp with time zone DEFAULT now()
);' as sql;

-- meal_items
SELECT 'CREATE TABLE IF NOT EXISTS meal_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_count integer DEFAULT 1,
  unit_label text DEFAULT ''portion'',
  unit_weight_g numeric(10,2),
  calories numeric(10,2) DEFAULT 0,
  protein numeric(10,2) DEFAULT 0,
  carbs numeric(10,2) DEFAULT 0,
  fat numeric(10,2) DEFAULT 0,
  fiber numeric(10,2) DEFAULT 0,
  sodium_mg numeric(10,2) DEFAULT 0,
  calcium_mg numeric(10,2) DEFAULT 0,
  iron_mg numeric(10,2) DEFAULT 0,
  vitamin_c_mg numeric(10,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);' as sql;

-- profiles
SELECT 'CREATE TABLE IF NOT EXISTS profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  username text,
  avatar_url text,
  daily_calorie_goal numeric(10,2) DEFAULT 2000,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);' as sql;

-- sleep_logs
SELECT 'CREATE TABLE IF NOT EXISTS sleep_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  sleep_date date DEFAULT CURRENT_DATE,
  duration_hours numeric(4,2),
  sleep_quality integer CHECK (sleep_quality BETWEEN 1 AND 5),
  bed_time timestamp with time zone,
  wake_time timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);' as sql;

-- water_logs
SELECT 'CREATE TABLE IF NOT EXISTS water_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount_ml integer DEFAULT 250,
  logged_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);' as sql;

-- body_composition
SELECT 'CREATE TABLE IF NOT EXISTS body_composition (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  weight_kg numeric(5,2),
  body_fat_percentage numeric(4,2),
  measured_at date DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);' as sql;

-- custom_foods
SELECT 'CREATE TABLE IF NOT EXISTS custom_foods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  calories_per_100g numeric(10,2) DEFAULT 0,
  protein_per_100g numeric(10,2) DEFAULT 0,
  carbs_per_100g numeric(10,2) DEFAULT 0,
  fat_per_100g numeric(10,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);' as sql;

-- 2. ACTIVER RLS
-- ============================================================
SELECT '-- Activer RLS' as section;

SELECT 'ALTER TABLE meals ENABLE ROW LEVEL SECURITY;' as sql
UNION ALL SELECT 'ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;'
UNION ALL SELECT 'ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;'
UNION ALL SELECT 'ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;'
UNION ALL SELECT 'ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;'
UNION ALL SELECT 'ALTER TABLE body_composition ENABLE ROW LEVEL SECURITY;'
UNION ALL SELECT 'ALTER TABLE custom_foods ENABLE ROW LEVEL SECURITY;';

-- 3. POLICIES RLS
-- ============================================================
SELECT '-- RLS Policies' as section;

SELECT 'DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON meals;
CREATE POLICY "Enable insert for authenticated users only" ON meals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);' as sql
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Enable select for own meals" ON meals;
CREATE POLICY "Enable select for own meals" ON meals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Enable update for own meals" ON meals;
CREATE POLICY "Enable update for own meals" ON meals
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Enable insert for meal owners" ON meal_items;
CREATE POLICY "Enable insert for meal owners" ON meal_items
  FOR INSERT TO authenticated WITH CHECK (
    meal_id IN (SELECT id FROM meals WHERE auth.uid() = user_id)
  );'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Enable select for meal owners" ON meal_items;
CREATE POLICY "Enable select for meal owners" ON meal_items
  FOR SELECT TO authenticated USING (
    meal_id IN (SELECT id FROM meals WHERE auth.uid() = user_id)
  );'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can view own sleep logs" ON sleep_logs;
CREATE POLICY "Users can view own sleep logs" ON sleep_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can insert own sleep logs" ON sleep_logs;
CREATE POLICY "Users can insert own sleep logs" ON sleep_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can view own water logs" ON water_logs;
CREATE POLICY "Users can view own water logs" ON water_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can insert own water logs" ON water_logs;
CREATE POLICY "Users can insert own water logs" ON water_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can view own body composition" ON body_composition;
CREATE POLICY "Users can view own body composition" ON body_composition
  FOR SELECT TO authenticated USING (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can insert own body composition" ON body_composition;
CREATE POLICY "Users can insert own body composition" ON body_composition
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can view own custom foods" ON custom_foods;
CREATE POLICY "Users can view own custom foods" ON custom_foods
  FOR SELECT TO authenticated USING (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can insert own custom foods" ON custom_foods;
CREATE POLICY "Users can insert own custom foods" ON custom_foods
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);'
UNION ALL
SELECT 'DROP POLICY IF EXISTS "Users can update own custom foods" ON custom_foods;
CREATE POLICY "Users can update own custom foods" ON custom_foods
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);';

-- 4. INDEXES (optionnel mais recommandé)
-- ============================================================
SELECT '-- Index optionnels' as section;

SELECT 'CREATE INDEX IF NOT EXISTS idx_meals_user_id ON meals(user_id);' as sql
UNION ALL SELECT 'CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(meal_date);'
UNION ALL SELECT 'CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id ON meal_items(meal_id);'
UNION ALL SELECT 'CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);'
UNION ALL SELECT 'CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_id ON sleep_logs(user_id);'
UNION ALL SELECT 'CREATE INDEX IF NOT EXISTS idx_water_logs_user_id ON water_logs(user_id);'
UNION ALL SELECT 'CREATE INDEX IF NOT EXISTS idx_body_composition_user_id ON body_composition(user_id);'
UNION ALL SELECT 'CREATE INDEX IF NOT EXISTS idx_custom_foods_user_id ON custom_foods(user_id);';
