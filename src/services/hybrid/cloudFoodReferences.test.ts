import { describe, expect, it } from "vitest";
import { CLOUD_FOOD_REFERENCES } from "./cloudFoodReferences";

describe("verified cloud-only USDA snapshots", () => {
  it("uses USDA 167746 for raw lemon without peel", () => {
    expect(CLOUD_FOOD_REFERENCES.find((r) => r.id === "usda-sr-167746")?.per100).toMatchObject({ calories: 29, proteins: 1.1, carbs: 9.32, fats: 0.3, vitamin_c_mg: 53 });
  });
  it("uses USDA 172421 for boiled unsalted lentils", () => {
    expect(CLOUD_FOOD_REFERENCES.find((r) => r.id === "usda-sr-172421")?.per100).toMatchObject({ calories: 116, proteins: 9.02, carbs: 20.13, fats: 0.38, vitamin_b9_mcg: 181 });
  });
});