import { describe, expect, it } from "vitest";
import { detectWorkoutContext, normalizeWorkoutWindows, WORKOUT_WINDOW_DEFAULTS } from "./metabolic-quality";

const session = (minutes: number, calories_kcal = 0) => ({ start_time: "2026-11-08T17:00:00Z", end_time: new Date(Date.parse("2026-11-08T17:00:00Z") + minutes * 60000).toISOString(), calories_kcal });
describe("adjustable workout windows", () => {
  it.each([
    ["endurance", 90, 45], ["hypertrophy", 90, 120], ["cut", 60, 60], ["health", 90, 90],
  ] as const)("defaults for %s", (preset, preMin, postMin) => {
    expect(normalizeWorkoutWindows(null, preset)).toEqual({ preMin, postMin });
  });
  it("bounds pre to 15–180 minutes", () => {
    expect(normalizeWorkoutWindows({ preMin: 0 }).preMin).toBe(15);
    expect(normalizeWorkoutWindows({ preMin: 999 }).preMin).toBe(180);
  });
  it("bounds post to 15–240 minutes", () => {
    expect(normalizeWorkoutWindows({ postMin: 0 }).postMin).toBe(15);
    expect(normalizeWorkoutWindows({ postMin: 999 }).postMin).toBe(240);
  });
  it("uses 15-minute steps", () => {
    expect(normalizeWorkoutWindows({ preMin: 38, postMin: 53 })).toEqual({ preMin: 45, postMin: 60 });
  });
  it("accepts a session from 20 minutes", () => {
    expect(detectWorkoutContext("2026-11-08T16:45:00Z", [session(19)])).toBe("none");
    expect(detectWorkoutContext("2026-11-08T16:45:00Z", [session(20)])).toBe("pre_workout");
  });
  it("alternatively accepts 100 kcal", () => {
    expect(detectWorkoutContext("2026-11-08T16:45:00Z", [session(10, 99)])).toBe("none");
    expect(detectWorkoutContext("2026-11-08T16:45:00Z", [session(10, 100)])).toBe("pre_workout");
  });
  it("requires 45 minutes for intra", () => {
    expect(detectWorkoutContext("2026-11-08T17:10:00Z", [session(44, 300)])).toBe("none");
    expect(detectWorkoutContext("2026-11-08T17:10:00Z", [session(45)])).toBe("intra_workout");
  });
  it("applies customized pre/post boundaries", () => {
    const windows = { preMin: 15, postMin: 240 };
    expect(detectWorkoutContext("2026-11-08T16:44:59Z", [session(60)], windows)).toBe("none");
    expect(detectWorkoutContext("2026-11-08T16:45:00Z", [session(60)], windows)).toBe("pre_workout");
    expect(detectWorkoutContext("2026-11-08T22:00:00Z", [session(60)], windows)).toBe("post_workout");
    expect(detectWorkoutContext("2026-11-08T22:00:01Z", [session(60)], windows)).toBe("none");
    expect(WORKOUT_WINDOW_DEFAULTS.hypertrophy).toEqual({ preMin: 90, postMin: 120 });
  });
});