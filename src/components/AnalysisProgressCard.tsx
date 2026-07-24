import React, { useEffect, useState } from "react";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import type { RoutingProgressStep } from "@/lib/aiRouting";

const STEPS: { key: RoutingProgressStep; label: string }[] = [
  { key: "preparing", label: "Optimisation et envoi de la photo…" },
  { key: "vision", label: "Identification des aliments…" },
  { key: "nutrition", label: "Calcul des calories et micronutriments…" },
  { key: "finalizing", label: "Création de la fiche repas…" },
];

interface Props {
  preview: string | null;
  currentStep: RoutingProgressStep;
  modelLabel: string;
  isFallback: boolean;
  attempt: number;
}

const AnalysisProgressCard: React.FC<Props> = ({ preview, currentStep, modelLabel, isFallback, attempt }) => {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-card bg-card animate-fade-up">
      {preview && (
        <img
          src={preview}
          alt="Repas en cours d'analyse"
          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm"
        />
      )}
      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm">Analyse du repas</h3>
          <span className="text-[10px] text-muted-foreground tabular-nums">{seconds}s</span>
        </div>

        <ul className="space-y-2">
          {STEPS.map((s, idx) => {
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {done ? (
                    <Check className="w-4 h-4 text-primary" />
                  ) : active ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                <span
                  className={
                    done
                      ? "text-foreground"
                      : active
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          {isFallback ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              Bascule secours #{attempt} : {modelLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Modèle : {modelLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisProgressCard;
