/**
 * Étage 2 + 3 du pipeline hybride : résolution nutritionnelle.
 *
 * Ordre de résolution (le premier qui répond gagne) :
 *   1. Bibliothèque perso de l'utilisateur (`custom_foods` / recettes) — instantané,
 *      et SEULE source qui connaît déjà ses micronutriments personnalisés.
 *   2. Table de référence embarquée (type CIQUAL) — < 1 ms, hors-ligne,
 *      macros + les 15 micros standards.
 *   3. Open Food Facts (réseau, produits emballés) — quelques centaines de ms.
 *   4. Micro-LLM local (LiteRT-LM, prompt texte de 30 tokens) — uniquement pour
 *      COMBLER les trous : nutriments custom inconnus, ou aliment introuvable.
 *
 * Aucune étape ne « devine » ce qu'une étape précédente a déjà fourni : les
 * valeurs déterministes ne sont jamais écrasées par une estimation.
 */
import { appLogger } from "@/services/appLogger";
import { runLocalIntentChat } from "@/services/localAiBridge";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";
import type { CustomNutrientDef } from "@/utils/nutrients-helpers";
import { PER100_FIELD_TO_STDKEY } from "@/utils/nutrients-helpers";
import {
  FOOD_REFERENCE_TABLE,
  cookedEquivalentOf,
  findFoodReference,
  isRawByDefault,
  normalizeName,
  type FoodReference,
} from "./foodReferenceTable";

export type ResolutionSource = "library" | "reference" | "openfoodfacts" | "micro_llm" | "unresolved";

export interface ResolvedFoodItem {
  name: string;
  estimated_weight_g: number;
  unit_count?: number;
  unit_weight_g?: number;
  unit_label?: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  /** Micros standards + custom, pour le poids estimé. */
  [nutrientKey: string]: any;
  /** Origine des données (diagnostic / affichage). */
  source: ResolutionSource;
  /** Confiance 0→1 de la résolution. */
  confidence: number;
}

export interface ResolveOptions {
  /** Bibliothèque perso (rows `custom_foods`). */
  customFoods?: any[];
  /** Définitions des micronutriments personnalisés de l'utilisateur. */
  customNutrients?: CustomNutrientDef[];
  /** true si l'aliment provient d'une PHOTO (donc vu cuit). */
  fromImage?: boolean;
  /** Autoriser l'appel réseau Open Food Facts. */
  allowNetwork?: boolean;
  /** Autoriser l'étage 3 (micro-LLM local sur l'appareil). */
  allowMicroLlm?: boolean;
  /** Modèle local à utiliser pour l'étage 3. */
  microLlmModel?: string;
}

export interface FoodQuery {
  name: string;
  weightG: number;
  unitCount?: number;
  unitWeightG?: number;
  unitLabel?: string;
  /** Confiance de la détection amont (Laya) — 1 pour une saisie texte. */
  detectionConfidence?: number;
}

const STD_KEYS = NUTRIENTS_STD_LIST.map((n) => n.key);

function round1(v: number): number {
  return Math.round((Number(v) || 0) * 10) / 10;
}

/** Applique le ratio portion/100 g à un jeu de valeurs pour 100 g. */
function scalePer100(
  per100: Record<string, number>,
  weightG: number,
  keys: string[],
): Record<string, number> {
  const ratio = weightG / 100;
  const out: Record<string, number> = {};
  for (const k of keys) {
    const v = Number(per100[k]);
    if (Number.isFinite(v) && v !== 0) out[k] = round1(v * ratio);
  }
  return out;
}

// ── Étage 2a : bibliothèque personnelle ──────────────────────────────────────

function matchLibraryFood(name: string, customFoods: any[] = []): any | null {
  const q = normalizeName(name);
  if (!q) return null;
  let best: { row: any; score: number } | null = null;
  for (const row of customFoods) {
    const rn = normalizeName(row?.name || "");
    if (!rn) continue;
    let score = 0;
    if (rn === q) score = 1;
    else if (q.includes(rn) || rn.includes(q)) score = 0.9;
    else {
      const qw = new Set(q.split(" ").filter((w) => w.length > 2));
      const common = rn.split(" ").filter((w) => w.length > 2 && qw.has(w)).length;
      if (common > 0) score = 0.55 + 0.1 * common;
    }
    if (score >= 0.55 && (!best || score > best.score)) best = { row, score };
  }
  return best?.row ?? null;
}

