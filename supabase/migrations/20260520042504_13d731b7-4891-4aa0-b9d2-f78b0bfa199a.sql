CREATE TABLE public.goals_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  calories NUMERIC NOT NULL DEFAULT 0,
  proteins NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  fats NUMERIC NOT NULL DEFAULT 0,
  goals_mode TEXT NOT NULL DEFAULT 'scientific',
  source TEXT NOT NULL DEFAULT 'manual',
  weight_kg NUMERIC,
  body_fat_percent NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, recorded_at)
);

ALTER TABLE public.goals_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goals history" ON public.goals_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals history" ON public.goals_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals history" ON public.goals_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals history" ON public.goals_history FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_goals_history_user_date ON public.goals_history(user_id, recorded_at DESC);