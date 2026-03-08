import React, { useState, useEffect, useId } from "react";
import { ChevronDown, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTooltipCtx } from "./TooltipContext";
import { getMicroInfo, type MicroGoals } from "@/lib/micro-goals";

interface MealMicrosProps {
  mealId: string;
  microGoals?: MicroGoals;
}

const MICRO_KEYS: { key: string; name: string; unit: string; goalKey: keyof MicroGoals }[] = [
  { key: "fiber", name: "Fibres", unit: "g", goalKey: "fiber" },
  { key: "sugar", name: "Sucres", unit: "g", goalKey: "sugar" },
  { key: "saturated_fat", name: "AG Saturés", unit: "g", goalKey: "saturated_fat" },
  { key: "omega3_mg", name: "Oméga-3", unit: "mg", goalKey: "omega3_mg" },
  { key: "sodium_mg", name: "Sodium", unit: "mg", goalKey: "sodium_mg" },
  { key: "potassium_mg", name: "Potassium", unit: "mg", goalKey: "potassium_mg" },
  { key: "magnesium_mg", name: "Magnésium", unit: "mg", goalKey: "magnesium_mg" },
  { key: "calcium_mg", name: "Calcium", unit: "mg", goalKey: "calcium_mg" },
  { key: "vitamin_b_mg", name: "Vitamine B", unit: "mg", goalKey: "vitamin_b_mg" },
  { key: "vitamin_c_mg", name: "Vitamine C", unit: "mg", goalKey: "vitamin_c_mg" },
  { key: "vitamin_d_mcg", name: "Vitamine D", unit: "µg", goalKey: "vitamin_d_mcg" },
  { key: "vitamin_e_mg", name: "Vitamine E", unit: "mg", goalKey: "vitamin_e_mg" },
];

const MicroInfoBubble: React.FC<{ info: string; id: string }> = ({ info, id }) => {
  const { openId, open } = useTooltipCtx();
  const isOpen = openId === id;
  return (
    <span className="relative inline-flex" data-info-bubble>
      <button type="button" onClick={(e) => { e.stopPropagation(); open(id); }} className="inline-flex">
        <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help" />
      </button>
      {isOpen && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 bg-popover border rounded-md px-2.5 py-1.5 text-xs text-popover-foreground shadow-md max-w-[200px] whitespace-normal animate-in fade-in-0 zoom-in-95">
          {info}
        </span>
      )}
    </span>
  );
};

const MealMicros: React.FC<MealMicrosProps> = ({ mealId, microGoals }) => {
  const [open, setOpen] = useState(false);
  const [micros, setMicros] = useState<Record<string, number> | null>(null);
  const prefix = useId();

  useEffect(() => {
    if (!open || micros) return;
    (async () => {
      const { data } = await supabase
        .from("meal_items")
        .select("fiber, sodium_mg, potassium_mg, magnesium_mg, calcium_mg, sugar, saturated_fat, omega3_mg, vitamin_b_mg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg")
        .eq("meal_id", mealId);
      if (data) {
        const totals: Record<string, number> = {};
        MICRO_KEYS.forEach((m) => (totals[m.key] = 0));
        (data as any[]).forEach((item) => {
          MICRO_KEYS.forEach((m) => {
            totals[m.key] += Number(item[m.key]) || 0;
          });
        });
        setMicros(totals);
      }
    })();
  }, [open, micros, mealId]);

  const hasMicros = micros && MICRO_KEYS.some((m) => (micros[m.key] || 0) > 0);

  return (
    <div className="mt-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        Détails Santé
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1.5 mt-1.5 animate-fade-up">
          {micros && hasMicros ? (
            MICRO_KEYS.filter((m) => (micros[m.key] || 0) > 0).map((m, i) => {
              const goal = microGoals ? microGoals[m.goalKey] : 0;
              const info = microGoals ? getMicroInfo(m.key, goal) : "";
              return (
                <div key={m.key} className="bg-accent rounded-lg px-2 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium">{m.name}</span>
                    {info && <MicroInfoBubble info={info} id={`${prefix}-mm-${i}`} />}
                  </div>
                  <span className="text-[10px] font-bold">{Math.round((micros[m.key] || 0) * 10) / 10}{m.unit}</span>
                </div>
              );
            })
          ) : (
            <p className="text-[10px] text-muted-foreground col-span-2">Aucun micronutriment enregistré.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default MealMicros;
