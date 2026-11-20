import { describe, expect, it } from "vitest";
import { coachNutrientObservations } from "./coach-observations";
describe("coach measured quality observations", () => {
  it("keeps measured fiber and omega3 when another meal is unknown", () => {
    const r = coachNutrientObservations([{ carbohydrateBasis: "unknown", nutrients_std: { fiber: 8, omega3_mg: 1000 } }, { carbohydrateBasis: "unknown", nutrients_std: {} }]);
    expect(r.fiber).toEqual({ observed: 8, measuredMeals: 1, totalMeals: 2, complete: false });
    expect(r.omega3_mg.observed).toBe(1000);
  });
  it("never turns missing nutrient records into a measured zero", () => {
    expect(coachNutrientObservations([{ carbohydrateBasis: "unknown", nutrients_std: {} }]).fiber.observed).toBeNull();
  });
  it("marks a total complete only if every meal has a measurement", () => {
    expect(coachNutrientObservations([{ carbohydrateBasis: "unknown", nutrients_std: { fiber: 0 } }, { carbohydrateBasis: "unknown", nutrients_std: { fiber: 8 } }]).fiber)
      .toEqual({ observed: 8, measuredMeals: 2, totalMeals: 2, complete: true });
  });
  it("does not present a partial ingredient sum as a complete daily total", () => {
    expect(coachNutrientObservations([{ carbohydrateBasis: "unknown", nutrients_std: { fiber: 7.3 }, nutrientCoverage: { fiber: 0.5 } }]).fiber)
      .toEqual({ observed: 7.3, measuredMeals: 1, totalMeals: 1, complete: false });
  });
});