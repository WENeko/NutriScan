import React, { useState, useMemo, useEffect } from "react";
import { format, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Utensils, Copy, Trash2, Heart, Pencil, X, Check, Plus, Clock, Camera, ScanBarcode, Loader2, BadgeCheck, Minus, ChevronDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import NumericInput from "./NumericInput";
import MealMicros from "./MealMicros";
import { type MicroGoals } from "@/lib/micro-goals";
import BarcodeScanner from "./BarcodeScanner";
import { getLocalDateTimeString, localDateTimeToISO } from "@/lib/numeric-input";
import { buildStdNutrients, hydrateMealItem } from "@/utils/nutrients-helpers";
import { MACRO_COLORS } from "@/lib/macro-colors";
import { analyzeMeal } from "@/services/mealAnalysisService";



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
  model_used?: string | null;
  confidence_score?: number | null;
}

/** Couleur de la pastille de confiance selon le score (0-100). */
function confidenceColor(score: number): string {
  if (score >= 90) return "#10b981"; // vert émeraude — confiance élevée
  if (score >= 70) return "#f59e0b"; // orange — confiance moyenne
  return "#ef4444"; // rouge — approximatif
}

/** Nettoie le libellé du modèle (retire le préfixe fournisseur si présent). */
function modelShortLabel(raw: string): string {
  const parts = raw.split("·").map((s) => s.trim());
  return parts[parts.length - 1] || raw;
}

const AiBadges: React.FC<{ model?: string | null; confidence?: number | null }> = ({ model, confidence }) => {
  if (model == null && confidence == null) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {confidence != null && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold"
          title={`Confiance : ${Math.round(confidence)}%`}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: confidenceColor(Math.round(confidence)) }}
          />
          {Math.round(confidence)}%
        </span>
      )}
      {model && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          🤖 {modelShortLabel(model)}
        </span>
      )}
    </div>
  );
};

interface MealHistoryProps {
  meals: Meal[];
  userId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  microGoals?: MicroGoals;
  customDefs?: import("@/utils/nutrients-helpers").CustomNutrientDef[];
  groupByPeriod?: boolean;
  searchable?: boolean;
}

type AddMode = "text" | "barcode";

