-- Routing config (ordered model priorities per feature) on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS routing_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Persist which model produced an analysis + its confidence
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS confidence_score integer;

-- Coach chat history
CREATE TABLE IF NOT EXISTS public.coach_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_messages TO authenticated;
GRANT ALL ON public.coach_messages TO service_role;

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own coach messages"
  ON public.coach_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own coach messages"
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own coach messages"
  ON public.coach_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_coach_messages_user_created
  ON public.coach_messages (user_id, created_at);