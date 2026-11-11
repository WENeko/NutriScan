import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay } from "date-fns";
import { normalizeSportPreset, qualityInputFromMeal, type QualityInput } from "@/utils/metabolic-quality";
import { coachQualityContext, rankCoachSuggestions, type CoachBudget, type CoachFood } from "@/utils/coach-quality";

export async function loadCoachQuality(userId: string, remaining: CoachBudget, weight: number, goalCalories: number, now = new Date()) {
  const [profile, library] = await Promise.all([
    supabase.from("profiles").select("sport_preset").eq("user_id", userId).single(),
    supabase.from("custom_foods").select("id, name, serving_size_g, calories_per_100g, proteins_per_100g, carbs_per_100g, fats_per_100g, nutrients_std").eq("user_id", userId).order("id").limit(500),
  ]);
  if (profile.error) throw profile.error;
  if (library.error) throw library.error;
  const preset = normalizeSportPreset(profile.data.sport_preset);
  const meals: Parameters<typeof qualityInputFromMeal>[0][] = [];
  const ids: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await supabase.from("meals").select("id, total_calories, total_proteins, total_carbs, total_fats, peri_workout")
      .eq("user_id", userId).gte("timestamp", startOfDay(now).toISOString()).lte("timestamp", endOfDay(now).toISOString())
      .order("timestamp").order("id").range(offset, offset + 499);
    if (r.error) throw r.error;
    for (const row of r.data ?? []) { meals.push({ ...row, peri_workout: row.peri_workout ?? undefined }); ids.push(row.id); }
    if ((r.data?.length ?? 0) < 500) break;
  }
  const items: Record<string, Record<string, unknown>[]> = {};
  for (let i = 0; i < ids.length; i += 50) {
    for (let offset = 0; ; offset += 500) {
      const r = await supabase.from("meal_items").select("meal_id, nutrients_std").in("meal_id", ids.slice(i, i + 50)).order("id").range(offset, offset + 499);
      if (r.error) throw r.error;
      for (const item of r.data ?? []) (items[item.meal_id] ??= []).push(item);
      if ((r.data?.length ?? 0) < 500) break;
    }
  }
  const inputs = meals.map((meal, i) => qualityInputFromMeal(meal, items[ids[i]] ?? []));
  const foods: CoachFood[] = (library.data ?? []).map(f => ({ id: f.id, name: f.name, grams: f.serving_size_g,
    per100: { calories: f.calories_per_100g, proteins: f.proteins_per_100g, carbs: f.carbs_per_100g, fats: f.fats_per_100g,
      carbohydrateBasis: "unknown", nutrients_std: f.nutrients_std as QualityInput["nutrients_std"] } }));
  const suggestions = rankCoachSuggestions(inputs, foods, remaining, preset);
  return { suggestions, context: coachQualityContext(inputs, preset, weight, goalCalories, suggestions) };
}