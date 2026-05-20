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
  if (!["macro", "mineral", "vitamin", "lipid"].includes(category)) {
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
  return { ok: true, value: { key, label, unit, category, goal } };
}
