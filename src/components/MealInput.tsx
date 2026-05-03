import React, { useRef, useState, useEffect } from "react";
import { supabase as supabaseLovable } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2, Check, X, Pencil, MessageSquareText, ScanBarcode, Plus, Clock, ImageIcon, Minus, AlertCircle, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import BarcodeScanner from "./BarcodeScanner";
import NumericInput from "./NumericInput";
import { getLocalDateTimeString, localDateTimeToISO } from "@/lib/numeric-input";
import { analyzeMealWithGemini } from "@/services/geminiAiService";
import { saveMealWithDualWrite } from "@/services/mealPersistenceService";
import { ensureUserInPersonalDB, logDatabaseHealth } from "@/services/databaseSyncService";
import { localToUtcIso } from "@/lib/timezoneUtils";
import { appLogger } from "@/services/appLogger";

// --- CONFIGURATION SUPABASE PERSONNEL ---
const PERSONAL_SUPABASE_URL = import.meta.env.VITE_PERSONAL_SUPABASE_URL;
const PERSONAL_SUPABASE_ANON_KEY = import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;

// Validation et logging des variables d'environnement
console.log("[MealInput] VITE_PERSONAL_SUPABASE_URL:", PERSONAL_SUPABASE_URL ? "✅ Définie" : "❌ Non définie");
console.log("[MealInput] VITE_PERSONAL_SUPABASE_ANON_KEY:", PERSONAL_SUPABASE_ANON_KEY ? "✅ Définie" : "❌ Non définie");

const supabasePerso = (PERSONAL_SUPABASE_URL && PERSONAL_SUPABASE_ANON_KEY)
  ? createClient(PERSONAL_SUPABASE_URL, PERSONAL_SUPABASE_ANON_KEY, {
      auth: { storage: localStorage, persistSession: true, autoRefreshToken: true }
    })
  : null;

if (!supabasePerso) {
  console.warn("[MealInput] ⚠️ Client Supabase Perso non initialisé - vérifiez le .env");
}

interface MealItem {
  name: string;
  quantity: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  protDensity: number;
  carbsDensity: number;
  fatsDensity: number;
  isCustom?: boolean;
  fiber?: number;
  sugar?: number;
  saturated_fat?: number;
  omega3_mg?: number;
  sodium_mg?: number;
  potassium_mg?: number;
  magnesium_mg?: number;
  calcium_mg?: number;
  iron_mg?: number;
  zinc_mg?: number;
  vitamin_b_mg?: number;
  vitamin_b9_mcg?: number;
  vitamin_b12_mcg?: number;
  vitamin_c_mg?: number;
  vitamin_d_mcg?: number;
  vitamin_e_mg?: number;
  unitCount?: number;
  unitWeightG?: number;
  unitLabel?: string;
  isCooked?: boolean;
}

const roundNutrient = (value: number) => Math.round(value * 10) / 10;

const getItemWeight = (item: MealItem) => {
  if (item.unitCount && item.unitWeightG) return item.unitCount * item.unitWeightG;
  return parseFloat((item.quantity || "").replace("g", "")) || 0;
};

const scaleItemToWeight = (item: MealItem, newWeight: number, overrides: Partial<MealItem> = {}): MealItem => {
  const currentWeight = getItemWeight(item);
  const factor = currentWeight > 0 ? newWeight / currentWeight : 1;

  return {
    ...item,
    ...overrides,
    quantity: `${newWeight}g`,
    calories: Math.round(item.calories * factor),
    proteins: roundNutrient(item.proteins * factor),
    carbs: roundNutrient(item.carbs * factor),
    fats: roundNutrient(item.fats * factor),
    fiber: roundNutrient((item.fiber || 0) * factor),
    sugar: roundNutrient((item.sugar || 0) * factor),
    saturated_fat: roundNutrient((item.saturated_fat || 0) * factor),
    omega3_mg: roundNutrient((item.omega3_mg || 0) * factor),
    sodium_mg: roundNutrient((item.sodium_mg || 0) * factor),
    potassium_mg: roundNutrient((item.potassium_mg || 0) * factor),
    magnesium_mg: roundNutrient((item.magnesium_mg || 0) * factor),
    calcium_mg: roundNutrient((item.calcium_mg || 0) * factor),
    iron_mg: roundNutrient((item.iron_mg || 0) * factor),
    zinc_mg: roundNutrient((item.zinc_mg || 0) * factor),
    vitamin_b_mg: roundNutrient((item.vitamin_b_mg || 0) * factor),
    vitamin_b9_mcg: roundNutrient((item.vitamin_b9_mcg || 0) * factor),
    vitamin_b12_mcg: roundNutrient((item.vitamin_b12_mcg || 0) * factor),
    vitamin_c_mg: roundNutrient((item.vitamin_c_mg || 0) * factor),
    vitamin_d_mcg: roundNutrient((item.vitamin_d_mcg || 0) * factor),
    vitamin_e_mg: roundNutrient((item.vitamin_e_mg || 0) * factor),
  };
};

