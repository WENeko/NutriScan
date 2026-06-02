/**
 * Gestion de l'accès IA par utilisateur.
 *
 * Règle métier (validée avec l'utilisateur) :
 * - Si l'admin a activé `lovable_ai_enabled` pour l'utilisateur → l'IA passe par
 *   les edge functions Lovable (analyze-meal, describe-nutrient).
 * - Sinon → l'utilisateur doit utiliser SA propre clé Gemini (stockée en base,
 *   table `user_api_keys`), utilisée directement côté client.
 *
 * Les valeurs sont mises en cache dans localStorage pour éviter une requête DB
 * à chaque analyse. `loadAiAccess` est appelé au login et après modification.
 */
import { supabase } from "@/integrations/supabase/client";

const LS_LOVABLE = "lovable_ai_enabled";
const LS_GEMINI = "user_gemini_api_key";

/** Charge l'accès IA de l'utilisateur depuis la base et met à jour le cache local. */
export async function loadAiAccess(userId: string): Promise<void> {
  try {
    const [{ data: profile }, { data: keyRow }] = await Promise.all([
      supabase.from("profiles").select("lovable_ai_enabled").eq("user_id", userId).maybeSingle(),
      supabase.from("user_api_keys").select("gemini_api_key").eq("user_id", userId).maybeSingle(),
    ]);

    localStorage.setItem(LS_LOVABLE, (profile as any)?.lovable_ai_enabled ? "true" : "false");

    const key = (keyRow as any)?.gemini_api_key;
    if (key) localStorage.setItem(LS_GEMINI, key);
    else localStorage.removeItem(LS_GEMINI);
  } catch (e) {
    console.warn("loadAiAccess error", e);
  }
}

/** true si l'utilisateur peut utiliser les edge functions IA de Lovable. */
export function isLovableAiEnabled(): boolean {
  return localStorage.getItem(LS_LOVABLE) === "true";
}

/** Clé Gemini personnelle (cache local). */
export function getPersonalGeminiKey(): string | null {
  return localStorage.getItem(LS_GEMINI);
}

/** Met à jour le cache local de la clé Gemini après une sauvegarde. */
export function setPersonalGeminiKeyCache(key: string | null): void {
  if (key) localStorage.setItem(LS_GEMINI, key);
  else localStorage.removeItem(LS_GEMINI);
}

export function clearAiAccessCache(): void {
  localStorage.removeItem(LS_LOVABLE);
  localStorage.removeItem(LS_GEMINI);
}
