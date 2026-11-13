import { format, parseISO, startOfWeek } from "date-fns";
import { calculateDailyQuality, normalizeSportPreset, qualityInputFromMeal } from "./metabolic-quality";
import { resolveTrainingDays, type DayType } from "./day-cycling";
import type { CalorieCycling } from "./goals-calc";
import type { ExerciseSession } from "@/services/training-days";

export interface ReportMeal {
  id: string; timestamp: string; total_calories: number | null; total_proteins: number | null;
  total_carbs: number | null; total_fats: number | null; peri_workout?: string | null;
}
export interface ReportBody { recorded_at: string; weight_kg: number | null; body_fat_percent: number | null; muscle_mass_kg: number | null }
export interface ReportDay {
  date: string; type: DayType; exception: boolean; logged: boolean; completed: boolean;
  calories: number | null; proteins: number | null; carbs: number | null; fats: number | null;
  goal: number | null; iqm: number | null; coverage: number; fiber: number | null; omega3: number | null;
  weight: number | null; bodyFat: number | null; muscle: number | null;
  sessions: number | null; minutes: number | null;
  baselineBody?: { weight: number | null; bodyFat: number | null; muscle: number | null };
}
const numeric = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sumKnown = (values: (number | null | undefined)[]) => values.length && values.every(numeric) ? values.reduce<number>((s, n) => s + (n ?? 0), 0) : null;

