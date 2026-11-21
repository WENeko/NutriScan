import { parseISO } from "date-fns";
import { applyDayCycling, buildWeekStrip, type DayType } from "./day-cycling";
import type { CalorieCycling } from "./goals-calc";

export interface DailyGoals { calories: number; proteins: number; carbs: number; fats: number }
export interface GoalSnapshot extends DailyGoals { recorded_at: string }

/** Snapshots are already cycled: never forward-fill or cycle them twice. */
export function datedGoals(date: string, base: DailyGoals, cycling: CalorieCycling | null, weight: number,
  override: DayType | null, snapshot?: GoalSnapshot): DailyGoals {
  if (snapshot?.recorded_at === date && !override) return snapshot;
  return applyDayCycling(base, cycling, parseISO(date), weight, override);
}

export function weeklyGoals(base: DailyGoals, cycling: CalorieCycling | null, today: Date, weight: number, overrides: Record<string, DayType>) {
  const days = buildWeekStrip(cycling, today, overrides).map(day => ({ ...day,
    goals: applyDayCycling(base, cycling, parseISO(day.date), weight, day.override),
  }));
  return { days, total: days.reduce((sum, day) => sum + day.goals.calories, 0),
    elapsed: days.filter(day => day.isPast || day.isToday).reduce((sum, day) => sum + day.goals.calories, 0) };
}