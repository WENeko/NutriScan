import { describe, expect, it } from "vitest";
import { applyDayCycling, cyclingForDay } from "./day-cycling";

const base = { calories: 2000, proteins: 150, carbs: 200, fats: 70 };
const routine = { enabled: true, multipliers: [1.2, 0.85, 1.2, 0.85, 1.2, 0.85, 0.85], trainingDays: [0, 2, 4], locked: [true, false, false, false, false, false, false] };
describe("dated cycling exceptions", () => {
  it("moves Thursday to training without changing the Wednesday routine", () => {
    const original = structuredClone(routine);
    expect(applyDayCycling(base, routine, new Date(2026, 10, 5), 80, "training")).toEqual({ calories: 2400, proteins: 150, carbs: 300, fats: 70 });
    expect(routine).toEqual(original);
  });
  it("moves Wednesday to rest using the existing rest budget", () => {
    expect(applyDayCycling(base, routine, new Date(2026, 10, 4), 80, "rest")).toEqual({ calories: 1700, proteins: 150, carbs: 140, fats: 63 });
  });
  it("returning to routine restores its exact goals", () => {
    expect(applyDayCycling(base, routine, new Date(2026, 10, 5), 80, null).calories).toBe(1700);
  });
  it("does not invent a surplus when no training coefficient exists", () => {
    expect(cyclingForDay({ enabled: true, multipliers: [1, 0.9, 1, 0.9, 1, 0.9, 0.9], trainingDays: [] }, new Date(2026, 10, 5), "training")?.multipliers[3]).toBe(1);
  });
  it("disabled cycling leaves goals unchanged", () => {
    expect(applyDayCycling(base, { ...routine, enabled: false }, new Date(2026, 10, 5), 80, "training")).toEqual(base);
  });
});