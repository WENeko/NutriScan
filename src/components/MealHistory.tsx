import React, { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Utensils, Copy, Trash2, Heart, Pencil, X, Check, Plus, Clock, Camera, MessageSquareText, ScanBarcode, Loader2, BadgeCheck, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import NumericInput from "./NumericInput";
import MealMicros from "./MealMicros";
import { type MicroGoals } from "@/lib/micro-goals";
import BarcodeScanner from "./BarcodeScanner";
import { getLocalDateTimeString, localDateTimeToISO } from "@/lib/numeric-input";


interface MealItem {
  id: string;
  name: string;
  quantity: string | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  isCustom?: boolean;
  fiber?: number | null;
  sugar?: number | null;
  saturated_fat?: number | null;
  omega3_mg?: number | null;
  sodium_mg?: number | null;
  potassium_mg?: number | null;
  magnesium_mg?: number | null;
  calcium_mg?: number | null;
  vitamin_b_mg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  vitamin_e_mg?: number | null;
  unitCount?: number | null;
  unitWeightG?: number | null;
  unitLabel?: string | null;
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
  microGoals?: MicroGoals;
  customDefs?: import("@/utils/nutrients-helpers").CustomNutrientDef[];
}

type AddMode = "manual" | "text" | "barcode";

const MealHistory: React.FC<MealHistoryProps> = ({ meals, userId, onSelect, onRefresh, microGoals, customDefs }) => {
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<MealItem[]>([]);
  const [editDensities, setEditDensities] = useState<{ protD: number; carbsD: number; fatsD: number; fiberD: number; sugarD: number; satFatD: number; omega3D: number; sodiumD: number; potassiumD: number; magnesiumD: number; calciumD: number; vitBD: number; vitCD: number; vitDD: number; vitED: number }[]>([]);
  const [editWeightInputs, setEditWeightInputs] = useState<string[]>([]);
  const [editMealName, setEditMealName] = useState("");
  const [editTimestamp, setEditTimestamp] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(false);
  // Add ingredient state
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [addTextInput, setAddTextInput] = useState("");
  const [addManualName, setAddManualName] = useState("");
  const [addManualWeight, setAddManualWeight] = useState("");
  const [addAnalyzing, setAddAnalyzing] = useState(false);

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
      const { data: items, error: itemsErr } = await supabase.from("meal_items").select("*").eq("meal_id", mealId);
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
          is_favorite: originalMeal.is_favorite || false,
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
            fiber: item.fiber,
            sugar: item.sugar,
            saturated_fat: item.saturated_fat,
            omega3_mg: item.omega3_mg,
            sodium_mg: item.sodium_mg,
            potassium_mg: item.potassium_mg,
            magnesium_mg: item.magnesium_mg,
            calcium_mg: item.calcium_mg,
            vitamin_b_mg: item.vitamin_b_mg,
            vitamin_c_mg: item.vitamin_c_mg,
            vitamin_d_mcg: item.vitamin_d_mcg,
            vitamin_e_mg: item.vitamin_e_mg,
            unit_count: item.unit_count,
            unit_weight_g: item.unit_weight_g,
            unit_label: item.unit_label,
          } as any))
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
    setAddMode(null);
    try {
      const { data, error } = await supabase.from("meal_items").select("*").eq("meal_id", mealId);
      if (error) throw error;
      const meal = meals.find((m) => m.id === mealId);
      setEditMealName(meal?.meal_name || "");
      setEditTimestamp(meal ? getLocalDateTimeString(new Date(meal.timestamp)) : getLocalDateTimeString());

      // Check which items are from custom foods library
      const { data: customFoods } = await supabase
        .from("custom_foods")
        .select("name")
        .eq("user_id", userId);
      const customNames = new Set((customFoods || []).map((f: any) => f.name.toLowerCase()));

      const items = (data || []).map((item: any) => {
        const w = parseFloat(item.quantity || "100") || 100;
        // Use saved unit data from DB (set by AI at creation time)
        const unitCount = item.unit_count || null;
        const unitWeightG = item.unit_weight_g || null;
        const unitLabel = item.unit_label || null;
        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          calories: item.calories,
          proteins: item.proteins,
          carbs: item.carbs,
          fats: item.fats,
          fiber: item.fiber,
          sugar: item.sugar,
          saturated_fat: item.saturated_fat,
          omega3_mg: item.omega3_mg,
          sodium_mg: item.sodium_mg,
          potassium_mg: item.potassium_mg,
          magnesium_mg: item.magnesium_mg,
          calcium_mg: item.calcium_mg,
          vitamin_b_mg: item.vitamin_b_mg,
          vitamin_c_mg: item.vitamin_c_mg,
          vitamin_d_mcg: item.vitamin_d_mcg,
          vitamin_e_mg: item.vitamin_e_mg,
          isCustom: customNames.has(item.name?.toLowerCase()),
          unitCount,
          unitWeightG,
          unitLabel,
        };
      });
      setEditItems(items);
      const densities = items.map((item: MealItem) => {
        const w = parseFloat(item.quantity || "100") || 100;
        return {
          protD: (item.proteins || 0) / w,
          carbsD: (item.carbs || 0) / w,
          fatsD: (item.fats || 0) / w,
          fiberD: (item.fiber || 0) / w,
          sugarD: (item.sugar || 0) / w,
          satFatD: (item.saturated_fat || 0) / w,
          omega3D: (item.omega3_mg || 0) / w,
          sodiumD: (item.sodium_mg || 0) / w,
          potassiumD: (item.potassium_mg || 0) / w,
          magnesiumD: (item.magnesium_mg || 0) / w,
          calciumD: (item.calcium_mg || 0) / w,
          vitBD: (item.vitamin_b_mg || 0) / w,
          vitCD: (item.vitamin_c_mg || 0) / w,
          vitDD: (item.vitamin_d_mcg || 0) / w,
          vitED: (item.vitamin_e_mg || 0) / w,
        };
      });
      setEditDensities(densities);
      setEditWeightInputs(items.map((item: MealItem) => String(parseFloat(item.quantity || "0") || 0)));
      setEditingMealId(mealId);
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoadingEdit(false);
    }
  };

  const updateEditItemWeight = (idx: number, rawValue: string) => {
    setEditWeightInputs((prev) => prev.map((v, i) => (i === idx ? rawValue : v)));
    const newWeight = parseFloat(rawValue);
    if (isNaN(newWeight) || newWeight <= 0) return;
    const density = editDensities[idx];
    if (!density) return;
    setEditItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const proteins = Math.round(density.protD * newWeight * 10) / 10;
        const carbs = Math.round(density.carbsD * newWeight * 10) / 10;
        const fats = Math.round(density.fatsD * newWeight * 10) / 10;
        return {
          ...item,
          quantity: `${newWeight}g`, proteins, carbs, fats,
          calories: Math.round(proteins * 4 + carbs * 4 + fats * 9),
          fiber: Math.round(density.fiberD * newWeight * 10) / 10,
          sugar: Math.round(density.sugarD * newWeight * 10) / 10,
          saturated_fat: Math.round(density.satFatD * newWeight * 10) / 10,
          omega3_mg: Math.round(density.omega3D * newWeight * 10) / 10,
          sodium_mg: Math.round(density.sodiumD * newWeight * 10) / 10,
          potassium_mg: Math.round(density.potassiumD * newWeight * 10) / 10,
          magnesium_mg: Math.round(density.magnesiumD * newWeight * 10) / 10,
          calcium_mg: Math.round(density.calciumD * newWeight * 10) / 10,
          vitamin_b_mg: Math.round(density.vitBD * newWeight * 10) / 10,
          vitamin_c_mg: Math.round(density.vitCD * newWeight * 10) / 10,
          vitamin_d_mcg: Math.round(density.vitDD * newWeight * 10) / 10,
          vitamin_e_mg: Math.round(density.vitED * newWeight * 10) / 10,
        };
      })
    );
  };

  const updateEditItemName = (idx: number, name: string) => {
    setEditItems((prev) => prev.map((item, i) => i === idx ? { ...item, name } : item));
  };

  const removeEditItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
    setEditDensities((prev) => prev.filter((_, i) => i !== idx));
    setEditWeightInputs((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEditItemUnits = (idx: number, delta: number) => {
    const item = editItems[idx];
    const density = editDensities[idx];
    if (!item?.unitCount || !item?.unitWeightG || !density) return;
    const newCount = Math.max(1, item.unitCount + delta);
    const newWeight = newCount * item.unitWeightG;
    setEditWeightInputs((prev) => prev.map((v, i) => i === idx ? String(newWeight) : v));
    setEditItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        return {
          ...it,
          unitCount: newCount,
          quantity: `${newWeight}g`,
          proteins: Math.round(density.protD * newWeight * 10) / 10,
          carbs: Math.round(density.carbsD * newWeight * 10) / 10,
          fats: Math.round(density.fatsD * newWeight * 10) / 10,
          calories: Math.round(density.protD * newWeight * 4 + density.carbsD * newWeight * 4 + density.fatsD * newWeight * 9),
          fiber: Math.round(density.fiberD * newWeight * 10) / 10,
          sugar: Math.round(density.sugarD * newWeight * 10) / 10,
          saturated_fat: Math.round(density.satFatD * newWeight * 10) / 10,
          omega3_mg: Math.round(density.omega3D * newWeight * 10) / 10,
          sodium_mg: Math.round(density.sodiumD * newWeight * 10) / 10,
          potassium_mg: Math.round(density.potassiumD * newWeight * 10) / 10,
          magnesium_mg: Math.round(density.magnesiumD * newWeight * 10) / 10,
          calcium_mg: Math.round(density.calciumD * newWeight * 10) / 10,
          vitamin_b_mg: Math.round(density.vitBD * newWeight * 10) / 10,
          vitamin_c_mg: Math.round(density.vitCD * newWeight * 10) / 10,
          vitamin_d_mcg: Math.round(density.vitDD * newWeight * 10) / 10,
          vitamin_e_mg: Math.round(density.vitED * newWeight * 10) / 10,
        };
      })
    );
  };

  // Add ingredient via AI text
  const addIngredientText = async () => {
    if (!addTextInput.trim()) return;
    setAddAnalyzing(true);
    try {
      const response = await supabase.functions.invoke("analyze-meal", {
        body: { text: addTextInput },
      });
      if (response.error) throw new Error(response.error.message);
      const data = response.data;
      const item = data.items?.[0];
      if (item) {
        const weight = parseFloat(item.estimated_weight_g || item.weight_g || "100") || 100;
        const p = item.proteins || 0;
        const c = item.carbs || 0;
        const f = item.fats || 0;
        const newItem: MealItem = {
          id: `new-${Date.now()}`,
          name: item.name,
          quantity: `${weight}g`,
          proteins: p, carbs: c, fats: f,
          calories: Math.round(p * 4 + c * 4 + f * 9),
          fiber: item.fiber || 0, sugar: item.sugar || 0, saturated_fat: item.saturated_fat || 0,
          omega3_mg: item.omega3_mg || 0, sodium_mg: item.sodium_mg || 0, potassium_mg: item.potassium_mg || 0,
          magnesium_mg: item.magnesium_mg || 0, calcium_mg: item.calcium_mg || 0,
          vitamin_b_mg: item.vitamin_b_mg || 0, vitamin_c_mg: item.vitamin_c_mg || 0,
          vitamin_d_mcg: item.vitamin_d_mcg || 0, vitamin_e_mg: item.vitamin_e_mg || 0,
        };
        setEditItems((prev) => [...prev, newItem]);
        setEditDensities((prev) => [...prev, { protD: p / weight, carbsD: c / weight, fatsD: f / weight, fiberD: (item.fiber || 0) / weight, sugarD: (item.sugar || 0) / weight, satFatD: (item.saturated_fat || 0) / weight, omega3D: (item.omega3_mg || 0) / weight, sodiumD: (item.sodium_mg || 0) / weight, potassiumD: (item.potassium_mg || 0) / weight, magnesiumD: (item.magnesium_mg || 0) / weight, calciumD: (item.calcium_mg || 0) / weight, vitBD: (item.vitamin_b_mg || 0) / weight, vitCD: (item.vitamin_c_mg || 0) / weight, vitDD: (item.vitamin_d_mcg || 0) / weight, vitED: (item.vitamin_e_mg || 0) / weight }]);
        setEditWeightInputs((prev) => [...prev, String(weight)]);
        toast({ title: "Ingrédient ajouté !" });
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAddAnalyzing(false);
      setAddTextInput("");
      setAddMode(null);
    }
  };

  // Add ingredient manually
  const addIngredientManual = async () => {
    if (!addManualName.trim()) return;
    const userWeight = parseFloat(addManualWeight);
    const hasUserWeight = !isNaN(userWeight) && userWeight > 0;
    setAddAnalyzing(true);
    try {
      // Check custom foods first
      const { data: customFoods } = await supabase
        .from("custom_foods")
        .select("*")
        .eq("user_id", userId)
        .ilike("name", `%${addManualName}%`)
        .limit(1);

      if (customFoods && customFoods.length > 0) {
        const cf = customFoods[0] as any;
        // If no weight provided, ask AI for estimate
        let weight = hasUserWeight ? userWeight : 100;
        if (!hasUserWeight) {
          try {
            const resp = await supabase.functions.invoke("analyze-meal", {
              body: { text: addManualName },
            });
            const aiItem = resp.data?.items?.[0];
            if (aiItem) {
              weight = parseFloat(aiItem.estimated_weight_g || aiItem.weight_g || "100") || 100;
            }
          } catch {}
        }
        const p = Math.round(cf.proteins_per_100g * weight / 100 * 10) / 10;
        const c = Math.round(cf.carbs_per_100g * weight / 100 * 10) / 10;
        const f = Math.round(cf.fats_per_100g * weight / 100 * 10) / 10;
        const newItem: MealItem = {
          id: `new-${Date.now()}`, name: cf.name, quantity: `${weight}g`,
          proteins: p, carbs: c, fats: f, calories: Math.round(p * 4 + c * 4 + f * 9), isCustom: true,
        };
        setEditItems((prev) => [...prev, newItem]);
        setEditDensities((prev) => [...prev, { protD: cf.proteins_per_100g / 100, carbsD: cf.carbs_per_100g / 100, fatsD: cf.fats_per_100g / 100, fiberD: (cf.fiber_per_100g || 0) / 100, sugarD: (cf.sugar_per_100g || 0) / 100, satFatD: (cf.saturated_fat_per_100g || 0) / 100, omega3D: (cf.omega3_mg_per_100g || 0) / 100, sodiumD: (cf.sodium_mg_per_100g || 0) / 100, potassiumD: (cf.potassium_mg_per_100g || 0) / 100, magnesiumD: (cf.magnesium_mg_per_100g || 0) / 100, calciumD: (cf.calcium_mg_per_100g || 0) / 100, vitBD: (cf.vitamin_b_per_100g || 0) / 100, vitCD: (cf.vitamin_c_per_100g || 0) / 100, vitDD: (cf.vitamin_d_per_100g || 0) / 100, vitED: (cf.vitamin_e_per_100g || 0) / 100 }]);
        setEditWeightInputs((prev) => [...prev, String(weight)]);
      } else {
        // Let AI estimate everything including weight
        const textPrompt = hasUserWeight ? `${userWeight}g de ${addManualName}` : addManualName;
        const response = await supabase.functions.invoke("analyze-meal", {
          body: { text: textPrompt },
        });
        if (response.error) throw new Error(response.error.message);
        const item = response.data.items?.[0];
        if (item) {
          const weight = hasUserWeight ? userWeight : (parseFloat(item.estimated_weight_g || item.weight_g || "100") || 100);
          const p = item.proteins || 0;
          const c = item.carbs || 0;
          const f = item.fats || 0;
          setEditItems((prev) => [...prev, {
            id: `new-${Date.now()}`, name: item.name || addManualName, quantity: `${weight}g`,
            proteins: p, carbs: c, fats: f, calories: Math.round(p * 4 + c * 4 + f * 9),
            fiber: item.fiber || 0, sugar: item.sugar || 0, saturated_fat: item.saturated_fat || 0,
            omega3_mg: item.omega3_mg || 0, sodium_mg: item.sodium_mg || 0, potassium_mg: item.potassium_mg || 0,
            magnesium_mg: item.magnesium_mg || 0, calcium_mg: item.calcium_mg || 0,
            vitamin_b_mg: item.vitamin_b_mg || 0, vitamin_c_mg: item.vitamin_c_mg || 0,
            vitamin_d_mcg: item.vitamin_d_mcg || 0, vitamin_e_mg: item.vitamin_e_mg || 0,
          }]);
          setEditDensities((prev) => [...prev, { protD: p / weight, carbsD: c / weight, fatsD: f / weight, fiberD: (item.fiber || 0) / weight, sugarD: (item.sugar || 0) / weight, satFatD: (item.saturated_fat || 0) / weight, omega3D: (item.omega3_mg || 0) / weight, sodiumD: (item.sodium_mg || 0) / weight, potassiumD: (item.potassium_mg || 0) / weight, magnesiumD: (item.magnesium_mg || 0) / weight, calciumD: (item.calcium_mg || 0) / weight, vitBD: (item.vitamin_b_mg || 0) / weight, vitCD: (item.vitamin_c_mg || 0) / weight, vitDD: (item.vitamin_d_mcg || 0) / weight, vitED: (item.vitamin_e_mg || 0) / weight }]);
          setEditWeightInputs((prev) => [...prev, String(weight)]);
        }
      }
      toast({ title: "Ingrédient ajouté !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAddAnalyzing(false);
      setAddManualName("");
      setAddManualWeight("");
      setAddMode(null);
    }
  };

  const handleBarcodeProduct = (product: any) => {
    const weight = product.weight_g || 100;
    const p = product.proteins || 0;
    const c = product.carbs || 0;
    const f = product.fats || 0;
    setEditItems((prev) => [...prev, {
      id: `new-${Date.now()}`, name: product.name, quantity: `${weight}g`,
      proteins: p, carbs: c, fats: f, calories: Math.round(p * 4 + c * 4 + f * 9),
    }]);
    setEditDensities((prev) => [...prev, { protD: p / weight, carbsD: c / weight, fatsD: f / weight, fiberD: 0, sugarD: 0, satFatD: 0, omega3D: 0, sodiumD: 0, potassiumD: 0, magnesiumD: 0, calciumD: 0, vitBD: 0, vitCD: 0, vitDD: 0, vitED: 0 }]);
    setEditWeightInputs((prev) => [...prev, String(weight)]);
    setAddMode(null);
    toast({ title: "Produit ajouté !" });
  };

  const saveEdit = async () => {
    if (!editingMealId) return;
    try {
      await supabase.from("meal_items").delete().eq("meal_id", editingMealId);
      if (editItems.length > 0) {
        await supabase.from("meal_items").insert(
          editItems.map((item) => ({
            meal_id: editingMealId,
            name: item.name,
            quantity: item.quantity,
            proteins: item.proteins,
            carbs: item.carbs,
            fats: item.fats,
            calories: Math.round((item.proteins || 0) * 4 + (item.carbs || 0) * 4 + (item.fats || 0) * 9),
            fiber: item.fiber || 0,
            sugar: item.sugar || 0,
            saturated_fat: item.saturated_fat || 0,
            omega3_mg: item.omega3_mg || 0,
            sodium_mg: item.sodium_mg || 0,
            potassium_mg: item.potassium_mg || 0,
            magnesium_mg: item.magnesium_mg || 0,
            calcium_mg: item.calcium_mg || 0,
            vitamin_b_mg: item.vitamin_b_mg || 0,
            vitamin_c_mg: item.vitamin_c_mg || 0,
            vitamin_d_mcg: item.vitamin_d_mcg || 0,
            vitamin_e_mg: item.vitamin_e_mg || 0,
            unit_count: item.unitCount || null,
            unit_weight_g: item.unitWeightG || null,
            unit_label: item.unitLabel || null,
          } as any))
        );
      }
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
        meal_name: editMealName || null,
        timestamp: editTimestamp ? localDateTimeToISO(editTimestamp) : undefined,
        total_calories: Math.round(totals.calories),
        total_proteins: Math.round(totals.proteins * 10) / 10,
        total_carbs: Math.round(totals.carbs * 10) / 10,
        total_fats: Math.round(totals.fats * 10) / 10,
      } as any).eq("id", editingMealId);

      toast({ title: "Repas modifié !" });
      setEditingMealId(null);
      setEditItems([]);
      setAddMode(null);
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
              {meal.meal_name && <p className="text-sm font-bold truncate">{meal.meal_name}</p>}
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
          {/* Meal micros */}
          <div className="px-3 pb-2">
            <MealMicros mealId={meal.id} microGoals={microGoals} />
          </div>

          {/* Inline edit panel */}
          {editingMealId === meal.id && (
            <div className="bg-accent rounded-xl p-3 mt-1 space-y-2 animate-fade-up">
              {/* Edit title */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Titre</label>
                <Input value={editMealName} onChange={(e) => setEditMealName(e.target.value)} className="h-8 text-sm rounded-lg" placeholder="Nom du repas" />
              </div>
              {/* Edit timestamp */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Date/Heure</label>
                <Input type="datetime-local" value={editTimestamp} onChange={(e) => setEditTimestamp(e.target.value)} className="h-8 text-xs rounded-lg" />
              </div>
              {/* Edit items */}
              <h4 className="text-[10px] font-semibold text-muted-foreground pt-1">Ingrédients</h4>
              {editItems.map((item, i) => (
                <div key={item.id || i} className="bg-card rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {item.isCustom && (
                      <BadgeCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    )}
                    <Input value={item.name} onChange={(e) => updateEditItemName(i, e.target.value)} className="h-7 text-xs rounded-md flex-1" />
                    <div className="flex items-center gap-1">
                       <NumericInput
                         value={parseFloat(editWeightInputs[i] || "0") || 0}
                         onChange={(v, raw) => updateEditItemWeight(i, raw)}
                         className="w-16 h-7 text-xs rounded-md text-center"
                       />
                      <span className="text-[10px] text-muted-foreground">g</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground w-10 text-right">
                      {Math.round((item.proteins || 0) * 4 + (item.carbs || 0) * 4 + (item.fats || 0) * 9)}
                    </span>
                    <button onClick={() => removeEditItem(i)} className="p-1 rounded hover:bg-destructive/10">
                      <X className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                  {/* Unit counter */}
                  {item.unitCount && item.unitWeightG && (
                    <div className="flex items-center gap-2 bg-accent rounded-md px-2 py-1">
                      <span className="text-[10px] text-muted-foreground capitalize flex-1">{item.unitLabel}</span>
                      <button
                        onClick={() => updateEditItemUnits(i, -1)}
                        className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-95"
                      >
                        <Minus className="w-3 h-3 text-foreground" />
                      </button>
                      <span className="text-xs font-bold min-w-[2ch] text-center">{item.unitCount}</span>
                      <button
                        onClick={() => updateEditItemUnits(i, 1)}
                        className="w-6 h-6 rounded-full nutri-gradient flex items-center justify-center hover:opacity-90 active:scale-95"
                      >
                        <Plus className="w-3 h-3 text-primary-foreground" />
                      </button>
                      <span className="text-[9px] text-muted-foreground">({item.unitWeightG}g/u)</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Add ingredient section */}
              {addMode === null && (
                <div className="flex gap-1.5">
                  <button onClick={() => setAddMode("manual")} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-primary/30 text-[10px] font-semibold text-primary">
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                  <button onClick={() => setAddMode("text")} className="p-1.5 rounded-lg border border-dashed border-primary/30 text-primary" title="Texte">
                    <MessageSquareText className="w-3 h-3" />
                  </button>
                  <button onClick={() => setAddMode("barcode")} className="p-1.5 rounded-lg border border-dashed border-primary/30 text-primary" title="Scanner">
                    <ScanBarcode className="w-3 h-3" />
                  </button>
                </div>
              )}

              {addMode === "manual" && (
                <div className="bg-card rounded-lg p-2 space-y-2 animate-fade-up">
                  <div className="flex gap-2">
                    <Input value={addManualName} onChange={(e) => setAddManualName(e.target.value)} placeholder="Nom" className="h-7 text-xs rounded-md flex-1" />
                    <Input value={addManualWeight} onChange={(e) => setAddManualWeight(e.target.value)} placeholder="g" className="h-7 text-xs rounded-md w-16" type="number" />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setAddMode(null)} className="flex-1 py-1 text-[10px] rounded-md bg-muted">Annuler</button>
                    <button onClick={addIngredientManual} disabled={addAnalyzing} className="flex-1 py-1 text-[10px] rounded-md nutri-gradient text-primary-foreground">
                      {addAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Ajouter"}
                    </button>
                  </div>
                </div>
              )}

              {addMode === "text" && (
                <div className="bg-card rounded-lg p-2 space-y-2 animate-fade-up">
                  <Input value={addTextInput} onChange={(e) => setAddTextInput(e.target.value)} placeholder="Ex: 200g de riz blanc" className="h-7 text-xs rounded-md" />
                  <div className="flex gap-1.5">
                    <button onClick={() => setAddMode(null)} className="flex-1 py-1 text-[10px] rounded-md bg-muted">Annuler</button>
                    <button onClick={addIngredientText} disabled={addAnalyzing} className="flex-1 py-1 text-[10px] rounded-md nutri-gradient text-primary-foreground">
                      {addAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Analyser"}
                    </button>
                  </div>
                </div>
              )}

              {addMode === "barcode" && (
                <div className="animate-fade-up">
                  <BarcodeScanner onProductFound={handleBarcodeProduct} />
                  <button onClick={() => setAddMode(null)} className="w-full py-1 text-[10px] rounded-md bg-muted mt-1">Annuler</button>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setEditingMealId(null); setEditItems([]); setAddMode(null); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/80">
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
