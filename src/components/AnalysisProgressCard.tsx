import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import type { RoutingProgressStep } from "@/lib/aiRouting";

type AnalysisMode = "photo" | "text";

const STEP_LABELS: Record<AnalysisMode, Record<RoutingProgressStep, string>> = {
  photo: {
    preparing: "Optimisation et envoi de la photo…",
    vision: "Identification des aliments…",
    nutrition: "Calcul des calories et micronutriments…",
    finalizing: "Création de la fiche repas…",
  },
  text: {
    preparing: "Préparation de votre description…",
    vision: "Analyse des aliments décrits…",
    nutrition: "Calcul des calories et micronutriments…",
    finalizing: "Création de la fiche repas…",
  },
};

const STEP_ORDER: RoutingProgressStep[] = ["preparing", "vision", "nutrition", "finalizing"];

interface Props {
  preview: string | null;
  currentStep: RoutingProgressStep;
  modelLabel: string;
  isFallback: boolean;
  attempt: number;
  mode?: AnalysisMode;
}

const AnalysisProgressCard: React.FC<Props> = ({ preview, currentStep, modelLabel, isFallback, attempt, mode = "photo" }) => {
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const steps = STEP_ORDER.map((key) => ({ key, label: STEP_LABELS[mode][key] }));
  const startedAt = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);

  // Chronomètre basé sur l'horloge réelle : reste juste même si les timers
  // sont mis en pause (écran verrouillé / app en arrière-plan).
  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
