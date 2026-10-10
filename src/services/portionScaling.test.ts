import { describe, it, expect } from "vitest";
import { scaleForDistance } from "./portionScaling";

describe("scaleForDistance", () => {
  it("oeufs calibrés : rien ne bouge", () => {
    expect(scaleForDistance({ name: "Oeuf", quantity: "110g", unitCount: 2, unitWeightG: 55 }, 1.78)).toBeNull();
  });
  it("boulettes variables : compte figé, poids unitaire dilaté", () => {
    expect(scaleForDistance({ name: "Boulettes de viande", quantity: "100g", unitCount: 4, unitWeightG: 25 }, 1.4))
      .toEqual({ newWeight: 140, unitCount: 4, unitWeightG: 35 });
  });
  it("vrac : poids total dilaté", () => {
    expect(scaleForDistance({ name: "Purée maison", quantity: "150g" }, 2)).toEqual({ newWeight: 300 });
  });
});
