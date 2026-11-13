import { describe, expect, it } from "vitest";
import { rankCoachSuggestions, scaleCoachFood, type CoachFood } from "./coach-quality";
import type { QualityInput } from "./metabolic-quality";
const poor: QualityInput = { calories: 600, proteins: 45, carbs: 60, fats: 20, carbohydrateBasis: "unknown", nutrients_std: { sugar: 30, fiber: 0, saturated_fat: 12, omega3_mg: 0 } };
const good: CoachFood = { id: "known", name: "Fiche test", grams: 100, per100: { ...poor, nutrients_std: { sugar: 6, fiber: 8, saturated_fat: 4, omega3_mg: 1000 } } };
const budget = { calories: 600, proteins: 45, carbs: 60, fats: 20 };
describe("coach IQM arbitration", () => {
  it("rejects all portions above the calorie ceiling and exhausted budgets", () => {
    expect(rankCoachSuggestions([poor], [good], { ...budget, calories: 299 }, "hypertrophy")).toEqual([]);
    expect(rankCoachSuggestions([poor], [good], { ...budget, calories: 0 }, "hypertrophy")).toEqual([]);
  });
  it("scales known nutrient records including omega3 in mg", () => {
    expect(scaleCoachFood(good, 0.5).nutrients_std?.omega3_mg).toBe(500);
    expect(scaleCoachFood(good, 0.5).calories).toBe(300);
  });
  it("calculates the projected daily gain rather than asking AI to invent it", () => {
    const [result] = rankCoachSuggestions([poor], [good], budget, "hypertrophy");
    expect(result.mealScore).toBe(100);
    expect(result.projectedScore).toBe(83);
    expect(result.gain).toBe(17);
  });
  it("does not sacrifice a measured IQM to fill macros", () => {
    expect(rankCoachSuggestions([good.per100], [{ ...good, per100: poor }], budget, "hypertrophy")).toEqual([]);
  });
  it("computes gains even with partial nutrient coverage", () => {
    const [result] = rankCoachSuggestions([{ ...poor, nutrients_std: {} }], [good], budget, "hypertrophy");
    expect(result.gain).not.toBeNull();
    const [partial] = rankCoachSuggestions([poor], [{ ...good, per100: { ...poor, nutrients_std: {} } }], budget, "hypertrophy");
    expect(partial.coverage).toBe(0.25);
    expect(partial.projectedScore).toBeNull();
    expect(partial.nutrition.nutrients_std?.fiber).toBeUndefined();
  });
});