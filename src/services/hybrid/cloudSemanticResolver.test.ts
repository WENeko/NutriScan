import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCloudFoodItems } from "./cloudSemanticResolver";
import { resolveFoodItem } from "./nutritionResolver";
import { validatedSelections } from "../../../supabase/functions/_shared/foodSelection";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
afterEach(() => vi.clearAllMocks());

describe("cloud-only semantic nutrition", () => {
  it("keeps every detected portion field and name, using only selected record values", async () => {
    invoke.mockResolvedValue({ data: { results: [{ index: 0, id: "usda:123", name: "Fish, cooked", source: "usda", per100: { calories: 125, proteins: 24, carbs: 0, fats: 3 } }] }, error: null });
    const [out] = await resolveCloudFoodItems([{ name: "Filet de poisson cuit", weightG: 130.5, unitCount: 1, unitWeightG: 130.5, unitLabel: "filet" }]);
    expect(out).toMatchObject({ name: "Filet de poisson cuit", estimated_weight_g: 130.5, unit_count: 1, unit_weight_g: 130.5, unit_label: "filet", calories: 163, proteins: 31.3, nutrition_reference: { id: "usda:123", name: "Fish, cooked" } });
  });
  it("never replaces Schupfnudeln by apple or potato on an unapproved match", async () => {
    invoke.mockResolvedValue({ data: { results: [{ index: 0, per100: null, source: "unresolved" }] }, error: null });
    const [out] = await resolveCloudFoodItems([{ name: "Schupfnudeln cuits (nouilles de pommes de terre)", weightG: 180 }], { customFoods: [{ name: "Pomme", calories_per_100g: 52 }] });
    expect(out.name).toBe("Schupfnudeln cuits (nouilles de pommes de terre)");
    expect(out.source).toBe("unresolved");
    expect(out.calories).toBe(0);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("rejects incomplete macro records rather than presenting missing fat as zero", async () => {
    invoke.mockResolvedValue({ data: { results: [{ index: 0, source: "usda", per100: { calories: 120, proteins: 24 } }] }, error: null });
    const [out] = await resolveCloudFoodItems([{ name: "Poisson", weightG: 130 }]);
    expect(out.source).toBe("unresolved");
  });
  it("retains the existing resolver behavior outside cloud hybrid", async () => {
    const out = await resolveFoodItem({ name: "POULET RÔTI", weightG: 200 }, { customFoods: [{ name: "Poulet rôti", calories_per_100g: 165 }], allowNetwork: false });
    expect(out.name).toBe("Poulet rôti");
    expect(out.calories).toBe(330);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("accepts IDs only from supplied candidates, never AI nutrition values", () => {
    const requests = [{ index: 0, name: "poisson", candidates: [{ id: "fish", name: "Poisson cuit" }] }];
    expect(validatedSelections({ matches: [{ index: 0, id: "invented", equivalent: true, calories: 9999 }] }, requests).size).toBe(0);
    expect(validatedSelections({ matches: [{ index: 0, id: "fish", equivalent: false }] }, requests).size).toBe(0);
    expect(validatedSelections({ matches: [{ index: 0, id: "fish", equivalent: true }] }, requests).get(0)).toBe("fish");
    expect(validatedSelections({ matches: [{ index: 0, id: "fish", equivalent: true }, { index: 0, id: "fish", equivalent: true }] }, requests).size).toBe(0);
  });
});