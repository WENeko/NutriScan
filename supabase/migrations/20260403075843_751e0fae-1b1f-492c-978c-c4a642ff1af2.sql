
-- Create recipe_ingredients table
CREATE TABLE public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  custom_food_id UUID NOT NULL REFERENCES public.custom_foods(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight_g NUMERIC NOT NULL DEFAULT 100,
  proteins_per_100g NUMERIC NOT NULL DEFAULT 0,
  carbs_per_100g NUMERIC NOT NULL DEFAULT 0,
  fats_per_100g NUMERIC NOT NULL DEFAULT 0,
  fiber_per_100g NUMERIC NOT NULL DEFAULT 0,
  sugar_per_100g NUMERIC NOT NULL DEFAULT 0,
  saturated_fat_per_100g NUMERIC NOT NULL DEFAULT 0,
  omega3_mg_per_100g NUMERIC NOT NULL DEFAULT 0,
  sodium_mg_per_100g NUMERIC NOT NULL DEFAULT 0,
  potassium_mg_per_100g NUMERIC NOT NULL DEFAULT 0,
  magnesium_mg_per_100g NUMERIC NOT NULL DEFAULT 0,
  calcium_mg_per_100g NUMERIC NOT NULL DEFAULT 0,
  vitamin_b_per_100g NUMERIC NOT NULL DEFAULT 0,
  vitamin_c_per_100g NUMERIC NOT NULL DEFAULT 0,
  vitamin_d_per_100g NUMERIC NOT NULL DEFAULT 0,
  vitamin_e_per_100g NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- RLS policies: access via parent custom_food ownership
CREATE POLICY "Users can view own recipe ingredients"
ON public.recipe_ingredients FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.custom_foods
  WHERE custom_foods.id = recipe_ingredients.custom_food_id
  AND custom_foods.user_id = auth.uid()
));

CREATE POLICY "Users can insert own recipe ingredients"
ON public.recipe_ingredients FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.custom_foods
  WHERE custom_foods.id = recipe_ingredients.custom_food_id
  AND custom_foods.user_id = auth.uid()
));

CREATE POLICY "Users can update own recipe ingredients"
ON public.recipe_ingredients FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.custom_foods
  WHERE custom_foods.id = recipe_ingredients.custom_food_id
  AND custom_foods.user_id = auth.uid()
));

CREATE POLICY "Users can delete own recipe ingredients"
ON public.recipe_ingredients FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.custom_foods
  WHERE custom_foods.id = recipe_ingredients.custom_food_id
  AND custom_foods.user_id = auth.uid()
));

-- Add morphotype and mass_gain_phase columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS morphotype TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS mass_gain_phase TEXT DEFAULT NULL;
