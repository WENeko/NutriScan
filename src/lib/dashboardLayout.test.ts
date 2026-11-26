import { beforeEach, describe, expect, it } from "vitest";
import { canUseHalfWidth, defaultDashboardLayout, loadDashboardLayout, normalizeDashboardLayout, reorderDashboardLayout, saveDashboardLayout } from "./dashboardLayout";

describe("dashboard layout", () => {
  beforeEach(() => localStorage.clear());
  it("keeps budget and water side by side by default", () => {
    expect(defaultDashboardLayout().filter(w => w.half).map(w => w.id)).toEqual(["budget", "water"]);
  });
  it("reorders without losing widgets or their settings", () => {
    const initial = defaultDashboardLayout();
    const moved = reorderDashboardLayout(initial, "water", "cycling");
    expect(moved[0]).toEqual({ id: "water", half: true, hidden: false });
    expect(new Set(moved.map(w => w.id)).size).toBe(9);
    expect(initial[0].id).toBe("cycling");
    expect(reorderDashboardLayout(initial, "unknown", "water")).toBe(initial);
  });
  it("saves order, width and visibility separately for each account", () => {
    const changed = reorderDashboardLayout(defaultDashboardLayout(), "water", "cycling").map(w => w.id === "water" ? { ...w, half: false, hidden: true } : w);
    expect(saveDashboardLayout("alice", changed)).toBe(true);
    expect(loadDashboardLayout("alice")).toEqual(changed);
    expect(loadDashboardLayout("bob")).toEqual(defaultDashboardLayout());
  });
  it("rejects obsolete and duplicate ids and restores missing modules", () => {
    const normalized = normalizeDashboardLayout([{ id: "water", half: true, hidden: true }, { id: "water" }, { id: "obsolete" }]);
    expect(normalized).toHaveLength(9);
    expect(normalized[0]).toEqual({ id: "water", half: true, hidden: true });
    expect(normalizeDashboardLayout("broken")).toEqual(defaultDashboardLayout());
  });
  it("keeps meal input accessible and wide modules readable", () => {
    expect(normalizeDashboardLayout([{ id: "input", half: true, hidden: true }])[0]).toEqual({ id: "input", half: false, hidden: false });
    expect(canUseHalfWidth("summary")).toBe(false);
  });
  it("restores the original layout after reset", () => {
    saveDashboardLayout("alice", reorderDashboardLayout(defaultDashboardLayout(), "health", "summary"));
    saveDashboardLayout("alice", defaultDashboardLayout());
    expect(loadDashboardLayout("alice")).toEqual(defaultDashboardLayout());
  });
});