ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expert_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS micro_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;