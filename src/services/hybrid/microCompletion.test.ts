import { describe, it, expect } from "vitest";
import { mergeMicroFill, missingMicroKeys } from "./microCompletion";

const keys = ["calcium_mg", "iron_mg", "vitamin_c_mg", "calories"];

describe("mergeMicroFill", () => {
  it("rejects generated micros in cloud semantic-only mode while accepting database records", () => {
    const out = mergeMicroFill({ estimated_weight_g: 100 }, { values: { iron_mg: 2, calcium_mg: 50 }, sources: { iron_mg: "ai", calcium_mg: "usda" } }, keys, true);
    expect(out.iron_mg).toBeUndefined();
    expect(out.calcium_mg).toBe(50);
  });
  it("préserve une valeur zéro connue et exclut les macros même dans une liste custom", () => {
    const out = mergeMicroFill({ estimated_weight_g: 100, iron_mg: 0 }, { values: { iron_mg: 2 }, sources: { iron_mg: "ai" } }, keys);
    expect(out.iron_mg).toBe(0);
    expect(missingMicroKeys({}, [{ key: "calories", label: "Calories", unit: "kcal", category: "custom" }])).not.toContain("calories");
  });
  it("n'écrase jamais une valeur déjà résolue (CIQUAL)", () => {
    const out = mergeMicroFill({ estimated_weight_g: 100, calcium_mg: 120 }, { values: { calcium_mg: 999 }, sources: { calcium_mg: "ai" } }, keys);
    expect(out.calcium_mg).toBe(120);
  });

  it("ne remplit que les clés manquantes autorisées, jamais les calories", () => {
    const out = mergeMicroFill({ estimated_weight_g: 100, calories: 50 }, { values: { iron_mg: 2, calories: 400, zinc_mg: 3 }, sources: { iron_mg: "usda" } }, keys);
    expect(out.iron_mg).toBe(2);
    expect(out.micro_sources.iron_mg).toBe("usda");
    expect(out.calories).toBe(50);
    expect(out.zinc_mg).toBeUndefined();
  });

  it("rejette une valeur aberrante", () => {
    const out = mergeMicroFill({ estimated_weight_g: 100 }, { values: { vitamin_c_mg: 50000 }, sources: {} }, keys);
    expect(out.vitamin_c_mg).toBeUndefined();
  });
});
