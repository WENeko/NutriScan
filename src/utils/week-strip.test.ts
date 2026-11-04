import { describe, it, expect } from "vitest";
import { buildWeekStrip, nextDayChoice } from "./day-cycling";

const cycling = { enabled: true, multipliers: [1, 1, 1, 1, 1, 1, 1], trainingDays: [0, 2, 4] } as any;

describe("bandeau 7 jours", () => {
  it("couvre lundi→dimanche de la semaine locale", () => {
    const days = buildWeekStrip(cycling, new Date(2026, 10, 4, 12), {}); // mercredi 4/11
    expect(days.map(d => d.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(days[2].isToday).toBe(true);
    expect(days[1].isPast).toBe(true);
  });
  it("une séance décalée mercredi→jeudi ne change que ces deux dates", () => {
    const days = buildWeekStrip(cycling, new Date(2026, 10, 4), { "2026-11-04": "rest", "2026-11-05": "training" });
    expect(days.map(d => d.effective)).toEqual(["training", "rest", "rest", "training", "training", "rest", "rest"]);
    expect(days[0].override).toBeNull();
  });
  it("un tap inverse la routine, un second revient à la routine", () => {
    expect(nextDayChoice({ routine: "rest", override: null })).toBe("training");
    expect(nextDayChoice({ routine: "training", override: null })).toBe("rest");
    expect(nextDayChoice({ routine: "rest", override: "training" })).toBeNull();
  });
});
