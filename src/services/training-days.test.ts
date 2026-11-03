import { afterEach, describe, expect, it } from "vitest";
import { detectHabitualTrainingDays, readTrainingDays, trainingWindow, type ExerciseSession } from "./training-days";

const now = new Date(2026, 10, 2, 12);
const session = (day: number, source = "samsung"): ExerciseSession => ({
  source_package: source,
  start_time: new Date(2026, 9, day, 0, 15).toISOString(),
  end_time: new Date(2026, 9, day, 1, 15).toISOString(),
});
afterEach(() => { delete (window as any).Capacitor; });

describe("jours habituels d'entraînement", () => {
  it("utilise 28 jours locaux révolus même au changement d'heure", () => {
    const { start, end } = trainingWindow(now);
    expect([start.getMonth(), start.getDate(), start.getHours()]).toEqual([9, 5, 0]);
    expect([end.getMonth(), end.getDate(), end.getHours()]).toEqual([10, 2, 0]);
  });
  it("retient deux lundis réels sans exiger de calories", () => {
    expect(detectHabitualTrainingDays([session(5), session(12)], ["samsung"], now)).toEqual([0]);
  });
  it("ne compte pas plusieurs séances le même jour comme une habitude", () => {
    expect(detectHabitualTrainingDays([session(5), session(5)], ["samsung"], now)).toEqual([]);
  });
  it("ignore les sources non approuvées", () => {
    expect(detectHabitualTrainingDays([session(5, "other"), session(12, "other")], ["samsung"], now)).toEqual([]);
  });
  it("exclut aujourd'hui, les dates anciennes et les séances invalides", () => {
    const today = { ...session(5), start_time: new Date(2026, 10, 2, 8).toISOString(), end_time: new Date(2026, 10, 2, 9).toISOString() };
    expect(detectHabitualTrainingDays([session(5), session(28 - 7), { ...session(12), end_time: "invalid" }, today, session(1)], ["samsung"], now)).toEqual([]);
  });
  it("ne lit ni les calories actives ni les pas, uniquement les séances natives", async () => {
    (window as any).Capacitor = { Plugins: { SportSamples: { readExerciseSessions: async () => ({ available: true, granted: true, samples: [] }) } } };
    expect(await readTrainingDays(["samsung"], now)).toEqual([]);
  });
  it("distingue une permission absente d'une absence de séances", async () => {
    (window as any).Capacitor = { Plugins: { SportSamples: { readExerciseSessions: async () => ({ available: true, granted: false, samples: [] }) } } };
    await expect(readTrainingDays(["samsung"], now)).rejects.toThrow("Autorise");
  });
});