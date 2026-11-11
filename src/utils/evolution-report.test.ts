import { describe, expect, it } from "vitest";
import { adherence, buildReportDays, correlation, reportCsv, reportWeeks, type ReportDay } from "./evolution-report";

const day = (patch: Partial<ReportDay> = {}): ReportDay => ({ date: "2026-11-02", type: "rest", exception: false, completed: true, logged: true,
  calories: 2000, proteins: 100, carbs: 200, fats: 50, goal: 2000, iqm: 80, coverage: 1, fiber: 20, omega3: 1000,
  weight: null, bodyFat: null, muscle: null, sessions: null, minutes: null, ...patch });
describe("evolution reports", () => {
  it("includes the ±7.5% boundary, not missing logs, targets or today", () => {
    expect(adherence([day({ calories: 2150 }), day({ calories: 2151 }), day({ logged: false }), day({ goal: null }), day({ completed: false })], "rest")).toEqual({ count: 2, conforming: 1, percent: 50 });
  });
  it("uses the chosen tolerance and separates day types", () => {
    expect(adherence([day({ calories: 2200 }), day({ type: "training" })], "rest", 10).percent).toBe(100);
  });
  it("keeps missing ingredient nutrients unknown and honours exceptions without auto-applying sessions", () => {
    const result = buildReportDays({ dates: ["2026-11-02", "2026-11-03"], today: "2026-11-04",
      meals: [{ id: "m", timestamp: "2026-11-02T12:00:00", total_calories: 500, total_proteins: 30, total_carbs: 40, total_fats: 20 }],
      items: { m: [{ nutrients_std: { fiber: 5, sugar: 3, saturated_fat: 2, omega3_mg: 100 } }, { nutrients_std: {} }] },
      body: [], goals: [{ recorded_at: "2026-11-02", calories: 2400 }], overrides: { "2026-11-02": "rest" },
      cycling: { enabled: true, multipliers: [1.2, 1, 1, 1, 1, 1, 1], trainingDays: [0] }, preset: "health",
      sessions: [{ source_package: "unapproved", start_time: "2026-11-02T10:00:00", end_time: "2026-11-02T11:00:00" }], allowed: ["approved"], sessionsAvailable: true });
    expect(result[0].type).toBe("rest"); expect(result[0].goal).toBe(2400);
    expect(result[0].fiber).toBeNull(); expect(result[0].coverage).toBe(0.25); expect(result[0].sessions).toBe(0);
    expect(result[1].goal).toBeNull(); expect(result[1].calories).toBeNull();
  });
  it("weights weekly IQM by energy with three complete days and two actual body measurements", () => {
    const weeks = reportWeeks([day({ weight: 80 }), day({ date: "2026-11-03", iqm: 60, calories: 1000 }), day({ date: "2026-11-04", weight: 79 })]);
    expect(weeks[0].iqm).toBe(76); expect(weeks[0].weight).toBe(-1);
    expect(reportWeeks([day({ coverage: 0.25, weight: 80 })])[0].iqm).toBeNull();
    expect(reportWeeks([day({ weight: 80 })])[0].weight).toBeNull();
  });
  it("requires four paired weeks and nonconstant values for correlation", () => {
    const weeks = [60, 70, 80, 90].map((iqm, i) => ({ date: `week${i}`, days: 3, iqm, weight: -i, bodyFat: null, muscle: null, weightValue: null, bodyFatValue: null, muscleValue: null }));
    expect(correlation(weeks.slice(0, 3), "weight").r).toBeNull();
    expect(correlation(weeks, "weight").r).toBeCloseTo(-1);
    expect(correlation(weeks.map(w => ({ ...w, weight: 0 })), "weight").r).toBeNull();
  });
  it("exports unknowns as empty cells, preserving actual zeros and coverage", () => {
    const csv = reportCsv([day({ fiber: 0, omega3: null, coverage: 0.25 })]);
    expect(csv).toContain('"80";"25";"0";""'); expect(csv.startsWith("\uFEFF")).toBe(true);
  });
  it("calculates inter-week delta when user weighs once per consecutive week", () => {
  const weeks = reportWeeks([
    day({ date: "2026-11-02", weight: 80 }),
    day({ date: "2026-11-09", weight: 79.4 }),
  ]);
  expect(weeks[0].weight).toBeNull(); // Première semaine : pas d'historique antérieur
  expect(weeks[1].weight).toBe(-0.6); // Semaine consécutive : 79.4 - 80.0 = -0.6 kg
});
  it("preserves actual measurements across an unmeasured week without filling gaps", () => {
    const weeks = reportWeeks([day({ weight: 80 }), day({ date: "2026-11-09" }), day({ date: "2026-11-16", weight: 79 })]);
    expect(weeks[1].weightValue).toBeNull();
    expect(weeks[1].weight).toBeNull();
    expect(weeks[2].weightValue).toBe(79);
    expect(weeks[2].weight).toBe(-1);
  });
  it("does not correlate provisional IQM even when three days are logged", () => {
    expect(reportWeeks([day({ coverage: 0.25 }), day({ date: "2026-11-03", coverage: 0.25 }), day({ date: "2026-11-04", coverage: 0.25 })])[0].iqm).toBeNull();
  });
});
