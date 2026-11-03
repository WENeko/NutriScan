import { format } from "date-fns";

export interface ExerciseSession {
  source_package: string;
  start_time: string;
  end_time: string;
}

/** Four completed local weeks; today never participates in recurrence. */
export function trainingWindow(now = new Date()) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 28);
  return { start, end };
}

/** Two distinct session dates per weekday in four weeks, approved sources only. */
export function detectHabitualTrainingDays(
  sessions: ExerciseSession[], allowedSources: string[], now = new Date(),
): number[] {
  const { start, end } = trainingWindow(now);
  const allowed = new Set(allowedSources);
  const dates = Array.from({ length: 7 }, () => new Set<string>());
  for (const session of sessions) {
    if (!allowed.has(session.source_package)) continue;
    const from = new Date(session.start_time);
    const to = new Date(session.end_time);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) continue;
    if (from < start || from >= end) continue;
    dates[(from.getDay() + 6) % 7].add(format(from, "yyyy-MM-dd"));
  }
  return dates.flatMap((days, index) => days.size >= 2 ? [index] : []);
}

/** Read session records independently from energy imports and their smoothing. */
export async function readTrainingDays(allowedSources: string[], now = new Date()): Promise<number[]> {
  if (!allowedSources.length) throw new Error("Aucune source sportive approuvée. Sélectionne tes sources dans Santé & Activité connectée.");
  const plugins = (window as unknown as { Capacitor?: { Plugins?: {
    SportSamples?: { readExerciseSessions: (options: { startDate: string; endDate: string }) => Promise<{
      available: boolean; granted: boolean; samples: ExerciseSession[];
    }> };
  } } }).Capacitor?.Plugins;
  if (!plugins?.SportSamples?.readExerciseSessions) {
    throw new Error("La détection des séances nécessite la nouvelle version Android. Tes jours restent sélectionnables manuellement.");
  }
  const { start, end } = trainingWindow(now);
  const result = await plugins.SportSamples.readExerciseSessions({ startDate: start.toISOString(), endDate: end.toISOString() });
  if (!result.available) throw new Error("Santé Connect est indisponible sur cet appareil.");
  if (!result.granted) throw new Error("Autorise la lecture des séances d’exercice dans Santé Connect, puis relance la détection.");
  return detectHabitualTrainingDays(result.samples, allowedSources, now);
}