const MealHistory: React.FC<MealHistoryProps> = ({ meals, userId, onSelect, onRefresh, microGoals, customDefs, groupByPeriod = false, searchable = false }) => {
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<MealItem[]>([]);
  const [editDensities, setEditDensities] = useState<{ protD: number; carbsD: number; fatsD: number; fiberD: number; sugarD: number; satFatD: number; omega3D: number; sodiumD: number; potassiumD: number; magnesiumD: number; calciumD: number; vitBD: number; vitCD: number; vitDD: number; vitED: number }[]>([]);
  const [editCustomPerGram, setEditCustomPerGram] = useState<Record<string, number>[]>([]);
  const [editWeightInputs, setEditWeightInputs] = useState<string[]>([]);
  const [editMealName, setEditMealName] = useState("");
  const [editTimestamp, setEditTimestamp] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(false);
  // Expand (read-only) ingredient list state
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, MealItem[]>>({});
  // Add ingredient state
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [addTextInput, setAddTextInput] = useState("");
  const [addAnalyzing, setAddAnalyzing] = useState(false);
  // Search + collapsed groups
const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // Map mealId -> concatenated lowercase ingredient names (for search)
  const [itemNamesByMeal, setItemNamesByMeal] = useState<Record<string, string>>({});
  // Full-screen image viewer
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Prefetch ingredient names for all visible meals (search source)
  useEffect(() => {
    if (!searchable || meals.length === 0) return;
    const missing = meals.map((m) => m.id).filter((id) => !(id in itemNamesByMeal));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("meal_items")
        .select("meal_id, name")
        .in("meal_id", missing);
      const map: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        const k = row.meal_id;
        map[k] = (map[k] ? map[k] + " " : "") + (row.name || "").toLowerCase();
      });
      // ensure missing ids present even if empty
      missing.forEach((id) => { if (!(id in map)) map[id] = ""; });
      setItemNamesByMeal((prev) => ({ ...prev, ...map }));
    })();
  }, [meals, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered meals (by search) + grouping by temporal period
  const filteredMeals = useMemo(() => {
    if (!searchQuery.trim()) return meals;
    const q = searchQuery.toLowerCase();
    return meals.filter((m) => {
      const name = (m.meal_name || "").toLowerCase();
      const date = format(new Date(m.timestamp), "EEEE d MMMM yyyy", { locale: fr }).toLowerCase();
      const items = itemNamesByMeal[m.id] || "";
      return name.includes(q) || date.includes(q) || items.includes(q);
    });
  }, [meals, searchQuery, itemNamesByMeal]);

  const groups = useMemo(() => {
    if (!groupByPeriod) return null;
    const buckets = new Map<string, { label: string; order: number; meals: Meal[] }>();
    const ensure = (key: string, label: string, order: number) => {
      if (!buckets.has(key)) buckets.set(key, { label, order, meals: [] });
      return buckets.get(key)!;
    };
    filteredMeals.forEach((m) => {
      const d = new Date(m.timestamp);
      let key: string, label: string, order: number;
      if (isToday(d)) { key = "today"; label = "Aujourd'hui"; order = 0; }
      else if (isYesterday(d)) { key = "yesterday"; label = "Hier"; order = 1; }
      else if (isThisWeek(d, { weekStartsOn: 1 })) { key = "week"; label = "Cette semaine"; order = 2; }
      else if (isThisMonth(d)) { key = "month"; label = "Ce mois-ci"; order = 3; }
      else if (isThisYear(d)) {
        key = `m-${d.getFullYear()}-${d.getMonth()}`;
        label = format(d, "MMMM yyyy", { locale: fr });
        order = 100 + (12 - d.getMonth());
      } else {
        key = `y-${d.getFullYear()}`;
        label = String(d.getFullYear());
        order = 1000 + (3000 - d.getFullYear());
      }
      ensure(key, label, order).meals.push(m);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, val]) => ({ key, ...val }));
  }, [filteredMeals, groupByPeriod]);


  const toggleExpand = async (mealId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedMealId === mealId) {
      setExpandedMealId(null);
      return;
    }
    setExpandedMealId(mealId);
    if (!expandedItems[mealId]) {
      const { data } = await supabase
        .from("meal_items")
        .select("id, name, quantity, calories, proteins, carbs, fats")
        .eq("meal_id", mealId);
      setExpandedItems((prev) => ({ ...prev, [mealId]: (data as any[]) || [] }));
    }
  };


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
          model_used: originalMeal.model_used,
          confidence_score: originalMeal.confidence_score,
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
            unit_count: item.unit_count,
            unit_weight_g: item.unit_weight_g,
            unit_label: item.unit_label,
            nutrients_std: item.nutrients_std ?? {},
            nutrients_custom: item.nutrients_custom ?? {},
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

      const items = (data || []).map((raw: any) => {
        // Source unique de vérité : on hydrate les champs micros depuis nutrients_std
        const item = hydrateMealItem(raw);
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
          vitamin_b9_mcg: item.vitamin_b9_mcg,
          vitamin_b12_mcg: item.vitamin_b12_mcg,
          iron_mg: item.iron_mg,
          zinc_mg: item.zinc_mg,
          nutrients_std: item.nutrients_std ?? {},
          nutrients_custom: item.nutrients_custom ?? {},
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
      const customPerGram = items.map((item: MealItem) => {
        const w = parseFloat(item.quantity || "100") || 100;
        const custom = (item as any).nutrients_custom || {};
        const out: Record<string, number> = {};
        Object.entries(custom).forEach(([k, v]) => { out[k] = (Number(v) || 0) / w; });
        return out;
      });
      setEditCustomPerGram(customPerGram);
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
          nutrients_custom: Object.fromEntries(
            Object.entries(editCustomPerGram[idx] || {}).map(([k, perG]) => [k, Math.round(perG * newWeight * 1000) / 1000])
          ),
        } as any;
      })
    );
  };

  const updateEditItemName = (idx: number, name: string) => {
    setEditItems((prev) => prev.map((item, i) => i === idx ? { ...item, name } : item));
  };

  const removeEditItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
    setEditDensities((prev) => prev.filter((_, i) => i !== idx));
    setEditCustomPerGram((prev) => prev.filter((_, i) => i !== idx));
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
          nutrients_custom: Object.fromEntries(
            Object.entries(editCustomPerGram[idx] || {}).map(([k, perG]) => [k, Math.round(perG * newWeight * 1000) / 1000])
          ),
        } as any;
      })
    );
  };

  // Add ingredient via AI text (uses the cascading AI routing engine, same as MealInput)
  const addIngredientText = async () => {
    if (!addTextInput.trim()) return;
    setAddAnalyzing(true);
    try {
      const { data: customFoods } = await supabase
        .from("custom_foods")
        .select("*")
        .eq("user_id", userId);

      const data = await analyzeMeal({
        text: addTextInput,
        custom_foods: customFoods || [],
        // Liste complète des nutriments custom de l'utilisateur (jamais codée en dur)
        custom_nutrients: (customDefs || []).map((d) => ({ key: d.key, label: d.label, unit: d.unit })),
        local_time: new Date().toLocaleString("fr-FR"),
      });

      const items = data?.items || [];
      if (!items.length) {
        toast({ title: "Aucun ingrédient détecté", variant: "destructive" });
        return;
      }

      for (const item of items) {
        const weight = parseFloat(item.quantity || item.estimated_weight_g || item.weight_g || "100") || 100;
        const num = (v: any) => Number(v) || 0;
        const p = num(item.proteins);
        const c = num(item.carbs);
        const f = num(item.fats);

        // Nutriments custom renvoyés par l'IA, indexés dynamiquement par leur clé
        const nutrientsCustom: Record<string, number> = {};
        const customPerGram: Record<string, number> = {};
        for (const d of customDefs || []) {
          const v = num(item[d.key]);
          if (v !== 0) {
            nutrientsCustom[d.key] = v;
            customPerGram[d.key] = v / weight;
          }
        }

        const newItem: MealItem = {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: item.food_name || item.name || "Aliment",
          quantity: `${weight}g`,
          proteins: p, carbs: c, fats: f,
          calories: Math.round(p * 4 + c * 4 + f * 9),
          fiber: num(item.fiber), sugar: num(item.sugar), saturated_fat: num(item.saturated_fat),
          omega3_mg: num(item.omega3_mg), sodium_mg: num(item.sodium_mg), potassium_mg: num(item.potassium_mg),
          magnesium_mg: num(item.magnesium_mg), calcium_mg: num(item.calcium_mg),
          vitamin_b_mg: num(item.vitamin_b_mg), vitamin_c_mg: num(item.vitamin_c_mg),
          vitamin_d_mcg: num(item.vitamin_d_mcg), vitamin_e_mg: num(item.vitamin_e_mg),
          // Micros supplémentaires persistés par saveEdit / nutrients_std
          ...( { vitamin_b9_mcg: num(item.vitamin_b9_mcg), vitamin_b12_mcg: num(item.vitamin_b12_mcg),
                 iron_mg: num(item.iron_mg), zinc_mg: num(item.zinc_mg),
                 nutrients_custom: nutrientsCustom } as any ),
        };
        setEditItems((prev) => [...prev, newItem]);
        setEditDensities((prev) => [...prev, { protD: p / weight, carbsD: c / weight, fatsD: f / weight, fiberD: num(item.fiber) / weight, sugarD: num(item.sugar) / weight, satFatD: num(item.saturated_fat) / weight, omega3D: num(item.omega3_mg) / weight, sodiumD: num(item.sodium_mg) / weight, potassiumD: num(item.potassium_mg) / weight, magnesiumD: num(item.magnesium_mg) / weight, calciumD: num(item.calcium_mg) / weight, vitBD: num(item.vitamin_b_mg) / weight, vitCD: num(item.vitamin_c_mg) / weight, vitDD: num(item.vitamin_d_mcg) / weight, vitED: num(item.vitamin_e_mg) / weight }]);
        setEditCustomPerGram((prev) => [...prev, customPerGram]);
        setEditWeightInputs((prev) => [...prev, String(weight)]);
      }
      toast({ title: items.length > 1 ? "Ingrédients ajoutés !" : "Ingrédient ajouté !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAddAnalyzing(false);
      setAddTextInput("");
      setAddMode(null);
    }
  };



  const handleBarcodeProduct = (product: any) => {
    const weight = product.weight_g || 100;
    const p = product.proteins || 0;
    const c = product.carbs || 0;
    const f = product.fats || 0;
    const fiber = product.fiber || 0;
    const sugar = product.sugar || 0;
    const sodium = product.sodium_mg || 0;
    setEditItems((prev) => [...prev, {
      id: `new-${Date.now()}`, name: product.name, quantity: `${weight}g`,
      proteins: p, carbs: c, fats: f, calories: Math.round(p * 4 + c * 4 + f * 9),
      fiber, sugar, sodium_mg: sodium,
    }]);
    setEditDensities((prev) => [...prev, { protD: p / weight, carbsD: c / weight, fatsD: f / weight, fiberD: fiber / weight, sugarD: sugar / weight, satFatD: 0, omega3D: 0, sodiumD: sodium / weight, potassiumD: 0, magnesiumD: 0, calciumD: 0, vitBD: 0, vitCD: 0, vitDD: 0, vitED: 0 }]);
    setEditCustomPerGram((prev) => [...prev, {}]);
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
            vitamin_b9_mcg: (item as any).vitamin_b9_mcg || 0,
            vitamin_b12_mcg: (item as any).vitamin_b12_mcg || 0,
            iron_mg: (item as any).iron_mg || 0,
            zinc_mg: (item as any).zinc_mg || 0,
            unit_count: item.unitCount || null,
            unit_weight_g: item.unitWeightG || null,
            unit_label: item.unitLabel || null,
            nutrients_std: buildStdNutrients(item as unknown as Record<string, unknown>),
            nutrients_custom: (item as any).nutrients_custom ?? {},
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

  const renderMealCard = (meal: Meal, idx: number) => (
    <div key={meal.id} style={{ animationDelay: `${idx * 40}ms` }}>
      <button
        onClick={() => onSelect(meal.id)}
        className="w-full flex flex-col gap-2 bg-card rounded-xl p-3 shadow-card hover:shadow-float transition-shadow text-left"
      >
        <div className="w-full flex items-start gap-3">
          <div className="flex-shrink-0">
            {meal.image_url ? (
              <img
                src={meal.image_url}
                alt="Repas"
                className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={(e) => { e.stopPropagation(); setLightboxUrl(meal.image_url); }}
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                <Utensils className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {meal.meal_name && <p className="text-sm font-bold truncate">{meal.meal_name}</p>}
            <p className={`text-xs text-muted-foreground truncate ${meal.meal_name ? '' : 'text-sm font-semibold text-foreground'}`}>
              {format(new Date(meal.timestamp), "EEEE d MMM, HH:mm", { locale: fr })}
            </p>
            <div className="flex gap-2 text-xs mt-0.5 font-medium">
              <span style={{ color: MACRO_COLORS.protein }}>P: {Math.round(meal.total_proteins)}g</span>
              <span style={{ color: MACRO_COLORS.carb }}>G: {Math.round(meal.total_carbs)}g</span>
              <span style={{ color: MACRO_COLORS.fat }}>L: {Math.round(meal.total_fats)}g</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="text-right">
              <span className="text-sm font-bold text-primary">{Math.round(meal.total_calories)}</span>
              <span className="text-[10px] text-muted-foreground block">kcal</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={(e) => toggleExpand(meal.id, e)} className="p-1.5 rounded-lg hover:bg-accent transition-colors" title="Voir les ingrédients">
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedMealId === meal.id ? 'rotate-180' : ''}`} />
              </button>
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
        </div>
        <AiBadges model={meal.model_used} confidence={meal.confidence_score} />
      </button>

          {/* Read-only expanded ingredient list */}
          {expandedMealId === meal.id && editingMealId !== meal.id && (
            <div className="bg-accent/50 rounded-xl px-3 py-2 mt-1 space-y-1 animate-fade-up">
              {(expandedItems[meal.id] || []).length === 0 ? (
                <p className="text-[10px] text-muted-foreground">Aucun ingrédient.</p>
              ) : (
                (expandedItems[meal.id] || []).map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate flex-1">
                      <span className="font-medium">{it.name}</span>
                      {it.quantity && <span className="text-muted-foreground"> · {it.quantity}</span>}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0 font-medium">
                      <span style={{ color: MACRO_COLORS.calorie }}>{Math.round(it.calories || 0)}kcal</span>
                      <span style={{ color: MACRO_COLORS.protein }}>P{Math.round(it.proteins || 0)}</span>
                      <span style={{ color: MACRO_COLORS.carb }}>G{Math.round(it.carbs || 0)}</span>
                      <span style={{ color: MACRO_COLORS.fat }}>L{Math.round(it.fats || 0)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Meal micros */}
          <div className="px-3 pb-2">
            <MealMicros mealId={meal.id} microGoals={microGoals} customDefs={customDefs} refreshKey={`${meal.total_calories}-${meal.total_proteins}-${meal.total_carbs}-${meal.total_fats}`} />
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
                  <button onClick={() => setAddMode("text")} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-primary/30 text-[10px] font-semibold text-primary">
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                  <button onClick={() => setAddMode("barcode")} className="p-1.5 rounded-lg border border-dashed border-primary/30 text-primary" title="Scanner">
                    <ScanBarcode className="w-3 h-3" />
                  </button>
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
  );

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un repas..."
            className="pl-9 h-9 text-sm rounded-xl"
          />
        </div>
      )}

      {filteredMeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Utensils className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-xs">{searchQuery ? "Aucun résultat" : "Aucun repas"}</p>
        </div>
      ) : groups ? (
        groups.map((g) => {
          const collapsed = collapsedGroups[g.key] ?? (g.order > 1);
          const totalKcal = g.meals.reduce((s, m) => s + (m.total_calories || 0), 0);
          return (
            <div key={g.key} className="space-y-2">
              <button
                onClick={() => toggleGroup(g.key)}
                className="w-full flex items-center justify-between px-1 py-1 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground capitalize">
                  {g.label} <span className="text-muted-foreground/60 normal-case">· {g.meals.length}</span>
                </span>
                <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {Math.round(totalKcal)} kcal
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? "" : "rotate-180"}`} />
                </span>
              </button>
              {!collapsed && (
                <div className="space-y-3">
                  {g.meals.map((meal, idx) => renderMealCard(meal, idx))}
                </div>
              )}
            </div>
          );
        })
      ) : (
        filteredMeals.map((meal, idx) => renderMealCard(meal, idx))
      )}

      {/* Full-screen image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed top-0 left-0 w-[100dvw] h-[100dvh] z-50 bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-hidden"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Repas en plein écran"
            className="max-w-full max-h-[85dvh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default MealHistory;
