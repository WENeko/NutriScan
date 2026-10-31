import { describe, it, expect } from "vitest";
import { qualityTargets } from "./metabolic-quality";

describe("qualityTargets", () => {
  it("hypertrophy: protein 1.8-2.2 g/kg, fat 1 g/kg, omega-3 3000 mg, sugar <10% kcal", () => {
    const t = qualityTargets("hypertrophy", 80, 3000);
    expect(t.proteinG).toEqual([144, 176]);
    expect(t.fatMinG).toBe(80);
    expect(t.omega3MinMg).toBe(3000);
    expect(t.sugarMaxG).toBe(75);
  });
  it("hypertrophy: no sugar cap around training", () => {
    expect(qualityTargets("hypertrophy", 80, 3000, true).sugarMaxG).toBeNull();
  });
  it("cut: protein 2.2-2.5 g/kg, sugar <25 g, fibre 15 g/1000 kcal", () => {
    const t = qualityTargets("cut", 80, 2000);
    expect(t.proteinG[0]).toBeCloseTo(176); expect(t.proteinG[1]).toBe(200);
    expect(t.sugarMaxG).toBe(25); expect(t.fiberMinG).toBe(30);
  });
  it("endurance: protein 1.6-1.8 g/kg", () => {
    expect(qualityTargets("endurance", 70, 2800).proteinG).toEqual([112, 126]);
  });
  it("health: saturated < 8% kcal", () => {
    expect(qualityTargets("health", 70, 2250).saturatedMaxG).toBe(20);
  });
});
