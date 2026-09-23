/**
 * Orchestrateur du MODE HYBRIDE ultra-rapide.
 *
 *   Étage 1 — détection            : Laya (photo, ~30-60 ms) ou parseur texte (< 1 ms)
 *   Étage 2 — résolution           : bibliothèque perso → table embarquée → Open Food Facts
 *   Étage 3 — complétion des trous : micro-LLM local (LiteRT-LM), prompt texte court
 *
 * Le résultat respecte EXACTEMENT le contrat de `analyzeMealWithGemini`
 * (meal_name, confidence_score, items[], total_summary) : tout le reste de
 * l'application (enregistrement, édition, Health Connect, graphiques) fonctionne
 * sans modification.
 */
import { appLogger } from "@/services/appLogger";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";
import type { CustomNutrientDef } from "@/utils/nutrients-helpers";
import { detectFoodsWithLaya, isLayaAvailable } from "@/services/hybrid/layaVision";
import { extractSuggestedTimestamp, parseMealText } from "@/services/hybrid/mealTextParser";
import { resolveFoodItems, type FoodQuery, type ResolvedFoodItem } from "@/services/hybrid/nutritionResolver";

export const HYBRID_LABEL = "Hybride ultra-rapide (Laya + base locale)";

export type HybridStage = "detection" | "resolution" | "completion" | "done";

export interface HybridProgress {
  stage: HybridStage;
  /** Durée cumulée depuis le début, en ms. */
  elapsedMs: number;
  detail?: string;
}

export interface HybridAnalysisInput {
  image?: string;
  text?: string;
  custom_foods?: any[];
  custom_nutrients?: CustomNutrientDef[];
  local_time?: string;
  /** Autoriser l'appel Open Food Facts (réseau). */
  allowNetwork?: boolean;
  /** Autoriser l'étage 3 (micro-LLM local). */
  allowMicroLlm?: boolean;
  microLlmModel?: string;
  onStage?: (evt: HybridProgress) => void;
}

export interface HybridAnalysisResult {
  meal_name: string;
  confidence_score: number;
  suggested_timestamp?: string;
  items: ResolvedFoodItem[];
  total_summary: { calories: number; proteins: number; carbs: number; fats: number };
  /** Diagnostic du pipeline (affiché dans l'indicateur de progression). */
  pipeline: {
    detectionMs: number;
    resolutionMs: number;
    totalMs: number;
    mode: "photo" | "text";
    detectionModel?: string;
    sources: Record<string, number>;
  };
}

/** true si le mode hybride peut tourner pour cette fonctionnalité. */
export async function isHybridAvailable(feature: "photo" | "text"): Promise<boolean> {
  // Le mode texte est 100 % déterministe : toujours disponible.
  if (feature === "text") return true;
  return isLayaAvailable();
}

function titleCase(s: string): string {
  return s.replace(/\b[a-zà-ÿ]/g, (c) => c.toUpperCase());
}

function buildMealName(items: ResolvedFoodItem[]): string {
  if (items.length === 0) return "Repas";
  const names = items.slice(0, 3).map((i) => i.name);
  const suffix = items.length > 3 ? ` +${items.length - 3}` : "";
  return titleCase(names.join(", ")) + suffix;
}

