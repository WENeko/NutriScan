/**
 * Cyclage calorique hebdomadaire.
 * - 7 sliders (Lun→Dim, −30 % → +30 %), presets en 1 tap.
 * - Un jour déplacé par l'utilisateur se verrouille : seuls les jours libres
 *   absorbent la différence (rebalanceWithLocks) pour garder la moyenne hebdo.
 * - Jours d'entraînement choisis via des puces ; détection auto (Santé Connect
 *   + calories actives) seulement si aucun jour n'est choisi.
 */
import React, { useMemo, useState } from "react";
import { readTrainingDays } from "@/services/training-days";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { CalendarRange, Dumbbell, Lock, LockOpen, RotateCcw, Scale } from "lucide-react";
import {
  rebalanceWithLocks,
  DEFAULT_CYCLING,
  type CalorieCycling,
} from "@/utils/goals-calc";

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const NO_LOCKS = [false, false, false, false, false, false, false];

interface Props {
  userId: string;
  allowedSources: string[];
  baseCalories: number;
  weighinDay?: number | null;
  value: CalorieCycling;
  onChange: (next: CalorieCycling) => void;
}

/** Préréglage Training/Repos : jours d'entraînement +15 %, repos compensent. */
export function buildTrainingMultipliers(trainingDays: number[]): number[] {
  const n = trainingDays.length;
  if (n === 0 || n === 7) return [1, 1, 1, 1, 1, 1, 1];
  const up = 1.15;
  const down = (7 - up * n) / (7 - n);
  return Array.from({ length: 7 }, (_, i) =>
    Math.round((trainingDays.includes(i) ? up : Math.max(0.7, down)) * 1000) / 1000,
  );
}

const CyclingEditor: React.FC<Props> = ({ allowedSources, baseCalories, weighinDay, value, onChange }) => {
  const [detecting, setDetecting] = useState(false);
  const locked = value.locked?.length === 7 ? value.locked : NO_LOCKS;
  const trainingDays = value.trainingDays ?? [];

  const weeklyAvg = useMemo(() => {
    const m = value.multipliers;
    if (m.length !== 7) return baseCalories;
    return Math.round((m.reduce((s, v) => s + v, 0) / 7) * baseCalories);
  }, [value.multipliers, baseCalories]);

  const detectSportDays = async () => {
    setDetecting(true);
    try {
      const days = await readTrainingDays(allowedSources);
      if (!days.length) {
        toast({ title: "Aucun jour habituel détecté", description: "Pas de séances répétées sur les quatre dernières semaines. Tes choix actuels sont conservés." });
        return;
      }
      onChange({ ...value, trainingDays: days, locked: [...NO_LOCKS], multipliers: buildTrainingMultipliers(days) });
      toast({ title: "Jours détectés", description: days.map((d) => DAY_LABELS[d]).join(", ") });
    } catch (error) {
      toast({ title: "Détection indisponible", description: error instanceof Error ? error.message : "Lecture des séances impossible.", variant: "destructive" });
    } finally {
      setDetecting(false);
    }
  };

  const handleToggle = (enabled: boolean) => onChange({ ...value, enabled });

  const setMultiplier = (idx: number, mult: number, commit: boolean) => {
    const next = [...value.multipliers];
    next[idx] = mult;
    const nextLocked = [...locked];
    nextLocked[idx] = true;
    onChange({
      ...value,
      locked: nextLocked,
      multipliers: commit ? rebalanceWithLocks(next, nextLocked) : next,
    });
  };

  const toggleLock = (idx: number) => {
    const nextLocked = [...locked];
    nextLocked[idx] = !nextLocked[idx];
    onChange({ ...value, locked: nextLocked, multipliers: rebalanceWithLocks(value.multipliers, nextLocked) });
  };

  const toggleTrainingDay = (idx: number) => {
    const next = trainingDays.includes(idx) ? trainingDays.filter((d) => d !== idx) : [...trainingDays, idx].sort();
    onChange({ ...value, trainingDays: next, locked: [...NO_LOCKS], multipliers: buildTrainingMultipliers(next) });
  };

  const applyPreset = async (kind: "training" | "5/2" | "reset") => {
    if (kind === "reset") {
      onChange({ ...value, multipliers: [...DEFAULT_CYCLING.multipliers], locked: [...NO_LOCKS] });
      return;
    }
    if (kind === "5/2") {
      onChange({ ...value, locked: [...NO_LOCKS], multipliers: rebalanceWithLocks([1.05, 1.05, 1.05, 1.05, 1.05, 0.875, 0.875], NO_LOCKS) });
      return;
    }
    if (!trainingDays.length) {
      await detectSportDays();
      return;
    }
    onChange({ ...value, locked: [...NO_LOCKS], multipliers: buildTrainingMultipliers(trainingDays) });
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
            Répartis ton budget selon les jours. La moyenne hebdomadaire reste identique à ton objectif.
          </p>
        </div>
        <Switch checked={value.enabled} onCheckedChange={handleToggle} disabled={detecting} />
      </div>

      {value.enabled && (
        <div className="mt-4 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Jours d'entraînement</Label>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((label, idx) => {
                const on = trainingDays.includes(idx);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleTrainingDay(idx)}
                    aria-pressed={on}
                    className={`py-2 rounded-lg text-[11px] font-semibold transition-all ${on ? "nutri-gradient text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {on ? "🏋️" : "🛋️"}
                    <div>{label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={detectSportDays} disabled={detecting}>
              <Dumbbell className="w-3.5 h-3.5 mr-1" /> {detecting ? "Détection…" : "Détecter mes jours"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => applyPreset("training")} disabled={detecting}>
              <CalendarRange className="w-3.5 h-3.5 mr-1" /> Training / Repos
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => applyPreset("5/2")}>
              5/2 léger
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-xs" onClick={() => applyPreset("reset")}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Réinitialiser
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Un jour que tu règles se verrouille 🔒 ; seuls les jours libres s'ajustent.</p>

          <div className="space-y-3">
            {DAY_LABELS.map((label, idx) => {
              const mult = value.multipliers[idx] ?? 1;
              const pct = Math.round((mult - 1) * 100);
              const kcal = Math.round(baseCalories * mult);
              const isWeighin = weighinDay != null && weighinDay === idx;
              const isLocked = locked[idx];
              return (
                <div key={label} className={`rounded-xl p-3 ${isWeighin ? "bg-primary/10 ring-1 ring-primary/30" : "bg-accent"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      {label}
                      {trainingDays.includes(idx) && <Dumbbell className="w-3 h-3 text-primary" />}
                      {isWeighin && <Scale className="w-3 h-3 text-primary" />}
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums">
                        <span className={pct > 0 ? "text-primary font-semibold" : pct < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                          {pct > 0 ? `+${pct}` : pct} %
                        </span>
                        <span className="text-muted-foreground"> · {kcal} kcal</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleLock(idx)}
                        aria-label={isLocked ? `Déverrouiller ${label}` : `Verrouiller ${label}`}
                        className="p-1 rounded-md hover:bg-muted"
                      >
                        {isLocked ? <Lock className="w-3.5 h-3.5 text-primary" /> : <LockOpen className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                    </div>
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
            <span className={`text-sm font-semibold ${Math.abs(weeklyAvg - baseCalories) <= 5 ? "text-primary" : "text-destructive"}`}>
              {weeklyAvg.toLocaleString("fr-FR")} kcal {Math.abs(weeklyAvg - baseCalories) <= 5 ? "✓" : "— déverrouille un jour"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
};

export default CyclingEditor;
