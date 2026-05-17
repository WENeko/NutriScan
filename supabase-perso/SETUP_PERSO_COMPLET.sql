-- =====================================================================
--  SETUP COMPLET BDD PERSO — à exécuter dans le SQL Editor du projet Supabase perso
--  (PAS celui de Lovable). Idempotent — peut être rejoué sans danger.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Trigger générique updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. profiles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  goals jsonb NOT NULL DEFAULT '{"calories":2000,"proteins":150,"carbs":250,"fats":70}'::jsonb,
  weight_kg numeric,
  height_cm numeric,
  age integer,
  gender text,
  activity_level text DEFAULT 'moderate',
  bmr numeric,
  bmr_method text DEFAULT 'mifflin',
  date_of_birth date,
  body_fat_percent numeric,
  muscle_mass_kg numeric,
  sport_calories_daily numeric DEFAULT 0,
  water_goal_ml numeric DEFAULT 2000,
  target_weight_kg numeric,
  target_body_fat_percent numeric,
  target_muscle_mass_kg numeric,
  weighin_frequency text DEFAULT 'weekly',
  weighin_day integer DEFAULT 1,
  weighin_hour integer DEFAULT 8,
  weighin_minute integer DEFAULT 0,
  last_weighin_date date,
  morphotype text,
  mass_gain_phase text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 3. meals & meal_items
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meal_name text,
  total_calories numeric DEFAULT 0,
  total_proteins numeric DEFAULT 0,
  total_carbs   numeric DEFAULT 0,
  total_fats    numeric DEFAULT 0,
  raw_ai_analysis text,
  image_url text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  is_confirmed boolean NOT NULL DEFAULT false,
  is_favorite  boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity text,
  unit_count integer,
  unit_weight_g numeric,
  unit_label text,
  calories numeric DEFAULT 0,
  proteins numeric DEFAULT 0,
  carbs    numeric DEFAULT 0,
  fats     numeric DEFAULT 0,
  fiber numeric DEFAULT 0,
  sugar numeric DEFAULT 0,
  saturated_fat numeric DEFAULT 0,
  sodium_mg numeric DEFAULT 0,
  potassium_mg numeric DEFAULT 0,
  magnesium_mg numeric DEFAULT 0,
  calcium_mg numeric DEFAULT 0,
  iron_mg numeric DEFAULT 0,
  zinc_mg numeric DEFAULT 0,
  omega3_mg numeric DEFAULT 0,
  vitamin_b_mg numeric DEFAULT 0,
  vitamin_b9_mcg numeric DEFAULT 0,
  vitamin_b12_mcg numeric DEFAULT 0,
  vitamin_c_mg numeric DEFAULT 0,
  vitamin_d_mcg numeric DEFAULT 0,
  vitamin_e_mg numeric DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meals_user_time ON public.meals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON public.meal_items(meal_id);

-- ---------------------------------------------------------------------
-- 4. body_composition / water_logs / sleep_logs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.body_composition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg numeric,
  body_fat_percent numeric,
  muscle_mass_kg numeric,
  sport_calories numeric DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.water_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_ml integer NOT NULL DEFAULT 250,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer,
  stages jsonb,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. custom_foods & recipe_ingredients
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  brand text,
  barcode text,
  serving_size_g numeric NOT NULL DEFAULT 100,
  calories_per_100g numeric NOT NULL DEFAULT 0,
  proteins_per_100g numeric NOT NULL DEFAULT 0,
  carbs_per_100g numeric NOT NULL DEFAULT 0,
  fats_per_100g  numeric NOT NULL DEFAULT 0,
  fiber_per_100g numeric DEFAULT 0,
  sugar_per_100g numeric DEFAULT 0,
  saturated_fat_per_100g numeric DEFAULT 0,
  sodium_mg_per_100g numeric DEFAULT 0,
  potassium_mg_per_100g numeric DEFAULT 0,
  magnesium_mg_per_100g numeric DEFAULT 0,
  calcium_mg_per_100g numeric DEFAULT 0,
  iron_mg_per_100g numeric DEFAULT 0,
  zinc_mg_per_100g numeric DEFAULT 0,
  omega3_mg_per_100g numeric DEFAULT 0,
  vitamin_b_per_100g numeric DEFAULT 0,
  vitamin_b9_mcg_per_100g numeric DEFAULT 0,
  vitamin_b12_mcg_per_100g numeric DEFAULT 0,
  vitamin_c_per_100g numeric DEFAULT 0,
  vitamin_d_per_100g numeric DEFAULT 0,
  vitamin_e_per_100g numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_custom_foods_updated_at ON public.custom_foods;
