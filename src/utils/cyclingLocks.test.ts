import { describe, it, expect } from "vitest";
import { rebalanceWithLocks } from "./goals-calc";
import { buildTrainingMultipliers } from "@/components/CyclingEditor";
import { extractChoices } from "@/services/hybrid/cloudHybridService";
import { validatedSelections } from "../../supabase/functions/_shared/foodSelection";

const avg = (m: number[]) => m.reduce((s, v) => s + v, 0) / 7;

describe("cyclage : jours verrouillés", () => {
  it("un jour verrouillé garde exactement sa valeur, les autres compensent", () => {
    const locked = [true, false, false, false, false, false, false];
    const out = rebalanceWithLocks([1.2, 1, 1, 1, 1, 1, 1], locked);
    expect(out[0]).toBe(1.2);
    expect(avg(out)).toBeCloseTo(1, 2);
  });

  it("deux jours verrouillés ne bougent pas quand on rééquilibre", () => {
    const locked = [true, false, true, false, false, false, false];
    const out = rebalanceWithLocks([1.1, 1, 0.9, 1, 1, 1, 1.2], locked);
    expect(out[0]).toBe(1.1);
    expect(out[2]).toBe(0.9);
    expect(avg(out)).toBeCloseTo(1, 2);
  });
});

describe("cyclage : Training / Repos", () => {
  it("les jours d'entraînement choisis passent à +15 % et la moyenne reste 1", () => {
    const out = buildTrainingMultipliers([0, 2, 4]);
    expect(out[0]).toBe(1.15);
    expect(out[2]).toBe(1.15);
    expect(out[4]).toBe(1.15);
    expect(out[1]).toBeLessThan(1);
    expect(avg(out)).toBeCloseTo(1, 2);
  });
});

describe("choix rapides aliments ambigus", () => {
  it("limite à 4 choix, sans doublon ni le nom déjà affiché", () => {
    expect(extractChoices({ name: "Bœuf", choices: ["Bœuf", "Agneau", "agneau", "Porc", "Veau", "Cheval", "Poulet"] }))
      .toEqual(["Agneau", "Porc", "Veau", "Cheval"]);
  });
});

describe("sélection de fiche tolérante", () => {
  it("accepte un index texte et un ID sans préfixe, mais seulement parmi les candidats", () => {
    const req = [{ index: 0, name: "poisson", candidates: [{ id: "usda:123", name: "Fish, cooked" }] }];
    expect(validatedSelections({ matches: [{ index: "0", id: "123", equivalent: "true" }] }, req).get(0)).toBe("usda:123");
    expect(validatedSelections({ matches: [{ index: 0, id: "999", equivalent: true }] }, req).size).toBe(0);
  });
});
