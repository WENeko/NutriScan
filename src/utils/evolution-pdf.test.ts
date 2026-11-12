import { describe, expect, it } from "vitest";
import { evolutionPdf } from "./evolution-pdf";
import type { ReportPalette } from "./evolution-pdf";
const palette: ReportPalette = { paper: "#ffffff", ink: "#16372d", muted: "#52665f", accent: "#288566", tint: "#edf5f1", rule: "#d6e3dc" };
describe("evolution PDF", () => {
  it("generates a real nonempty PDF for even an empty report", async () => {
    const pdf = evolutionPdf([], 7.5, palette);
    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(1000);
  });
});