/** Analyse un repas via le pipeline hybride (photo OU texte). */
export async function analyzeMealHybrid(input: HybridAnalysisInput): Promise<HybridAnalysisResult> {
  const started = Date.now();
  const emit = (stage: HybridStage, detail?: string) =>
    input.onStage?.({ stage, elapsedMs: Date.now() - started, detail });

  const mode: "photo" | "text" = input.image ? "photo" : "text";
  const customNutrients = (input.custom_nutrients ?? []).filter((c) => c?.key && c?.unit);

  // ── Étage 1 : détection ────────────────────────────────────────────────────
  emit("detection", mode === "photo" ? "Détection visuelle Laya" : "Lecture de la saisie");
  const detectionStart = Date.now();
  let queries: FoodQuery[] = [];
  let detectionModel: string | undefined;

  if (mode === "photo") {
    const laya = await detectFoodsWithLaya(input.image!, { minConfidence: 0.2, maxResults: 6 });
    detectionModel = laya.model;
    if (laya.detections.length === 0) {
      throw new Error("Aucun aliment reconnu par la détection rapide — bascule sur un modèle plus complet.");
    }
    queries = laya.detections.map((d) => ({
      name: d.name,
      // Sans repère d'échelle, on part d'une portion standard ; l'utilisateur ajuste ensuite.
      weightG: 120,
      detectionConfidence: d.confidence,
    }));
    // Un texte additionnel (ex: « 150g de riz ») affine les poids détectés.
    if (input.text) {
      const mentions = parseMealText(input.text);
      for (const m of mentions) {
        const match = queries.find((q) => q.name.includes(m.name) || m.name.includes(q.name));
        if (match && !m.assumed) {
          match.weightG = m.weightG;
          match.unitCount = m.unitCount;
          match.unitWeightG = m.unitWeightG;
          match.unitLabel = m.unitLabel;
        } else if (!match) {
          queries.push({ ...m, detectionConfidence: 1 });
        }
      }
    }
  } else {
    const mentions = parseMealText(input.text ?? "");
    if (mentions.length === 0) {
      throw new Error("Aucun aliment identifié dans la saisie — bascule sur un modèle plus complet.");
    }
    queries = mentions.map((m) => ({
      name: m.name,
      weightG: m.weightG,
      unitCount: m.unitCount,
      unitWeightG: m.unitWeightG,
      unitLabel: m.unitLabel,
      detectionConfidence: m.assumed ? 0.7 : 1,
    }));
  }
  const detectionMs = Date.now() - detectionStart;

  // ── Étages 2 & 3 : résolution + complétion ────────────────────────────────
  emit("resolution", `${queries.length} aliment(s) à résoudre`);
  const resolutionStart = Date.now();
  const items = await resolveFoodItems(queries, {
    customFoods: input.custom_foods,
    customNutrients,
    fromImage: mode === "photo",
    allowNetwork: input.allowNetwork !== false,
    allowMicroLlm: input.allowMicroLlm !== false,
    microLlmModel: input.microLlmModel,
  });
  const resolutionMs = Date.now() - resolutionStart;

  if (items.length === 0) {
    throw new Error("Aucun aliment résolu par le pipeline hybride.");
  }

  emit("completion", "Consolidation des micronutriments");

  // ── Totaux ────────────────────────────────────────────────────────────────
  const total = items.reduce(
    (acc, i) => ({
      calories: acc.calories + (Number(i.calories) || 0),
      proteins: acc.proteins + (Number(i.proteins) || 0),
      carbs: acc.carbs + (Number(i.carbs) || 0),
      fats: acc.fats + (Number(i.fats) || 0),
    }),
    { calories: 0, proteins: 0, carbs: 0, fats: 0 },
  );

  const sources: Record<string, number> = {};
  for (const i of items) sources[i.source] = (sources[i.source] ?? 0) + 1;

  const confidence =
    items.reduce((s, i) => s + (Number(i.confidence) || 0), 0) / items.length;

  const result: HybridAnalysisResult = {
    meal_name: buildMealName(items),
    confidence_score: Math.round(confidence * 100) / 100,
    suggested_timestamp: input.text ? extractSuggestedTimestamp(input.text) : undefined,
    items,
    total_summary: {
      calories: Math.round(total.calories),
      proteins: Math.round(total.proteins * 10) / 10,
      carbs: Math.round(total.carbs * 10) / 10,
      fats: Math.round(total.fats * 10) / 10,
    },
    pipeline: {
      detectionMs,
      resolutionMs,
      totalMs: Date.now() - started,
      mode,
      detectionModel,
      sources,
    },
  };

  emit("done", `${result.pipeline.totalMs} ms`);
  appLogger.info("Hybride", `Analyse ${mode} terminée en ${result.pipeline.totalMs} ms`, {
    items: items.length,
    sources,
  });

  // Garde-fou : les micros standards manquants restent absents plutôt que faux.
  void NUTRIENTS_STD_LIST;
  return result;
}
