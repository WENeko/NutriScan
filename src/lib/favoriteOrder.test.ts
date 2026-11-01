import { describe, it, expect } from "vitest";
import { applyFavoriteOrder, moveItem } from "./favoriteOrder";
import { extractOffNutrients } from "../../supabase/functions/_shared/offNutrients";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";

const meals = [
  { id: "1", meal_name: "A" },
  { id: "2", meal_name: "B" },
  { id: "3", meal_name: "C" },
];

describe("favorite order", () => {
  it("applies the saved order and appends new favorites", () => {
    expect(applyFavoriteOrder(meals, ["C", "A"]).map((m) => m.meal_name)).toEqual(["C", "A", "B"]);
  });
  it("moves an item up", () => {
    expect(moveItem(["A", "B", "C"], 2, -1)).toEqual(["A", "C", "B"]);
  });
  it("ignores out-of-range moves", () => {
    expect(moveItem(["A", "B"], 0, -1)).toEqual(["A", "B"]);
  });
});

describe("dynamic OFF extraction", () => {
  it("converts by declared unit and reads renamed tags", () => {
    const out = extractOffNutrients(
      { sugars_100g: 5, "omega-3-fat_100g": 0.2, "vitamin-d_100g": 0.000002, sodium_100g: 0.4 },
      NUTRIENTS_STD_LIST,
    );
    expect(out.sugar).toBe(5);
    expect(out.omega3_mg).toBeCloseTo(200);
    expect(out.vitamin_d_mcg).toBeCloseTo(2);
    expect(out.sodium_mg).toBeCloseTo(400);
    expect(out.fiber).toBeUndefined();
  });
  it("reads custom nutrients from their key", () => {
    expect(extractOffNutrients({ "vitamin-k_100g": 0.00001 }, [{ key: "vitamin_k_mcg", unit: "µg" }]).vitamin_k_mcg).toBeCloseTo(10);
  });
});
