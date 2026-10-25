import { describe, expect, it } from "vitest";
import { cloudFoodSearchName } from "../../../supabase/functions/_shared/cloudFoodSearch";

describe("cloud catalogue queries", () => {
  it("corrects Schupfnudlen and strips the trailing cooking term for retrieval", () => {
    expect(cloudFoodSearchName("Schupfnudlen cuits")).toBe("Schupfnudeln");
  });
  it("keeps the actual ingredients and added fat", () => {
    expect(cloudFoodSearchName("Nouilles de pommes de terre cuites")).toBe("Nouilles de pommes de terre");
    expect(cloudFoodSearchName("Poisson cuit au beurre")).toBe("Poisson cuit au beurre");
  });
  it("broadens English USDA queries without substituting a recipe", () => {
    expect(cloudFoodSearchName("lentils, boiled")).toBe("lentils");
    expect(cloudFoodSearchName("potato noodles, cooked")).toBe("potato noodles");
  });
});