function per100FromLibraryRow(row: any, customNutrients: CustomNutrientDef[]): Record<string, number> {
  const std = (row?.nutrients_std || {}) as Record<string, number>;
  const custom = (row?.nutrients_custom || {}) as Record<string, number>;
  const per100: Record<string, number> = {
    calories: Number(row?.calories_per_100g) || 0,
    proteins: Number(row?.proteins_per_100g) || 0,
    carbs: Number(row?.carbs_per_100g) || 0,
    fats: Number(row?.fats_per_100g) || 0,
  };
  // Micros standards : nutrients_std en priorité, colonnes héritées en repli.
  for (const [field, key] of Object.entries(PER100_FIELD_TO_STDKEY)) {
    const v = Number(std[key] ?? row?.[field]);
    if (Number.isFinite(v) && v !== 0) per100[key] = v;
  }
  for (const key of STD_KEYS) {
    const v = Number(std[key]);
    if (Number.isFinite(v) && v !== 0 && per100[key] == null) per100[key] = v;
  }
  // Micros personnalisés déjà renseignés dans la bibliothèque.
  for (const def of customNutrients) {
    const v = Number(custom[def.key]);
    if (Number.isFinite(v) && v !== 0) per100[def.key] = v;
  }
  return per100;
}

// ── Étage 2b : Open Food Facts ───────────────────────────────────────────────

const OFF_FIELDS = [
  "product_name",
  "nutriments",
  "serving_quantity",
].join(",");

/** Mapping nutriments Open Food Facts → clés NUTRIENTS_STD_LIST (facteur inclus). */
const OFF_MAP: { off: string; key: string; factor: number }[] = [
  { off: "fiber_100g", key: "fiber", factor: 1 },
  { off: "sugars_100g", key: "sugar", factor: 1 },
  { off: "saturated-fat_100g", key: "saturated_fat", factor: 1 },
  { off: "omega-3-fat_100g", key: "omega3_mg", factor: 1000 },
  { off: "sodium_100g", key: "sodium_mg", factor: 1000 },
  { off: "potassium_100g", key: "potassium_mg", factor: 1000 },
  { off: "magnesium_100g", key: "magnesium_mg", factor: 1000 },
  { off: "calcium_100g", key: "calcium_mg", factor: 1000 },
  { off: "iron_100g", key: "iron_mg", factor: 1000 },
  { off: "zinc_100g", key: "zinc_mg", factor: 1000 },
  { off: "vitamin-c_100g", key: "vitamin_c_mg", factor: 1000 },
  { off: "vitamin-d_100g", key: "vitamin_d_mcg", factor: 1_000_000 },
  { off: "vitamin-b9_100g", key: "vitamin_b9_mcg", factor: 1_000_000 },
  { off: "vitamin-b12_100g", key: "vitamin_b12_mcg", factor: 1_000_000 },
  { off: "vitamin-e_100g", key: "vitamin_e_mg", factor: 1000 },
];

async function searchOpenFoodFacts(name: string): Promise<Record<string, number> | null> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}` +
    `&search_simple=1&action=process&json=1&page_size=1&fields=${OFF_FIELDS}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const product = data?.products?.[0];
    const nutriments = product?.nutriments;
    if (!nutriments) return null;
    const per100: Record<string, number> = {
      calories: Number(nutriments["energy-kcal_100g"]) || 0,
      proteins: Number(nutriments.proteins_100g) || 0,
      carbs: Number(nutriments.carbohydrates_100g) || 0,
      fats: Number(nutriments.fat_100g) || 0,
    };
    if (!per100.calories && !per100.proteins) return null;
    for (const { off, key, factor } of OFF_MAP) {
      const v = Number(nutriments[off]);
      if (Number.isFinite(v) && v !== 0) per100[key] = v * factor;
    }
    return per100;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Étage 3 : micro-LLM local (complétion ciblée) ────────────────────────────

/**
 * Demande au micro-LLM local UNIQUEMENT les valeurs manquantes, sous forme
 * d'un prompt texte très court (pas d'image, pas de JSON verbeux).
 */
async function completeWithMicroLlm(
  foodName: string,
  weightG: number,
  missing: { key: string; label: string; unit: string }[],
  model?: string,
): Promise<Record<string, number>> {
  if (missing.length === 0) return {};
  const asked = missing.map((m) => `"${m.key}"(${m.unit})`).join(",");
  const system = "Tu es une table de composition nutritionnelle. Réponds UNIQUEMENT en JSON compact, valeurs numériques, 0 si inconnu.";
  const prompt = `Pour ${weightG}g de "${foodName}", donne ${asked}. JSON: {${missing.map((m) => `"${m.key}":0`).join(",")}}`;
  const raw = await runLocalIntentChat({ system, prompt, model });
  const match = String(raw || "").match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const m of missing) {
      const v = Number(parsed[m.key]);
      if (Number.isFinite(v) && v > 0) out[m.key] = round1(v);
    }
    return out;
  } catch {
    return {};
  }
}

