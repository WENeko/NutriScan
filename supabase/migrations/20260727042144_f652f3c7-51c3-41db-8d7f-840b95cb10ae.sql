ALTER TABLE public.user_provider_keys ALTER COLUMN api_key DROP NOT NULL;
ALTER TABLE public.user_provider_keys ADD COLUMN IF NOT EXISTS base_url text;

INSERT INTO public.ai_providers (name, api_type, base_url, models_endpoint, is_active, display_order)
SELECT 'Serveur Perso (Ollama / OpenAI compatible)', 'custom', 'http://localhost:11434/v1', '/models', true, 50
WHERE NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE api_type = 'custom');