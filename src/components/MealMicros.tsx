import React, { useState, useEffect, useId } from "react";
import { ChevronDown, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTooltipCtx } from "./TooltipContext";
import { getMicroInfo, type MicroGoals, NUTRIENTS_STD_LIST } from "@/utils/nutrition-logic";
import { mergedNutrientList, type CustomNutrientDef } from "@/utils/nutrients-helpers";

interface MealMicrosProps {
  mealId: string;
  microGoals?: MicroGoals;
  customDefs?: CustomNutrientDef[];
}

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

const MealMicros: React.FC<MealMicrosProps> = ({ mealId, microGoals, customDefs = [] }) => {
  const [open, setOpen] = useState(false);
  const [micros, setMicros] = useState<Record<string, number> | null>(null);
  const prefix = useId();

  const allNutrients = mergedNutrientList(customDefs);

  useEffect(() => {
    if (!open || micros) return;
    (async () => {
      // On lit les JSONB (source unique de vérité) + fallback colonnes legacy
      const { data } = await supabase
        .from("meal_items")
        .select("nutrients_std, nutrients_custom")
        .eq("meal_id", mealId);
      if (data) {
        const totals: Record<string, number> = {};
        allNutrients.forEach((n) => (totals[n.key] = 0));
        (data as any[]).forEach((item) => {
          const std = item.nutrients_std || {};
          const custom = item.nutrients_custom || {};
          allNutrients.forEach((n) => {
            const v = Number(std[n.key] ?? custom[n.key] ?? 0);
            if (Number.isFinite(v)) totals[n.key] += v;
          });
        });
        setMicros(totals);
      }
    })();
  }, [open, micros, mealId, allNutrients]);

  const hasMicros = micros && allNutrients.some((n) => (micros[n.key] || 0) > 0);

  return (
    <div className="mt-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        Détails Santé
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1.5 mt-1.5 animate-fade-up">
          {micros && hasMicros ? (
            allNutrients.filter((n) => (micros[n.key] || 0) > 0).map((n, i) => {
              const goal = microGoals ? (microGoals as any)[n.key] ?? 0 : 0;
              const isStd = NUTRIENTS_STD_LIST.some((s) => s.key === n.key);
              const info = isStd && microGoals ? getMicroInfo(n.key, goal) : `${n.label} (custom)`;
              return (
                <div key={n.key} className="bg-accent rounded-lg px-2 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium">{n.label}</span>
                    {info && <MicroInfoBubble info={info} id={`${prefix}-mm-${i}`} />}
                  </div>
                  <span className="text-[10px] font-bold">{Math.round((micros[n.key] || 0) * 10) / 10}{n.unit}</span>
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
