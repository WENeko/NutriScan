import { describe, expect, it, vi } from "vitest";
import { applyCloudHybridSteps, normalizeRoutingConfig, pruneRoutingConfig, type RoutingConfig, type RoutingStep } from "./aiRouting";

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

const fullConfig = (): RoutingConfig => ({
  enabled: false,
  photo: [...cascade],
  text: [{ type: "byok", providerId: "google", model: "flash" }],
  coach: [{ type: "edge_function" }],
  recipe: [],
  models: { google: ["flash", "pro"], local: ["llama"] },
  hybrid: true,
  cloud_hybrid: true,
});

describe("pruneRoutingConfig (non-destructif)", () => {
  it("ne touche à rien quand la liste des fournisseurs est vide (échec de chargement)", () => {
    const cfg = fullConfig();
    const { config, changed } = pruneRoutingConfig(cfg, []);
    expect(changed).toBe(false);
    expect(config).toBe(cfg);
  });
  it("conserve intégralement modèles et cascades quand tout est valide, même désactivé", () => {
    const cfg = fullConfig();
    const { config, changed } = pruneRoutingConfig(cfg, ["google", "local"]);
    expect(changed).toBe(false);
    expect(config).toEqual(cfg);
    expect(config.enabled).toBe(false);
  });
  it("retire uniquement le fournisseur réellement supprimé", () => {
    const { config, changed } = pruneRoutingConfig(fullConfig(), ["google"]);
    expect(changed).toBe(true);
    expect(config.models).toEqual({ google: ["flash", "pro"] });
    expect(config.photo).toEqual([cascade[0], cascade[1]]);
  });
  it("retire un modèle obsolète seulement si la liste du fournisseur est non vide", () => {
    const cfg = fullConfig();
    cfg.models.google = ["pro"];
    const { config, changed } = pruneRoutingConfig(cfg, ["google", "local"]);
    expect(changed).toBe(true);
    expect(config.photo).toEqual([cascade[1], cascade[2]]);
    expect(config.text).toEqual([]);
  });
  it("conserve un step byok dont la liste de modèles du fournisseur est absente", () => {
    const cfg = fullConfig();
    delete cfg.models.local;
    const { config, changed } = pruneRoutingConfig(cfg, ["google", "local"]);
    expect(changed).toBe(false);
    expect(config.photo).toEqual(cascade);
  });
});