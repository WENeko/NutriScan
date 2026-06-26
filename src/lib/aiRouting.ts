/**
 * Moteur de routage des modèles IA avec liste de priorité et fallback en cascade.
 *
 * Chaque fonctionnalité ('photo' | 'text' | 'coach' | 'recipe') possède une liste
 * ORDONNÉE de modèles. Le moteur tente la priorité 1, puis 2, etc. jusqu'au succès.
 *
 * Un "step" peut être :
 *  - { type: 'edge_function' }  → IA par défaut de l'application (Edge Function Lovable)
 *  - { type: 'byok', providerId, model } → clé perso de l'utilisateur (Gemini / OpenAI...)
 *
 * Stockage : profiles.routing_config (JSON) :
 *   { enabled: boolean, photo: RoutingStep[], text: [...], coach: [...], recipe: [...] }
 *
 * Tout est enregistré uniquement sur la base Supabase principale (aucune base perso).
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { appLogger } from "@/services/appLogger";
import { analyzeMealWithGemini } from "@/services/geminiAiService";
import type { ActiveProviderConfig, ApiType } from "@/lib/aiAccess";
import { isLocalApiType } from "@/lib/aiAccess";
import { fallbackModelFor } from "@/lib/providerCatalog";
import { runLocalIntentChat } from "@/services/localAiBridge";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";

export type FeatureKey = "photo" | "text" | "coach" | "recipe";

export interface RoutingStep {
  type: "byok" | "edge_function";
  providerId?: string;
  model?: string;
}

export interface RoutingConfig {
  enabled: boolean;
  photo: RoutingStep[];
  text: RoutingStep[];
  coach: RoutingStep[];
  recipe: RoutingStep[];
  /** Modèles gérés par fournisseur (clé = providerId). Persistés ici pour éviter
   *  de re-saisir la clé API à chaque modèle d'un même fournisseur. */
  models: Record<string, string[]>;
}

export const EDGE_LABEL = "Edge Function Lovable";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  photo: "Analyse de photos (Vision)",
  text: "Analyse de texte",
  coach: "Nutri-Coach (Chat)",
  recipe: "Générateur de recettes",
};

export const emptyRoutingConfig = (): RoutingConfig => ({
  enabled: false,
  photo: [],
  text: [],
  coach: [],
  recipe: [],
  models: {},
});

export function normalizeRoutingConfig(raw: any): RoutingConfig {
  const base = emptyRoutingConfig();
  if (!raw || typeof raw !== "object") return base;
  const pick = (k: FeatureKey): RoutingStep[] =>
    Array.isArray(raw[k]) ? (raw[k] as RoutingStep[]).filter((s) => s && (s.type === "byok" || s.type === "edge_function")) : [];
  const models: Record<string, string[]> = {};
  if (raw.models && typeof raw.models === "object") {
    for (const [pid, list] of Object.entries(raw.models)) {
      if (Array.isArray(list)) models[pid] = (list as any[]).map(String).filter(Boolean);
    }
  }
  return {
    enabled: !!raw.enabled,
    photo: pick("photo"),
    text: pick("text"),
    coach: pick("coach"),
    recipe: pick("recipe"),
    models,
  };
}


interface ResolvedProvider {
  id: string;
  name: string;
  apiType: ApiType;
  baseUrl: string;
  modelsEndpoint: string;
  apiKey: string | null;
}

interface RoutingContext {
  userId: string;
  lovableEnabled: boolean;
  routing: RoutingConfig;
  selectedProviderId: string | null;
  selectedModel: string | null;
  providers: Map<string, ResolvedProvider>;
}

