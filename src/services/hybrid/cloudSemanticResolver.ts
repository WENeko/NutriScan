import { supabase } from "@/integrations/supabase/client";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";
import { FOOD_REFERENCE_TABLE } from "./foodReferenceTable";
import { CLOUD_FOOD_REFERENCES } from "./cloudFoodReferences";
import { per100FromLibraryRow, resolveFoodItem, type FoodQuery, type ResolveOptions, type ResolutionSource } from "./nutritionResolver";

/** Separate cloud path: legacy/local matching is never invoked here. */
export async function resolveCloudFoodItems(queries: FoodQuery[], opts: ResolveOptions = {}) {
  const nutrients = [...NUTRIENTS_STD_LIST, ...(opts.customNutrients ?? [])];
  const candidates = [
    ...(opts.customFoods ?? []).slice(0, 200).map((food, index) => ({
      id: `library:${index}`, name: String(food.name ?? ""), source: "library",
      per100: per100FromLibraryRow(food, opts.customNutrients ?? []),
    })),
    ...[...FOOD_REFERENCE_TABLE, ...CLOUD_FOOD_REFERENCES].map((food) => ({
      id: `reference:${food.id}`, name: food.name, aliases: food.aliases,
      source: "reference", per100: food.per100,
    })),
  ].filter((c) => c.name);
  const records = new Map<number, any>();
  for (let offset = 0; offset < queries.length; offset += 10) {
    const { data, error } = await supabase.functions.invoke("resolve-cloud-foods", {
      body: {
        items: queries.slice(offset, offset + 10).map((q, i) => ({ index: offset + i, name: q.name })),
        candidates, nutrients: nutrients.map(({ key, label, unit }) => ({ key, label, unit })),
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    for (const record of data?.results ?? []) {
      if (records.has(record.index)) throw new Error("Réponse nutritionnelle ambiguë.");
      records.set(record.index, record);
    }
  }
  return Promise.all(queries.map((query, index) => {
    const record = records.get(index);
    const validSource = ["library", "reference", "openfoodfacts", "usda"].includes(record?.source);
    const allowed = new Set(["calories", "proteins", "carbs", "fats", ...nutrients.map((n) => n.key)]);
    const per100 = Object.fromEntries(Object.entries(record?.per100 ?? {}).filter(([key, value]) =>
      allowed.has(key) && typeof value === "number" && Number.isFinite(value) && value >= 0));
    const hasMacros = ["calories", "proteins", "carbs", "fats"].every((k) => per100[k] != null);
    return resolveFoodItem(query, {
      ...opts, allowNetwork: false, allowMicroLlm: false,
      cloudRecord: validSource && hasMacros ? {
        per100: per100 as Record<string, number>, source: record.source as ResolutionSource,
        id: String(record.id ?? ""), name: String(record.name ?? ""),
      } : null,
    });
  }));
}