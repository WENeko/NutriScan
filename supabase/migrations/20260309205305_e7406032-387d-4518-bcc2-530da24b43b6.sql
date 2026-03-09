
-- Create sleep_logs table for Health Connect sleep data
CREATE TABLE public.sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer,
  stages jsonb,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recorded_at)
);

ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sleep logs" ON public.sleep_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sleep logs" ON public.sleep_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sleep logs" ON public.sleep_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sleep logs" ON public.sleep_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
