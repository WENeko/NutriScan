-- ============================================================
-- FIX RAPIDE - Exécutez ce script dans SQL Editor de Supabase
-- Votre projet perso (pas Lovable)
-- ============================================================

-- 1. SUPPRIMER LES CONTRAINTES FK QUI BLOQUENT
-- (Cela permet d'insérer des repas même sans utilisateur dans auth.users)
ALTER TABLE IF EXISTS public.meals 
  DROP CONSTRAINT IF EXISTS meals_user_id_fkey;

ALTER TABLE IF EXISTS public.meal_items 
  DROP CONSTRAINT IF EXISTS meal_items_user_id_fkey;

-- 2. AJOUTER LES COLONNES MANQUANTES DANS meals
ALTER TABLE IF EXISTS public.meals 
  ADD COLUMN IF NOT EXISTS total_calories DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_proteins DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_carbs DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_fats DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ADD COLUMN IF NOT EXISTS image_url TEXT,
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

-- 3. AJOUTER LES COLONNES MANQUANTES DANS meal_items
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

-- 4. AJOUTER user_id à meal_items s'il manque
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'meal_items' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.meal_items ADD COLUMN user_id UUID;
  END IF;
END $$;

-- 5. CRÉER LA TABLE profiles SI ELLE N'EXISTE PAS
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  goals JSONB NOT NULL DEFAULT '{"calories": 2000, "proteins": 150, "carbs": 250, "fats": 70}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Activer RLS sur profiles
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Supprimer et recréer les policies pour éviter les doublons
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- 6. CRÉER UN TRIGGER POUR AUTO-CRÉER LE PROFIL LORS DE L'INSCRIPTION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer et recréer le trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. INDEX POUR PERFORMANCES
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON public.meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_timestamp ON public.meals(timestamp);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id ON public.meal_items(meal_id);

-- ============================================================
-- VÉRIFICATION
-- ============================================================
SELECT 'Tables modifiées avec succès !' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'meals') as meals_columns,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'meal_items') as meal_items_columns,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'profiles') as has_profiles;