CREATE TRIGGER trg_custom_foods_updated_at BEFORE UPDATE ON public.custom_foods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_food_id uuid NOT NULL REFERENCES public.custom_foods(id) ON DELETE CASCADE,
  name text NOT NULL,
  weight_g numeric NOT NULL DEFAULT 100,
  proteins_per_100g numeric NOT NULL DEFAULT 0,
  carbs_per_100g numeric NOT NULL DEFAULT 0,
  fats_per_100g numeric NOT NULL DEFAULT 0,
  fiber_per_100g numeric NOT NULL DEFAULT 0,
  sugar_per_100g numeric NOT NULL DEFAULT 0,
  saturated_fat_per_100g numeric NOT NULL DEFAULT 0,
  sodium_mg_per_100g numeric NOT NULL DEFAULT 0,
  potassium_mg_per_100g numeric NOT NULL DEFAULT 0,
  magnesium_mg_per_100g numeric NOT NULL DEFAULT 0,
  calcium_mg_per_100g numeric NOT NULL DEFAULT 0,
  iron_mg_per_100g numeric DEFAULT 0,
  zinc_mg_per_100g numeric DEFAULT 0,
  omega3_mg_per_100g numeric NOT NULL DEFAULT 0,
  vitamin_b_per_100g numeric NOT NULL DEFAULT 0,
  vitamin_b9_mcg_per_100g numeric DEFAULT 0,
  vitamin_b12_mcg_per_100g numeric DEFAULT 0,
  vitamin_c_per_100g numeric NOT NULL DEFAULT 0,
  vitamin_d_per_100g numeric NOT NULL DEFAULT 0,
  vitamin_e_per_100g numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. RLS — active partout
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_composition  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sleep_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_foods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- Helper: policy "auth.uid() = user_id" sur les 4 commandes
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','meals','body_composition','water_logs','sleep_logs','custom_foods'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select_own" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert_own" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update_own" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete_own" ON public.%1$s', t);

    EXECUTE format('CREATE POLICY "%1$s_select_own" ON public.%1$s FOR SELECT USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "%1$s_insert_own" ON public.%1$s FOR INSERT WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "%1$s_update_own" ON public.%1$s FOR UPDATE USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "%1$s_delete_own" ON public.%1$s FOR DELETE USING (auth.uid() = user_id)', t);
  END LOOP;
END$$;

-- meal_items via EXISTS
DROP POLICY IF EXISTS meal_items_select_own ON public.meal_items;
DROP POLICY IF EXISTS meal_items_insert_own ON public.meal_items;
DROP POLICY IF EXISTS meal_items_update_own ON public.meal_items;
DROP POLICY IF EXISTS meal_items_delete_own ON public.meal_items;

CREATE POLICY meal_items_select_own ON public.meal_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_items.meal_id AND m.user_id = auth.uid()));
CREATE POLICY meal_items_insert_own ON public.meal_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_items.meal_id AND m.user_id = auth.uid()));
CREATE POLICY meal_items_update_own ON public.meal_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_items.meal_id AND m.user_id = auth.uid()));
CREATE POLICY meal_items_delete_own ON public.meal_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_items.meal_id AND m.user_id = auth.uid()));

-- recipe_ingredients via EXISTS sur custom_foods
DROP POLICY IF EXISTS recipe_ingredients_select_own ON public.recipe_ingredients;
DROP POLICY IF EXISTS recipe_ingredients_insert_own ON public.recipe_ingredients;
DROP POLICY IF EXISTS recipe_ingredients_update_own ON public.recipe_ingredients;
DROP POLICY IF EXISTS recipe_ingredients_delete_own ON public.recipe_ingredients;

CREATE POLICY recipe_ingredients_select_own ON public.recipe_ingredients FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.custom_foods c WHERE c.id = recipe_ingredients.custom_food_id AND c.user_id = auth.uid()));
CREATE POLICY recipe_ingredients_insert_own ON public.recipe_ingredients FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.custom_foods c WHERE c.id = recipe_ingredients.custom_food_id AND c.user_id = auth.uid()));
CREATE POLICY recipe_ingredients_update_own ON public.recipe_ingredients FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.custom_foods c WHERE c.id = recipe_ingredients.custom_food_id AND c.user_id = auth.uid()));
CREATE POLICY recipe_ingredients_delete_own ON public.recipe_ingredients FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.custom_foods c WHERE c.id = recipe_ingredients.custom_food_id AND c.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 7. handle_new_user — crée le profile à l'inscription auth.users
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- DONE. Tu peux maintenant déployer les 3 edge functions
-- (create-user-in-personal-db, save-meal, sync-record) dans ce projet
-- via la CLI : `supabase functions deploy <name> --no-verify-jwt`
-- =====================================================================
