CREATE TABLE public.training_day_overrides (
  user_id uuid NOT NULL,
  local_date date NOT NULL,
  day_type text NOT NULL CHECK (day_type IN ('training', 'rest')),
  PRIMARY KEY (user_id, local_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_day_overrides TO authenticated;
GRANT ALL ON public.training_day_overrides TO service_role;
ALTER TABLE public.training_day_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own day overrides" ON public.training_day_overrides FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);