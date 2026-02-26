
-- Table: body_composition (suivi poids, masse grasse, masse musculaire, calories sport)
CREATE TABLE public.body_composition (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC,
  body_fat_percent NUMERIC,
  muscle_mass_kg NUMERIC,
  sport_calories NUMERIC DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.body_composition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own body composition" ON public.body_composition FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own body composition" ON public.body_composition FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own body composition" ON public.body_composition FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own body composition" ON public.body_composition FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_body_comp_user_date ON public.body_composition (user_id, recorded_at DESC);

-- Table: custom_foods (bibliothèque personnelle d'aliments)
CREATE TABLE public.custom_foods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  serving_size_g NUMERIC NOT NULL DEFAULT 100,
  calories_per_100g NUMERIC NOT NULL DEFAULT 0,
  proteins_per_100g NUMERIC NOT NULL DEFAULT 0,
  carbs_per_100g NUMERIC NOT NULL DEFAULT 0,
  fats_per_100g NUMERIC NOT NULL DEFAULT 0,
  fiber_per_100g NUMERIC DEFAULT 0,
  sodium_mg_per_100g NUMERIC DEFAULT 0,
  potassium_mg_per_100g NUMERIC DEFAULT 0,
  magnesium_mg_per_100g NUMERIC DEFAULT 0,
  calcium_mg_per_100g NUMERIC DEFAULT 0,
  sugar_per_100g NUMERIC DEFAULT 0,
  saturated_fat_per_100g NUMERIC DEFAULT 0,
  omega3_mg_per_100g NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom foods" ON public.custom_foods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own custom foods" ON public.custom_foods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own custom foods" ON public.custom_foods FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own custom foods" ON public.custom_foods FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_custom_foods_updated_at
  BEFORE UPDATE ON public.custom_foods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Ajouter les colonnes micronutriments à meal_items
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS fiber NUMERIC DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS sodium_mg NUMERIC DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS potassium_mg NUMERIC DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS magnesium_mg NUMERIC DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS calcium_mg NUMERIC DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS sugar NUMERIC DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS saturated_fat NUMERIC DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS omega3_mg NUMERIC DEFAULT 0;

-- Ajouter champs composition corporelle au profil (pour saisie rapide)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS body_fat_percent NUMERIC;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS muscle_mass_kg NUMERIC;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sport_calories_daily NUMERIC DEFAULT 0;

-- Ajouter colonne eau au profil (suivi quotidien)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS water_goal_ml NUMERIC DEFAULT 2000;
