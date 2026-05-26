/**
 * Sport calories — filtrage par source + dédoublonnage temporel + lissage 7 jours.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SportSample {
  source_package: string;
  source_name?: string | null;
  start_time: string; // ISO
  end_time: string;   // ISO
  value_kcal: number;
  recorded_date: string; // YYYY-MM-DD local
}

/** Agrège les kcal d'un set de samples (un jour donné) après filtrage par sources
 *  autorisées et dédoublonnage temporel (chevauchements → on garde le max). */
export function aggregateSportCalories(
  samples: SportSample[],
  allowedSources: string[]
): number {
  if (!samples.length || !allowedSources.length) return 0;
  const allow = new Set(allowedSources);
  const filtered = samples
    .filter((s) => allow.has(s.source_package))
    .map((s) => ({
      start: new Date(s.start_time).getTime(),
      end: new Date(s.end_time).getTime(),
      kcal: Number(s.value_kcal) || 0,
    }))
    .sort((a, b) => a.start - b.start);

  // Dédup chevauchement : si chevauche le précédent retenu, on garde le max.
  const kept: typeof filtered = [];
  for (const cur of filtered) {
    const prev = kept[kept.length - 1];
    if (prev && cur.start < prev.end) {
      if (cur.kcal > prev.kcal) {
        prev.kcal = cur.kcal;
        prev.end = Math.max(prev.end, cur.end);
      }
    } else {
      kept.push({ ...cur });
    }
  }
  return kept.reduce((sum, s) => sum + s.kcal, 0);
}

/** Charge les samples des 8 derniers jours et calcule la moyenne quotidienne
 *  sur les 7 jours révolus (hors aujourd'hui). */
export async function computeSmoothedDailySport(
  userId: string,
  allowedSources: string[]
): Promise<number> {
  if (!allowedSources.length) return 0;

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 8);
  const end = new Date(today);
  end.setDate(end.getDate() - 1);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("sport_activity_samples")
    .select("source_package, source_name, start_time, end_time, value_kcal, recorded_date")
    .eq("user_id", userId)
    .gte("recorded_date", startStr)
    .lte("recorded_date", endStr);

  if (!data || !data.length) return 0;

  const byDay = new Map<string, SportSample[]>();
  for (const s of data as any[]) {
    const arr = byDay.get(s.recorded_date) || [];
    arr.push(s as SportSample);
    byDay.set(s.recorded_date, arr);
  }

  let total = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    total += aggregateSportCalories(byDay.get(key) || [], allowedSources);
  }
  return total / 7;
}

/** Liste les packages détectés sur les 30 derniers jours. */
export async function listDetectedSources(
  userId: string
): Promise<{ package: string; name: string | null; samples: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data } = await supabase
    .from("sport_activity_samples")
    .select("source_package, source_name")
    .eq("user_id", userId)
    .gte("recorded_date", since.toISOString().slice(0, 10));

  if (!data) return [];
  const map = new Map<string, { name: string | null; samples: number }>();
  for (const r of data as any[]) {
    const cur = map.get(r.source_package) || { name: r.source_name, samples: 0 };
    cur.samples++;
    if (!cur.name && r.source_name) cur.name = r.source_name;
    map.set(r.source_package, cur);
  }
  return Array.from(map.entries()).map(([pkg, v]) => ({
    package: pkg,
    name: v.name,
    samples: v.samples,
  }));
}
