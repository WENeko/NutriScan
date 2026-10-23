/**
 * Complétion des micronutriments restés vides après le résolveur
 * (bibliothèque → CIQUAL → Open Food Facts).
 *
 * Cascade côté serveur (fonction « complete-micros ») :
 *   1. USDA FoodData Central   2. Fichier canadien des éléments nutritifs
 *   3. Passe IA ciblée — uniquement sur les cases encore vides.
 *
 * Règles : on ne remplit QUE des clés absentes ; calories/macros et valeurs
 * déjà résolues ne sont jamais touchées ; chaque valeur garde sa source.
 */
import { supabase } from "@/integrations/supabase/client";
import { appLogger } from "@/services/appLogger";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";
import type { CustomNutrientDef } from "@/utils/nutrients-helpers";

export type MicroSource = "library" | "reference" | "openfoodfacts" | "usda" | "cnf" | "ai";

const LS_AI_PASS = "nutriscan-micro-ai-pass";
export function isMicroAiPassEnabled(): boolean {
  try { return localStorage.getItem(LS_AI_PASS) !== "off"; } catch { return true; }
}
export function setMicroAiPassEnabled(on: boolean): void {
  try { localStorage.setItem(LS_AI_PASS, on ? "on" : "off"); } catch { /* ignoré */ }
}

/** Plafonds physiologiques par 100 g : au-delà, la valeur est rejetée. */
export const MICRO_CAPS_PER100: Record<string, number> = {
  fiber: 80, sugar: 100, saturated_fat: 100, omega3_mg: 60000, sodium_mg: 40000,
  potassium_mg: 15000, magnesium_mg: 2000, calcium_mg: 3000, iron_mg: 100, zinc_mg: 100,
  vitamin_c_mg: 3000, vitamin_d_mcg: 300, vitamin_b9_mcg: 3000, vitamin_b12_mcg: 100, vitamin_e_mg: 200,
};

const PROTECTED = new Set(["calories", "proteins", "carbs", "fats"]);

export interface MicroFill { values: Record<string, number>; sources: Record<string, MicroSource> }

/**
 * Fusionne des valeurs proposées dans un aliment : uniquement les clés manquantes,
 * jamais les macros, rejet des valeurs aberrantes (rapportées à 100 g).
 */
export function mergeMicroFill(item: Record<string, any>, fill: MicroFill, allowedKeys: string[]): Record<string, any> {
  const out = { ...item, micro_sources: { ...(item.micro_sources ?? {}) } };
  const weight = Number(item.estimated_weight_g) || 100;
  for (const [key, raw] of Object.entries(fill.values ?? {})) {
    if (PROTECTED.has(key) || !allowedKeys.includes(key)) continue;
    if (item[key] != null) continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) continue;
    const cap = MICRO_CAPS_PER100[key];
    if (cap != null && (v / weight) * 100 > cap) continue;
    out[key] = Math.round(v * 10) / 10;
    out.micro_sources[key] = fill.sources?.[key] ?? "ai";
  }
  return out;
}

export function missingMicroKeys(item: Record<string, any>, customNutrients: CustomNutrientDef[] = []): string[] {
  const keys = [...NUTRIENTS_STD_LIST.map((n) => n.key), ...customNutrients.map((c) => c.key)];
  return [...new Set(keys)].filter((k) => !PROTECTED.has(k) && item[k] == null);
}

/** Complète tous les aliments d'un repas en un seul appel serveur. */
export async function completeMissingMicros(
  items: Record<string, any>[],
  customNutrients: CustomNutrientDef[] = [],
  opts: { allowAi?: boolean; semanticOnly?: boolean } = {},
): Promise<Record<string, any>[]> {
  const requests = items.map((it, index) => ({
    index,
    name: String(it.name ?? it.food_name ?? ""),
    weight_g: Number(it.estimated_weight_g) || 100,
    missing: missingMicroKeys(it, customNutrients),
  })).filter((r) => r.name && r.missing.length > 0 && items[r.index].source !== "unresolved");
  if (requests.length === 0) return items;

  try {
    const fills: (MicroFill & { index: number })[] = [];
    for (let offset = 0; offset < requests.length; offset += 20) {
      const { data, error } = await supabase.functions.invoke("complete-micros", {
      body: {
        items: requests.slice(offset, offset + 20),
        allow_ai: opts.allowAi ?? isMicroAiPassEnabled(),
        ...(opts.semanticOnly ? { semantic_only: true } : {}),
        nutrients: [
          ...NUTRIENTS_STD_LIST.map((n) => ({ key: n.key, label: n.label, unit: n.unit })),
          ...customNutrients.map((c) => ({ key: c.key, label: c.label ?? c.key, unit: c.unit, custom: true })),
        ],
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    fills.push(...(Array.isArray(data?.items) ? data.items : []));
    }
    const out = [...items];
    for (const f of fills) {
      const req = requests.find((r) => r.index === f.index);
      if (!req) continue;
      out[f.index] = mergeMicroFill(out[f.index], f, req.missing);
    }
    return out;
  } catch (e) {
    appLogger.warn("MicroCompletion", "Complétion des micronutriments indisponible", e);
    return items;
  }
}
