import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSportPreset, normalizeWorkoutWindows, WORKOUT_WINDOW_DEFAULTS, type WorkoutWindows, type UserPreset } from "@/utils/metabolic-quality";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function SportPresetPicker({ userId }: { userId: string }) {
  const [preset, setPreset] = useState<UserPreset>("hypertrophy");
  const [windows, setWindows] = useState<WorkoutWindows>(WORKOUT_WINDOW_DEFAULTS.hypertrophy);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void supabase.from("profiles").select("sport_preset,workout_windows").eq("user_id", userId).single().then(({ data, error }) => {
    if (!active) return;
    if (error) { toast({ title: "Réglages IQM indisponibles", variant: "destructive" }); return; }
    const next = normalizeSportPreset(data?.sport_preset);
    setPreset(next); setWindows(normalizeWorkoutWindows(data?.workout_windows, next)); setLoaded(true);
  }); return () => { active = false; }; }, [userId]);
  const save = async (next: UserPreset, nextWindows: WorkoutWindows) => {
    if (busy || !loaded) return;
    setBusy(true);
    const normalized = normalizeWorkoutWindows(nextWindows, next);
    const { error } = await supabase.from("profiles").update({ sport_preset: next, workout_windows: { ...normalized } }).eq("user_id", userId);
    setBusy(false);
    if (error) { toast({ title: "Profil non enregistré", description: error.message, variant: "destructive" }); return; }
    setPreset(next);
    setWindows(normalized);
    window.dispatchEvent(new Event("nutriscan:quality-profile"));
    toast({ title: "Réglages IQM enregistrés" });
  };
  return <div className="space-y-2 py-3"><Label>Profil de qualité nutritionnelle (IQM)</Label>
    <Select value={preset} onValueChange={value => { const next = normalizeSportPreset(value); void save(next, WORKOUT_WINDOW_DEFAULTS[next]); }} disabled={busy || !loaded}><SelectTrigger aria-label="Profil de qualité nutritionnelle"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="hypertrophy">Hypertrophie / Force</SelectItem><SelectItem value="cut">Sèche</SelectItem><SelectItem value="endurance">Endurance</SelectItem><SelectItem value="health">Santé / Recomposition</SelectItem>
    </SelectContent></Select>
    <div className="space-y-5 pt-4">
      {([{ key: "preMin", label: "Fenêtre pré-effort", max: 180 }, { key: "postMin", label: "Fenêtre post-effort", max: 240 }] as const).map(({ key, label, max }) => <div key={key} className="space-y-2">
        <div className="flex items-center justify-between gap-2"><Label>{label}</Label><span className="text-sm tabular-nums text-muted-foreground">{windows[key]} min</span></div>
        <Slider aria-label={label} min={15} max={max} step={15} value={[windows[key]]} disabled={busy || !loaded}
          onValueChange={values => { const value = values[0]; if (value !== undefined) setWindows(current => ({ ...current, [key]: value })); }}
          onValueCommit={values => { const value = values[0]; if (value !== undefined) void save(preset, { ...windows, [key]: value }); }} />
        <div className="flex justify-between text-xs text-muted-foreground"><span>15 min</span><span>{max} min</span></div>
      </div>)}
      <Button type="button" size="sm" variant="outline" disabled={busy || !loaded} onClick={() => void save(preset, WORKOUT_WINDOW_DEFAULTS[preset])}><RotateCcw />Réinitialiser les fenêtres</Button>
    </div>
  </div>;
}