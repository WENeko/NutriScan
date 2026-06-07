/**
 * Gestion de l'accès IA par utilisateur.
 *
 * Règle métier (validée avec l'utilisateur) :
 * - Si l'admin a activé `lovable_ai_enabled` pour l'utilisateur → l'IA passe par
 *   les edge functions Lovable (analyze-meal, describe-nutrient).
 * - Sinon → l'utilisateur utilise SA propre clé, auprès du fournisseur d'IA
 *   qu'il a sélectionné (table `ai_providers` + `user_provider_keys`), avec le
 *   modèle de son choix. Les fournisseurs sont gérés par l'admin (évolutif).
 *
 * Les valeurs sont mises en cache dans localStorage pour éviter une requête DB
 * à chaque analyse. `loadAiAccess` est appelé au login et après modification.
 */
import { supabase } from "@/integrations/supabase/client";

const LS_LOVABLE = "lovable_ai_enabled";
const LS_PROVIDER = "ai_provider_config";

export type ApiType = "gemini" | "openai";

export interface ActiveProviderConfig {
  providerId: string;
  name: string;
  apiType: ApiType;
  baseUrl: string;
  modelsEndpoint: string;
  model: string | null;
  apiKey: string | null;
}

/** Charge l'accès IA de l'utilisateur depuis la base et met à jour le cache local. */
export async function loadAiAccess(userId: string): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("lovable_ai_enabled, selected_ai_provider_id, selected_ai_model")
      .eq("user_id", userId)
      .maybeSingle();

    localStorage.setItem(LS_LOVABLE, (profile as any)?.lovable_ai_enabled ? "true" : "false");

    const providerId = (profile as any)?.selected_ai_provider_id as string | null;
    if (!providerId) {
      localStorage.removeItem(LS_PROVIDER);
      return;
    }

    const [{ data: provider }, { data: keyRow }] = await Promise.all([
      supabase
        .from("ai_providers")
        .select("id, name, api_type, base_url, models_endpoint")
        .eq("id", providerId)
        .maybeSingle(),
      supabase
        .from("user_provider_keys")
        .select("api_key")
        .eq("user_id", userId)
        .eq("provider_id", providerId)
        .maybeSingle(),
    ]);

    if (!provider) {
      localStorage.removeItem(LS_PROVIDER);
      return;
    }

    const config: ActiveProviderConfig = {
      providerId: (provider as any).id,
      name: (provider as any).name,
      apiType: ((provider as any).api_type as ApiType) ?? "gemini",
      baseUrl: (provider as any).base_url,
      modelsEndpoint: (provider as any).models_endpoint,
      model: ((profile as any)?.selected_ai_model as string) ?? null,
      apiKey: ((keyRow as any)?.api_key as string) ?? null,
    };
    localStorage.setItem(LS_PROVIDER, JSON.stringify(config));
  } catch (e) {
    console.warn("loadAiAccess error", e);
  }
}

/** true si l'utilisateur peut utiliser les edge functions IA de Lovable. */
export function isLovableAiEnabled(): boolean {
  return localStorage.getItem(LS_LOVABLE) === "true";
}

/** Configuration du fournisseur d'IA sélectionné (cache local). */
export function getActiveProviderConfig(): ActiveProviderConfig | null {
  const raw = localStorage.getItem(LS_PROVIDER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveProviderConfig;
  } catch {
    return null;
  }
}

export function clearAiAccessCache(): void {
  localStorage.removeItem(LS_LOVABLE);
  localStorage.removeItem(LS_PROVIDER);
}

/**
 * true si une IA est réellement utilisable : soit l'IA de l'application est
 * activée, soit un fournisseur perso avec une clé est sélectionné.
 */
export function isAiConfigured(): boolean {
  if (isLovableAiEnabled()) return true;
  const cfg = getActiveProviderConfig();
  return !!(cfg && cfg.apiKey);
}