export function buildReportDays(input: {
  dates: string[]; today: string; meals: ReportMeal[]; items: Record<string, Record<string, unknown>[]>;
  body: ReportBody[]; goals: { recorded_at: string; calories: number }[]; overrides: Record<string, DayType>;
  cycling: CalorieCycling | null; preset: unknown; sessions: ExerciseSession[]; allowed: string[]; sessionsAvailable: boolean;
}): ReportDay[] {
  const training = resolveTrainingDays(input.cycling);
  const preset = normalizeSportPreset(input.preset);
  return input.dates.map(date => {
    const meals = input.meals.filter(m => format(new Date(m.timestamp), "yyyy-MM-dd") === date);
    // Report measurements require all ingredients to cover each nutrient, not a partial sum.
    const quality = meals.map(m => {
      const items = input.items[m.id] ?? [];
      return qualityInputFromMeal({ ...m, peri_workout: m.peri_workout ?? undefined }, items);
    });
    const score = calculateDailyQuality(quality, preset);
    const body = input.body.find(b => b.recorded_at === date);
    const sessions = input.sessions.filter(s => input.allowed.includes(s.source_package)
      && format(new Date(s.start_time), "yyyy-MM-dd") === date
      && new Date(s.end_time) > new Date(s.start_time));
    const override = input.overrides[date];
    return {
      date, type: override ?? (input.cycling?.enabled && training.includes((parseISO(date).getDay() + 6) % 7) ? "training" : "rest"),
      exception: !!override, logged: meals.length > 0, completed: date < input.today,
      calories: sumKnown(meals.map(m => m.total_calories)), proteins: sumKnown(meals.map(m => m.total_proteins)),
      carbs: sumKnown(meals.map(m => m.total_carbs)), fats: sumKnown(meals.map(m => m.total_fats)),
      // goals_history already contains cycled daily targets: never cycle a snapshot twice or forward-fill it.
      goal: input.goals.find(g => g.recorded_at === date)?.calories ?? null,
      iqm: score.score, coverage: score.coverage,
      fiber: sumKnown(quality.map(q => q.nutrients_std?.fiber)), omega3: sumKnown(quality.map(q => q.nutrients_std?.omega3_mg)),
      weight: body?.weight_kg ?? null, bodyFat: body?.body_fat_percent ?? null, muscle: body?.muscle_mass_kg ?? null,
      sessions: input.sessionsAvailable ? sessions.length : null,
      minutes: input.sessionsAvailable ? sessions.reduce((sum, s) => sum + (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000, 0) : null,
    };
  });
}

export function adherence(days: ReportDay[], type: DayType, tolerance = 7.5) {
  const eligible = days.filter(d => d.type === type && d.completed && d.logged && d.calories !== null && d.goal !== null && d.goal > 0);
  const conforming = eligible.filter(d => Math.abs((d.calories ?? 0) - (d.goal ?? 0)) <= (d.goal ?? 0) * tolerance / 100 + 1e-8).length;
  return { count: eligible.length, conforming, percent: eligible.length ? Math.round(conforming / eligible.length * 100) : null };
}
export interface ReportWeek {
  date: string;
  iqm: number | null;
  days: number;
  weight: number | null;
  bodyFat: number | null;
  muscle: number | null;
  weightValue: number | null;
  bodyFatValue: number | null;
  muscleValue: number | null;
  /** Mean signed calorie gap vs recorded goal, in % (surplus > 0); null without goals. */
  calorieGap?: number | null;
}

export function reportWeeks(days: ReportDay[]): ReportWeek[] {
  const groups = new Map<string, ReportDay[]>();
  for (const d of days.filter(d => d.completed)) {
    const key = format(startOfWeek(parseISO(d.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  const sortedWeeks = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  // Accepter les jours avec un score IQM réel (sans exiger 100% de couverture théorique)
  const parsed = sortedWeeks.map(([date, rows]) => {
    const scored = rows.filter(d => d.iqm !== null && (d.calories ?? 0) > 0);
    const energy = scored.reduce((s, d) => s + (d.calories ?? 0), 0);

    const getMeasures = (key: "weight" | "bodyFat" | "muscle") =>
      rows.filter(d => d[key] !== null).sort((a, b) => a.date.localeCompare(b.date));

    return {
      date,
      rows,
      scoredLength: scored.length,
      iqm: energy > 0 && scored.length >= 3
        ? scored.reduce((s, d) => s + (d.iqm ?? 0) * (d.calories ?? 0), 0) / energy
        : null,
      weightMeasures: getMeasures("weight"),
      bodyFatMeasures: getMeasures("bodyFat"),
      muscleMeasures: getMeasures("muscle"),
      calorieGap: (() => {
        const g = rows.filter(d => d.logged && numeric(d.calories) && numeric(d.goal) && (d.goal ?? 0) > 0);
        return g.length >= 3 ? Number((g.reduce((s, d) => s + ((d.calories ?? 0) - (d.goal ?? 0)) / (d.goal ?? 1) * 100, 0) / g.length).toFixed(1)) : null;
      })(),
    };
  });

  // Conserver la dernière pesée connue pour calculer le delta même si une semaine a été sautée
  let lastKnownWeight: number | null = days[0]?.baselineBody?.weight ?? null;
  let lastKnownBodyFat: number | null = days[0]?.baselineBody?.bodyFat ?? null;
  let lastKnownMuscle: number | null = days[0]?.baselineBody?.muscle ?? null;

  return parsed.map((curr) => {
    const calcDelta = (
      measures: ReportDay[],
      lastKnown: number | null,
      key: "weight" | "bodyFat" | "muscle"
    ): { delta: number | null; currentVal: number | null } => {
      if (measures.length >= 2) {
        const first = measures[0]?.[key], last = measures.at(-1)?.[key];
        return {
          delta: first != null && last != null ? Number((last - first).toFixed(2)) : null,
          currentVal: last ?? null,
        };
      }
      if (measures.length === 1) {
        const val = measures[0]?.[key] ?? null;
        const delta = val != null && lastKnown != null ? Number((val - lastKnown).toFixed(2)) : null;
        return { delta, currentVal: val };
      }
      return { delta: null, currentVal: null };
    };

    const wRes = calcDelta(curr.weightMeasures, lastKnownWeight, "weight");
    const bfRes = calcDelta(curr.bodyFatMeasures, lastKnownBodyFat, "bodyFat");
    const mRes = calcDelta(curr.muscleMeasures, lastKnownMuscle, "muscle");

    if (wRes.currentVal != null) lastKnownWeight = wRes.currentVal;
    if (bfRes.currentVal != null) lastKnownBodyFat = bfRes.currentVal;
    if (mRes.currentVal != null) lastKnownMuscle = mRes.currentVal;

    return {
      date: curr.date,
      days: curr.scoredLength,
      iqm: curr.iqm,
      weight: wRes.delta,
      bodyFat: bfRes.delta,
      muscle: mRes.delta,
      weightValue: wRes.currentVal,
      bodyFatValue: bfRes.currentVal,
      muscleValue: mRes.currentVal,
      calorieGap: curr.calorieGap,
    };
  });
}

export function correlation(weeks: ReportWeek[], key: "weight" | "bodyFat" | "muscle", source: "iqm" | "calorieGap" = "iqm") {
  const pairs = weeks.filter(w => numeric(w[source]) && numeric(w[key]));
  if (pairs.length < 4) return { n: pairs.length, r: null };
  const x = pairs.reduce((s, w) => s + (w[source] ?? 0), 0) / pairs.length;
  const y = pairs.reduce((s, w) => s + (w[key] ?? 0), 0) / pairs.length;
  let covariance = 0, vx = 0, vy = 0;
  for (const w of pairs) { const dx = (w[source] ?? 0) - x, dy = (w[key] ?? 0) - y; covariance += dx * dy; vx += dx * dx; vy += dy * dy; }
  return { n: pairs.length, r: vx > 0 && vy > 0 ? covariance / Math.sqrt(vx * vy) : null };
}
export function reportCsv(days: ReportDay[]) {
  const headers = ["Date", "Type prévu", "Exception", "Jour terminé", "Repas saisis", "Calories cible enregistrée", "Calories consommées", "Protéines g", "Glucides g", "Lipides g", "IQM", "Couverture IQM %", "Fibres g", "Oméga-3 mg", "Poids kg", "Masse grasse %", "Masse musculaire kg", "Séances approuvées", "Durée séances min"];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\uFEFF" + [headers, ...days.map(d => [d.date, d.type === "training" ? "Entraînement" : "Repos", d.exception ? "Oui" : "Non", d.completed ? "Oui" : "Non", d.logged ? "Oui" : "Non", d.goal, d.calories, d.proteins, d.carbs, d.fats, d.iqm, Math.round(d.coverage * 100), d.fiber, d.omega3, d.weight, d.bodyFat, d.muscle, d.sessions, d.minutes])].map(row => row.map(cell).join(";")).join("\r\n");
}
