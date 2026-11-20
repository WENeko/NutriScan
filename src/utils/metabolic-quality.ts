/** Application-specific IQM heuristic, not a clinically validated health score.
 * Missing measurements stay unknown; no nutrition values are imputed.
 */
export type UserPreset = "hypertrophy" | "cut" | "endurance" | "health";
export type WorkoutContext = "none" | "pre_workout" | "intra_workout" | "post_workout";
export type CarbohydrateBasis = "available" | "includes_fiber" | "unknown";

export interface QualityInput {
  calories?: number | null;
  proteins?: number | null;
  carbs?: number | null;
  fats?: number | null;
  nutrients_std?: Record<string, number | null | undefined>;
  /** Fraction of ingredients with a measurement; partial sums are observed, not totals. */
  nutrientCoverage?: Record<string, number>;
  /** EU available carbohydrate excludes fibre; US total carbohydrate includes it. */
  carbohydrateBasis: CarbohydrateBasis;
  peri_workout?: WorkoutContext;
}

export interface QualityResult {
  score: number | null;
  grade: "A" | "B" | "C" | "D" | null;
  scores: { carbs: number | null; fats: number | null; proteins: number | null };
  /** Pillar weights adjusted for actual ingredient measurement coverage. */
  coverage: number;
  missing: string[];
  fractions: {
    nonSugarCarbs: number | null;
    unsaturatedRemainder: number | null;
    sugarRatio: number | null;
    saturatedRatio: number | null;
  };
}

// Working targets within the approved 25–35% range, not changes to calorie goals.
export const PROTEIN_ENERGY_TARGET: Record<UserPreset, number> = {
  hypertrophy: 0.30, cut: 0.35, endurance: 0.25, health: 0.30,
};
const WEIGHTS = { carbs: 0.40, fats: 0.35, proteins: 0.25 };
const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const measured = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const grade = (score: number | null): QualityResult["grade"] =>
  score === null ? null : score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";

export function calculateMealQuality(input: QualityInput, preset: UserPreset = "hypertrophy"): QualityResult {
  const { calories: kcal, proteins: p, carbs: c, fats: l } = input;
  const micro = input.nutrients_std ?? {};
  const sugar = micro.sugar, fiber = micro.fiber, sat = micro.saturated_fat, omega = micro.omega3_mg;
  const peri = input.peri_workout !== undefined && input.peri_workout !== "none";
  const missing: string[] = [];
  const coverageOf = (key: string) => measured(micro[key]) ? clamp(input.nutrientCoverage?.[key] ?? 1, 0, 1) : 0;
  for (const [key, value] of Object.entries({ calories: kcal, proteins: p, carbs: c, fats: l, sugar, fiber, saturated_fat: sat, omega3_mg: omega })) {
    if (!measured(value) || (QUALITY_KEYS.includes(key as typeof QUALITY_KEYS[number]) && coverageOf(key) < 1)) missing.push(key);
  }
  const validEnergy = measured(kcal) && kcal > 0;
  let carbs: number | null = null, fats: number | null = null, proteins: number | null = null;
  if (validEnergy && measured(c) && measured(sugar) && measured(fiber)) {
    carbs = peri
      ? clamp(100 - (fiber > 15 ? 15 : 0), 60)
      : clamp(100 - Math.min(70, Math.max(0, sugar / Math.max(1, c) - 0.15) * 120)
        + Math.min(20, fiber * 1000 / Math.max(100, kcal) * 1.5));
  }
  if (validEnergy && measured(l)) {
    if (peri) {
      fats = clamp(100 - Math.max(0, l * 9 / kcal - 0.20) * 200, 20);
    } else if (measured(sat) && measured(omega)) {
      fats = clamp(80 - Math.min(50, Math.max(0, sat / Math.max(1, l) - 0.30) * 100)
        + Math.min(20, omega / 1000 * 20));
    }
  }
  if (validEnergy && measured(p)) proteins = clamp(p * 4 / kcal / PROTEIN_ENERGY_TARGET[preset] * 100);
  const scores = { carbs, fats, proteins };
  const support = {
    carbs: Math.min(coverageOf("sugar"), coverageOf("fiber")),
    fats: peri ? 1 : Math.min(coverageOf("saturated_fat"), coverageOf("omega3_mg")),
    proteins: 1,
  };
  let coverage = 0, weighted = 0, calculable = 0;
  for (const key of ["carbs", "fats", "proteins"] as const) {
    const value = scores[key];
    if (value !== null) { coverage += WEIGHTS[key] * support[key]; calculable += WEIGHTS[key]; weighted += value * WEIGHTS[key]; }
  }
  const score = calculable > 0 ? Math.round(weighted / calculable) : null;
  const nonSugarCarbs = measured(c) && measured(sugar) && input.carbohydrateBasis !== "unknown"
    && coverageOf("sugar") === 1 && (input.carbohydrateBasis !== "includes_fiber" || coverageOf("fiber") === 1)
    && (input.carbohydrateBasis === "available" || measured(fiber))
    ? Math.max(0, c - sugar - (input.carbohydrateBasis === "includes_fiber" && measured(fiber) ? fiber : 0)) : null;
  return {
    score, grade: grade(score), scores, coverage, missing,
    fractions: {
      // This remainder is not a measured starch amount or a glycaemic index.
      nonSugarCarbs,
      // May also contain trans/other fats: do not label as measured unsaturated fat.
      unsaturatedRemainder: measured(l) && measured(sat) && coverageOf("saturated_fat") === 1 ? Math.max(0, l - sat) : null,
      sugarRatio: measured(c) && measured(sugar) && coverageOf("sugar") === 1 ? sugar / Math.max(1, c) : null,
      saturatedRatio: measured(l) && measured(sat) && coverageOf("saturated_fat") === 1 ? sat / Math.max(1, l) : null,
    },
  };
}

