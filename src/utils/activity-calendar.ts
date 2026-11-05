import type { CalorieCycling } from "./goals-calc";
import { resolveTrainingDays, type DayType } from "./day-cycling";
import type { ExerciseSession } from "@/services/training-days";

export interface CalendarDay {
  date: string; inMonth: boolean; isToday: boolean; isFuture: boolean;
  planned: DayType; override: DayType | null;
  sessions: number; calories: number | null; weight: number | null;
}

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Session count per local date, approved sources only (same rule as habit detection). */
export function sessionsByDate(sessions: ExerciseSession[], allowedSources: string[]): Record<string, number> {
  const allowed = new Set(allowedSources);
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (!allowed.has(s.source_package)) continue;
    const from = new Date(s.start_time), to = new Date(s.end_time);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) continue;
    const k = ymd(from);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** Monday-first 6-week grid. Planned type = dated exception, else weekly routine. */
export function buildMonthGrid(
  month: Date, today: Date, cycling: CalorieCycling | null,
  overrides: Record<string, DayType>, sessions: Record<string, number>,
  calories: Record<string, number>, weights: Record<string, number>,
): CalendarDay[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const training = resolveTrainingDays(cycling);
  const todayStr = ymd(today);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i);
    const date = ymd(d);
    const iso = (d.getDay() + 6) % 7;
    const override = overrides[date] ?? null;
    const routine: DayType = cycling?.enabled && training.includes(iso) ? "training" : "rest";
    return {
      date, inMonth: d.getMonth() === month.getMonth(), isToday: date === todayStr, isFuture: date > todayStr,
      planned: override ?? routine, override,
      sessions: sessions[date] || 0, calories: calories[date] ?? null, weight: weights[date] ?? null,
    };
  });
}
