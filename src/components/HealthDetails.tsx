import React, { useState, useId, useMemo } from "react";
import { ChevronDown, Info, Activity } from "lucide-react";
import { useTooltipCtx } from "./TooltipContext";

export interface MicroNutrient {
  name: string;
  value: number;
  unit: string;
  info: string;
  goal?: number;
  /** If true, staying UNDER the goal is good (e.g. sugar, sodium) — inverts color scale */
  isLimit?: boolean;
}

interface HealthDetailsProps {
  micros: MicroNutrient[];
}

function computeDensityScore(micros: MicroNutrient[]): number {
  const scored = micros.filter((m) => m.goal && m.goal > 0);
  if (scored.length === 0) return 0;
  let total = 0;
  scored.forEach((m) => {
    const ratio = Math.min(m.value / m.goal!, 1);
    total += ratio;
  });
  return Math.round((total / scored.length) * 100);
}

const InfoBubble: React.FC<{ info: string; id: string }> = ({ info, id }) => {
  const { openId, open } = useTooltipCtx();
  const isOpen = openId === id;
  return (
    <span className="relative inline-flex" data-info-bubble>
      <button type="button" onClick={(e) => { e.stopPropagation(); open(id); }} className="inline-flex">
        <Info className="w-3 h-3 text-muted-foreground cursor-help" />
      </button>
      {isOpen && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 bg-popover border rounded-md px-3 py-2 text-xs text-popover-foreground shadow-md max-w-[220px] whitespace-normal animate-in fade-in-0 zoom-in-95">
          {info}
        </span>
      )}
    </span>
  );
};

const HealthDetails: React.FC<HealthDetailsProps> = ({ micros }) => {
  const [open, setOpen] = useState(false);
  const prefix = useId();

  const densityScore = useMemo(() => computeDensityScore(micros), [micros]);

  if (micros.every((m) => m.value === 0)) return null;

  const scoreColor = densityScore >= 70 ? "text-primary" : densityScore >= 40 ? "text-secondary" : "text-destructive";

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-sm">Détails Santé</h3>
          <div className="flex items-center gap-1 bg-accent px-2 py-0.5 rounded-lg">
            <Activity className="w-3 h-3 text-muted-foreground" />
            <span className={`text-xs font-bold ${scoreColor}`}>{densityScore}</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 animate-fade-up">
          <div className="bg-accent rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">
              Score de densité nutritionnelle : <span className={`font-bold ${scoreColor}`}>{densityScore}/100</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {densityScore >= 70 ? "Excellent apport en micronutriments 🌟" : densityScore >= 40 ? "Apport correct, diversifie tes repas" : "Apport faible, ajoute des légumes et fruits"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {micros.filter((m) => m.value > 0).map((micro, i) => {
              const pct = micro.goal ? Math.min(micro.value / micro.goal, 1) : 0;
              const pctColor = micro.isLimit
                ? (pct >= 0.9 ? "bg-destructive" : pct >= 0.7 ? "bg-secondary" : "bg-primary")
                : (pct >= 0.7 ? "bg-primary" : pct >= 0.4 ? "bg-secondary" : "bg-destructive");
              return (
                <div key={micro.name} className="bg-accent rounded-xl p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium">{micro.name}</span>
                      <InfoBubble info={micro.info} id={`${prefix}-hd-${i}`} />
                    </div>
                    <span className="text-sm font-bold">{Math.round(micro.value * 10) / 10}</span>
                  </div>
                  {micro.goal && micro.goal > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pctColor}`} style={{ width: `${pct * 100}%` }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{Math.round(pct * 100)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthDetails;
