
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS target_body_fat_percent numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS target_muscle_mass_kg numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bmr_method text DEFAULT 'mifflin',
  ADD COLUMN IF NOT EXISTS weighin_frequency text DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS weighin_day integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weighin_hour integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS last_weighin_date date DEFAULT NULL;
