ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS goals_mode TEXT NOT NULL DEFAULT 'scientific',
  ADD COLUMN IF NOT EXISTS ai_coach_prompt TEXT;