import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Dumbbell, Sofa, Scale } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { buildMonthGrid, sessionsByDate, ymd, type CalendarDay } from "@/utils/activity-calendar";
import { readSessionsInRange } from "@/services/training-days";
import type { DayType } from "@/utils/day-cycling";
import { Button } from "@/components/ui/button";

interface Props { userId: string; calorieGoal: number; userProfile?: any }

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

const ActivityCalendar: React.FC<Props> = ({ userId, calorieGoal, userProfile }) => {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [overrides, setOverrides] = useState<Record<string, DayType>>({});
  const [sessions, setSessions] = useState<Record<string, number>>({});
  const [calories, setCalories] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const cycling = userProfile?.calorie_cycling ?? null;
  const allowed: string[] = userProfile?.sport_allowed_sources ?? [];

  useEffect(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - ((month.getDay() + 6) % 7));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42);
    const from = ymd(start), to = ymd(end);
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
      // Page through meals rather than depending on the server's row cap.
      const readMeals = async () => {
        const rows: { timestamp: string; total_calories: number }[] = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase.from("meals")
            .select("timestamp, total_calories").eq("user_id", userId)
            .gte("timestamp", start.toISOString()).lt("timestamp", end.toISOString())
            .order("timestamp").order("id").range(offset, offset + pageSize - 1);
          if (error) throw error;
          rows.push(...(data ?? []));
          if (!data || data.length < pageSize) return rows;
        }
      };
      const [ov, meals, body, sess] = await Promise.all([
        supabase.from("training_day_overrides").select("local_date, day_type").eq("user_id", userId).gte("local_date", from).lt("local_date", to),
        readMeals(),
        supabase.from("body_composition").select("recorded_at, weight_kg").eq("user_id", userId).gte("recorded_at", from).lt("recorded_at", to),
        allowed.length ? readSessionsInRange(start, end) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      if (ov.error) throw ov.error;
      if (body.error) throw body.error;
      const o: Record<string, DayType> = {};
      (ov.data || []).forEach((r: any) => { o[r.local_date] = r.day_type; });
      const c: Record<string, number> = {};
      meals.forEach((m) => { const k = ymd(new Date(m.timestamp)); c[k] = (c[k] || 0) + (Number(m.total_calories) || 0); });
      const w: Record<string, number> = {};
      (body.data || []).forEach((b: any) => { if (b.weight_kg) w[b.recorded_at] = Number(b.weight_kg); });
      setOverrides(o); setCalories(c); setWeights(w); setSessions(sessionsByDate(sess, allowed));
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setOverrides({}); setCalories({}); setWeights({}); setSessions({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, month, allowed.join(",")]);

  const grid = useMemo(
    () => buildMonthGrid(month, today, cycling, overrides, sessions, calories, weights),
    [month, cycling, overrides, sessions, calories, weights],
  );
  const selectedDay = selected ? grid.find((day) => day.date === selected.date) : undefined;

  const shift = (n: number) => { setSelected(null); setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };
  const ratioClass = (kcal: number | null) => {
    if (kcal == null || !calorieGoal) return "";
    const r = kcal / calorieGoal;
    return r > 1.1 ? "bg-destructive" : r < 0.8 ? "bg-muted-foreground/50" : "bg-primary";
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Mois précédent"><ChevronLeft className="w-4 h-4" /></Button>
          <h3 className="font-semibold capitalize">{format(month, "MMMM yyyy", { locale: fr })}</h3>
          <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Mois suivant"><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
          {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => (
            <Button variant="ghost" key={d.date} onClick={() => setSelected(d)}
              aria-label={format(parseISO(d.date), "EEEE d MMMM yyyy", { locale: fr })}
              aria-pressed={selected?.date === d.date} disabled={loading || loadError}
              className={`relative aspect-square h-auto min-w-0 p-0 gap-0 rounded-lg flex flex-col items-center justify-center text-xs transition-colors
                ${d.inMonth ? "" : "opacity-30"}
                ${d.planned === "training" ? "bg-primary/10" : "bg-muted/40"}
                ${d.override ? "border border-dashed border-primary" : ""}
                ${d.isToday ? "ring-2 ring-primary" : ""}
                ${selected?.date === d.date ? "bg-primary/25" : ""}`}>
              <span className="font-medium">{Number(d.date.slice(8))}</span>
              <div className="flex items-center gap-0.5 h-3">
                {d.sessions > 0 && <Dumbbell className="w-2.5 h-2.5 text-primary" />}
                {d.weight != null && <Scale className="w-2.5 h-2.5 text-muted-foreground" />}
              </div>
              {d.calories != null && <span className={`absolute bottom-0.5 w-3 h-0.5 rounded-full ${ratioClass(d.calories)}`} />}
            </Button>
          ))}
        </div>
        {loading && <p role="status" className="text-xs text-muted-foreground mt-2">Chargement…</p>}
        {loadError && <p role="alert" className="text-xs text-destructive mt-2">Le calendrier n’a pas pu être chargé.</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/10" /> Prévu entraînement</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-dashed border-primary" /> Exception</span>
          <span className="flex items-center gap-1"><Dumbbell className="w-3 h-3 text-primary" /> Séance réalisée</span>
          <span className="flex items-center gap-1"><Scale className="w-3 h-3" /> Pesée</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary" /> Calories dans l'objectif</span>
        </div>
        {allowed.length === 0 && (
          <p className="text-[10px] text-muted-foreground mt-2">Sélectionne tes sources sportives dans Santé connectée pour afficher les séances réalisées.</p>
        )}
      </div>

      {selectedDay && !loading && !loadError && (
        <div className="bg-card rounded-2xl p-4 shadow-card space-y-2">
          <h4 className="font-semibold capitalize">{format(parseISO(selectedDay.date), "EEEE d MMMM", { locale: fr })}</h4>
          <div className="flex items-center gap-2 text-sm">
            {selectedDay.planned === "training" ? <Dumbbell className="w-4 h-4 text-primary" /> : <Sofa className="w-4 h-4 text-muted-foreground" />}
            <span>{selectedDay.planned === "training" ? "Entraînement" : "Repos"}{selectedDay.override ? " (exception)" : " (routine)"}</span>
          </div>
          <p className="text-sm">Séances : <b>{selectedDay.sessions}</b></p>
          <p className="text-sm">Calories : <b>{selectedDay.calories != null ? `${Math.round(selectedDay.calories)} kcal` : "—"}</b>{calorieGoal ? ` / ${Math.round(calorieGoal)} kcal` : ""}</p>
          <p className="text-sm">Poids : <b>{selectedDay.weight != null ? `${selectedDay.weight.toFixed(1)} kg` : "—"}</b></p>
        </div>
      )}
    </div>
  );
};

export default ActivityCalendar;
