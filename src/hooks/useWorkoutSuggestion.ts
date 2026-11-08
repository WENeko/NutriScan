import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { detectWorkoutContext, normalizeSportPreset, normalizeWorkoutWindows, type WorkoutContext } from "@/utils/metabolic-quality";
import { readSessionsInRange } from "@/services/training-days";

export function useWorkoutSuggestion(userId: string, timestamp: string) {
  const [suggestion, setSuggestion] = useState<WorkoutContext>("none");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("nutriscan:quality-profile", refresh);
    return () => window.removeEventListener("nutriscan:quality-profile", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    const time = new Date(timestamp).getTime();
    if (!Number.isFinite(time)) { setSuggestion("none"); return; }
    setSuggestion("none");
    void (async () => {
      const { data, error } = await supabase.from("profiles").select("sport_preset,workout_windows,sport_allowed_sources").eq("user_id", userId).single();
      if (error || !data || !active) return;
      const windows = normalizeWorkoutWindows(data.workout_windows, normalizeSportPreset(data.sport_preset));
      const allowed = data.sport_allowed_sources ?? [];
      if (!allowed.length) return;
      // Read exercise records, never daily active-energy samples. Include long sessions crossing midnight.
      const sessions = await readSessionsInRange(new Date(time - (24 * 60 + windows.postMin) * 60_000), new Date(time + windows.preMin * 60_000));
      if (active) setSuggestion(detectWorkoutContext(timestamp, sessions.filter(session => allowed.includes(session.source_package)), windows));
    })().catch(() => { if (active) setSuggestion("none"); });
    return () => { active = false; };
  }, [userId, timestamp, revision]);
  return suggestion;
}