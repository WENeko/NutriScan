import { applyCycling, getIsoDayIndex, type CalorieCycling } from "./goals-calc";

export type DayType = "training" | "rest";

/** A dated exception borrows the mean coefficient of the selected routine type.
 * No matching routine days means a neutral coefficient, never an invented surplus.
 * The original routine and its locks remain untouched. */
export function cyclingForDay(cycling: CalorieCycling | null, date: Date, override: DayType | null): CalorieCycling | null {
  if (!cycling?.enabled || cycling.multipliers.length !== 7 || !override) return cycling;
  const index = getIsoDayIndex(date);
  const training = cycling.trainingDays ?? [];
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