/** Energy-weighted contextual meal scores: one workout meal cannot exempt a whole day. */
export function calculateDailyQuality(meals: QualityInput[], preset: UserPreset = "hypertrophy") {
  let energy = 0, scoredEnergy = 0, weighted = 0, supportedEnergy = 0;
  for (const meal of meals) {
    if (!measured(meal.calories) || meal.calories === 0) continue;
    energy += meal.calories;
    const result = calculateMealQuality(meal, preset);
    supportedEnergy += meal.calories * result.coverage;
    if (result.score !== null) { scoredEnergy += meal.calories; weighted += result.score * meal.calories; }
  }
  const score = scoredEnergy > 0 ? Math.round(weighted / scoredEnergy) : null;
  return { score, grade: grade(score), coverage: energy > 0 ? supportedEnergy / energy : 0 };
}

export interface WorkoutInterval { start_time: string; end_time: string; calories_kcal?: number | null }
export interface WorkoutWindows { preMin: number; postMin: number }
export const WORKOUT_WINDOW_DEFAULTS: Record<UserPreset, WorkoutWindows> = {
  endurance: { preMin: 90, postMin: 45 }, hypertrophy: { preMin: 90, postMin: 120 },
  cut: { preMin: 60, postMin: 60 }, health: { preMin: 90, postMin: 90 },
};
export function normalizeWorkoutWindows(value: unknown, preset: UserPreset = "hypertrophy"): WorkoutWindows {
  const raw = value && typeof value === "object" ? value as Partial<WorkoutWindows> : {};
  const defaults = WORKOUT_WINDOW_DEFAULTS[preset];
  const minutes = (v: unknown, fallback: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(15, Math.min(max, Math.round(v / 15) * 15)) : fallback;
  return { preMin: minutes(raw.preMin, defaults.preMin, 180), postMin: minutes(raw.postMin, defaults.postMin, 240) };
}
export const QUALITY_KEYS = ["sugar", "fiber", "saturated_fat", "omega3_mg"] as const;

/** Sum only measured values, retaining per-nutrient ingredient coverage. */
export function qualityNutrientMeasurements(items: Record<string, unknown>[]) {
  const totals: Record<string, number> = {};
  const nutrientCoverage: Record<string, number> = {};
  for (const key of QUALITY_KEYS) {
    let sum = 0;
    let count = 0;
    for (const item of items) {
      const std = item.nutrients_std as Record<string, unknown> | undefined;
      const raw = std && std[key] !== undefined ? std[key] : item[key];
      if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        sum += raw;
        count += 1;
      }
    }
    nutrientCoverage[key] = items.length ? count / items.length : 0;
    if (count > 0) {
      totals[key] = Math.round(sum * 10) / 10;
    }
  }
  return { nutrients_std: totals, nutrientCoverage };
}

