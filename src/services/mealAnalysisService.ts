/**
 * Service unifié d'analyse de repas.
 * 1. Tentative via la function Lovable `analyze-meal` (AI Gateway, qualité optimale).
 * 2. Fallback automatique vers le Gemini perso (clé utilisateur) si :
 *    - HTTP 402 (crédits Lovable AI épuisés)
 *    - HTTP 429 (rate limit)
 *    - erreur réseau / function indisponible
 *
 * Le Gemini perso (`geminiAiService.analyzeMealWithGemini`) produit désormais
 * la MÊME shape que la function Lovable (items[{name, estimated_weight_g, ...}]),
 * pour que le reste de l'app reste indifférent à la source utilisée.
 */
import { supabase } from "@/integrations/supabase/client";
import { analyzeMealWithGemini } from "./geminiAiService";
import { appLogger } from "./appLogger";
import { toast } from "@/hooks/use-toast";

export interface AnalyzeMealParams {
  image?: string;
  text?: string;
  custom_foods?: any[];
  custom_nutrients?: { key: string; label?: string; unit: string }[];
  local_time?: string;
}

async function tryFallback(params: AnalyzeMealParams, reason: string) {
  appLogger.warn("MealAnalysis", `Fallback Gemini perso : ${reason}`);
  toast({
    title: "Analyse via clé perso",
    description: reason,
  });
  return await analyzeMealWithGemini(params);
}

export async function analyzeMeal(params: AnalyzeMealParams): Promise<any> {
  appLogger.info("MealAnalysis", "Appel analyze-meal (Lovable)", {
    hasImage: !!params.image,
    hasText: !!params.text,
  });

  try {
    const { data, error } = await supabase.functions.invoke("analyze-meal", {
      body: params,
    });

    if (error) {
      // Tente d'extraire le status HTTP / payload d'erreur
      let status: number | undefined;
      let errBody: any = null;
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.status === "number") status = ctx.status;
      if (ctx?.json) {
        try { errBody = await ctx.clone().json(); } catch { /* noop */ }
      }
      const msg = (errBody?.error || error.message || "").toLowerCase();
      const isCreditsExhausted =
        status === 402 || /crédit|credit|insuffisant|payment/.test(msg);
      const isRateLimited =
        status === 429 || /rate|quota|too many/.test(msg);

      if (isCreditsExhausted) {
        return await tryFallback(params, "Crédits IA Lovable épuisés");
      }
      if (isRateLimited) {
        return await tryFallback(params, "Limite de requêtes Lovable atteinte");
      }
      // Autre erreur → tente quand même le fallback (cas function indisponible)
      return await tryFallback(params, `Lovable AI indisponible (${status ?? "?"})`);
    }

    if (data?.error) {
      return await tryFallback(params, `Lovable: ${data.error}`);
    }

    if (!data || !Array.isArray(data.items)) {
      return await tryFallback(params, "Réponse Lovable vide/invalide");
    }

    appLogger.info("MealAnalysis", "OK via Lovable", { items: data.items.length });
    return data;
  } catch (e: any) {
    return await tryFallback(params, `Exception: ${e?.message ?? "inconnue"}`);
  }
}
