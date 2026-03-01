
-- Add vitamin columns to meal_items
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS vitamin_b_mg numeric DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS vitamin_c_mg numeric DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS vitamin_d_mcg numeric DEFAULT 0;
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS vitamin_e_mg numeric DEFAULT 0;

-- Add vitamin columns to custom_foods
ALTER TABLE public.custom_foods ADD COLUMN IF NOT EXISTS vitamin_b_per_100g numeric DEFAULT 0;
ALTER TABLE public.custom_foods ADD COLUMN IF NOT EXISTS vitamin_c_per_100g numeric DEFAULT 0;
ALTER TABLE public.custom_foods ADD COLUMN IF NOT EXISTS vitamin_d_per_100g numeric DEFAULT 0;
ALTER TABLE public.custom_foods ADD COLUMN IF NOT EXISTS vitamin_e_per_100g numeric DEFAULT 0;

-- Create water_logs table
CREATE TABLE public.water_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount_ml integer NOT NULL DEFAULT 250,
  logged_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own water logs" ON public.water_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own water logs" ON public.water_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own water logs" ON public.water_logs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_water_logs_user_date ON public.water_logs (user_id, logged_at);
