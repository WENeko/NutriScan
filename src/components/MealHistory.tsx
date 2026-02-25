import React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Utensils, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  userId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

const MealHistory: React.FC<MealHistoryProps> = ({ meals, userId, onSelect, onRefresh }) => {
  const duplicateMeal = async (mealId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Fetch original meal items
      const { data: items, error: itemsErr } = await supabase
        .from("meal_items")
        .select("*")
        .eq("meal_id", mealId);
      if (itemsErr) throw itemsErr;

      const originalMeal = meals.find((m) => m.id === mealId);
      if (!originalMeal) return;

      // Create new meal
      const { data: newMeal, error: mealErr } = await supabase
        .from("meals")
        .insert({
          user_id: userId,
          image_url: originalMeal.image_url,
          total_calories: originalMeal.total_calories,
          total_proteins: originalMeal.total_proteins,
          total_carbs: originalMeal.total_carbs,
          total_fats: originalMeal.total_fats,
          is_confirmed: true,
          source: "ai",
        })
        .select()
        .single();
      if (mealErr) throw mealErr;

      // Duplicate items
      if (items && items.length > 0) {
        await supabase.from("meal_items").insert(
          items.map((item: any) => ({
            meal_id: newMeal.id,
            name: item.name,
            quantity: item.quantity,
            calories: item.calories,
            proteins: item.proteins,
            carbs: item.carbs,
            fats: item.fats,
          }))
        );
      }

      toast({ title: "Repas dupliqué !" });
      onRefresh();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

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
            <img src={meal.image_url} alt="Repas" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
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
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <span className="text-sm font-bold text-primary">{Math.round(meal.total_calories)}</span>
              <span className="text-[10px] text-muted-foreground block">kcal</span>
            </div>
            <button
              onClick={(e) => duplicateMeal(meal.id, e)}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              title="Dupliquer ce repas"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </button>
      ))}
    </div>
  );
};

export default MealHistory;
