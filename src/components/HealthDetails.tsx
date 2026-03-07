import React, { useState, useId } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useTooltipCtx } from "./TooltipContext";

export interface MicroNutrient {
  name: string;
  value: number;
  unit: string;
  info: string;
}

interface HealthDetailsProps {
  micros: MicroNutrient[];
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

  if (micros.every((m) => m.value === 0)) return null;

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4">
        <h3 className="font-display font-semibold text-sm">Détails Santé</h3>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-2 animate-fade-up">
          {micros.filter((m) => m.value > 0).map((micro, i) => (
            <div key={micro.name} className="bg-accent rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{micro.name}</span>
                  <InfoBubble info={micro.info} id={`${prefix}-hd-${i}`} />
                </div>
                <span className="text-[10px] text-muted-foreground">{micro.unit}</span>
              </div>
              <span className="text-sm font-bold">{Math.round(micro.value * 10) / 10}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HealthDetails;
