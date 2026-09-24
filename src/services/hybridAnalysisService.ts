/**
 * Pipeline hybride ultra-rapide (photo & texte).
 *
 * Trois étages, du plus rapide au plus coûteux :
 *   1. Détection    — modèle de décision local (Laya / classifieur .tflite) sur
 *                     l'image, ou parseur déterministe sur la saisie texte.
 *   2. Résolution    — bibliothèque perso → table embarquée → Open Food Facts.
 *                     Macros ET 15 micronutriments standards calculés par
 *                     règle de trois, sans aucune hallucination possible.
 *   3. Complétion    — micro-LLM local, uniquement pour les cases restées vides
 *                     (typiquement les micronutriments personnalisés).
 *
 * La sortie respecte exactement le contrat de `analyzeMealWithGemini`
 * (meal_name, confidence_score, items[], total_summary) afin d'être consommée
 * sans adaptation par MealInput, MealScanner et le moteur de routage.
 */

import { appLogger } from "@/lib/appLogger";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";
import { detectFoodsWithLaya, isLayaAvailable, getSelectedLayaModel } from "./hybrid/layaVision";
import { parseMealText, extractSuggestedTimestamp } from "./hybrid/mealTextParser";
import { resolveFoodItems, type FoodQuery, type ResolutionSource, type ResolvedFoodItem } from "./hybrid/nutritionResolver";

export const HYBRID_LABEL = "Hybride ultra-rapide (local)";

export type HybridStage = "detection" | "resolution" | "completion" | "done";

export interface HybridProgressEvent {
  stage: HybridStage;
  /** Nombre d'aliments identifiés (dès l'étage 1). */
  itemCount?: number;
  /** Durée cumulée en ms depuis le début de l'analyse. */
  elapsedMs?: number;
}

export interface HybridAnalysisInput {
  image?: string | null;
  text?: string | null;
  custom_foods?: any[];
  custom_nutrients?: { key: string; label: string; unit: string }[];
  local_time?: string;
  /** Autorise l'appel réseau à Open Food Facts (activé par défaut). */
  allowNetwork?: boolean;
  /** Autorise le micro-LLM local de complétion (activé par défaut). */
  allowMicroLlm?: boolean;
  onStage?: (event: HybridProgressEvent) => void;
}

export interface HybridPipelineMetrics {
  detectionMs: number;
  resolutionMs: number;
  totalMs: number;
  mode: "photo" | "text";
  detectionModel?: string;
  sources: Partial<Record<ResolutionSource, number>>;
}

export interface HybridAnalysisResult {
  meal_name: string;
  confidence_score: number;
  suggested_timestamp?: string;
  items: any[];
  total_summary: Record<string, number>;
  pipeline: HybridPipelineMetrics;
}

const STD_KEYS = NUTRIENTS_STD_LIST.map((n) => n.key);

/**
 * Le mode hybride est-il exécutable ?
 * Le texte l'est toujours (parseur + bases déterministes) ; la photo exige un
 * modèle de détection installé sur l'appareil.
 */
export async function isHybridAvailable(feature: "photo" | "text" = "photo"): Promise<boolean> {
  if (feature === "text") return true;
  try {
    return await isLayaAvailable();
  } catch {
    return false;
  }
}

