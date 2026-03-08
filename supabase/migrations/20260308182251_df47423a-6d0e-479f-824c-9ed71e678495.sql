ALTER TABLE public.meal_items 
  ADD COLUMN unit_count integer DEFAULT NULL,
  ADD COLUMN unit_weight_g numeric DEFAULT NULL,
  ADD COLUMN unit_label text DEFAULT NULL;