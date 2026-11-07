import { describe, expect, it } from "vitest";
import { CLOUD_FOOD_REFERENCES } from "./cloudFoodReferences";

describe("verified cloud-only USDA snapshots", () => {
  it("uses USDA 167746 for raw lemon without peel", () => {
    expect(CLOUD_FOOD_REFERENCES.find((r) => r.id === "usda-sr-167746")?.per100).toMatchObject({ calories: 29, proteins: 1.1, carbs: 9.32, fats: 0.3, vitamin_c_mg: 53 });
  });
  it("uses USDA 172421 for boiled unsalted lentils", () => {
    expect(CLOUD_FOOD_REFERENCES.find((r) => r.id === "usda-sr-172421")?.per100).toMatchObject({ calories: 116, proteins: 9.02, carbs: 20.13, fats: 0.38, vitamin_b9_mcg: 181 });
  });
  it("uses USDA 2708722 for potato gnocchi", () => {
    const g = CLOUD_FOOD_REFERENCES.find((r) => r.id === "usda-fdc-2708722");
    expect(g?.aliases).toContain("gnocchi");
    expect(g?.per100).toMatchObject({ calories: 135, proteins: 2.44, carbs: 17.2, fats: 6.33, sodium_mg: 279 });
  });
  it("uses USDA 168412 for raw endive", () => {
    const e = CLOUD_FOOD_REFERENCES.find((r) => r.id === "usda-sr-168412");
    expect(e?.aliases).toContain("endive");
    expect(e?.per100).toMatchObject({ calories: 17, proteins: 1.25, carbs: 3.35, fiber: 3.1, vitamin_b9_mcg: 142 });
  });
  it("marks Schupfnudeln as provisional (no official USDA record)", () => {
    const s = CLOUD_FOOD_REFERENCES.find((r) => r.id === "prov-schupfnudeln");
    expect((s as any)?.provisional).toBe(true);
    expect(s?.per100).toMatchObject({ calories: 140, carbs: 28 });
  });
});