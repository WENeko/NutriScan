ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS parent_meal_id uuid REFERENCES public.meals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meals_parent_meal_id ON public.meals(parent_meal_id);