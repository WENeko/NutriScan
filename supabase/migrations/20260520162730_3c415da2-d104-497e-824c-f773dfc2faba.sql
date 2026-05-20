ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_athlete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_smoker boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pregnant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_menopausal boolean NOT NULL DEFAULT false;