
CREATE TABLE IF NOT EXISTS public.sport_activity_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_package text NOT NULL,
  source_name text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  value_kcal numeric NOT NULL DEFAULT 0,
  recorded_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sport_activity_samples_uniq UNIQUE (user_id, source_package, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS sport_activity_samples_user_date_idx
  ON public.sport_activity_samples (user_id, recorded_date);

ALTER TABLE public.sport_activity_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sport samples" ON public.sport_activity_samples
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sport samples" ON public.sport_activity_samples
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sport samples" ON public.sport_activity_samples
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own sport samples" ON public.sport_activity_samples
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sport_allowed_sources text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS phase_adjust_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS phase_adjust_value numeric NOT NULL DEFAULT 0;
