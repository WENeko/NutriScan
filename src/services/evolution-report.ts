import { supabase } from "@/integrations/supabase/client";
import { eachDayOfInterval, endOfDay, format, startOfDay, subDays } from "date-fns";
import { buildReportDays, type ReportBody, type ReportMeal } from "@/utils/evolution-report";
import { readSessionsInRange } from "./training-days";
import type { DayType } from "@/utils/day-cycling";
import type { CalorieCycling } from "@/utils/goals-calc";

export async function loadEvolutionReport(userId: string, period: "7d" | "28d" | "all", now = new Date()) {
  let start = startOfDay(subDays(now, period === "7d" ? 6 : 27));
  if (period === "all") {
    const first = await supabase.from("meals").select("timestamp").eq("user_id", userId).order("timestamp").limit(1);
    if (first.error) throw first.error;
    if (first.data?.[0]) start = startOfDay(new Date(first.data[0].timestamp));
  }
  const end = endOfDay(now), from = format(start, "yyyy-MM-dd"), to = format(now, "yyyy-MM-dd");
  const pageSize = 500;
  const meals: ReportMeal[] = [], body: ReportBody[] = [];
  const goals: { recorded_at: string; calories: number }[] = [];
  const overrides: Record<string, DayType> = {};
  const profileResult = await supabase.from("profiles").select("calorie_cycling, sport_preset, sport_allowed_sources").eq("user_id", userId).single();
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data;
  await Promise.all([
    (async () => { for (let offset = 0; ; offset += pageSize) {
      const r = await supabase.from("meals").select("id, timestamp, total_calories, total_proteins, total_carbs, total_fats, peri_workout")
        .eq("user_id", userId).gte("timestamp", start.toISOString()).lte("timestamp", end.toISOString()).order("timestamp").order("id").range(offset, offset + pageSize - 1);
      if (r.error) throw r.error; meals.push(...(r.data ?? [])); if ((r.data?.length ?? 0) < pageSize) break;
    } })(),
    (async () => { for (let offset = 0; ; offset += pageSize) {
      const r = await supabase.from("body_composition").select("recorded_at, weight_kg, body_fat_percent, muscle_mass_kg")
        .eq("user_id", userId).gte("recorded_at", from).lte("recorded_at", to).order("recorded_at").order("created_at").order("id").range(offset, offset + pageSize - 1);
      if (r.error) throw r.error;
      for (const b of r.data ?? []) { const previous = body.find(row => row.recorded_at === b.recorded_at);
        if (previous) { for (const key of ["weight_kg", "body_fat_percent", "muscle_mass_kg"] as const) if (b[key] !== null) previous[key] = b[key]; }
        else body.push(b);
      }
      if ((r.data?.length ?? 0) < pageSize) break;
    } })(),
    (async () => { for (let offset = 0; ; offset += pageSize) {
      const r = await supabase.from("goals_history").select("recorded_at, calories").eq("user_id", userId).gte("recorded_at", from).lte("recorded_at", to).order("recorded_at").range(offset, offset + pageSize - 1);
      if (r.error) throw r.error; goals.push(...(r.data ?? [])); if ((r.data?.length ?? 0) < pageSize) break;
    } })(),
    (async () => { for (let offset = 0; ; offset += pageSize) {
      const r = await supabase.from("training_day_overrides").select("local_date, day_type").eq("user_id", userId).gte("local_date", from).lte("local_date", to).order("local_date").range(offset, offset + pageSize - 1);
      if (r.error) throw r.error;
      for (const row of r.data ?? []) if (row.day_type === "training" || row.day_type === "rest") overrides[row.local_date] = row.day_type;
      if ((r.data?.length ?? 0) < pageSize) break;
    } })(),
  ]);
  const items: Record<string, Record<string, unknown>[]> = {};
  for (let i = 0; i < meals.length; i += 50) {
    for (let offset = 0; ; offset += pageSize) {
      const r = await supabase.from("meal_items").select("meal_id, nutrients_std").in("meal_id", meals.slice(i, i + 50).map(m => m.id)).order("id").range(offset, offset + pageSize - 1);
      if (r.error) throw r.error;
      for (const row of r.data ?? []) (items[row.meal_id] ??= []).push(row);
      if ((r.data?.length ?? 0) < pageSize) break;
    }
  }
  const allowed = Array.isArray(profile.sport_allowed_sources) ? profile.sport_allowed_sources.filter((s): s is string => typeof s === "string") : [];
  const nativeReader = (window as unknown as { Capacitor?: { Plugins?: { SportSamples?: { readExerciseSessions?: unknown } } } }).Capacitor?.Plugins?.SportSamples?.readExerciseSessions;
  const sessions = allowed.length && nativeReader ? await readSessionsInRange(start, end) : [];
  // Empty native reads may mean denied permissions; don't assert a measured zero.
  const sessionsAvailable = sessions.length > 0;
  return buildReportDays({ dates: eachDayOfInterval({ start, end }).map(d => format(d, "yyyy-MM-dd")), today: to,
    meals, items, body, goals, overrides, cycling: profile.calorie_cycling as unknown as CalorieCycling | null,
    preset: profile.sport_preset, sessions, allowed, sessionsAvailable });
}