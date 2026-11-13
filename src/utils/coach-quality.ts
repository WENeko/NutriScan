import { calculateDailyQuality, calculateMealQuality, qualityTargets, type QualityInput, type UserPreset, type WorkoutContext } from "./metabolic-quality";

export interface CoachBudget { calories: number; proteins: number; carbs: number; fats: number }
export interface CoachFood { id: string; name: string; grams: number; per100: QualityInput }
export interface CoachSuggestion {
  foods: { id: string; name: string; grams: number }[];
  nutrition: QualityInput;
  mealScore: number | null;
  projectedScore: number | null;
  gain: number | null;
  coverage: number;
  rank: number;
}

export function scaleCoachFood(food: CoachFood, factor = 1): QualityInput {
  const ratio = food.grams * factor / 100;
  const scale = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v * ratio : null;
  return {
    calories: scale(food.per100.calories), proteins: scale(food.per100.proteins), carbs: scale(food.per100.carbs), fats: scale(food.per100.fats),
    carbohydrateBasis: food.per100.carbohydrateBasis,
    nutrients_std: Object.fromEntries(Object.entries(food.per100.nutrients_std ?? {}).map(([k, v]) => [k, scale(v)])),
  };
}

/** Rank existing record portions, never model-generated nutrient numbers. */
export function rankCoachSuggestions(meals: QualityInput[], foods: CoachFood[], remaining: CoachBudget, preset: UserPreset): CoachSuggestion[] {
  if (remaining.calories <= 0) return [];
  const before = calculateDailyQuality(meals, preset);
  const candidates: CoachSuggestion[] = [];
  for (const food of foods) {
    if (!Number.isFinite(food.grams) || food.grams <= 0) continue;
    for (const factor of [0.5, 1, 1.5]) {
      const nutrition = scaleCoachFood(food, factor);
      if (nutrition.calories == null || nutrition.calories <= 0 || nutrition.calories > remaining.calories) continue;
      const quality = calculateMealQuality(nutrition, preset);
      const projected = calculateDailyQuality([...meals, nutrition], preset);
      const comparable = meals.length > 0 && before.score !== null && projected.score !== null;
      const gain = comparable ? (projected.score ?? 0) - (before.score ?? 0) : null;
      // Rule 1: calorie ceiling. Rule 2: do not trade measured quality for quota filling.
      if (gain !== null && gain < 0) continue;
      // Rule 3: macro fit is secondary to measured IQM; unknown quality gets no bonus.
      let fit = 0;
      for (const key of ["proteins", "carbs", "fats"] as const) {
        const v = nutrition[key];
        if (v == null) continue;
        const need = Math.max(0, remaining[key]);
        fit += need > 0 ? Math.min(v, need) / need - Math.max(0, v - need) / need : -v / Math.max(1, remaining.calories / 9);
      }
      const rank = (gain ?? 0) * 4 + (quality.score ?? 0) / 100 + fit / 3;
      candidates.push({ foods: [{ id: food.id, name: food.name, grams: food.grams * factor }], nutrition,
        mealScore: quality.score, projectedScore: projected.score, gain, coverage: quality.coverage, rank });
    }
  }
  const unique = new Set<string>();
  return candidates.sort((a, b) => b.rank - a.rank).filter(c => {
    const id = c.foods[0]?.id;
    if (!id || unique.has(id)) return false;
    unique.add(id); return true;
  }).slice(0, 3);
}

export function coachQualityContext(meals: QualityInput[], preset: UserPreset, weight: number, goalCalories: number, suggestions: CoachSuggestion[]) {
  const current = calculateDailyQuality(meals, preset);
  const last = meals.at(-1);
  const totals: Record<string, number | null> = {};
  for (const key of ["fiber", "sugar", "saturated_fat", "omega3_mg"]) {
    const values = meals.map(m => m.nutrients_std?.[key]);
    totals[key] = values.length && values.every(v => typeof v === "number" && Number.isFinite(v))
      ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  }
  return [
    "QUALITÉ IQM (calculée à partir des ingrédients enregistrés, non clinique) :",
    JSON.stringify({ preset, current, lastMeal: last ? { quality: calculateMealQuality(last, preset), context: last.peri_workout ?? "none" } : null,
      totals, targets: qualityTargets(preset, weight, goalCalories), suggestions }),
    "Arbitrages : 1. Respecter les calories restantes, ne pas imposer un repas si le budget est épuisé. 2. À macros comparables, privilégier fibres et oméga-3 et limiter les saturés/sucres hors effort confirmé ; ne pas dégrader un IQM mesuré pour remplir un quota. 3. Adapter protéines au profil et tolérance fibres/lipides au contexte du repas explicitement confirmé, jamais au sport lissé.",
    "Les suggestions sont des portions de fiches connues, pas nécessairement des repas complets. Mentionner les quantités et sources, privilégier ces pistes dans les recettes compatibles avec les ingrédients disponibles. Ne pas les appliquer automatiquement. Ne jamais inventer un nutriment manquant, un déficit de fibres/oméga-3 ou un gain IQM. Un gain chiffré est autorisé uniquement s'il est fourni ci-dessus ; une recette différente n'a pas de gain calculé. Coverage < 1 : score provisoire, comparaison indisponible. Conserver les règles expertes existantes.",
  ].join("\n");
}

export type { WorkoutContext };