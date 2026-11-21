import { supabase } from "@/integrations/supabase/client";
import { datedGoals, type DailyGoals, type GoalSnapshot } from "@/utils/dated-goals";
import type { DayType } from "@/utils/day-cycling";
import type { CalorieCycling } from "@/utils/goals-calc";

export async function loadDatedGoals(userId: string, dates: string[], base: DailyGoals, cycling: CalorieCycling | null, weight: number) {
  const sorted = [...dates].sort();
  if (!sorted.length) return {};
  const [exceptions, history] = await Promise.all([
    supabase.from("training_day_overrides").select("local_date, day_type").eq("user_id", userId).gte("local_date", sorted[0]).lte("local_date", sorted[sorted.length - 1]),
    supabase.from("goals_history").select("recorded_at, calories, proteins, carbs, fats").eq("user_id", userId).gte("recorded_at", sorted[0]).lte("recorded_at", sorted[sorted.length - 1]),
  ]);
  if (exceptions.error) throw exceptions.error;
  if (history.error) throw history.error;
  const snapshots = new Map((history.data ?? []).map(row => [row.recorded_at, row as GoalSnapshot]));
  const overrides = new Map((exceptions.data ?? []).map(row => [row.local_date, row.day_type as DayType]));
  return Object.fromEntries(dates.map(date => [date, datedGoals(date, base, cycling, weight, overrides.get(date) ?? null, snapshots.get(date))]));
}