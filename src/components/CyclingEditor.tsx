/**
 * Cyclage calorique hebdomadaire.
 * - Un interrupteur, 7 sliders (Lun→Dim, −30 % → +30 %), presets en 1 tap.
 * - La moyenne hebdo reste strictement égale à l'objectif de base grâce à
 *   normalizeMultipliers, appliqué à la fin du glissement (onValueCommit)
 *   pour éviter les sautements visuels pendant le drag.
 * - À l'activation, détecte les jours habituels de sport (sport_activity_samples)
 *   et pré-remplit le preset Training/Repos.
 */
import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { CalendarRange, Dumbbell, RotateCcw, Scale } from "lucide-react";
import {
  normalizeMultipliers,
  DEFAULT_CYCLING,
  type CalorieCycling,
} from "@/utils/goals-calc";

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface Props {
  userId: string;
  /** Objectif calorique de base (moyenne hebdo). */
  baseCalories: number;
  /** Jour de pesée configuré (index ISO 0-6), mis en évidence visuellement. */
  weighinDay?: number | null;
  value: CalorieCycling;
  onChange: (next: CalorieCycling) => void;
}

const CyclingEditor: React.FC<Props> = ({ userId, baseCalories, weighinDay, value, onChange }) => {
  const [detecting, setDetecting] = useState(false);

  const weeklyAvg = useMemo(() => {
    const m = value.multipliers;
    if (m.length !== 7) return baseCalories;
    return Math.round((m.reduce((s, v) => s + v, 0) / 7) * baseCalories);
  }, [value.multipliers, baseCalories]);

  /** Détecte les jours habituels de sport sur les 60 derniers jours. */
  const detectSportDays = async (): Promise<number[]> => {
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const { data } = await supabase
      .from("sport_activity_samples")
      .select("recorded_date")
      .eq("user_id", userId)
      .gte("recorded_date", since.toISOString().slice(0, 10));
    if (!data || !data.length) return [];
    // Compte les occurrences par jour ISO ; un jour est "sportif" s'il apparaît ≥ 3 fois.
    const counts = new Map<number, number>();
    for (const r of data as any[]) {
      const d = new Date(`${r.recorded_date}T12:00:00`);
      const iso = (d.getDay() + 6) % 7;
      counts.set(iso, (counts.get(iso) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n >= 3)
      .map(([iso]) => iso);
  };

  const buildTrainingPreset = (sportDays: number[]): number[] => {
    const m = new Array(7).fill(1);
    sportDays.forEach((d) => (m[d] = 1.15));
    return normalizeMultipliers(m);
  };

  const handleToggle = async (enabled: boolean) => {
    if (!enabled) {
      onChange({ ...value, enabled: false });
      return;
    }
    setDetecting(true);
    try {
      const sportDays = await detectSportDays();
      const multipliers = sportDays.length
        ? buildTrainingPreset(sportDays)
        : [...DEFAULT_CYCLING.multipliers];
      onChange({ enabled: true, multipliers });
    } finally {
      setDetecting(false);
    }
  };

  const setMultiplier = (idx: number, mult: number, commit: boolean) => {
    const next = [...value.multipliers];
    next[idx] = mult;
    onChange({
      ...value,
      multipliers: commit ? normalizeMultipliers(next) : next,
    });
  };

  const applyPreset = (kind: "training" | "5/2" | "reset") => {
    if (kind === "reset") {
      onChange({ ...value, multipliers: [...DEFAULT_CYCLING.multipliers] });
      return;
    }
    if (kind === "5/2") {
      // 5 jours +5 %, 2 jours (Sam/Dim) −12.5 %, normalisé.
      onChange({ ...value, multipliers: normalizeMultipliers([1.05, 1.05, 1.05, 1.05, 1.05, 0.875, 0.875]) });
      return;
    }
    // Training/Repos : jours de sport détectés +15 %.
    void (async () => {
      setDetecting(true);
      try {
        const sportDays = await detectSportDays();
        const days = sportDays.length ? sportDays : [1, 3, 5]; // fallback Mar/Jeu/Sam
        onChange({ ...value, multipliers: buildTrainingPreset(days) });
      } finally {
        setDetecting(false);
      }
    })();
  };

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "65ms" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-primary" />
            <h2 className="font-display font-semibold text-base">Cyclage calorique</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Répartis ton budget différemment selon les jours (ex. jours d'entraînement plus hauts).
            La moyenne hebdomadaire reste identique à ton objectif.
          </p>
        </div>
        <Switch checked={value.enabled} onCheckedChange={handleToggle} disabled={detecting} />
      </div>

      {value.enabled && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => applyPreset("training")} disabled={detecting}>
              <Dumbbell className="w-3.5 h-3.5 mr-1" /> Training / Repos
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => applyPreset("5/2")}>
              5/2 léger
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-xs" onClick={() => applyPreset("reset")}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Réinitialiser
            </Button>
          </div>

          <div className="space-y-3">
            {DAY_LABELS.map((label, idx) => {
              const mult = value.multipliers[idx] ?? 1;
              const pct = Math.round((mult - 1) * 100);
              const kcal = Math.round(baseCalories * mult);
              const isWeighin = weighinDay != null && weighinDay === idx;
              return (
                <div key={label} className={`rounded-xl p-3 ${isWeighin ? "bg-primary/10 ring-1 ring-primary/30" : "bg-accent"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      {label}
                      {isWeighin && <Scale className="w-3 h-3 text-primary" />}
                    </Label>
                    <span className="text-xs tabular-nums">
                      <span className={pct > 0 ? "text-primary font-semibold" : pct < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                        {pct > 0 ? `+${pct}` : pct} %
                      </span>
                      <span className="text-muted-foreground"> · {kcal} kcal</span>
                    </span>
                  </div>
                  <Slider
                    min={-30}
                    max={30}
                    step={1}
                    value={[pct]}
                    onValueChange={([v]) => setMultiplier(idx, 1 + v / 100, false)}
                    onValueCommit={([v]) => setMultiplier(idx, 1 + v / 100, true)}
                  />
                </div>
              );
            })}
          </div>

          <div className="bg-accent rounded-xl p-3 text-center">
            <span className="text-xs text-muted-foreground">Moyenne hebdo : </span>
            <span className="text-sm font-semibold text-primary">{weeklyAvg.toLocaleString("fr-FR")} kcal ✓</span>
          </div>
        </div>
      )}
    </section>
  );
};

export default CyclingEditor;
