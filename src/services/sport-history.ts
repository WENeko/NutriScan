import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfDay } from "date-fns";
import { runHealthImport } from "./foregroundHealthSync";
import type { SportSample } from "./sport-calories";

type NativeSample = Omit<SportSample, "recorded_date">;
interface HistoryPlugin {
  historyStatus(): Promise<{ available: boolean; supported: boolean; granted: boolean }>;
  requestHistoryPermission(): Promise<{ granted: boolean }>;
  readHistorySamples(options: { startDate: string; endDate: string; sources: string[] }): Promise<{ samples: NativeSample[] }>;
}

export function approvedHistorySamples(samples: NativeSample[], allowed: string[]): SportSample[] {
  return samples.filter(sample => allowed.includes(sample.source_package) && Number.isFinite(sample.value_kcal)
    && sample.value_kcal >= 0 && new Date(sample.end_time) > new Date(sample.start_time))
    .map(sample => ({ ...sample, recorded_date: format(new Date(sample.start_time), "yyyy-MM-dd") }));
}

/** Session-bound active energy only; no body records or calorie-goal rewrite. */
export async function importSportHistory(userId: string, months: number, progress: (done: number, total: number) => void) {
  const plugin = (window as unknown as { Capacitor?: { Plugins?: { SportSamples?: HistoryPlugin } } }).Capacitor?.Plugins?.SportSamples;
  if (!plugin?.historyStatus || !plugin.readHistorySamples) throw new Error("Installez le nouvel APK pour importer l’historique sportif.");
  const status = await plugin.historyStatus();
  if (!status.available || !status.supported) throw new Error("La lecture de l’historique étendu n’est pas disponible avec cette version de Santé Connect.");
  if (!status.granted && !(await plugin.requestHistoryPermission()).granted) throw new Error("L’autorisation de lecture de l’historique n’a pas été accordée.");
  const { data: profile, error } = await supabase.from("profiles").select("sport_allowed_sources").eq("user_id", userId).single();
  if (error) throw error;
  const allowed = Array.isArray(profile?.sport_allowed_sources) ? profile.sport_allowed_sources as string[] : [];
  if (!allowed.length) throw new Error("Sélectionnez au moins une application sportive approuvée.");
  return runHealthImport(userId, async () => {
    const end = new Date();
    let cursor = startOfDay(subMonths(end, months));
    const total = Math.ceil((end.getTime() - cursor.getTime()) / 86400000);
    let done = 0, count = 0;
    while (cursor < end) {
      const next = new Date(cursor); next.setDate(next.getDate() + 7);
      if (next > end) next.setTime(end.getTime());
      const result = await plugin.readHistorySamples({ startDate: cursor.toISOString(), endDate: next.toISOString(), sources: allowed });
      const rows = approvedHistorySamples(result.samples, allowed).map(sample => ({ ...sample, user_id: userId }));
      for (let offset = 0; offset < rows.length; offset += 200) {
        const { error: saveError } = await supabase.from("sport_activity_samples").upsert(rows.slice(offset, offset + 200), { onConflict: "user_id,source_package,start_time,end_time" });
        if (saveError) throw saveError;
      }
      count += rows.length;
      done = Math.min(total, done + 7); progress(done, total);
      cursor = next;
    }
    window.dispatchEvent(new Event("nutriscan:health-refreshed"));
    return count;
  });
}