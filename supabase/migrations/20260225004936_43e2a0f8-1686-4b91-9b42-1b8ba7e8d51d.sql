
-- Add favorite flag and meal name to meals
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS meal_name text;

-- Add date_of_birth to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
