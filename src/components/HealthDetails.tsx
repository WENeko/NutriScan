import React, { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MicroNutrient {
  name: string;
  value: number;
  unit: string;
  info: string;
}

interface HealthDetailsProps {
  micros: MicroNutrient[];
}

const HealthDetails: React.FC<HealthDetailsProps> = ({ micros }) => {
  const [open, setOpen] = useState(false);

  if (micros.every((m) => m.value === 0)) return null;

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4">
        <h3 className="font-display font-semibold text-sm">Détails Santé</h3>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-2 animate-fade-up">
          {micros.filter((m) => m.value > 0).map((micro) => (
            <div key={micro.name} className="bg-accent rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{micro.name}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      {micro.info}
                    </TooltipContent>
                  </Tooltip>
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
