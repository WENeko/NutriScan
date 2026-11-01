/**
 * Extraction dynamique des nutriments Open Food Facts.
 * Aucune table de correspondance : le tag OFF est dérivé de la clé du nutriment
 * (ou de `offTag` explicite) et le facteur de conversion de son unité déclarée.
 * Source unique partagée par l'app et les fonctions backend.
 */
export interface OffNutrientDef {
  key: string;
  unit: string;
  offTag?: string;
}

/** OFF stocke les valeurs en grammes pour 100 g ; conversion vers l'unité déclarée. */
export function getOffFactor(unit: string): number {
  const u = (unit || "").trim().toLowerCase();
  if (u === "mg") return 1000;
  if (u === "µg" || u === "μg" || u === "mcg" || u === "ug") return 1_000_000;
  return 1;
}

/** Tag OFF par défaut : suffixe d'unité retiré, `_` → `-` (ex. vitamin_c_mg → vitamin-c). */
export function deriveOffTag(def: OffNutrientDef): string {
  if (def.offTag) return def.offTag;
  return def.key.replace(/_(mg|mcg|ug|g)$/i, "").replace(/_/g, "-").toLowerCase();
}

/** Macros de base, toujours lues depuis leurs champs OFF officiels. */
export const OFF_MACRO_DEFS: OffNutrientDef[] = [
  { key: "calories", unit: "kcal", offTag: "energy-kcal" },
  { key: "proteins", unit: "g" },
  { key: "carbs", unit: "g", offTag: "carbohydrates" },
  { key: "fats", unit: "g", offTag: "fat" },
];

/** Lit chaque nutriment demandé dans `nutriments` OFF ; les valeurs absentes restent absentes. */
export function extractOffNutrients(
  nutriments: Record<string, unknown> | null | undefined,
  defs: OffNutrientDef[],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!nutriments) return out;
  for (const def of defs) {
    const raw = nutriments[`${deriveOffTag(def)}_100g`];
    if (raw == null || raw === "") continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) continue;
    out[def.key] = def.key === "calories" ? v : v * getOffFactor(def.unit);
  }
  return out;
}
