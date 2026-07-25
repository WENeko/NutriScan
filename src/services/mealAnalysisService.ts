/**
 * Service unifié d'analyse de repas.
 *
 * Utilise le moteur de routage en cascade (executeAIFeatureWithFallback) :
 * la liste ordonnée des modèles configurés par l'utilisateur est tentée
 * (Edge Function Lovable et/ou clés perso) jusqu'au premier succès.
 *
 * Le résultat renvoyé est l'objet d'analyse habituel (meal_name, items, ...),
 * enrichi de `_model_used` et `_confidence_score` pour l'affichage et l'historique.
 */
import { appLogger } from "./appLogger";
import { executeAIFeatureWithFallback } from "@/lib/aiRouting";

import type { RoutingProgressEvent, RoutingStep } from "@/lib/aiRouting";

export interface AnalyzeMealParams {
  image?: string;
  text?: string;
  custom_foods?: any[];
  custom_nutrients?: { key: string; label?: string; unit: string }[];
  local_time?: string;
  onProgress?: (evt: RoutingProgressEvent) => void;
  overrideSteps?: RoutingStep[];
}

export async function analyzeMeal(params: AnalyzeMealParams): Promise<any> {
  const feature = params.image ? "photo" : "text";
  appLogger.info("MealAnalysis", `Analyse via moteur de routage (${feature})`, {
    hasImage: !!params.image,
    hasText: !!params.text,
  });

  const { result, modelUsed, confidence } = await executeAIFeatureWithFallback(
    feature,
    {
      image: params.image,
      text: params.text,
      custom_foods: params.custom_foods,
      custom_nutrients: params.custom_nutrients,
      local_time: params.local_time,
    },
    params.onProgress,
    params.overrideSteps
  );

  appLogger.info("MealAnalysis", `OK via ${modelUsed}`, { confidence });

  if (result && typeof result === "object") {
    result._model_used = modelUsed;
    result._confidence_score = confidence ?? null;
  }
  return result;
}