/** Nom de repas lisible à partir des aliments résolus. */
function buildMealName(items: ResolvedFoodItem[]): string {
  const names = items.map((i) => i.name).filter(Boolean);
  if (names.length === 0) return "Repas";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} et ${names[1].toLowerCase()}`;
  return `${names[0]}, ${names[1].toLowerCase()} et ${names.length - 2} autre(s)`;
}

function sumTotals(items: ResolvedFoodItem[], customKeys: string[]): Record<string, number> {
  const keys = ["calories", "proteins", "carbs", "fats", ...STD_KEYS, ...customKeys];
  const totals: Record<string, number> = {};
  for (const key of keys) {
    let sum = 0;
    for (const item of items) sum += Number((item as any)[key]) || 0;
    if (sum > 0) totals[key] = key === "calories" ? Math.round(sum) : Math.round(sum * 10) / 10;
  }
  return totals;
}

/** Exécute le pipeline hybride et renvoie le contrat d'analyse standard. */
export async function analyzeMealHybrid(input: HybridAnalysisInput): Promise<HybridAnalysisResult> {
  const started = Date.now();
  const mode: "photo" | "text" = input.image ? "photo" : "text";
  const customNutrients = (input.custom_nutrients ?? []).filter((c) => c?.key && c?.unit);
  const emit = (stage: HybridStage, itemCount?: number) =>
    input.onStage?.({ stage, itemCount, elapsedMs: Date.now() - started });

  // ── Étage 1 : détection ────────────────────────────────────────────────────
  emit("detection");
  const detectionStart = Date.now();
  let queries: FoodQuery[] = [];
  let detectionModel: string | undefined;

  if (mode === "photo") {
    const detection = await detectFoodsWithLaya(input.image as string, {
      minConfidence: 0.25,
      maxResults: 5,
    });
    detectionModel = detection.model || getSelectedLayaModel() || undefined;
    queries = detection.detections.map((d) => ({
      name: d.name,
      weightG: 100,
      detectionConfidence: d.confidence,
    }));
    // La saisie texte éventuelle complète la photo (« avec 30 g de parmesan »).
    if (input.text) {
      for (const mention of parseMealText(input.text)) {
        if (queries.some((q) => q.name.toLowerCase() === mention.name.toLowerCase())) continue;
        queries.push({
          name: mention.name,
          weightG: mention.weightG,
          unitCount: mention.unitCount,
          unitWeightG: mention.unitWeightG,
          unitLabel: mention.unitLabel,
          detectionConfidence: mention.assumed ? 0.7 : 1,
        });
      }
    }
  } else {
    queries = parseMealText(input.text ?? "").map((mention) => ({
      name: mention.name,
      weightG: mention.weightG,
      unitCount: mention.unitCount,
      unitWeightG: mention.unitWeightG,
      unitLabel: mention.unitLabel,
      detectionConfidence: mention.assumed ? 0.7 : 1,
    }));
  }

  const detectionMs = Date.now() - detectionStart;
  if (queries.length === 0) {
    throw new Error(
      mode === "photo"
        ? "Aucun aliment reconnu par le modèle local."
        : "Aucun aliment identifié dans le texte saisi.",
    );
  }
  emit("resolution", queries.length);

  // ── Étages 2 et 3 : résolution nutritionnelle et complétion ────────────────
  const resolutionStart = Date.now();
  const items = await resolveFoodItems(queries, {
    customFoods: input.custom_foods,
    customNutrients,
    fromImage: mode === "photo",
    allowNetwork: input.allowNetwork !== false,
    allowMicroLlm: input.allowMicroLlm !== false,
  });
  const resolutionMs = Date.now() - resolutionStart;

  if (items.length === 0) throw new Error("Aucune donnée nutritionnelle résolue.");
  emit("completion", items.length);

  const sources: Partial<Record<ResolutionSource, number>> = {};
  for (const item of items) sources[item.source] = (sources[item.source] ?? 0) + 1;

  const customKeys = customNutrients.map((c) => c.key);
  const confidence = Math.round(
    (items.reduce((acc, i) => acc + (Number(i.confidence) || 0), 0) / items.length) * 100,
  );

  const result: HybridAnalysisResult = {
    meal_name: buildMealName(items),
    confidence_score: Math.max(1, Math.min(100, confidence)),
    suggested_timestamp: input.text
      ? extractSuggestedTimestamp(input.text, input.local_time ? new Date(input.local_time) : new Date())
      : undefined,
    // `food_name` est la clé attendue côté UI ; on conserve aussi `name`.
    items: items.map((item) => ({ ...item, food_name: item.name })),
    total_summary: sumTotals(items, customKeys),
    pipeline: {
      detectionMs,
      resolutionMs,
      totalMs: Date.now() - started,
      mode,
      detectionModel,
      sources,
    },
  };

  appLogger.info(
    "Hybrid",
    `Analyse ${mode} terminée en ${result.pipeline.totalMs} ms (détection ${detectionMs} ms, résolution ${resolutionMs} ms, ${items.length} aliment(s))`,
  );
  emit("done", items.length);
  return result;
}
