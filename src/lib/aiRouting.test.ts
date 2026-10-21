import { describe, expect, it, vi } from "vitest";
import { applyCloudHybridSteps, normalizeRoutingConfig, type RoutingStep } from "./aiRouting";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const cascade: RoutingStep[] = [
  { type: "byok", providerId: "google", model: "flash" },
  { type: "edge_function" },
  { type: "byok", providerId: "local", model: "llama" },
];
const isCloud = (id: string) => id !== "local";

describe("cloud hybrid routing", () => {
  it("is off by default and preserves legacy local settings", () => {
    expect(normalizeRoutingConfig({ hybrid: true }).cloud_hybrid).toBe(false);
    expect(normalizeRoutingConfig({ hybrid: true, cloud_hybrid: true })).toMatchObject({ hybrid: true, cloud_hybrid: true });
  });
  it("wraps cloud models in their existing order, never a local model", () => {
    expect(applyCloudHybridSteps(cascade, true, "photo", isCloud)).toEqual([
      { type: "cloud_hybrid", providerId: "google", model: "flash" },
      { type: "cloud_hybrid" },
      cascade[2],
    ]);
    expect(cascade[0].type).toBe("byok");
  });
  it("restores standard cloud analysis when switched off", () => {
    expect(applyCloudHybridSteps(cascade, false, "text", isCloud)).toEqual(cascade);
  });
  it("does not change coach or recipe routing", () => {
    expect(applyCloudHybridSteps(cascade, true, "coach", isCloud)).toEqual(cascade);
    expect(applyCloudHybridSteps(cascade, true, "recipe", isCloud)).toEqual(cascade);
  });
});