export function sumQualityNutrients(items: Record<string, unknown>[]): Record<string, number> {
  return qualityNutrientMeasurements(items).nutrients_std;
}

export function qualityInputFromMeal(meal: { total_calories: number | null; total_proteins: number | null; total_carbs: number | null; total_fats: number | null; peri_workout?: string }, items: Record<string, unknown>[]): QualityInput {
  return {
    calories: meal.total_calories,
    proteins: meal.total_proteins,
    carbs: meal.total_carbs,
    fats: meal.total_fats,
    ...qualityNutrientMeasurements(items),
    carbohydrateBasis: "available",
    peri_workout: normalizeWorkoutContext(meal.peri_workout),
  };
}


export function normalizeWorkoutContext(value: unknown): WorkoutContext {
  return value === "pre_workout" || value === "intra_workout" || value === "post_workout" ? value : "none";
}
export function normalizeSportPreset(value: unknown): UserPreset {
  return value === "cut" || value === "endurance" || value === "health" ? value : "hypertrophy";
}
/** Suggestion only; caller must preserve an explicitly chosen user tag.
 * Absolute instants handle timezone changes and sessions crossing midnight.
 */
export function detectWorkoutContext(timestamp: string | Date, sessions: WorkoutInterval[], windows: WorkoutWindows = WORKOUT_WINDOW_DEFAULTS.hypertrophy): WorkoutContext {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return "none";
  const candidates: { context: WorkoutContext; distance: number }[] = [];
  for (const session of sessions) {
    const start = new Date(session.start_time).getTime(), end = new Date(session.end_time).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const durationMin = (end - start) / 60_000;
    if (durationMin < 20 && (session.calories_kcal ?? 0) < 100) continue;
    if (time >= start && time < end && durationMin >= 45) return "intra_workout";
    if (time >= start - windows.preMin * 60_000 && time < start) candidates.push({ context: "pre_workout", distance: start - time });
    if (time >= end && time <= end + windows.postMin * 60_000) candidates.push({ context: "post_workout", distance: time - end });
  }
  return candidates.sort((a, b) => a.distance - b.distance)[0]?.context ?? "none";
}
/** Daily qualitative targets per sport profile (CDC §3). Values derive from weight and calories; null means not defined for the profile. */
export interface QualityTargets {
  proteinG: [number, number];
  fatMinG: number | null;
  omega3MinMg: number | null;
  sugarMaxG: number | null;
  fiberMinG: number | null;
  saturatedMaxG: number | null;
}
export function qualityTargets(preset: UserPreset, weightKg: number, kcal: number, peri = false): QualityTargets {
  const w = Math.max(0, weightKg), e = Math.max(0, kcal);
  switch (preset) {
    case "hypertrophy":
      return { proteinG: [1.8 * w, 2.2 * w], fatMinG: 1.0 * w, omega3MinMg: 3000,
        sugarMaxG: peri ? null : e * 0.10 / 4, fiberMinG: null, saturatedMaxG: null };
    case "cut":
      return { proteinG: [2.2 * w, 2.5 * w], fatMinG: 0.8 * w, omega3MinMg: null,
        sugarMaxG: 25, fiberMinG: e * 15 / 1000, saturatedMaxG: null };
    case "endurance":
      return { proteinG: [1.6 * w, 1.8 * w], fatMinG: null, omega3MinMg: null,
        sugarMaxG: null, fiberMinG: null, saturatedMaxG: null };
    case "health":
      return { proteinG: [e * 0.30 / 4, e * 0.30 / 4], fatMinG: null, omega3MinMg: null,
        sugarMaxG: null, fiberMinG: null, saturatedMaxG: e * 0.08 / 9 };
  }
}
