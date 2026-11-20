import { QUALITY_KEYS, type QualityInput } from "./metabolic-quality";

/** Observed sums are lower bounds, never complete daily totals when coverage is partial. */
export function coachNutrientObservations(meals: QualityInput[]) {
  return Object.fromEntries(QUALITY_KEYS.map(key => {
    const values = meals.map(m => m.nutrients_std?.[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
    return [key, { observed: values.length ? values.reduce((a, b) => a + b, 0) : null,
      measuredMeals: values.length, totalMeals: meals.length, complete: meals.length > 0 && values.length === meals.length && meals.every(m => (m.nutrientCoverage?.[key] ?? 1) === 1) }];
  }));
}