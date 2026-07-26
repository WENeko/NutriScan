/**
 * Section de paramètres « Personnalisation de la carte repas ».
 * Permet de choisir jusqu'à 2 actions rapides affichées sur la carte,
 * les autres restant accessibles depuis le menu ⋮.
 */
import React from "react";
import { LayoutList, Check } from "lucide-react";
import {
  MEAL_ACTIONS,
  MAX_QUICK_ACTIONS,
  useMealQuickActions,
  type MealAction,
} from "@/lib/mealCardActions";

const MealCardSettings: React.FC = () => {
  const [quickActions, setQuickActions] = useMealQuickActions();

  const toggle = (action: MealAction) => {
    if (quickActions.includes(action)) {
      setQuickActions(quickActions.filter((a) => a !== action));
    } else {
      const next = [...quickActions, action].slice(-MAX_QUICK_ACTIONS);
      setQuickActions(next);
    }
  };

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
      <div className="flex items-center gap-2 mb-2">
        <LayoutList className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Personnalisation de la carte repas</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Choisissez jusqu'à {MAX_QUICK_ACTIONS} actions rapides affichées directement sur la carte
        (à côté du chevron). Les autres restent disponibles dans le menu ⋮.
      </p>
      <div className="space-y-2">
        {MEAL_ACTIONS.map((a) => {
          const selected = quickActions.includes(a.value);
          const disabled = !selected && quickActions.length >= MAX_QUICK_ACTIONS;
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => toggle(a.value)}
              disabled={disabled}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                selected
                  ? "bg-primary/10 border border-primary/40"
                  : "bg-muted border border-transparent hover:bg-accent"
              } ${disabled ? "opacity-40" : ""}`}
            >
              <span className="text-base">{a.emoji}</span>
              <span className="text-sm font-medium flex-1">{a.label}</span>
              {selected ? (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-primary">
                  Carte <Check className="w-3 h-3" />
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Menu ⋮</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-3">
        Configuration standard : chevron + Dupliquer + menu ⋮.
      </p>
    </section>
  );
};

export default MealCardSettings;
