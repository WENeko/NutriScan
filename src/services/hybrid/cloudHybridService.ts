/**
 * Mode « Hybride Cloud » : la VISION reste confiée aux modèles cloud déjà
 * configurés dans la cascade (Edge Function ou clé perso), mais les valeurs
 * nutritionnelles ne sont JAMAIS celles générées par le modèle.
 *
 *   1. Détection cloud  — noms, grammes et unités (le contrat d'analyse
 *      habituel est consommé, ses nutriments sont ignorés).
 *   2. Résolution       — sélection sémantique de fiches existantes : bibliothèque
 *      perso → référence embarquée → Open Food Facts → USDA. Titres inchangés.
 *   3. Complétion micros— fiches USDA → CNF sélectionnées sémantiquement, seules
 *      cases vides, listes standard ET personnalisées dynamiques. Aucun chiffre IA.
 *
 * La sortie respecte le contrat de `analyzeMealWithGemini` / `analyzeMealHybrid`
 * (meal_name, confidence_score, items[], total_summary) pour être consommée
 * sans adaptation par MealInput, MealScanner et le moteur de routage.
 */
import { appLogger } from "@/services/appLogger";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";
import type { CustomNutrientDef } from "@/utils/nutrients-helpers";
import { completeMissingMicros } from "./microCompletion";
import { resolveCloudFoodItems } from "./cloudSemanticResolver";
import { type FoodQuery, type ResolutionSource, type ResolvedFoodItem } from "./nutritionResolver";
import { buildMealName, sumTotals, type HybridPipelineMetrics, type HybridProgressEvent } from "@/services/hybridAnalysisService";

export const CLOUD_HYBRID_LABEL = "Hybride cloud (vision + bases officielles)";

export interface CloudHybridInput {
  image?: string | null;
  text?: string | null;
  custom_foods?: any[];
  custom_nutrients?: CustomNutrientDef[];
  local_time?: string;
  onStage?: (event: HybridProgressEvent) => void;
}

export interface CloudHybridResult {
  meal_name: string;
  confidence_score: number;
  suggested_timestamp?: string;
  items: any[];
  total_summary: Record<string, number>;
  pipeline: HybridPipelineMetrics & { detector: string };
}

/** Convertit un aliment détecté par le cloud en requête de résolution. */
export function cloudItemToQuery(item: any, cloudConfidence?: number): FoodQuery | null {
  const name = String(item?.food_name ?? item?.name ?? "").trim();
  if (!name) return null;
  const weightG = Number(item?.estimated_weight_g ?? item?.quantity ?? item?.weight_g);
  if (!Number.isFinite(weightG) || weightG <= 0) return null;
  return {
    name,
    weightG,
    unitCount: item?.unit_count != null ? Number(item.unit_count) : undefined,
    unitWeightG: item?.unit_weight_g != null ? Number(item.unit_weight_g) : undefined,
    unitLabel: item?.unit_label != null ? String(item.unit_label) : undefined,
    detectionConfidence: cloudConfidence != null ? Math.min(1, Math.max(0.5, cloudConfidence)) : 0.9,
  };
}

/**
 * Exécute le mode hybride cloud.
 * @param detect Fonction de détection cloud (edge function ou BYOK) renvoyant
 *               le contrat d'analyse standard ; seuls noms/masses/unités sont lus.
 * @param detectorLabel Libellé du modèle de détection (diagnostic / affichage).
 */
export async function analyzeMealCloudHybrid(
  input: CloudHybridInput,
  detect: () => Promise<any>,
  detectorLabel: string,
): Promise<CloudHybridResult> {
  const started = Date.now();
  const mode: "photo" | "text" = input.image ? "photo" : "text";
  const customNutrients = (input.custom_nutrients ?? []).filter((c) => c?.key && c?.unit);
  const emit = (stage: HybridProgressEvent["stage"], itemCount?: number) =>
    input.onStage?.({ stage, itemCount, elapsedMs: Date.now() - started });

  // ── Étape 1 : détection cloud (vision ou compréhension de texte) ──────────
  emit("detection");
  const detectionStart = Date.now();
  const cloud = await detect();
  const cloudItems: any[] = Array.isArray(cloud?.items) ? cloud.items : [];
  const cloudConfidence = Number(cloud?.confidence_score);
  const queries = cloudItems
    .map((it) => cloudItemToQuery(it, Number.isFinite(cloudConfidence) ? (cloudConfidence <= 1 ? cloudConfidence : cloudConfidence / 100) : undefined))
    .filter((q): q is FoodQuery => q !== null);
  const detectionMs = Date.now() - detectionStart;

  if (queries.length === 0) {
    throw new Error("Le modèle cloud n'a identifié aucun aliment exploitable.");
  }
  emit("resolution", queries.length);

  // ── Étape 2 : résolution déterministe (jamais les chiffres du modèle) ─────
  const resolutionStart = Date.now();
  const resolved = await resolveCloudFoodItems(queries, {
    customFoods: input.custom_foods,
    customNutrients,
    fromImage: mode === "photo",
    allowNetwork: true,
    allowMicroLlm: false,
  });
  // ── Étape 3 : boucle de complétion des micros restés vides ────────────────
  if (resolved.some((item) => item.source === "unresolved") || resolved.length !== queries.length) {
    throw new Error("Données nutritionnelles introuvables pour certains aliments ; essayez un nom plus précis ou ajoutez-les à la bibliothèque.");
  }
  emit("completion", resolved.length);
  const items = (await completeMissingMicros(resolved, customNutrients, { allowAi: false, semanticOnly: true })) as ResolvedFoodItem[];
  const resolutionMs = Date.now() - resolutionStart;

  if (items.length === 0 || items.every((item) => item.source === "unresolved")) {
    throw new Error("Aucune donnée nutritionnelle résolue pour les aliments détectés.");
  }

  const sources: Partial<Record<ResolutionSource, number>> = {};
  for (const item of items) sources[item.source] = (sources[item.source] ?? 0) + 1;

  const customKeys = customNutrients.map((c) => c.key);
  const confidence = Math.round(
    (items.reduce((acc, i) => acc + (Number(i.confidence) || 0), 0) / items.length) * 100,
  );

  const result: CloudHybridResult = {
    meal_name: String(cloud?.meal_name ?? "").trim() || buildMealName(items),
    confidence_score: Math.max(1, Math.min(100, confidence)),
    suggested_timestamp: cloud?.suggested_timestamp,
    items: items.map((item) => ({ ...item, food_name: item.name })),
    total_summary: sumTotals(items, customKeys),
    pipeline: {
      detectionMs,
      resolutionMs,
      totalMs: Date.now() - started,
      mode,
      detectionModel: detectorLabel,
      sources,
      detector: detectorLabel,
    },
  };

  appLogger.info(
    "CloudHybrid",
    `Analyse ${mode} terminée en ${result.pipeline.totalMs} ms (détection ${detectionMs} ms via ${detectorLabel}, résolution ${resolutionMs} ms, ${items.length} aliment(s))`,
  );
  emit("done", items.length);
  return result;
}

/** Nombre de nutriments standard suivis dynamiquement (affichage réglages). */
export const STD_NUTRIENT_COUNT = NUTRIENTS_STD_LIST.length;
