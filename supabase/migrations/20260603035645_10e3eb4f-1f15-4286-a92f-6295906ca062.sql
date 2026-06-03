CREATE TABLE public.ai_providers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  api_type text NOT NULL DEFAULT 'gemini',
  base_url text NOT NULL,
  models_endpoint text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_providers TO authenticated;
GRANT ALL ON public.ai_providers TO service_role;

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active providers readable by authenticated"
ON public.ai_providers FOR SELECT TO authenticated
USING (is_active OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert providers"
ON public.ai_providers FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update providers"
ON public.ai_providers FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete providers"
ON public.ai_providers FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ai_providers_updated_at
BEFORE UPDATE ON public.ai_providers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_provider_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  provider_id uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_provider_keys TO authenticated;
GRANT ALL ON public.user_provider_keys TO service_role;

ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own provider keys"
ON public.user_provider_keys FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own provider keys"
ON public.user_provider_keys FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own provider keys"
ON public.user_provider_keys FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own provider keys"
ON public.user_provider_keys FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_provider_keys_updated_at
BEFORE UPDATE ON public.user_provider_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles
  ADD COLUMN selected_ai_provider_id uuid,
  ADD COLUMN selected_ai_model text;

INSERT INTO public.ai_providers (name, api_type, base_url, models_endpoint, display_order)
VALUES ('Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com', '/v1beta/models', 0);

INSERT INTO public.user_provider_keys (user_id, provider_id, api_key)
SELECT k.user_id, p.id, k.gemini_api_key
FROM public.user_api_keys k
CROSS JOIN (SELECT id FROM public.ai_providers WHERE name = 'Google Gemini' LIMIT 1) p
WHERE k.gemini_api_key IS NOT NULL AND k.gemini_api_key <> ''
ON CONFLICT (user_id, provider_id) DO NOTHING;

UPDATE public.profiles
SET selected_ai_provider_id = (SELECT id FROM public.ai_providers WHERE name = 'Google Gemini' LIMIT 1),
    selected_ai_model = COALESCE(selected_ai_model, 'gemini-2.5-flash');