// Raw/cooked ratio: cooked weight = raw weight * 2.5 (for starches/grains)
const RAW_TO_COOKED_RATIO = 2.5;

interface MealInputProps {
  userId: string;
  onMealSaved: () => void;
}

type InputMode = "image" | "text" | "barcode";

const MealInput: React.FC<MealInputProps> = ({ userId, onMealSaved }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<InputMode>("image");
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<MealItem[]>([]);
  const [rawAnalysis, setRawAnalysis] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [textInput, setTextInput] = useState("");
  const [mealName, setMealName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [mealTimestamp, setMealTimestamp] = useState("");
  const [source, setSource] = useState<"ai" | "text" | "barcode">("ai");
  const [addingManual, setAddingManual] = useState(false);
  const [manualItem, setManualItem] = useState({ name: "", weight: "" });
  const [manualIsCooked, setManualIsCooked] = useState(false);

  // Initialisation - vérifier la santé de la BDD perso
  useEffect(() => {
    const init = async () => {
      await logDatabaseHealth();
    };
    init();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setSource("ai");
    await analyzeImage(file);
  };

  const analyzeImage = async (file: File) => {
    setAnalyzing(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const { data: customFoods } = await supabaseLovable
        .from("custom_foods")
        .select("name, serving_size_g, calories_per_100g, proteins_per_100g, carbs_per_100g, fats_per_100g, fiber_per_100g, sugar_per_100g, saturated_fat_per_100g, omega3_mg_per_100g, sodium_mg_per_100g, potassium_mg_per_100g, magnesium_mg_per_100g, calcium_mg_per_100g, iron_mg_per_100g, zinc_mg_per_100g, vitamin_b_per_100g, vitamin_b9_mcg_per_100g, vitamin_b12_mcg_per_100g, vitamin_c_per_100g, vitamin_d_per_100g, vitamin_e_per_100g")
        .eq("user_id", userId);

      const result = await analyzeMealWithGemini({ 
        image: base64, 
        custom_foods: customFoods || [] 
      });
      
      handleAIResponse(result, customFoods || []);
    } catch (error: any) {
      toast({ title: "Erreur d'analyse", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeText = async () => {
    if (!textInput.trim()) return;
    setAnalyzing(true);
    setSource("text");
    try {
      const { data: customFoods } = await supabaseLovable
        .from("custom_foods")
        .select("name, serving_size_g, calories_per_100g, proteins_per_100g, carbs_per_100g, fats_per_100g, fiber_per_100g, sugar_per_100g, saturated_fat_per_100g, omega3_mg_per_100g, sodium_mg_per_100g, potassium_mg_per_100g, magnesium_mg_per_100g, calcium_mg_per_100g, iron_mg_per_100g, zinc_mg_per_100g, vitamin_b_per_100g, vitamin_b9_mcg_per_100g, vitamin_b12_mcg_per_100g, vitamin_c_per_100g, vitamin_d_per_100g, vitamin_e_per_100g")
        .eq("user_id", userId);

      const result = await analyzeMealWithGemini({ 
        text: textInput, 
        custom_foods: customFoods || [], 
        local_time: new Date().toLocaleString("fr-FR") 
      });
      
      handleAIResponse(result, customFoods || []);
    } catch (error: any) {
      toast({ title: "Erreur d'analyse", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAIResponse = (data: any, customFoods: any[]) => {
    setRawAnalysis(JSON.stringify(data));
    // Gérer différents formats de nom de repas
    const extractedMealName = data.meal_name || data.name || "";
    setMealName(extractedMealName);
    
    // Gérer le timestamp (format ISO ou datetime-local)
    const timestamp = data.suggested_timestamp || data.timestamp || data.meal_timestamp;
    if (timestamp) {
      // Convertir en format datetime-local si nécessaire
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        const localISO = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setMealTimestamp(localISO);
      }
    }
    const customFoodMap = new Map(customFoods.map((f: any) => [f.name.toLowerCase(), f]));

    const mappedItems: MealItem[] = (data.items || []).map((item: any) => {
      const itemName = item.food_name || item.name || "Aliment";
      const customMatch = customFoodMap.get(itemName.toLowerCase());
      const aiWeight = parseFloat(item.estimated_weight_g || item.weight_g || "100") || 100;
      const hasExplicitWeight = Boolean(item.estimated_weight_g || item.weight_g);
      const customDefaultWeight = Number(customMatch?.serving_size_g) || 100;
      const weight = customMatch && (!hasExplicitWeight || aiWeight === 100) ? customDefaultWeight : aiWeight;
      let proteins = Number(item.proteins) || 0;
      let carbs = Number(item.carbs) || 0;
      let fats = Number(item.fats) || 0;
      let calories = Number(item.calories) || Math.round(proteins * 4 + carbs * 4 + fats * 9);
      let fiber = Number(item.fiber) || 0;
      let sugar = Number(item.sugar) || 0;
      let saturated_fat = Number(item.saturated_fat) || 0;
      let omega3_mg = Number(item.omega3_mg) || 0;
      let sodium_mg = Number(item.sodium_mg) || 0;
      let potassium_mg = Number(item.potassium_mg) || 0;
      let magnesium_mg = Number(item.magnesium_mg) || 0;
      let calcium_mg = Number(item.calcium_mg) || 0;
      let iron_mg = Number(item.iron_mg) || 0;
      let zinc_mg = Number(item.zinc_mg) || 0;
      let vitamin_b_mg = Number(item.vitamin_b_mg) || 0;
      let vitamin_b9_mcg = Number(item.vitamin_b9_mcg) || 0;
      let vitamin_b12_mcg = Number(item.vitamin_b12_mcg) || 0;
      let vitamin_c_mg = Number(item.vitamin_c_mg) || 0;
      let vitamin_d_mcg = Number(item.vitamin_d_mcg) || 0;
      let vitamin_e_mg = Number(item.vitamin_e_mg) || 0;
      let isCustom = false;

      if (customMatch) {
        proteins = roundNutrient((Number(customMatch.proteins_per_100g) || 0) * weight / 100);
        carbs = roundNutrient((Number(customMatch.carbs_per_100g) || 0) * weight / 100);
        fats = roundNutrient((Number(customMatch.fats_per_100g) || 0) * weight / 100);
        calories = Math.round((Number(customMatch.calories_per_100g) || 0) * weight / 100);
        fiber = roundNutrient((Number(customMatch.fiber_per_100g) || 0) * weight / 100);
        sugar = roundNutrient((Number(customMatch.sugar_per_100g) || 0) * weight / 100);
        saturated_fat = roundNutrient((Number(customMatch.saturated_fat_per_100g) || 0) * weight / 100);
        omega3_mg = roundNutrient((Number(customMatch.omega3_mg_per_100g) || 0) * weight / 100);
        sodium_mg = roundNutrient((Number(customMatch.sodium_mg_per_100g) || 0) * weight / 100);
        potassium_mg = roundNutrient((Number(customMatch.potassium_mg_per_100g) || 0) * weight / 100);
        magnesium_mg = roundNutrient((Number(customMatch.magnesium_mg_per_100g) || 0) * weight / 100);
        calcium_mg = roundNutrient((Number(customMatch.calcium_mg_per_100g) || 0) * weight / 100);
        iron_mg = roundNutrient((Number(customMatch.iron_mg_per_100g) || 0) * weight / 100);
        zinc_mg = roundNutrient((Number(customMatch.zinc_mg_per_100g) || 0) * weight / 100);
        vitamin_b_mg = roundNutrient((Number(customMatch.vitamin_b_per_100g) || 0) * weight / 100);
        vitamin_b9_mcg = roundNutrient((Number(customMatch.vitamin_b9_mcg_per_100g) || 0) * weight / 100);
        vitamin_b12_mcg = roundNutrient((Number(customMatch.vitamin_b12_mcg_per_100g) || 0) * weight / 100);
        vitamin_c_mg = roundNutrient((Number(customMatch.vitamin_c_per_100g) || 0) * weight / 100);
        vitamin_d_mcg = roundNutrient((Number(customMatch.vitamin_d_per_100g) || 0) * weight / 100);
        vitamin_e_mg = roundNutrient((Number(customMatch.vitamin_e_per_100g) || 0) * weight / 100);
        isCustom = true;
      }

      const unitCount = item.unit_count ? parseInt(item.unit_count) : undefined;
      const unitWeightG = item.unit_weight_g ? parseInt(item.unit_weight_g) : undefined;
      const unitLabel = item.unit_label || undefined;

      return {
        name: itemName,
        quantity: `${weight}g`,
        calories, proteins, carbs, fats,
        protDensity: proteins / weight,
        carbsDensity: carbs / weight,
        fatsDensity: fats / weight,
        isCustom,
        fiber, sugar, saturated_fat, omega3_mg, sodium_mg, potassium_mg, magnesium_mg, calcium_mg,
        iron_mg, zinc_mg, vitamin_b_mg, vitamin_b9_mcg, vitamin_b12_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg,
        ...(unitCount && unitWeightG ? { unitCount, unitWeightG, unitLabel: unitLabel || "unité" } : {}),
      };
    });
    setItems((prev) => [...prev, ...mappedItems]);
  };

  const handleBarcodeProduct = (product: any) => {
    setSource("barcode");
    if (!mealName) setMealName(product.name);
    const weight = product.weight_g || 100;
    const proteins = product.proteins || 0;
    const carbs = product.carbs || 0;
    const fats = product.fats || 0;
    setItems((prev) => [...prev, {
      name: product.name,
      quantity: `${weight}g`,
      calories: product.calories || Math.round(proteins * 4 + carbs * 4 + fats * 9),
      proteins, carbs, fats,
      protDensity: proteins / weight,
      carbsDensity: carbs / weight,
      fatsDensity: fats / weight,
      fiber: product.fiber || 0,
      sugar: product.sugar || 0,
      saturated_fat: product.saturated_fat || 0,
      omega3_mg: product.omega3_mg || 0,
      sodium_mg: product.sodium_mg || 0,
      potassium_mg: product.potassium_mg || 0,
      magnesium_mg: product.magnesium_mg || 0,
      calcium_mg: product.calcium_mg || 0,
      iron_mg: product.iron_mg || 0,
      zinc_mg: product.zinc_mg || 0,
      vitamin_b_mg: product.vitamin_b_mg || 0,
      vitamin_b9_mcg: product.vitamin_b9_mcg || 0,
      vitamin_b12_mcg: product.vitamin_b12_mcg || 0,
      vitamin_c_mg: product.vitamin_c_mg || 0,
      vitamin_d_mcg: product.vitamin_d_mcg || 0,
      vitamin_e_mg: product.vitamin_e_mg || 0,
    }]);
  };

  const updateItemWeight = (idx: number, rawValue: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const newWeight = parseFloat(rawValue);
        if (!isNaN(newWeight) && newWeight > 0) {
          return scaleItemToWeight(item, newWeight);
        }
        return { ...item, quantity: rawValue ? `${rawValue}g` : "" };
      })
    );
  };

  const updateItemUnits = (idx: number, delta: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx || !item.unitCount || !item.unitWeightG) return item;
        const newCount = Math.max(1, item.unitCount + delta);
        const newWeight = newCount * item.unitWeightG;
        return scaleItemToWeight(item, newWeight, { unitCount: newCount });
      })
    );
  };

  const updateItemName = (idx: number, name: string) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, name } : item));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleItemCooked = (idx: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const currentWeight = getItemWeight(item);
        if (item.isCooked) {
          const rawWeight = Math.round(currentWeight / RAW_TO_COOKED_RATIO);
          return { ...item, isCooked: false, quantity: `${rawWeight}g` };
        } else {
          const cookedWeight = Math.round(currentWeight * RAW_TO_COOKED_RATIO);
          return { ...item, isCooked: true, quantity: `${cookedWeight}g` };
        }
      })
    );
  };

  const addManualItem = async () => {
    if (!manualItem.name.trim()) return;

    const { data: customFoods } = await supabaseLovable
      .from("custom_foods")
      .select("*")
      .eq("user_id", userId)
      .ilike("name", `%${manualItem.name}%`)
      .limit(1);

    if (customFoods && customFoods.length > 0) {
      const cf = customFoods[0] as any;
      let weight = manualItem.weight ? (parseFloat(manualItem.weight) || cf.serving_size_g || 100) : (cf.serving_size_g || 100);
      const nutrientWeight = manualIsCooked ? weight / RAW_TO_COOKED_RATIO : weight;
      const proteins = roundNutrient((cf.proteins_per_100g || 0) * nutrientWeight / 100);
      const carbs = roundNutrient((cf.carbs_per_100g || 0) * nutrientWeight / 100);
      const fats = roundNutrient((cf.fats_per_100g || 0) * nutrientWeight / 100);
      const fiber = roundNutrient((cf.fiber_per_100g || 0) * nutrientWeight / 100);
      const sugar = roundNutrient((cf.sugar_per_100g || 0) * nutrientWeight / 100);
      const saturated_fat = roundNutrient((cf.saturated_fat_per_100g || 0) * nutrientWeight / 100);
      const omega3_mg = roundNutrient((cf.omega3_mg_per_100g || 0) * nutrientWeight / 100);
      const sodium_mg = roundNutrient((cf.sodium_mg_per_100g || 0) * nutrientWeight / 100);
      const potassium_mg = roundNutrient((cf.potassium_mg_per_100g || 0) * nutrientWeight / 100);
      const magnesium_mg = roundNutrient((cf.magnesium_mg_per_100g || 0) * nutrientWeight / 100);
      const calcium_mg = roundNutrient((cf.calcium_mg_per_100g || 0) * nutrientWeight / 100);
      const iron_mg = roundNutrient((cf.iron_mg_per_100g || 0) * nutrientWeight / 100);
      const zinc_mg = roundNutrient((cf.zinc_mg_per_100g || 0) * nutrientWeight / 100);
      const vitamin_b_mg = roundNutrient((cf.vitamin_b_per_100g || 0) * nutrientWeight / 100);
      const vitamin_b9_mcg = roundNutrient((cf.vitamin_b9_mcg_per_100g || 0) * nutrientWeight / 100);
      const vitamin_b12_mcg = roundNutrient((cf.vitamin_b12_mcg_per_100g || 0) * nutrientWeight / 100);
      const vitamin_c_mg = roundNutrient((cf.vitamin_c_per_100g || 0) * nutrientWeight / 100);
      const vitamin_d_mcg = roundNutrient((cf.vitamin_d_per_100g || 0) * nutrientWeight / 100);
      const vitamin_e_mg = roundNutrient((cf.vitamin_e_per_100g || 0) * nutrientWeight / 100);
      setItems((prev) => [...prev, {
        name: cf.name + (manualIsCooked ? " (cuit)" : ""),
        quantity: `${weight}g`,
        calories: Math.round((cf.calories_per_100g || 0) * nutrientWeight / 100),
        proteins, carbs, fats,
        protDensity: cf.proteins_per_100g / 100,
        carbsDensity: cf.carbs_per_100g / 100,
        fatsDensity: cf.fats_per_100g / 100,
        isCustom: true, isCooked: manualIsCooked,
        fiber, sugar, saturated_fat, omega3_mg, sodium_mg, potassium_mg, magnesium_mg, calcium_mg,
        iron_mg, zinc_mg, vitamin_b_mg, vitamin_b9_mcg, vitamin_b12_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg,
      }]);
      toast({ title: `${cf.name} ajouté`, description: `Portion : ${weight}g${manualIsCooked ? " (cuit)" : ""}` });
    } else {
      const weight = parseFloat(manualItem.weight) || 100;
      const queryWeight = manualIsCooked ? Math.round(weight / RAW_TO_COOKED_RATIO) : weight;
      setAnalyzing(true);
      try {
        const result = await analyzeMealWithGemini({ 
          text: `${queryWeight}g de ${manualItem.name}` 
        });
        const item = result.items?.[0];
        if (item) {
          const p = item.proteins || 0;
          const c = item.carbs || 0;
          const f = item.fats || 0;
          setItems((prev) => [...prev, {
            name: (item.name || manualItem.name) + (manualIsCooked ? " (cuit)" : ""),
            quantity: `${weight}g`,
            calories: Number(item.calories) || Math.round(p * 4 + c * 4 + f * 9),
            proteins: p, carbs: c, fats: f,
            protDensity: p / queryWeight,
            carbsDensity: c / queryWeight,
            fatsDensity: f / queryWeight,
            isCooked: manualIsCooked,
            fiber: Number(item.fiber) || 0,
            sugar: Number(item.sugar) || 0,
            saturated_fat: Number(item.saturated_fat) || 0,
            omega3_mg: Number(item.omega3_mg) || 0,
            sodium_mg: Number(item.sodium_mg) || 0,
            potassium_mg: Number(item.potassium_mg) || 0,
            magnesium_mg: Number(item.magnesium_mg) || 0,
            calcium_mg: Number(item.calcium_mg) || 0,
            iron_mg: Number(item.iron_mg) || 0,
            zinc_mg: Number(item.zinc_mg) || 0,
            vitamin_b_mg: Number(item.vitamin_b_mg) || 0,
            vitamin_b9_mcg: Number(item.vitamin_b9_mcg) || 0,
            vitamin_b12_mcg: Number(item.vitamin_b12_mcg) || 0,
            vitamin_c_mg: Number(item.vitamin_c_mg) || 0,
            vitamin_d_mcg: Number(item.vitamin_d_mcg) || 0,
            vitamin_e_mg: Number(item.vitamin_e_mg) || 0,
          }]);
        }
      } catch (e: any) {
        toast({ title: "Erreur", description: e.message, variant: "destructive" });
      } finally {
        setAnalyzing(false);
      }
    }
    setManualItem({ name: "", weight: "" });
    setAddingManual(false);
    setManualIsCooked(false);
  };

  const computeTotals = () =>
    items.reduce(
      (acc, item) => ({
        calories: acc.calories + Number(item.calories),
        proteins: acc.proteins + Number(item.proteins),
        carbs: acc.carbs + Number(item.carbs),
        fats: acc.fats + Number(item.fats),
      }),
      { calories: 0, proteins: 0, carbs: 0, fats: 0 }
    );

  const saveMeal = async () => {
    if (items.length === 0) return;
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabaseLovable.storage.from("meal-images").upload(path, imageFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabaseLovable.storage.from("meal-images").getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const totals = computeTotals();
      const timestamp = mealTimestamp ? localDateTimeToISO(mealTimestamp) : new Date().toISOString();

      // S'assurer que l'utilisateur existe dans la BDD perso
      await ensureUserInPersonalDB(userId);

      // Sauvegarde Dual Write (Lovable + Perso)
      await saveMealWithDualWrite({
        userId,
        mealData: {
          meal_name: mealName || "Repas",
          total_calories: totals.calories,
          total_proteins: totals.proteins,
          total_carbs: totals.carbs,
          total_fats: totals.fats,
          image_url: imageUrl,
          timestamp,
          raw_ai_analysis: rawAnalysis || null,
          is_confirmed: true,
          source: source
        },
        items: items.map(item => ({
          food_name: item.name,
          name: item.name,
          calories: Number(item.calories),
          proteins: Number(item.proteins),
          carbs: Number(item.carbs),
          fats: Number(item.fats),
          fiber: item.fiber || 0,
          sugar: item.sugar || 0,
          sodium_mg: item.sodium_mg || 0,
          potassium_mg: item.potassium_mg || 0,
          magnesium_mg: item.magnesium_mg || 0,
          calcium_mg: item.calcium_mg || 0,
          iron_mg: item.iron_mg || 0,
          zinc_mg: item.zinc_mg || 0,
          vitamin_c_mg: item.vitamin_c_mg || 0,
          vitamin_d_mcg: item.vitamin_d_mcg || 0,
          vitamin_b9_mcg: item.vitamin_b9_mcg || 0,
          vitamin_b12_mcg: item.vitamin_b12_mcg || 0,
          vitamin_e_mg: item.vitamin_e_mg || 0,
          omega3_mg: item.omega3_mg || 0,
          saturated_fat: item.saturated_fat || 0,
          vitamin_b_mg: item.vitamin_b_mg || 0,
          quantity: 1,
          estimated_weight_g: parseFloat(item.quantity?.replace("g", "") || "100") || 100
        }))
      });

      toast({ title: "Repas enregistré !" });
      resetState();
      onMealSaved();
    } catch (error: any) {
      console.error("[MealInput] Erreur sauvegarde:", error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const resetState = () => {
    setPreview(null);
    setItems([]);
    setImageFile(null);
    setTextInput("");
    setRawAnalysis("");
    setMealName("");
    setMealTimestamp("");
    setEditingIdx(null);
    setEditingName(false);
    setAddingManual(false);
    setManualIsCooked(false);
  };

  const totals = computeTotals();
  const hasResults = items.length > 0;

  const tabs: { id: InputMode; label: string; icon: React.ReactNode }[] = [
    { id: "image", label: "Photo", icon: <Camera className="w-4 h-4" /> },
    { id: "text", label: "Texte", icon: <MessageSquareText className="w-4 h-4" /> },
    { id: "barcode", label: "Code-barres", icon: <ScanBarcode className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Validation env vars warning */}
      {!supabasePerso && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-sm text-yellow-800">
          <AlertCircle className="w-4 h-4" />
          <span>Configuration BDD perso manquante - vérifiez le .env</span>
        </div>
      )}
      
      {/* Bouton export logs (debug) */}
      <div className="flex justify-end">
        <button
          onClick={() => appLogger.downloadLogs()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          title="Télécharger les logs pour debug"
        >
          <Download className="w-3 h-3" />
          Logs
        </button>
      </div>

      {!hasResults && (
        <div className="flex rounded-xl bg-muted p-1 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                mode === tab.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {mode === "image" && !hasResults && (
        <>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          {!preview && (
            <div className="flex gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 h-36 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 flex flex-col items-center justify-center gap-3 hover:border-primary/60 transition-colors active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                  <Camera className="w-6 h-6 text-primary-foreground" />
                </div>
                <span className="text-sm font-semibold text-primary">Photo</span>
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 h-36 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 flex flex-col items-center justify-center gap-3 hover:border-primary/60 transition-colors active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                </div>
                <span className="text-sm font-semibold text-primary">Galerie</span>
              </button>
            </div>
          )}
          {preview && (
            <div className="relative rounded-2xl overflow-hidden shadow-card">
              <img src={preview} alt="Repas" className="w-full h-44 object-cover" />
              {analyzing && (
                <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center">
                  <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">Analyse en cours...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === "text" && !hasResults && (
        <div className="space-y-3">
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Décrivez votre repas... Ex: Hier à 22h, un café au lait et deux tartines de beurre"
            className="min-h-[100px] rounded-xl text-sm resize-none"
          />
          <Button
            onClick={analyzeText}
            disabled={analyzing || !textInput.trim()}
            className="w-full rounded-xl h-11 bg-primary text-primary-foreground hover:opacity-90"
          >
            {analyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyse en cours...</>
            ) : (
              "Analyser mon repas"
            )}
          </Button>
        </div>
      )}

      {mode === "barcode" && !hasResults && (
        <BarcodeScanner onProductFound={handleBarcodeProduct} />
      )}

      {hasResults && (
        <div className="space-y-3 animate-fade-up">
          <div className="flex items-center gap-2">
            {editingName ? (
              <Input
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                className="h-9 rounded-lg font-semibold"
                autoFocus
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="flex items-center gap-1.5 text-left">
                <h3 className="font-semibold text-base">{mealName || "Mon repas"}</h3>
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="datetime-local"
              value={mealTimestamp || getLocalDateTimeString()}
              onChange={(e) => setMealTimestamp(e.target.value)}
              className="h-8 text-xs rounded-lg flex-1"
            />
          </div>

          {items.map((item, idx) => (
            <div key={idx} className="bg-card rounded-xl p-3 shadow-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {item.isCustom && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">✓ Vérifié</span>}
                  {item.isCooked && <span className="text-[10px] bg-secondary/10 text-secondary px-1.5 py-0.5 rounded font-semibold">🍳 Cuit</span>}
                  {editingIdx === idx ? (
                    <Input
                      value={item.name}
                      onChange={(e) => updateItemName(idx, e.target.value)}
                      className="h-7 text-sm rounded-md w-32"
                    />
                  ) : (
                    <>
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.quantity}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditingIdx(editingIdx === idx ? null : idx)} className="p-1 rounded-lg hover:bg-muted">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => removeItem(idx)} className="p-1 rounded-lg hover:bg-destructive/10">
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>

              {item.unitCount && item.unitWeightG && (
                <div className="flex items-center gap-3 bg-accent rounded-lg px-3 py-1.5">
                  <span className="text-xs text-muted-foreground capitalize flex-1">{item.unitLabel}</span>
                  <button
                    onClick={() => updateItemUnits(idx, -1)}
                    className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-95 transition-all"
                  >
                    <Minus className="w-3.5 h-3.5 text-foreground" />
                  </button>
                  <span className="text-sm font-bold min-w-[2ch] text-center">{item.unitCount}</span>
                  <button
                    onClick={() => updateItemUnits(idx, 1)}
                    className="w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary-foreground" />
                  </button>
                  <span className="text-[10px] text-muted-foreground ml-1">({item.unitWeightG}g/u)</span>
                </div>
              )}

              {editingIdx === idx ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground">Poids (g)</label>
                     <NumericInput
                       value={parseFloat(item.quantity || "0") || 0}
                       onChange={(v, raw) => updateItemWeight(idx, raw)}
                       className="h-8 text-sm rounded-lg w-24"
                     />
                    <span className="text-xs text-muted-foreground ml-auto">
                      P:{Math.round(Number(item.proteins))}g G:{Math.round(Number(item.carbs))}g L:{Math.round(Number(item.fats))}g
                    </span>
                  </div>
                  <button
                    onClick={() => toggleItemCooked(idx)}
                    className={`text-[10px] px-2 py-1 rounded-lg font-semibold transition-all ${
                      item.isCooked ? "bg-secondary/20 text-secondary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.isCooked ? "🍳 Cuit (÷2.5)" : "🥩 Cru"}
                  </button>
                </div>
              ) : (
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>P: {Math.round(Number(item.proteins))}g</span>
                  <span>G: {Math.round(Number(item.carbs))}g</span>
                  <span>L: {Math.round(Number(item.fats))}g</span>
                  <span className="ml-auto font-medium text-foreground">
                    {Math.round(Number(item.calories))} kcal
                  </span>
                </div>
              )}
            </div>
          ))}

          {addingManual ? (
            <div className="bg-accent rounded-xl p-3 space-y-2 animate-fade-up">
              <div className="flex gap-2">
                <Input
                  value={manualItem.name}
                  onChange={(e) => setManualItem((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nom de l'aliment"
                  className="h-8 text-sm rounded-lg flex-1"
                />
                <Input
                  type="number"
                  value={manualItem.weight}
                  onChange={(e) => setManualItem((p) => ({ ...p, weight: e.target.value }))}
                  placeholder="Poids (g)"
                  className="h-8 text-sm rounded-lg w-24"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setManualIsCooked(false)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                    !manualIsCooked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >🥩 Cru</button>
                <button
                  onClick={() => setManualIsCooked(true)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                    manualIsCooked ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >🍳 Cuit (÷2.5)</button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setAddingManual(false); setManualIsCooked(false); }} className="flex-1 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/80">Annuler</button>
                <button onClick={addManualItem} disabled={analyzing} className="flex-1 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground">
                  {analyzing ? "..." : "Ajouter"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setAddingManual(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-primary/30 text-xs font-semibold text-primary hover:border-primary/60">
                <Plus className="w-3.5 h-3.5" /> Ajouter un aliment
              </button>
              <button
                onClick={() => { setMode("barcode"); }}
                className="p-2.5 rounded-xl border border-dashed border-primary/30 text-primary hover:border-primary/60"
                title="Scanner un code-barres"
              >
                <ScanBarcode className="w-4 h-4" />
              </button>
            </div>
          )}

          {hasResults && mode === "barcode" && (
            <div className="mt-2">
              <BarcodeScanner onProductFound={(product) => { handleBarcodeProduct(product); setMode("image"); }} />
            </div>
          )}

          <div className="bg-accent rounded-xl p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-primary">{Math.round(totals.calories)} kcal</span>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground mt-1">
              <span>P: {Math.round(totals.proteins)}g</span>
              <span>G: {Math.round(totals.carbs)}g</span>
              <span>L: {Math.round(totals.fats)}g</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={resetState} variant="outline" className="flex-1 rounded-xl h-11">
              <X className="w-4 h-4 mr-1" /> Annuler
            </Button>
            <Button onClick={saveMeal} className="flex-1 rounded-xl h-11 bg-primary text-primary-foreground hover:opacity-90">
              <Check className="w-4 h-4 mr-1" /> Valider
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealInput;
