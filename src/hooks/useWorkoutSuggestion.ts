import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { detectWorkoutContext, type WorkoutContext } from "@/utils/metabolic-quality";

export function useWorkoutSuggestion(userId: string, timestamp: string) {
  const [suggestion, setSuggestion] = useState<WorkoutContext>("none");
  useEffect(() => {
    let active = true;
    const time = new Date(timestamp).getTime();
    if (!Number.isFinite(time)) { setSuggestion("none"); return; }
    setSuggestion("none");
    void supabase.from("sport_activity_samples").select("start_time,end_time")
      .eq("user_id", userId)
      .gte("end_time", new Date(time - 120 * 60_000).toISOString())
      .lte("start_time", new Date(time + 60 * 60_000).toISOString())
      .then(({ data }) => { if (active) setSuggestion(detectWorkoutContext(timestamp, data ?? [])); });
    return () => { active = false; };
  }, [userId, timestamp]);
  return suggestion;
}