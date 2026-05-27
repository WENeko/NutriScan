-- 1) Catégories de micronutriments en table (au lieu de hard-codé)
CREATE TABLE IF NOT EXISTS public.micronutrient_categories (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.micronutrient_categories TO anon, authenticated;
GRANT ALL ON public.micronutrient_categories TO service_role;

ALTER TABLE public.micronutrient_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories readable by everyone"
  ON public.micronutrient_categories FOR SELECT
  USING (true);

INSERT INTO public.micronutrient_categories (key, label, display_order) VALUES
  ('macro',   'Macros associés', 1),
  ('mineral', 'Minéraux',        2),
  ('vitamin', 'Vitamines',       3),
  ('lipid',   'Lipides',         4)
ON CONFLICT (key) DO NOTHING;

-- 2) Étendre custom_foods pour stocker TOUS les micros (std + custom) en JSONB
ALTER TABLE public.custom_foods
  ADD COLUMN IF NOT EXISTS nutrients_std    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nutrients_custom JSONB NOT NULL DEFAULT '{}'::jsonb;