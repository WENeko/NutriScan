import { describe, it, expect } from "vitest";
import { parseVlmOutput } from "./localVlm";

describe("parseVlmOutput", () => {
  it("lit un JSON valide", () => {
    expect(parseVlmOutput('[{"ingredient":"riz blanc","weight_g":200}]')).toEqual([{ name: "riz blanc", weightG: 200, count: undefined }]);
  });
  it("extrait le JSON entouré de texte", () => {
    const r = parseVlmOutput('Voici : ```json\n[{"ingredient":"oeuf","weight_g":110,"count":2}]\n``` fin');
    expect(r[0]).toEqual({ name: "oeuf", weightG: 110, count: 2 });
  });
  it("poids absent → indéfini (portion par défaut ensuite)", () => {
    expect(parseVlmOutput('[{"ingredient":"pomme"}]')[0].weightG).toBeUndefined();
  });
  it("fusionne les doublons", () => {
    const r = parseVlmOutput('[{"ingredient":"Brocoli","weight_g":50},{"ingredient":"brocoli","weight_g":30}]');
    expect(r).toHaveLength(1);
    expect(r[0].weightG).toBe(80);
  });
  it("lit les tuples à guillemets simples", () => {
    const r = parseVlmOutput("['fish', 250], ['frites', 120]");
    expect(r).toEqual([{ name: "fish", weightG: 250, count: undefined }, { name: "frites", weightG: 120, count: undefined }]);
  });
  it("lit le format partagé estimated_weight_g / unit_count", () => {
    expect(parseVlmOutput('[{"name":"oeuf","estimated_weight_g":120,"unit_count":2}]')[0]).toEqual({ name: "oeuf", weightG: 120, count: 2 });
  });
});
