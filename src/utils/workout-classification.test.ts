import { describe, expect, it } from "vitest";
import { classifySavedMeals, WORKOUT_COUNTDOWN_SECONDS, type ClassifiableMeal } from "./workout-classification";
const meal: ClassifiableMeal = { id: "meal", meal_name: "Collation", timestamp: "2026-11-17T17:00:00Z", peri_workout: "none", workout_context_locked: false };
const sessions = [{ start_time: "2026-11-17T18:00:00Z", end_time: "2026-11-17T19:00:00Z" }];
const windows = { preMin: 90, postMin: 120 };
describe("saved meal classification", () => {
  it("classifies the previously recorded 17:00 snack before an 18:00 session", () => {
    expect(classifySavedMeals([meal], sessions, windows)[0]?.context).toBe("pre_workout");
  });
  it("never changes a manual Standard selection or cancelled classification", () => {
    expect(classifySavedMeals([{ ...meal, workout_context_locked: true }], sessions, windows)).toEqual([]);
  });
  it("preserves an existing non-standard context", () => {
    expect(classifySavedMeals([{ ...meal, peri_workout: "post_workout" }], sessions, windows)).toEqual([]);
  });
  it("uses the configured window instead of assuming every meal is eligible", () => {
    expect(classifySavedMeals([meal], sessions, { preMin: 15, postMin: 120 })).toEqual([]);
  });
  it("leaves five seconds to cancel before applying", () => {
    expect(WORKOUT_COUNTDOWN_SECONDS).toBe(5);
  });
});