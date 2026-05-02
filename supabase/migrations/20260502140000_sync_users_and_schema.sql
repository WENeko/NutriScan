-- Migration: Synchronisation utilisateurs et correction schéma BDD personnelle
-- Date: 2026-05-02

-- =====================================================
-- PARTIE 1: MIGRATION DES UTILISATEURS (à exécuter manuellement)
-- =====================================================
-- NOTE: Cette partie doit être exécutée via un script externe ou la console Supabase
-- car on ne peut pas faire de requêtes cross-database directement en SQL

-- Pour migrer les utilisateurs, utilisez ce script Python ou JavaScript:
/*
EXEMPLE DE SCRIPT DE MIGRATION (à exécuter côté client):

1. Récupérer tous les utilisateurs de la BDD Lovable via l'API Admin
2. Pour chaque utilisateur, créer l'entrée dans la BDD perso:

const migrateUsers = async () => {
  // 1. Get users from Lovable
  const { data: lovableUsers, error } = await supabaseLovable
    .from('profiles')
    .select('user_id, email, goals, created_at');
  
  if (error) throw error;
  
  // 2. Insert into personal DB
  for (const user of lovableUsers) {
    const { error: insertError } = await supabasePerso
      .from('profiles')
      .upsert({
        user_id: user.user_id,
        email: user.email,
        // autres champs...
      }, { onConflict: 'user_id' });
    
    if (insertError) console.error(`Failed for ${user.user_id}:`, insertError);
  }
};
*/

-- =====================================================
-- PARTIE 2: CORRECTION DU SCHÉMA BDD PERSONNELLE
-- =====================================================

-- 2.1 Vérifier et ajouter user_id à meal_items si manquant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'meal_items' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.meal_items ADD COLUMN user_id UUID;
    -- Ajouter la FK si auth.users existe
    ALTER TABLE public.meal_items 
      ADD CONSTRAINT meal_items_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2.2 Ajouter les colonnes de totaux à la table meals (manquantes dans BDD perso)
ALTER TABLE public.meals 
  ADD COLUMN IF NOT EXISTS total_calories DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_proteins DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_carbs DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_fats DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2.3 Ajouter les colonnes de micronutriments à meals
ALTER TABLE public.meals 
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

-- 2.4 Ajouter les colonnes de micronutriments à meal_items
ALTER TABLE public.meal_items 
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

-- =====================================================
-- PARTIE 3: CREER/FIXER LA TABLE PROFILES SI MANQUANTE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  goals JSONB NOT NULL DEFAULT '{"calories": 2000, "proteins": 150, "carbs": 250, "fats": 70}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Activer RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Créer les policies pour profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- =====================================================
-- PARTIE 4: TRIGGER POUR AUTO-CREER LE PROFIL
-- =====================================================

-- Fonction pour créer automatiquement le profil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sur auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- =====================================================
-- PARTIE 5: INDEX POUR PERFORMANCES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_meals_user_id ON public.meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_timestamp ON public.meals(timestamp);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id ON public.meal_items(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_user_id ON public.meal_items(user_id);
