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
  if (!apiKey) throw new Error("Clé API requise pour lister les modèles.");

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
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
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
