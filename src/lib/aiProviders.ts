/**
 * Helpers fournisseurs d'IA (évolutif, géré par l'admin via la table ai_providers).
 *
 * Deux types d'API supportés :
 * - "gemini"  : Google Generative Language API (clé en query param, format `contents`).
 * - "openai"  : API compatible OpenAI (Bearer token, format `messages`/`chat/completions`).
 *
 * La liste des modèles est remontée DYNAMIQUEMENT depuis le fournisseur, pour ne
 * jamais figer un nom de modèle dans le code.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ApiType } from "@/lib/aiAccess";

export interface AiProvider {
  id: string;
  name: string;
  api_type: ApiType;
  base_url: string;
  models_endpoint: string;
  is_active: boolean;
  display_order: number;
}

/** Vrai si l'URL pointe vers l'appareil ou un réseau privé (non joignable côté serveur). */
function isLocalHost(baseUrl: string): boolean {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    host = baseUrl.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** Concatène base_url + endpoint en évitant les doubles slashs. */
function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Liste les fournisseurs actifs (ou tous si admin via RLS). */
export async function listProviders(includeInactive = false): Promise<AiProvider[]> {
  let query = supabase
    .from("ai_providers")
    .select("id, name, api_type, base_url, models_endpoint, is_active, display_order")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data as AiProvider[]) ?? [];
}

/**
 * Récupère la liste des modèles disponibles directement depuis le fournisseur.
 * Renvoie des identifiants de modèle utilisables tels quels lors de l'analyse.
 */
export async function fetchProviderModels(
  provider: Pick<AiProvider, "api_type" | "base_url" | "models_endpoint">,
  apiKey: string
): Promise<string[]> {
  // Un serveur perso / self-hosted (Ollama, vLLM, LocalAI…) peut être ouvert : clé facultative.
  const keyOptional = provider.api_type === "custom" || provider.api_type === "local";
  if (!apiKey && !keyOptional) throw new Error("Clé API requise pour lister les modèles.");

  // La plupart des fournisseurs (GitHub Models, NVIDIA NIM, Azure AI…) n'envoient
  // aucun en-tête CORS : un appel direct depuis le navigateur échoue avec
  // "Failed to fetch". On relaie donc via une Edge Function, sauf pour un
  // serveur local/réseau privé qui n'est joignable que depuis l'appareil.
  if (!isLocalHost(provider.base_url)) {
    const { data, error } = await supabase.functions.invoke("list-provider-models", {
      body: {
        api_type: provider.api_type,
        base_url: provider.base_url,
        models_endpoint: provider.models_endpoint,
        api_key: apiKey,
      },
    });
    if (error) {
      let details = error.message;
      const ctx = (error as any)?.context;
      if (ctx?.text) {
        try {
          const body = JSON.parse(await ctx.text());
          details = body?.details || body?.error || details;
        } catch {
          /* corps non JSON : on garde le message d'origine */
        }
      }
      throw new Error(details);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return ((data as any)?.models ?? []) as string[];
  }


  if (provider.api_type === "gemini") {
    // Endpoint canonique des modèles Gemini (robuste si la config DB est erronée).
    const endpoint = /\/models\b/.test(provider.models_endpoint) ? provider.models_endpoint : "/v1beta/models";
    // Auth Gemini : clé en paramètre ?key=...
    const url = `${joinUrl(provider.base_url, endpoint)}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur ${res.status} lors de la récupération des modèles.`);
    const json = await res.json();
    const models = (json?.models ?? []) as Array<{ name: string; supportedGenerationMethods?: string[] }>;
    return models
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /gemini/i.test(n))
      .sort();
  }

  // openai-compatible : la liste des modèles est sur /models (jamais /chat/completions).
  // ATTENTION : header Authorization: Bearer obligatoire (sinon 401/404).
  const endpoint = provider.models_endpoint && /models\s*$/.test(provider.models_endpoint)
    ? provider.models_endpoint
    : "/models";
  const url = joinUrl(provider.base_url, endpoint);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Erreur ${res.status} lors de la récupération des modèles.`);
  const json = await res.json();
  // Certains fournisseurs (GitHub Models, Azure AI) renvoient un tableau au
  // niveau racine ; d'autres encapsulent dans { data: [...] } ou { models: [...] }.
  const list = (Array.isArray(json) ? json : (json?.data ?? json?.models ?? [])) as Array<{
    id?: string;
    name?: string;
  }>;
  return list
    .map((m) => {
      // Si l'id est une URI (ex. azureml://.../versions/3), il n'est pas utilisable
      // tel quel comme nom de modèle : on privilégie alors le champ `name`.
      const id = m.id ?? "";
      if (id && !id.includes("://")) return id;
      return m.name ?? id ?? "";
    })
    .filter(Boolean)
    .sort();
}

/** URL de base personnalisée enregistrée par l'utilisateur (serveur perso). */
export async function getUserProviderBaseUrl(userId: string, providerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_provider_keys")
    .select("base_url")
    .eq("user_id", userId)
    .eq("provider_id", providerId)
    .maybeSingle();
  return (data as any)?.base_url ?? null;
}

/** Enregistre l'URL de base personnalisée (et éventuellement la clé) d'un serveur perso. */
export async function saveUserProviderServer(
  userId: string,
  providerId: string,
  baseUrl: string,
  apiKey: string | null
) {
  return supabase.from("user_provider_keys").upsert(
    { user_id: userId, provider_id: providerId, base_url: baseUrl || null, api_key: apiKey || null },
    { onConflict: "user_id,provider_id" }
  );
}

/** Clé enregistrée par l'utilisateur pour un fournisseur donné. */
export async function getUserProviderKey(userId: string, providerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_provider_keys")
    .select("api_key")
    .eq("user_id", userId)
    .eq("provider_id", providerId)
    .maybeSingle();
  return (data as any)?.api_key ?? null;
}

/** Enregistre/écrase la clé de l'utilisateur pour un fournisseur. */
export async function saveUserProviderKey(userId: string, providerId: string, apiKey: string) {
  return supabase
    .from("user_provider_keys")
    .upsert({ user_id: userId, provider_id: providerId, api_key: apiKey }, { onConflict: "user_id,provider_id" });
}

export async function deleteUserProviderKey(userId: string, providerId: string) {
  return supabase.from("user_provider_keys").delete().eq("user_id", userId).eq("provider_id", providerId);
}

/** Enregistre la sélection (fournisseur + modèle) de l'utilisateur sur son profil. */
export async function saveUserSelection(userId: string, providerId: string, model: string | null) {
  return supabase
    .from("profiles")
    .update({ selected_ai_provider_id: providerId, selected_ai_model: model })
    .eq("user_id", userId);
}
