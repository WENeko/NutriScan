import { describe, expect, it } from "vitest";
import { buildStdNutrients } from "./nutrients-helpers";
import { calculateDailyQuality, calculateMealQuality, normalizeSportPreset, normalizeWorkoutContext, qualityInputFromMeal, sumQualityNutrients } from "./metabolic-quality";

describe("nutrition quality persistence adapters", () => {
  it("preserves measured zero sugar without creating missing measurements", () => {
    expect(buildStdNutrients({ sugar: 0, fiber: undefined, saturated_fat: null, omega3_mg: "" })).toEqual({ sugar: 0 });
  });
  it("retains observed partial sums and measured zero without inventing absent nutrients", () => {
    expect(sumQualityNutrients([{ nutrients_std: { sugar: 4, fiber: 2 } }, { nutrients_std: { sugar: 0 } }])).toEqual({ sugar: 4, fiber: 2 });
    expect(sumQualityNutrients([{ nutrients_std: {} }])).toEqual({});
    expect(sumQualityNutrients([])).toEqual({});
  });
  it("uses the breakfast's observed 7.3g fibre, 12g sugar and 0.7g saturated fat provisionally", () => {
    const input = qualityInputFromMeal({ total_calories: 432, total_proteins: 15, total_carbs: 70, total_fats: 10 }, [
      { nutrients_std: { fiber: 4, saturated_fat: 0.5, sugar: 0.4 } },
      { nutrients_std: { fiber: 3.3, saturated_fat: 0.2, sugar: 7.5 } },
      { nutrients_std: {} },
      { nutrients_std: { sugar: 4.1 } },
    ]);
    expect(input.nutrients_std).toEqual({ fiber: 7.3, saturated_fat: 0.7, sugar: 12 });
    expect(input.nutrientCoverage).toEqual({ fiber: 0.5, saturated_fat: 0.5, sugar: 0.75, omega3_mg: 0 });
    const result = calculateMealQuality(input);
    expect(result.scores.carbs).toBe(100);
    expect(result.coverage).toBeCloseTo(0.45);
    expect(result.missing).toEqual(expect.arrayContaining(["sugar", "fiber", "saturated_fat", "omega3_mg"]));
    expect(result.fractions.nonSugarCarbs).toBeNull();
    expect(result.fractions.unsaturatedRemainder).toBeNull();
    expect(calculateDailyQuality([input]).coverage).toBeCloseTo(0.45);
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
    expect(calculateMealQuality(input).fractions.nonSugarCarbs).toBe(55);
    expect(calculateMealQuality({ ...input, carbohydrateBasis: "unknown" }).fractions.nonSugarCarbs).toBeNull();
  });
});
