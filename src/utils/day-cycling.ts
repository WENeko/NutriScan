import { applyCycling, getIsoDayIndex, type CalorieCycling } from "./goals-calc";

export type DayType = "training" | "rest";

/** A dated exception borrows the mean coefficient of the selected routine type.
 * No matching routine days means a neutral coefficient, never an invented surplus.
 * The original routine and its locks remain untouched. */
export function cyclingForDay(cycling: CalorieCycling | null, date: Date, override: DayType | null): CalorieCycling | null {
  if (!cycling?.enabled || cycling.multipliers.length !== 7 || !override) return cycling;
  const index = getIsoDayIndex(date);
  const training = resolveTrainingDays(cycling);
  const desiredTraining = override === "training";
  if (training.includes(index) === desiredTraining) return cycling;
  const coefficients = cycling.multipliers.filter((_, i) => training.includes(i) === desiredTraining);
  const multiplier = coefficients.length ? coefficients.reduce((sum, n) => sum + n, 0) / coefficients.length : 1;
  const multipliers = [...cycling.multipliers];
  multipliers[index] = multiplier;
  const trainingDays = desiredTraining ? [...training, index] : training.filter(i => i !== index);
  return { ...cycling, multipliers, trainingDays };
}

export function applyDayCycling(base: Parameters<typeof applyCycling>[0], cycling: CalorieCycling | null, date: Date, weight: number, override: DayType | null) {
  return applyCycling(base, cyclingForDay(cycling, date, override), date, weight);
}
export interface WeekStripDay { date: string; isoIndex: number; routine: DayType; override: DayType | null; effective: DayType; isToday: boolean; isPast: boolean; }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Monday→Sunday of the local week containing `today`, with routine type and dated exceptions. */
export function buildWeekStrip(cycling: CalorieCycling | null, today: Date, overrides: Record<string, DayType>): WeekStripDay[] {
  const todayIdx = getIsoDayIndex(today);
  const todayStr = ymd(today);
  const training = resolveTrainingDays(cycling);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - todayIdx + i);
    const date = ymd(d);
    const routine: DayType = training.includes(i) ? "training" : "rest";
    const override = overrides[date] ?? null;
    return { date, isoIndex: i, routine, override, effective: override ?? routine, isToday: date === todayStr, isPast: date < todayStr };
  });
}

/** One tap flips the day away from its routine; tapping an exception returns to the routine (null). */
export function nextDayChoice(day: Pick<WeekStripDay, "routine" | "override">): DayType | null {
  return day.override ? null : day.routine === "training" ? "rest" : "training";
}

/** Résout les jours d'entraînement : priorité à la liste explicite, sinon déduit des jours avec surplus (> 1.01). */
export function resolveTrainingDays(cycling: CalorieCycling | null): number[] {
  if (!cycling) return [];
  if (Array.isArray(cycling.trainingDays) && cycling.trainingDays.length > 0) {
    return cycling.trainingDays;
  }
  if (Array.isArray(cycling.multipliers) && cycling.multipliers.length === 7) {
    return cycling.multipliers
      .map((m, idx) => (m > 1.01 ? idx : -1))
      .filter((idx) => idx >= 0);
  }
  return [];
}

