import { describe, expect, it } from "vitest";
import { observedNutrient, safeNutrient } from "./nutrient-value";

describe("meal numeric inputs", () => {
  it("accepts comma and dot decimals without truncation", () => {
    expect(safeNutrient("12,5")).toBe(12.5);
    expect(safeNutrient("12.5")).toBe(12.5);
  });
  it("never persists nonfinite or negative required macros", () => {
    for (const input of [NaN, Infinity, -2, "12oops", "", null]) expect(safeNutrient(input)).toBe(0);
  });
  it("does not turn unavailable micros into measured zeros", () => {
    for (const input of [undefined, null, "", " ", NaN, -1]) expect(observedNutrient(input)).toBeUndefined();
    expect(observedNutrient(0)).toBe(0);
    expect(observedNutrient("12,5")).toBe(12.5);
  });
});