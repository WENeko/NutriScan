import React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Utensils } from "lucide-react";

interface Meal {
  id: string;
  timestamp: string;
  image_url: string | null;
  total_calories: number;
  total_proteins: number;
  total_carbs: number;
  total_fats: number;
}

interface MealHistoryProps {
  meals: Meal[];
  onSelect: (id: string) => void;
}

const MealHistory: React.FC<MealHistoryProps> = ({ meals, onSelect }) => {
  if (meals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Utensils className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Aucun repas enregistré</p>
        <p className="text-xs">Scannez votre premier repas !</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meals.map((meal, idx) => (
        <button
          key={meal.id}
          onClick={() => onSelect(meal.id)}
          className="w-full flex items-center gap-3 bg-card rounded-xl p-3 shadow-card hover:shadow-float transition-shadow text-left"
          style={{ animationDelay: `${idx * 80}ms` }}
        >
          {meal.image_url ? (
            <img
              src={meal.image_url}
              alt="Repas"
              className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Utensils className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {format(new Date(meal.timestamp), "EEEE d MMM, HH:mm", { locale: fr })}
            </p>
            <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
              <span>P: {Math.round(meal.total_proteins)}g</span>
              <span>G: {Math.round(meal.total_carbs)}g</span>
              <span>L: {Math.round(meal.total_fats)}g</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="text-sm font-bold text-primary">
              {Math.round(meal.total_calories)}
            </span>
            <span className="text-[10px] text-muted-foreground block">kcal</span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default MealHistory;
