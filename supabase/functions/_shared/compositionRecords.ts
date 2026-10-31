import { fetchJson } from "./microAi.ts";
import { selectFoodCandidates } from "./foodSelection.ts";

export interface CompositionRecord {
  id: string;
  name: string;
  source: "library" | "reference" | "openfoodfacts" | "usda" | "cnf";
  per100: Record<string, number>;
}

const USDA_MAP: Record<string, [string, number]> = {
  "208": ["calories", 1], "203": ["proteins", 1], "205": ["carbs", 1], "204": ["fats", 1],
  "291": ["fiber", 1], "269": ["sugar", 1], "606": ["saturated_fat", 1],
  "307": ["sodium_mg", 1], "306": ["potassium_mg", 1], "304": ["magnesium_mg", 1],
  "301": ["calcium_mg", 1], "303": ["iron_mg", 1], "309": ["zinc_mg", 1],
  "401": ["vitamin_c_mg", 1], "328": ["vitamin_d_mcg", 1], "417": ["vitamin_b9_mcg", 1],
  "418": ["vitamin_b12_mcg", 1], "323": ["vitamin_e_mg", 1],
};

const OFF_MAP: Record<string, [string, number]> = {
  "energy-kcal": ["calories", 1], proteins: ["proteins", 1], carbohydrates: ["carbs", 1], fat: ["fats", 1],
  fiber: ["fiber", 1], sugars: ["sugar", 1], "saturated-fat": ["saturated_fat", 1],
  "omega-3-fat": ["omega3_mg", 1000], sodium: ["sodium_mg", 1000], potassium: ["potassium_mg", 1000],
  magnesium: ["magnesium_mg", 1000], calcium: ["calcium_mg", 1000], iron: ["iron_mg", 1000], zinc: ["zinc_mg", 1000],
  "vitamin-c": ["vitamin_c_mg", 1000], "vitamin-d": ["vitamin_d_mcg", 1e6],
  "vitamin-b9": ["vitamin_b9_mcg", 1e6], "vitamin-b12": ["vitamin_b12_mcg", 1e6], "vitamin-e": ["vitamin_e_mg", 1000],
};

export function hasCompositionMacros(record: CompositionRecord): boolean {
  return ["calories", "proteins", "carbs", "fats"].every((key) => Number.isFinite(record.per100[key]) && record.per100[key] >= 0);
}

export async function offRecords(name: string): Promise<CompositionRecord[]> {
  const data = await fetchJson(
    `https://world.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(name)}&page_size=8&fields=code,product_name,brands,nutriments`,
    6000,
    { headers: { "User-Agent": "NutriScan - Android/Web - Version 0.90.0" } }
  );
  return (data?.products ?? []).flatMap((p: any) => {
    if (!p.code || !p.product_name || !p.nutriments) return [];
    const per100: Record<string, number> = {};
    for (const [field, [key, factor]] of Object.entries(OFF_MAP)) {
      const value = p.nutriments[`${field}_100g`];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) per100[key] = value * factor;
    }
    if (per100.calories == null && ["proteins", "carbs", "fats"].every((k) => per100[k] != null)) {
      per100.calories = 4 * per100.proteins + 4 * per100.carbs + 9 * per100.fats;
    }
    return [{ id: `off:${p.code}`, name: `${p.product_name}${p.brands ? ` (${p.brands})` : ""}`, source: "openfoodfacts" as const, per100 }];
  });
}

export async function usdaRecords(query: string, key: string): Promise<CompositionRecord[]> {
  const data = await fetchJson(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}` +
    `&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&pageSize=8&api_key=${encodeURIComponent(key)}`);
  return (data?.foods ?? []).flatMap((food: any) => {
    if (!food.fdcId || !food.description || !Array.isArray(food.foodNutrients)) return [];
    const per100: Record<string, number> = {};
    let omega = 0, hasOmega = false;
    for (const n of food.foodNutrients) {
      if (typeof n.value !== "number" || !Number.isFinite(n.value) || n.value < 0) continue;
      const num = String(n.nutrientNumber);
      const mapping = USDA_MAP[num];
      if (mapping) per100[mapping[0]] = n.value * mapping[1];
      if (["851", "629", "621", "631"].includes(num)) { omega += n.value; hasOmega = true; }
    }
    if (hasOmega) per100.omega3_mg = omega * 1000;
    return [{ id: `usda:${food.fdcId}`, name: food.description, source: "usda" as const, per100 }];
  });
}

/** Numbers stay in server records; the AI receives only names/IDs. */
export async function chooseRecords(apiKey: string, requests: { index: number; name: string; records: CompositionRecord[] }[]) {
  const choices = await selectFoodCandidates(apiKey, requests.map((r) => ({
    index: r.index, name: r.name, candidates: r.records.map(({ id, name }) => ({ id, name })),
  })));
  return new Map(requests.flatMap((r) => {
    const record = r.records.find((c) => c.id === choices.get(r.index));
    return record ? [[r.index, record] as const] : [];
  }));
}

const CNF_MAP: [RegExp, string][] = [
  [/^fibre, total dietary/i, "fiber"], [/^sugars, total/i, "sugar"], [/^fatty acids, saturated, total/i, "saturated_fat"],
  [/^sodium/i, "sodium_mg"], [/^potassium/i, "potassium_mg"], [/^magnesium/i, "magnesium_mg"],
  [/^calcium/i, "calcium_mg"], [/^iron/i, "iron_mg"], [/^zinc/i, "zinc_mg"],
  [/^vitamin c/i, "vitamin_c_mg"], [/^vitamin d \(/i, "vitamin_d_mcg"], [/^folate, total|^total folate/i, "vitamin_b9_mcg"],
  [/^vitamin b-?12/i, "vitamin_b12_mcg"], [/^alpha-tocopherol/i, "vitamin_e_mg"],
];

export async function selectedCnfRecords(apiKey: string, items: { index: number; name: string; english: string }[]) {
  const data = await fetchJson("https://food-nutrition.canada.ca/api/canadian-nutrient-file/food/?lang=en&type=json", 10000);
  if (!Array.isArray(data)) return new Map<number, CompositionRecord>();
  const requests = items.map((it) => {
    const words = it.english.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);
    const candidates = data.map((f: any) => ({ id: `cnf:${f.food_code}`, name: String(f.food_description ?? "") }))
      .map((f) => ({ ...f, score: words.filter((w) => f.name.toLowerCase().includes(w)).length }))
      .filter((f) => f.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
    return { index: it.index, name: it.name, candidates };
  });
  const selections = await selectFoodCandidates(apiKey, requests);
  const records = await Promise.all(items.map(async (it) => {
    const id = selections.get(it.index);
    const candidate = requests.find((r) => r.index === it.index)?.candidates.find((c) => c.id === id);
    if (!candidate) return null;
    const rows = await fetchJson(`https://food-nutrition.canada.ca/api/canadian-nutrient-file/nutrientamount/?id=${encodeURIComponent(candidate.id.slice(4))}&lang=en&type=json`);
    const per100: Record<string, number> = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const hit = CNF_MAP.find(([pattern]) => pattern.test(String(row.nutrient_web_name ?? row.nutrient_name ?? "")));
      if (hit && typeof row.nutrient_value === "number" && Number.isFinite(row.nutrient_value) && row.nutrient_value >= 0) per100[hit[1]] = row.nutrient_value;
    }
    return [it.index, { id: candidate.id, name: candidate.name, source: "cnf", per100 }] as [number, CompositionRecord];
  }));
  return new Map(records.filter((r): r is [number, CompositionRecord] => r !== null));
}