// ── Résolution d'un aliment ──────────────────────────────────────────────────

export async function resolveFoodItem(query: FoodQuery, opts: ResolveOptions = {}): Promise<ResolvedFoodItem> {
  const customNutrients = (opts.customNutrients ?? []).filter((c) => c?.key && c?.unit);
  const allKeys = [...STD_KEYS, ...customNutrients.map((c) => c.key)];
  const weightG = Math.max(1, Math.round(query.weightG || 100));

  let per100: Record<string, number> | null = null;
  let source: ResolutionSource = "unresolved";
  let displayName = query.name;
  let baseConfidence = query.detectionConfidence ?? 1;

  // 1) Bibliothèque perso
  const libRow = matchLibraryFood(query.name, opts.customFoods);
  if (libRow) {
    per100 = per100FromLibraryRow(libRow, customNutrients);
    source = "library";
    displayName = libRow.name || displayName;
  }

  // 2) Table de référence embarquée
  if (!per100) {
    const match = findFoodReference(query.name);
    if (match) {
      let food: FoodReference = match.food;
      // Sur photo, l'aliment est vu CUIT : on bascule sur l'équivalent cuit.
      if (opts.fromImage && isRawByDefault(food.id)) {
        food = cookedEquivalentOf(food.id) ?? food;
      }
      per100 = { ...(food.per100 as Record<string, number>) };
      source = "reference";
      displayName = food.name;
      baseConfidence = Math.min(baseConfidence, match.score);
    }
  }

  // 3) Open Food Facts
  if (!per100 && opts.allowNetwork !== false) {
    const off = await searchOpenFoodFacts(query.name);
    if (off) {
      per100 = off;
      source = "openfoodfacts";
      baseConfidence = Math.min(baseConfidence, 0.7);
    }
  }

  const item: ResolvedFoodItem = {
    name: displayName,
    estimated_weight_g: weightG,
    calories: 0,
    proteins: 0,
    carbs: 0,
    fats: 0,
    source,
    confidence: baseConfidence,
  };
  if (query.unitCount) {
    item.unit_count = query.unitCount;
    item.unit_weight_g = query.unitWeightG;
    item.unit_label = query.unitLabel;
  }

  if (per100) {
    const scaled = scalePer100(per100, weightG, ["calories", "proteins", "carbs", "fats", ...allKeys]);
    item.calories = Math.round(scaled.calories || 0);
    item.proteins = round1(scaled.proteins || 0);
    item.carbs = round1(scaled.carbs || 0);
    item.fats = round1(scaled.fats || 0);
    for (const k of allKeys) {
      if (scaled[k] != null) item[k] = scaled[k];
    }
  }

  // 4) Micro-LLM local : uniquement pour les trous
  if (opts.allowMicroLlm) {
    const missing: { key: string; label: string; unit: string }[] = [];
    if (!per100) {
      missing.push(
        { key: "calories", label: "Calories", unit: "kcal" },
        { key: "proteins", label: "Protéines", unit: "g" },
        { key: "carbs", label: "Glucides", unit: "g" },
        { key: "fats", label: "Lipides", unit: "g" },
      );
    }
    // Micros personnalisés absents des bases publiques.
    for (const def of customNutrients) {
      if (item[def.key] == null) missing.push({ key: def.key, label: def.label, unit: def.unit });
    }
    if (missing.length > 0) {
      try {
        const filled = await completeWithMicroLlm(displayName, weightG, missing, opts.microLlmModel);
        for (const [k, v] of Object.entries(filled)) {
          if (item[k] == null || item[k] === 0) item[k] = v;
        }
        if (!per100 && (Number(item.calories) > 0 || Number(item.proteins) > 0)) {
          item.source = "micro_llm";
          item.confidence = Math.min(item.confidence, 0.6);
        }
      } catch (e) {
        appLogger.warn("HybridResolver", "Micro-LLM local indisponible", e);
      }
    }
  }

  return item;
}

/** Résout plusieurs aliments en parallèle (le réseau est le seul coût). */
export async function resolveFoodItems(queries: FoodQuery[], opts: ResolveOptions = {}): Promise<ResolvedFoodItem[]> {
  const results: ResolvedFoodItem[] = [];
  // Les étapes déterministes sont instantanées ; on parallélise pour OFF.
  const settled = await Promise.all(queries.map((q) => resolveFoodItem(q, opts).catch(() => null)));
  for (const r of settled) if (r) results.push(r);
  return results;
}

/** Nombre d'aliments couverts par la base embarquée (affichage réglages). */
export const REFERENCE_FOOD_COUNT = FOOD_REFERENCE_TABLE.length;
