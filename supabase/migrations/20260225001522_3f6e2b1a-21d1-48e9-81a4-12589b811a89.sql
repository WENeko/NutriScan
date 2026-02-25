
-- Add metabolism and weight columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS activity_level text DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS bmr numeric;

-- Add source column to meals (ai, text, barcode)
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai';

-- Add comment for clarity
COMMENT ON COLUMN public.meals.source IS 'Source of meal data: ai, text, or barcode';
