import { describe, expect, it } from "vitest";
import { evolutionPdf } from "./evolution-pdf";
describe("evolution PDF", () => {
  it("generates a real nonempty PDF for even an empty report", async () => {
    const pdf = evolutionPdf([], 7.5);
    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(1000);
  });
});