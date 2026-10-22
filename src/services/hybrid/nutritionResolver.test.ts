import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveFoodItem } from "./nutritionResolver";
import { NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("USDA resolver stage", () => {
  it("uses USDA after OFF fails, scales to portion and passes dynamic lists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [] }) }));
    invoke.mockResolvedValue({ data: { results: [{ query: "alimentxyz", per100: { calories: 120, proteins: 10, calcium_mg: 80 } }] }, error: null });
    const custom = [{ key: "choline_mg", label: "Choline", unit: "mg", category: "custom" }];
    const out = await resolveFoodItem({ name: "alimentxyz", weightG: 250, unitCount: 2, unitWeightG: 125, unitLabel: "portion" }, { customNutrients: custom });
    expect(out).toMatchObject({ source: "usda", calories: 300, proteins: 25, calcium_mg: 200, unit_count: 2, unit_weight_g: 125, unit_label: "portion" });
    expect(out.micro_sources.calcium_mg).toBe("usda");
    expect(invoke).toHaveBeenCalledWith("resolve-usda", { body: { queries: ["alimentxyz"], nutrients: [...NUTRIENTS_STD_LIST, ...custom] } });
  });
  it("does not call USDA when the library already resolves the food", async () => {
    const out = await resolveFoodItem({ name: "alimentxyz", weightG: 200 }, { customFoods: [{ name: "alimentxyz", calories_per_100g: 75 }] });
    expect(out.calories).toBe(150);
    expect(out.source).toBe("library");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("does not access USDA in offline mode", async () => {
    const out = await resolveFoodItem({ name: "alimentxyz", weightG: 100 }, { allowNetwork: false });
    expect(out.source).toBe("unresolved");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("keeps known zero micros resolved so completion cannot overwrite them", async () => {
    const out = await resolveFoodItem({ name: "alimentxyz", weightG: 200 }, { customFoods: [{ name: "alimentxyz", calories_per_100g: 75, nutrients_std: { iron_mg: 0 }, nutrients_custom: { choline_mg: 0 } }], customNutrients: [{ key: "choline_mg", label: "Choline", unit: "mg", category: "custom" }] });
    expect(out.iron_mg).toBe(0);
    expect(out.choline_mg).toBe(0);
    expect(out.micro_sources.iron_mg).toBe("library");
  });
});