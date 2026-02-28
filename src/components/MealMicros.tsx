import React, { useState, useEffect } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

interface MealMicrosProps {
  mealId: string;
}

const MICRO_META = [
  { key: "fiber", name: "Fibres", unit: "g", info: "Digestion et satiété. Objectif : 25-35g/jour." },
  { key: "sugar", name: "Sucres", unit: "g", info: "Glucides simples. Limitez à <50g/jour." },
  { key: "saturated_fat", name: "AG Saturés", unit: "g", info: "Santé cardiovasculaire. Limitez à <20g/jour." },
  { key: "omega3_mg", name: "Oméga-3", unit: "mg", info: "Anti-inflammatoire, récupération musculaire. 250-500mg/jour." },
  { key: "sodium_mg", name: "Sodium", unit: "mg", info: "Sodium/Potassium : Équilibre hydrique. <2300mg/jour." },
  { key: "potassium_mg", name: "Potassium", unit: "mg", info: "Sodium/Potassium : Équilibre hydrique. 3500mg/jour." },
  { key: "magnesium_mg", name: "Magnésium", unit: "mg", info: "Magnésium/Calcium : Récupération. 400mg/jour." },
  { key: "calcium_mg", name: "Calcium", unit: "mg", info: "Magnésium/Calcium : Récupération. 1000mg/jour." },
];

const MealMicros: React.FC<MealMicrosProps> = ({ mealId }) => {
  const [open, setOpen] = useState(false);
  const [micros, setMicros] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!open || micros) return;
    (async () => {
      const { data } = await supabase
        .from("meal_items")
        .select("fiber, sodium_mg, potassium_mg, magnesium_mg, calcium_mg, sugar, saturated_fat, omega3_mg")
        .eq("meal_id", mealId);
      if (data) {
        const totals: Record<string, number> = {};
        MICRO_META.forEach((m) => (totals[m.key] = 0));
        (data as any[]).forEach((item) => {
          MICRO_META.forEach((m) => {
            totals[m.key] += Number(item[m.key]) || 0;
          });
        });
        setMicros(totals);
      }
    })();
  }, [open, micros, mealId]);

  const hasMicros = micros && MICRO_META.some((m) => (micros[m.key] || 0) > 0);

  return (
    <div className="mt-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        Détails Santé
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1.5 mt-1.5 animate-fade-up">
          {micros && hasMicros ? (
            MICRO_META.filter((m) => (micros[m.key] || 0) > 0).map((m) => (
              <div key={m.key} className="bg-accent rounded-lg px-2 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium">{m.name}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">{m.info}</TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-[10px] font-bold">{Math.round((micros[m.key] || 0) * 10) / 10}{m.unit}</span>
              </div>
            ))
          ) : (
            <p className="text-[10px] text-muted-foreground col-span-2">Aucun micronutriment enregistré.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default MealMicros;