/** Charge profil + fournisseurs + clés perso pour construire le contexte de routage. */
async function loadRoutingContext(userId: string): Promise<RoutingContext> {
  const [{ data: profile }, { data: provs }, { data: keys }] = await Promise.all([
    supabase
      .from("profiles")
      .select("lovable_ai_enabled, routing_config, selected_ai_provider_id, selected_ai_model")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("ai_providers").select("id, name, api_type, base_url, models_endpoint").eq("is_active", true),
    supabase.from("user_provider_keys").select("provider_id, api_key").eq("user_id", userId),
  ]);

  const keyMap = new Map<string, string>();
  (keys as any[] | null)?.forEach((k) => keyMap.set(k.provider_id, k.api_key));

  const providers = new Map<string, ResolvedProvider>();
  (provs as any[] | null)?.forEach((p) =>
    providers.set(p.id, {
      id: p.id,
      name: p.name,
      apiType: (p.api_type as ApiType) ?? "gemini",
      baseUrl: p.base_url,
      modelsEndpoint: p.models_endpoint,
      apiKey: keyMap.get(p.id) ?? null,
    })
  );

  return {
    userId,
    lovableEnabled: !!(profile as any)?.lovable_ai_enabled,
    routing: normalizeRoutingConfig((profile as any)?.routing_config),
    selectedProviderId: ((profile as any)?.selected_ai_provider_id as string) ?? null,
    selectedModel: ((profile as any)?.selected_ai_model as string) ?? null,
    providers,
  };
}

/** Construit la cascade par défaut (mode non-expert) : Edge Function puis clé perso. */
function defaultSteps(ctx: RoutingContext): RoutingStep[] {
  const steps: RoutingStep[] = [];
  if (ctx.lovableEnabled) steps.push({ type: "edge_function" });
  if (ctx.selectedProviderId) {
    const p = ctx.providers.get(ctx.selectedProviderId);
    // Un fournisseur local n'a pas besoin de clé.
    if (p && (p.apiKey || p.apiType === "local")) {
      steps.push({ type: "byok", providerId: ctx.selectedProviderId, model: ctx.selectedModel ?? undefined });
    }
  }
  return steps;
}

/** Liste ordonnée des steps réellement exécutables pour une fonctionnalité. */
function resolveSteps(ctx: RoutingContext, feature: FeatureKey): RoutingStep[] {
  let steps = ctx.routing.enabled ? ctx.routing[feature] : [];
  if (!steps || steps.length === 0) steps = defaultSteps(ctx);
  // Filtre les steps non exécutables (edge sans droit, byok sans clé sauf local).
  return steps.filter((s) => {
    if (s.type === "edge_function") return ctx.lovableEnabled;
    const p = s.providerId ? ctx.providers.get(s.providerId) : null;
    return !!p && (!!p.apiKey || p.apiType === "local");
  });
}

function toConfidenceInt(raw: any): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (Number.isNaN(n)) return undefined;
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// ── Appel chat générique (BYOK) pour coach / recettes ────────────────────────
async function callChatProvider(p: ResolvedProvider, model: string, system: string, userText: string): Promise<string> {
  const baseUrl = p.baseUrl.replace(/\/+$/, "");
  if (p.apiType === "openai" || p.apiType === "local") {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }
  // Gemini
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${p.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
    }),
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export interface AnalysisPayload {
  image?: string;
  text?: string;
  custom_foods?: any[];
  custom_nutrients?: { key: string; label?: string; unit: string }[];
  local_time?: string;
}

export interface ChatPayload {
  system: string;
  userText: string;
}

export interface FeatureResult {
  result: any;
  modelUsed: string;
  confidence?: number;
}

function labelForStep(ctx: RoutingContext, step: RoutingStep): string {
  if (step.type === "edge_function") return EDGE_LABEL;
  const p = step.providerId ? ctx.providers.get(step.providerId) : null;
  const model = step.model || ctx.selectedModel || "modèle";
  return p ? `${p.name} · ${model}` : model;
}

/**
 * Exécute une fonctionnalité IA en suivant la liste de priorité avec fallback en cascade.
 * Retourne le résultat, le nom du modèle ayant réussi, et un indice de confiance (analyse).
 */
