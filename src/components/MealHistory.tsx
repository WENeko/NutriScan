import React, { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Utensils, Copy, Trash2, Heart, Pencil, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

interface MealItem {
  id: string;
  name: string;
  quantity: string | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
}

interface Meal {
  id: string;
  timestamp: string;
  image_url: string | null;
  total_calories: number;
  total_proteins: number;
  total_carbs: number;
  total_fats: number;
  meal_name?: string | null;
  is_favorite?: boolean;
}

interface MealHistoryProps {
  meals: Meal[];
  userId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

const MealHistory: React.FC<MealHistoryProps> = ({ meals, userId, onSelect, onRefresh }) => {
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<MealItem[]>([]);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const deleteMeal = async (mealId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase.from("meal_items").delete().eq("meal_id", mealId);
      const { error } = await supabase.from("meals").delete().eq("id", mealId);
      if (error) throw error;
      toast({ title: "Repas supprimé" });
      onRefresh();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const toggleFavorite = async (mealId: string, current: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from("meals").update({ is_favorite: !current }).eq("id", mealId);
      if (error) throw error;
      onRefresh();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const duplicateMeal = async (mealId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data: items, error: itemsErr } = await supabase
        .from("meal_items").select("*").eq("meal_id", mealId);
      if (itemsErr) throw itemsErr;
      const originalMeal = meals.find((m) => m.id === mealId);
      if (!originalMeal) return;
      const { data: newMeal, error: mealErr } = await supabase
        .from("meals")
        .insert({
          user_id: userId,
          image_url: originalMeal.image_url,
          meal_name: originalMeal.meal_name,
          total_calories: originalMeal.total_calories,
          total_proteins: originalMeal.total_proteins,
          total_carbs: originalMeal.total_carbs,
          total_fats: originalMeal.total_fats,
          is_confirmed: true,
          source: "ai",
        })
        .select().single();
      if (mealErr) throw mealErr;
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

  const startEdit = async (mealId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingEdit(true);
    try {
      const { data, error } = await supabase
        .from("meal_items").select("*").eq("meal_id", mealId);
      if (error) throw error;
      setEditItems((data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        calories: item.calories,
        proteins: item.proteins,
        carbs: item.carbs,
        fats: item.fats,
      })));
      setEditingMealId(mealId);
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoadingEdit(false);
    }
  };

  const updateEditItemWeight = (idx: number, newWeight: number) => {
    setEditItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const oldWeight = parseFloat(item.quantity || "100") || 100;
        const ratio = newWeight / oldWeight;
        return {
          ...item,
          quantity: `${newWeight}g`,
          proteins: Math.round((item.proteins || 0) * ratio * 10) / 10,
          carbs: Math.round((item.carbs || 0) * ratio * 10) / 10,
          fats: Math.round((item.fats || 0) * ratio * 10) / 10,
          calories: Math.round(
            ((item.proteins || 0) * ratio * 4 +
              (item.carbs || 0) * ratio * 4 +
              (item.fats || 0) * ratio * 9) * 10
          ) / 10,
        };
      })
    );
  };

  const saveEdit = async () => {
    if (!editingMealId) return;
    try {
      // Update each item
      for (const item of editItems) {
        const cals = (item.proteins || 0) * 4 + (item.carbs || 0) * 4 + (item.fats || 0) * 9;
        await supabase.from("meal_items").update({
          quantity: item.quantity,
          proteins: item.proteins,
          carbs: item.carbs,
          fats: item.fats,
          calories: Math.round(cals),
        }).eq("id", item.id);
      }
      // Update meal totals
      const totals = editItems.reduce(
        (acc, item) => ({
          calories: acc.calories + (item.proteins || 0) * 4 + (item.carbs || 0) * 4 + (item.fats || 0) * 9,
          proteins: acc.proteins + (item.proteins || 0),
          carbs: acc.carbs + (item.carbs || 0),
          fats: acc.fats + (item.fats || 0),
        }),
        { calories: 0, proteins: 0, carbs: 0, fats: 0 }
      );
      await supabase.from("meals").update({
        total_calories: Math.round(totals.calories),
        total_proteins: Math.round(totals.proteins * 10) / 10,
        total_carbs: Math.round(totals.carbs * 10) / 10,
        total_fats: Math.round(totals.fats * 10) / 10,
      }).eq("id", editingMealId);

      toast({ title: "Repas modifié !" });
      setEditingMealId(null);
      setEditItems([]);
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
        <div key={meal.id} style={{ animationDelay: `${idx * 80}ms` }}>
          <button
            onClick={() => onSelect(meal.id)}
            className="w-full flex items-center gap-3 bg-card rounded-xl p-3 shadow-card hover:shadow-float transition-shadow text-left"
          >
            {meal.image_url ? (
              <img src={meal.image_url} alt="Repas" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Utensils className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {meal.meal_name && (
                <p className="text-sm font-bold truncate">{meal.meal_name}</p>
              )}
              <p className={`text-xs text-muted-foreground truncate ${meal.meal_name ? '' : 'text-sm font-semibold text-foreground'}`}>
                {format(new Date(meal.timestamp), "EEEE d MMM, HH:mm", { locale: fr })}
              </p>
              <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                <span>P: {Math.round(meal.total_proteins)}g</span>
                <span>G: {Math.round(meal.total_carbs)}g</span>
                <span>L: {Math.round(meal.total_fats)}g</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <div className="text-right">
                <span className="text-sm font-bold text-primary">{Math.round(meal.total_calories)}</span>
                <span className="text-[10px] text-muted-foreground block">kcal</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button onClick={(e) => toggleFavorite(meal.id, !!meal.is_favorite, e)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <Heart className={`w-3.5 h-3.5 ${meal.is_favorite ? 'fill-destructive text-destructive' : 'text-muted-foreground'}`} />
                </button>
                <button onClick={(e) => startEdit(meal.id, e)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={(e) => duplicateMeal(meal.id, e)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={(e) => deleteMeal(meal.id, e)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            </div>
          </button>

          {/* Inline edit panel */}
          {editingMealId === meal.id && (
            <div className="bg-accent rounded-xl p-3 mt-1 space-y-2 animate-fade-up">
              <h4 className="text-xs font-semibold text-muted-foreground">Modifier les poids</h4>
              {editItems.map((item, i) => (
                <div key={item.id} className="flex items-center gap-2 bg-card rounded-lg p-2">
                  <span className="text-xs font-medium flex-1 truncate">{item.name}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={parseFloat(item.quantity || "0") || 0}
                      onChange={(e) => updateEditItemWeight(i, Number(e.target.value))}
                      className="w-16 h-7 text-xs rounded-md text-center"
                    />
                    <span className="text-[10px] text-muted-foreground">g</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground w-12 text-right">
                    {Math.round((item.proteins || 0) * 4 + (item.carbs || 0) * 4 + (item.fats || 0) * 9)} kcal
                  </span>
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => { setEditingMealId(null); setEditItems([]); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/80">
                  <X className="w-3 h-3" /> Annuler
                </button>
                <button onClick={saveEdit} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs nutri-gradient text-primary-foreground">
                  <Check className="w-3 h-3" /> Sauvegarder
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default MealHistory;
