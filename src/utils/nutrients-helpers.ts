/**
 * Helpers pour manipuler `nutrients_std` / `nutrients_custom` (JSONB meal_items).
 * La Master List = NUTRIENTS_STD_LIST + custom (voir `getMasterList` dans nutrition-logic.ts).
 */
import { NUTRIENTS_STD_LIST, type NutrientDef } from "@/utils/nutrition-logic";

export interface CustomNutrientDef extends NutrientDef {
  /** Objectif quotidien optionnel (unité = NutrientDef.unit) */
  goal?: number;
  /** true = limite à ne pas dépasser, false (défaut) = minimum à atteindre */
  is_limit?: boolean;
  /** Description (bienfaits/impact) générée par l'IA pour le tooltip */
  description?: string;
}

/** Construit nutrients_std (JSONB) à partir d'un item d'IA / formulaire. */
export function buildStdNutrients(item: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of NUTRIENTS_STD_LIST) {
    const v = Number(item[n.key]);
    if (Number.isFinite(v) && v > 0) out[n.key] = v;
  }
  return out;
}

/**
 * Mapping colonne historique `*_per_100g` (custom_foods / recipe_ingredients) → clé de nutriment.
 * Sert à reconstruire les champs per_100g depuis `nutrients_std` (et inversement).
 */
export const PER100_FIELD_TO_STDKEY: Record<string, string> = {
  fiber_per_100g: "fiber",
  sugar_per_100g: "sugar",
  saturated_fat_per_100g: "saturated_fat",
  omega3_mg_per_100g: "omega3_mg",
  sodium_mg_per_100g: "sodium_mg",
  potassium_mg_per_100g: "potassium_mg",
  magnesium_mg_per_100g: "magnesium_mg",
  calcium_mg_per_100g: "calcium_mg",
  iron_mg_per_100g: "iron_mg",
  zinc_mg_per_100g: "zinc_mg",
  vitamin_c_per_100g: "vitamin_c_mg",
  vitamin_d_per_100g: "vitamin_d_mcg",
  vitamin_e_per_100g: "vitamin_e_mg",
  vitamin_b9_mcg_per_100g: "vitamin_b9_mcg",
  vitamin_b12_mcg_per_100g: "vitamin_b12_mcg",
  vitamin_b_per_100g: "vitamin_b_mg",
};

/** Reconstruit les champs `*_per_100g` à partir d'un map `nutrients_std`. */
export function per100FromStd(std: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [field, key] of Object.entries(PER100_FIELD_TO_STDKEY)) {
    out[field] = Number(std?.[key]) || 0;
  }
  return out;
}

/** Construit `nutrients_std` (base per_100g) à partir des champs `*_per_100g` d'un formulaire/row. */
export function stdFromPer100(row: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [field, key] of Object.entries(PER100_FIELD_TO_STDKEY)) {
    const v = Number(row?.[field]);
    if (Number.isFinite(v) && v > 0) out[key] = v;
  }
  return out;
}

/** Hydrate un row meal_items : recopie `nutrients_std` sur les champs micros de premier niveau. */
export function hydrateMealItem<T extends Record<string, unknown>>(row: T): T {
  return { ...row, ...((row.nutrients_std as Record<string, number>) || {}) };
}

/** Construit nutrients_custom à partir des définitions custom de l'utilisateur. */
export function buildCustomNutrients(
  item: Record<string, unknown>,
  defs: CustomNutrientDef[] = [],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of defs) {
    const v = Number(item[d.key]);
    if (Number.isFinite(v) && v > 0) out[d.key] = v;
  }
  return out;
}

/** Validation d'une définition de nutriment custom. */
export function validateCustomNutrient(
  def: Partial<CustomNutrientDef>,
  existingKeys: string[] = [],
): { ok: true; value: CustomNutrientDef } | { ok: false; error: string } {
  const key = (def.key || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const label = (def.label || "").trim();
  const unit = (def.unit || "").trim();
  const category = (def.category as CustomNutrientDef["category"]) || "vitamin";

  if (!key) return { ok: false, error: "Clé requise (ex: choline_mg)" };
  if (key.length > 40) return { ok: false, error: "Clé trop longue (max 40)" };
  if (!label) return { ok: false, error: "Nom requis" };
  if (label.length > 60) return { ok: false, error: "Nom trop long (max 60)" };
  if (!unit) return { ok: false, error: "Unité requise (g, mg, µg…)" };
  if (unit.length > 8) return { ok: false, error: "Unité trop longue" };
  // Catégorie : validée dynamiquement côté UI via micronutrient_categories,
  // on accepte ici n'importe quelle clé non vide pour rester extensible.
  if (!category || !/^[a-z0-9_]+$/.test(category)) {
    return { ok: false, error: "Catégorie invalide" };
  }
  if (NUTRIENTS_STD_LIST.some((n) => n.key === key)) {
    return { ok: false, error: "Clé déjà utilisée par la liste standard" };
  }
  if (existingKeys.includes(key)) {
    return { ok: false, error: "Clé déjà présente dans tes nutriments custom" };
  }
  const goal = def.goal != null && def.goal !== ("" as unknown as number) ? Number(def.goal) : undefined;
  if (goal != null && (!Number.isFinite(goal) || goal < 0)) {
    return { ok: false, error: "Objectif invalide" };
  }
  const description = typeof def.description === "string" ? def.description.trim().slice(0, 240) : undefined;
  return { ok: true, value: { key, label, unit, category, goal, is_limit: !!def.is_limit, description } };
}
