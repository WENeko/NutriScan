import { describe, expect, it } from "vitest";
import { buildStdNutrients } from "./nutrients-helpers";
import { calculateDailyQuality, calculateMealQuality, normalizeSportPreset, normalizeWorkoutContext, qualityInputFromMeal, sumQualityNutrients } from "./metabolic-quality";

describe("nutrition quality persistence adapters", () => {
  it("preserves measured zero sugar without creating missing measurements", () => {
    expect(buildStdNutrients({ sugar: 0, fiber: undefined, saturated_fat: null, omega3_mg: "" })).toEqual({ sugar: 0 });
  });
  it("does not treat one missing ingredient as measured zero", () => {
    expect(sumQualityNutrients([{ nutrients_std: { sugar: 4, fiber: 2 } }, { nutrients_std: { sugar: 0 } }])).toEqual({ sugar: 4 });
  });
  it("keeps the explicit Standard choice", () => {
    expect(normalizeWorkoutContext("none")).toBe("none");
  });
  it("supports all three persisted workout choices", () => {
    for (const value of ["pre_workout", "intra_workout", "post_workout"]) expect(normalizeWorkoutContext(value)).toBe(value);
  });
  it("keeps the four independent IQM profiles", () => {
    for (const value of ["hypertrophy", "cut", "endurance", "health"]) expect(normalizeSportPreset(value)).toBe(value);
  });
  it("recalculates the score from current ingredients and saved context", () => {
    const meal = { total_calories: 500, total_proteins: 35, total_carbs: 60, total_fats: 10, peri_workout: "none" };
    const items = [{ nutrients_std: { sugar: 60, fiber: 0, saturated_fat: 2, omega3_mg: 1000 } }];
    const standard = calculateMealQuality(qualityInputFromMeal(meal, items));
    const workout = calculateMealQuality(qualityInputFromMeal({ ...meal, peri_workout: "post_workout" }, items));
    expect(standard.scores.carbs).toBe(30);
    expect(workout.scores.carbs).toBe(100);
    expect(calculateDailyQuality([qualityInputFromMeal(meal, items), qualityInputFromMeal({ ...meal, peri_workout: "post_workout" }, items)]).score).toBeGreaterThan(standard.score ?? 100);
  });
  it("does not infer a carbohydrate convention from mixed catalogues", () => {
    const input = qualityInputFromMeal({ total_calories: 500, total_proteins: 30, total_carbs: 60, total_fats: 15 }, [{ nutrients_std: { sugar: 5, fiber: 10 } }]);
    expect(calculateMealQuality(input).fractions.nonSugarCarbs).toBeNull();
  });
});