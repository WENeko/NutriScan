import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayload, deleteMealFromHealthConnect, resyncMealToHealthConnect, writeMealToHealthConnect } from "./nutritionWriter";

const meal = { meal_name: "Test", total_calories: 250, total_proteins: 12.5, total_carbs: 30, total_fats: 8, timestamp: "2026-04-01T12:00:00Z" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

function plugin() {
  const p = { hasPermission: vi.fn(async () => ({ granted: true })), writeMeal: vi.fn(async () => ({ ok: true })), deleteMealById: vi.fn(async () => ({ ok: true })), deleteMealWindow: vi.fn(async () => ({ ok: true })) };
  vi.stubGlobal("Capacitor", { Plugins: { NutritionWriter: p } });
  localStorage.setItem("nutriscan-hc-nutrition-sync", "1");
  return p;
}

describe("nutrition writer", () => {
  it("keeps the same meal identity after losing the local cache", async () => {
    const p = plugin();
    expect(await writeMealToHealthConnect("meal-1", meal, [])).toBe(true);
    localStorage.removeItem("nutriscan-hc-write-windows");
    expect(await writeMealToHealthConnect("meal-1", meal, [])).toBe(true);
    expect(p.writeMeal.mock.calls.map(args => (args as unknown as [{ mealId: string }])[0].mealId)).toEqual(["meal-1", "meal-1"]);
  });
  it("upserts edited meals without deleting adjacent records", async () => {
    const p = plugin();
    await writeMealToHealthConnect("meal-1", meal, []);
    await resyncMealToHealthConnect("meal-1", { ...meal, total_calories: 300 }, []);
    expect(p.deleteMealWindow).not.toHaveBeenCalled();
    expect(p.writeMeal).toHaveBeenLastCalledWith(expect.objectContaining({ mealId: "meal-1", kcal: 300 }));
  });
  it("can delete by identity even when the cache was erased", async () => {
    const p = plugin();
    await deleteMealFromHealthConnect("meal-1");
    expect(p.deleteMealById).toHaveBeenCalledWith({ mealId: "meal-1" });
    expect(p.deleteMealWindow).not.toHaveBeenCalled();
  });
  it("keeps the full interval in the past and strictly positive", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T11:03:00Z"));
    for (const timestamp of ["2026-12-01T12:00:00Z", "invalid", "2026-11-22T11:03:00Z"]) {
      const p = buildPayload("meal-1", { ...meal, timestamp }, []);
      expect(Date.parse(p.endTime)).toBeLessThanOrEqual(Date.now());
      expect(Date.parse(p.endTime) - Date.parse(p.startTime)).toBe(60_000);
    }
  });
  it("sanitizes macros and converts observed comma-decimal micros to grams", () => {
    const p = buildPayload("meal-1", { ...meal, total_calories: NaN, total_fats: -1 }, [{ sodium_mg: "12,5", fiber: Infinity }] as never);
    expect(p.kcal).toBe(0);
    expect(p.totalFatGrams).toBe(0);
    expect(p.sodiumGrams).toBe(0.0125);
    expect(p.dietaryFiberGrams).toBe(0);
  });
});