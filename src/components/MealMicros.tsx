import React, { useState, useEffect } from "react";
import { ChevronDown, Info, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MealMicrosProps {
  mealId: string;
}

const MICRO_META = [
  { key: "fiber", name: "Fibres", unit: "g", info: "Digestion et satiété. Objectif : 25-35g/jour." },
  { key: "sugar", name: "Sucres", unit: "g", info: "Glucides simples. Limitez à <50g/jour." },
  { key: "saturated_fat", name: "AG Saturés", unit: "g", info: "Santé cardiovasculaire. Limitez à <20g/jour." },
  { key: "omega3_mg", name: "Oméga-3", unit: "mg", info: "Inflammation et santé cardiaque. 250-500mg/jour." },
  { key: "sodium_mg", name: "Sodium", unit: "mg", info: "Équilibre hydrique et congestion. <2300mg/jour." },
  { key: "potassium_mg", name: "Potassium", unit: "mg", info: "Équilibre hydrique et congestion. 3500mg/jour." },
  { key: "magnesium_mg", name: "Magnésium", unit: "mg", info: "Récupération et santé osseuse. 400mg/jour." },
  { key: "calcium_mg", name: "Calcium", unit: "mg", info: "Récupération et santé osseuse. 1000mg/jour." },
  { key: "vitamin_b_mg", name: "Vitamine B", unit: "mg", info: "Énergie et système nerveux." },
  { key: "vitamin_c_mg", name: "Vitamine C", unit: "mg", info: "Antioxydants. 90mg/jour." },
  { key: "vitamin_d_mcg", name: "Vitamine D", unit: "µg", info: "Immunité et hormones. 15µg/jour." },
  { key: "vitamin_e_mg", name: "Vitamine E", unit: "mg", info: "Antioxydants. 15mg/jour." },
];

const MicroInfoBubble: React.FC<{ info: string }> = ({ info }) => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={(e) => { e.stopPropagation(); setShow(!show); }} className="inline-flex">
        <Info className="w-2.5 h-2.5 text-muted-foreground cursor-help" />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 bg-popover border rounded-md px-2.5 py-1.5 text-xs text-popover-foreground shadow-md max-w-[200px] whitespace-normal animate-in fade-in-0 zoom-in-95">
          {info}
          <button type="button" onClick={(e) => { e.stopPropagation(); setShow(false); }} className="absolute -top-1 -right-1 bg-muted rounded-full p-0.5">
            <X className="w-2 h-2" />
          </button>
        </span>
      )}
    </span>
  );
};

const MealMicros: React.FC<MealMicrosProps> = ({ mealId }) => {
  const [open, setOpen] = useState(false);
  const [micros, setMicros] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!open || micros) return;
    (async () => {
      const { data } = await supabase
        .from("meal_items")
        .select("fiber, sodium_mg, potassium_mg, magnesium_mg, calcium_mg, sugar, saturated_fat, omega3_mg, vitamin_b_mg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg")
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
                  <MicroInfoBubble info={m.info} />
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