export async function executeAIFeatureWithFallback(
  feature: FeatureKey,
  payload: AnalysisPayload | ChatPayload
): Promise<FeatureResult> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Utilisateur non authentifié.");

  const ctx = await loadRoutingContext(userId);
  const steps = resolveSteps(ctx, feature);

  if (steps.length === 0) {
    throw new Error(
      "Aucun modèle IA configuré pour cette fonctionnalité. Ajoutez une clé API dans Réglages ou demandez l'accès à l'IA de l'application."
    );
  }

  const isAnalysis = feature === "photo" || feature === "text";
  const errors: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const label = labelForStep(ctx, step);
    try {
      appLogger.info("AIRouting", `Tentative priorité ${i + 1} (${feature}) : ${label}`);

      if (isAnalysis) {
        const ap = payload as AnalysisPayload;
        let data: any;
        if (step.type === "edge_function") {
          const { data: d, error } = await supabase.functions.invoke("analyze-meal", {
            body: { image: ap.image, text: ap.text, custom_foods: ap.custom_foods, custom_nutrients: ap.custom_nutrients, std_nutrients: NUTRIENTS_STD_LIST, local_time: ap.local_time },
          });
          if (error) throw new Error(error.message || "Edge function indisponible");
          if (d?.error) throw new Error(d.error);
          if (!d || !Array.isArray(d.items)) throw new Error("Réponse vide/invalide");
          data = d;
        } else {
          const p = ctx.providers.get(step.providerId!)!;
          const override: ActiveProviderConfig = {
            providerId: p.id,
            name: p.name,
            apiType: p.apiType,
            baseUrl: p.baseUrl,
            modelsEndpoint: p.modelsEndpoint,
            model: step.model ?? ctx.selectedModel ?? null,
            apiKey: p.apiKey,
          };
          data = await analyzeMealWithGemini({ ...ap, providerOverride: override });
          if (!data || !Array.isArray(data.items)) throw new Error("Réponse vide/invalide");
        }
        return { result: data, modelUsed: label, confidence: toConfidenceInt(data?.confidence_score) };
      }

      // ── Chat (coach / recette) ──
      const cp = payload as ChatPayload;
      let text: string;
      let modelUsed = label;
      if (step.type === "edge_function") {
        const { data: d, error } = await supabase.functions.invoke("coach-chat", {
          body: { system: cp.system, message: cp.userText },
        });
        if (error) throw new Error(error.message || "Edge function indisponible");
        if (d?.error) throw new Error(d.error);
        text = d?.reply ?? "";
        if (d?.model) modelUsed = `${EDGE_LABEL} · ${d.model}`;
      } else {
        const p = ctx.providers.get(step.providerId!)!;
        const chatModel = step.model ?? ctx.selectedModel ?? fallbackModelFor(p.baseUrl, p.apiType);
        text = await callChatProvider(p, chatModel, cp.system, cp.userText);
        modelUsed = `${p.name} · ${chatModel}`;
      }
      if (!text || !text.trim()) throw new Error("Réponse vide");
      return { result: text.trim(), modelUsed };
    } catch (e: any) {
      const msg = e?.message ?? "erreur inconnue";
      errors.push(`${label}: ${msg}`);
      appLogger.warn("AIRouting", `Échec ${label}`, msg);
      const hasNext = i < steps.length - 1;
      if (hasNext) {
        toast({
          title: "Modèle principal indisponible",
          description: "Basculement automatique sur la priorité suivante…",
        });
      }
    }
  }

  throw new Error(
    `Tous les modèles ont échoué. Vérifiez vos clés API dans Réglages.\n${errors.join("\n")}`
  );
}

/** Sauvegarde la config de routage (uniquement base Supabase principale). */
export async function saveRoutingConfig(userId: string, config: RoutingConfig) {
  return supabase.from("profiles").update({ routing_config: config as any }).eq("user_id", userId);
}

/** Charge la config de routage normalisée. */
export async function loadRoutingConfig(userId: string): Promise<RoutingConfig> {
  const { data } = await supabase.from("profiles").select("routing_config").eq("user_id", userId).maybeSingle();
  return normalizeRoutingConfig((data as any)?.routing_config);
}
