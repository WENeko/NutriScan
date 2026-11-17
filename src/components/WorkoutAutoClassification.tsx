import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readSessionsInRange } from "@/services/training-days";
import { normalizeSportPreset, normalizeWorkoutWindows } from "@/utils/metabolic-quality";
import { classifySavedMeals, WORKOUT_COUNTDOWN_SECONDS } from "@/utils/workout-classification";
import { WORKOUT_LABELS } from "./WorkoutContextPicker";
import { Button } from "./ui/button";
import { toast } from "sonner";

type Candidate = ReturnType<typeof classifySavedMeals>[number];
export default function WorkoutAutoClassification({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<Candidate[]>([]);
  const [seconds, setSeconds] = useState(WORKOUT_COUNTDOWN_SECONDS);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const seen = useRef(new Set<string>());
  const current = queue[0];
  useEffect(() => {
    let active = true;
    let reading = false;
    seen.current.clear();
    const scan = async () => {
      if (reading || document.visibilityState !== "visible") return;
      reading = true;
      try {
        const p = await supabase.from("profiles").select("sport_preset,workout_windows,sport_allowed_sources").eq("user_id", userId).single();
        if (p.error || !p.data?.sport_allowed_sources?.length) return;
        const now = new Date();
        const start = new Date(now); start.setDate(start.getDate() - 30); start.setHours(0, 0, 0, 0);
        const windows = normalizeWorkoutWindows(p.data.workout_windows, normalizeSportPreset(p.data.sport_preset));
        const from = new Date(start); from.setDate(from.getDate() - 1);
        const sessions = (await readSessionsInRange(from, new Date(now.getTime() + windows.preMin * 60000)))
          .filter(s => p.data.sport_allowed_sources?.includes(s.source_package));
        if (!sessions.length || !active) return;
        const meals: Candidate[] = [];
        for (let offset = 0; active; offset += 500) {
          const r = await supabase.from("meals").select("id,timestamp,meal_name,peri_workout,workout_context_locked")
            .eq("user_id", userId).eq("workout_context_locked", false).gte("timestamp", start.toISOString()).lte("timestamp", now.toISOString())
            .order("timestamp").order("id").range(offset, offset + 499);
          if (r.error) throw r.error;
          meals.push(...classifySavedMeals(r.data ?? [], sessions, windows));
          if ((r.data?.length ?? 0) < 500) break;
        }
        if (!active) return;
        const fresh = meals.filter(m => !seen.current.has(m.id));
        fresh.forEach(m => seen.current.add(m.id));
        setQueue(q => [...q, ...fresh]);
      } catch { /* Retry after next import. */ }
      finally { reading = false; }
    };
    const refresh = () => { void scan(); };
    window.addEventListener("nutriscan:health-refreshed", refresh);
    window.addEventListener("nutriscan:quality-profile", refresh);
    void scan();
    return () => { active = false; window.removeEventListener("nutriscan:health-refreshed", refresh); window.removeEventListener("nutriscan:quality-profile", refresh); };
  }, [userId]);

  const finish = useCallback(async (cancel: boolean) => {
    if (!current || pending.current) return;
    pending.current = true; setBusy(true);
    try {
      let query = supabase.from("meals").update(cancel ? { workout_context_locked: true } : { peri_workout: current.context })
        .eq("id", current.id).eq("user_id", userId).eq("workout_context_locked", false).eq("timestamp", current.timestamp);
      query = current.peri_workout === null ? query.is("peri_workout", null) : query.eq("peri_workout", current.peri_workout);
      const r = await query.select("id");
      if (r.error) throw r.error;
      if (r.data?.length) {
        window.dispatchEvent(new Event("nutriscan:quality-profile"));
        if (!cancel) toast.success(`${current.meal_name || "Repas"} · ${WORKOUT_LABELS[current.context]}`);
      }
    } catch { toast.error("Classement non enregistré. Réessayez après la prochaine synchronisation."); seen.current.delete(current.id); }
    finally { setQueue(q => q.slice(1)); pending.current = false; setBusy(false); }
  }, [current, userId]);
  useEffect(() => {
    setSeconds(WORKOUT_COUNTDOWN_SECONDS);
    if (!current) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setSeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [current?.id]);
  useEffect(() => { if (current && seconds === 0) void finish(false); }, [current, seconds, finish]);
  if (!current) return null;
  return <div role="status" className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md rounded-lg border border-border bg-background p-4 shadow-lg">
    <p className="text-sm font-semibold">Séance détectée · {WORKOUT_LABELS[current.context]}</p>
    <p className="my-2 text-sm text-muted-foreground">{current.meal_name || "Repas"} du {new Date(current.timestamp).toLocaleString()} sera classé dans {seconds} s.</p>
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void finish(false)}>Valider maintenant</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void finish(true)}>Annuler</Button></div>
  </div>;
}