import { scaleForDistance } from "@/services/portionScaling";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { supabase as supabaseLovable } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2, Check, X, Pencil, MessageSquareText, ScanBarcode, Plus, Clock, ImageIcon, Minus, AlertCircle, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import BarcodeScanner from "./BarcodeScanner";
import { Capacitor } from "@capacitor/core";
import { captureImageFile } from "@/lib/nativeCamera";
import NumericInput from "./NumericInput";
import { getLocalDateTimeString, localDateTimeToISO } from "@/lib/numeric-input";
import { analyzeMealWithGemini } from "@/services/geminiAiService";
import { analyzeMeal } from "@/services/mealAnalysisService";
import { saveMealWithDualWrite } from "@/services/mealPersistenceService";
import { ensureUserInPersonalDB, logDatabaseHealth } from "@/services/databaseSyncService";
import { localToUtcIso } from "@/lib/timezoneUtils";
import { appLogger } from "@/services/appLogger";
import AnalysisProgressCard from "./AnalysisProgressCard";
import type { RoutingProgressEvent, RoutingProgressStep } from "@/lib/aiRouting";
import { acquireAnalysisWakeLock } from "@/lib/analysisWakeLock";
import { uploadMealImage } from "@/lib/mealImageUpload";
import DistanceBadge from "./DistanceBadge";
import { parseImageScale, peekCaptureScale, setCaptureScale, type CaptureScale } from "@/services/hybrid/captureScale";
import NutritionQuality from "./NutritionQuality";
import WorkoutContextPicker from "./WorkoutContextPicker";
import { sumQualityNutrients, normalizeSportPreset, type UserPreset, type WorkoutContext } from "@/utils/metabolic-quality";
import { resolveCloudChoice } from "@/services/hybrid/cloudHybridService";

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
  nutritionSource?: string;
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
  /** Valeurs des nutriments custom (clé technique -> valeur) retournées par l'IA */
  customExtras?: Record<string, number>;
  /** Alternatives proposées quand l'identité de l'aliment est incertaine (hybride cloud). */
  choices?: string[];
}

const knownNutrient = (value: unknown): number | undefined => value == null || value === "" || !Number.isFinite(Number(value)) ? undefined : Number(value);
const scaledNutrient = (value: unknown, factor: number) => { const n = knownNutrient(value); return n === undefined ? undefined : Math.round(n * factor * 10) / 10; };

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
    fiber: scaledNutrient(item.fiber, factor),
    sugar: scaledNutrient(item.sugar, factor),
    saturated_fat: scaledNutrient(item.saturated_fat, factor),
    omega3_mg: scaledNutrient(item.omega3_mg, factor),
    sodium_mg: scaledNutrient(item.sodium_mg, factor),
    potassium_mg: scaledNutrient(item.potassium_mg, factor),
    magnesium_mg: scaledNutrient(item.magnesium_mg, factor),
    calcium_mg: scaledNutrient(item.calcium_mg, factor),
    iron_mg: scaledNutrient(item.iron_mg, factor),
    zinc_mg: scaledNutrient(item.zinc_mg, factor),
    vitamin_b_mg: scaledNutrient(item.vitamin_b_mg, factor),
    vitamin_b9_mcg: scaledNutrient(item.vitamin_b9_mcg, factor),
    vitamin_b12_mcg: scaledNutrient(item.vitamin_b12_mcg, factor),
    vitamin_c_mg: scaledNutrient(item.vitamin_c_mg, factor),
    vitamin_d_mcg: scaledNutrient(item.vitamin_d_mcg, factor),
    vitamin_e_mg: scaledNutrient(item.vitamin_e_mg, factor),
    customExtras: item.customExtras
      ? Object.fromEntries(Object.entries(item.customExtras).map(([k, v]) => [k, roundNutrient(v * factor)]))
      : undefined,
  };
};

// Raw/cooked ratio: cooked weight = raw weight * 2.5 (for starches/grains)
const RAW_TO_COOKED_RATIO = 2.5;

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
    <div className="flex items-center gap-1.5 mt-2">
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


export interface PrefillRecipe {
  title: string;
  portions: number;
  ingredients: { name: string; grams: number }[];
}

interface MealInputProps {
  userId: string;
  onMealSaved: () => void;
  /** Recette poussée depuis le Coach : déclenche une analyse automatique en attente de validation. */
  prefillRecipe?: PrefillRecipe | null;
  /** Appelé une fois la recette consommée (analyse lancée) pour vider le prefill côté parent. */
  onPrefillConsumed?: () => void;
}

type InputMode = "image" | "text" | "barcode";

const MealInput: React.FC<MealInputProps> = ({ userId, onMealSaved, prefillRecipe, onPrefillConsumed }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const mapItemRef = useRef<((item: any) => MealItem) | null>(null);
  const [choiceBusyIdx, setChoiceBusyIdx] = useState<number | null>(null);
  const [otherIdx, setOtherIdx] = useState<number | null>(null);
  const [otherText, setOtherText] = useState("");
  const [mode, setMode] = useState<InputMode>("image");
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState<RoutingProgressStep>("preparing");
  const [progressModel, setProgressModel] = useState<string>("");
  const [progressFallback, setProgressFallback] = useState(false);
  const [progressAttempt, setProgressAttempt] = useState(1);
  const [rawTextInput, setRawTextInput] = useState<string | null>(null);
  const onAnalyzeProgress = (evt: RoutingProgressEvent) => {
    setProgressStep(evt.step);
    setProgressModel(evt.modelLabel);
    setProgressFallback(evt.isFallback);
    setProgressAttempt(evt.attempt);
  };
  const [items, setItems] = useState<MealItem[]>([]);
  const [rawAnalysis, setRawAnalysis] = useState("");
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [hybridPipeline, setHybridPipeline] = useState<any | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [captureScale, setCaptureScaleState] = useState<CaptureScale | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [textInput, setTextInput] = useState("");
  const [mealName, setMealName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [mealTimestamp, setMealTimestamp] = useState("");
  const [workoutContext, setWorkoutContext] = useState<WorkoutContext>("none");
  const [contextChosen, setContextChosen] = useState(false);
  const [sportPreset, setSportPreset] = useState<UserPreset>("hypertrophy");
  const [source, setSource] = useState<"ai" | "text" | "barcode">("ai");
  const [addingManual, setAddingManual] = useState(false);
  const [manualItem, setManualItem] = useState({ name: "", weight: "" });
  const [manualIsCooked, setManualIsCooked] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsContent, setLogsContent] = useState("");
  const [customNutrients, setCustomNutrients] = useState<{ key: string; label?: string; unit: string }[]>([]);

  // Initialisation - vérifier la santé de la BDD perso + charger nutriments custom
  useEffect(() => {
    const init = async () => {
      await logDatabaseHealth();
      const { data } = await supabaseLovable
        .from("profiles")
        .select("custom_nutrients,sport_preset")
        .eq("user_id", userId)
        .single();
      const arr = Array.isArray((data as any)?.custom_nutrients) ? (data as any).custom_nutrients : [];
      setCustomNutrients(arr);
      setSportPreset(normalizeSportPreset(data?.sport_preset));
    };
    init();
  }, [userId]);

  // Widgets d'écran d'accueil : nutriscan://scan?source=camera|gallery
  // Sur natif on ouvre directement la caméra / galerie via le plugin Camera
  // (le clic programmatique sur un input file est bloqué par la WebView).
  const startCapture = useCallback(async (src: "camera" | "gallery") => {
    setMode("image");
    // Galerie : sélecteur de fichiers du système → octets d'origine intacts
    // (le plugin Camera ré-encode l'image et perd la distance des métadonnées).
    if (Capacitor.isNativePlatform() && src === "camera") {
      const file = await captureImageFile(src);
      if (!file) return;
      setCaptureScaleState(peekCaptureScale());
      setImageFile(file);
      setPreview(URL.createObjectURL(file));
      setSource("ai");
      await analyzeImage(file);
      return;
    }
    setTimeout(() => {
      if (src === "gallery") galleryInputRef.current?.click();
      else fileInputRef.current?.click();
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onScanIntent = (e: Event) => {
      const src = (e as CustomEvent).detail?.source === "gallery" ? "gallery" : "camera";
      void startCapture(src);
    };
    window.addEventListener("nutriscan:scan", onScanIntent);
    return () => window.removeEventListener("nutriscan:scan", onScanIntent);
  }, [startCapture]);



  // Recette poussée depuis le Coach → bascule en mode texte et lance l'analyse,
  // l'utilisateur se retrouve en attente de validation comme pour une saisie texte.
  useEffect(() => {
    if (!prefillRecipe) return;
    const ingredientsText = prefillRecipe.ingredients
      .map((i) => `${i.name} (${i.grams}g)`)
      .join(", ");
    const description = `Recette "${prefillRecipe.title}" pour ${prefillRecipe.portions} portion(s). Ingrédients : ${ingredientsText}.`;
    setMode("text");
    setItems([]);
    setMealName(prefillRecipe.title);
    setTextInput(description);
    onPrefillConsumed?.();
    void analyzeText(description);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillRecipe]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const sc = parseImageScale(await file.arrayBuffer());
      setCaptureScale(sc);
      setCaptureScaleState(sc);
    } catch { setCaptureScaleState(null); }
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setSource("ai");
    await analyzeImage(file);
  };

  // Correction manuelle de la distance : met à l'échelle les quantités existantes
  // (surface apparente ∝ distance²), sans relancer d'analyse ni ajouter d'aliments.
  const handleDistanceChange = async (distanceM: number | null) => {
    const oldD = captureScale?.distanceM ?? null;
    const sc: CaptureScale = {
      ...(captureScale ?? { focalMm: null, focal35Mm: null }),
      distanceM,
      source: distanceM ? "manual" : "none",
    } as CaptureScale;
    setCaptureScaleState(sc);
    setCaptureScale(sc);
    if (!oldD || !distanceM || oldD === distanceM) return;
    const factor = (distanceM / oldD) ** 2;
    setItems((prev) => prev.map((it) => {
      const r = scaleForDistance(it, factor);
      if (!r) return it;
      return scaleItemToWeight(it, r.newWeight, r.unitWeightG ? { unitCount: r.unitCount, unitWeightG: r.unitWeightG } : {});
    }));
    toast({ title: "Quantités ajustées", description: `Distance ${Math.round(distanceM * 100)} cm (×${factor.toFixed(2)})` });
  };

  const analyzeImage = async (file: File) => {
    setAnalyzing(true);
    const releaseWakeLock = await acquireAnalysisWakeLock();
    setProgressStep("preparing");
    setProgressModel("");
    setProgressFallback(false);
    setProgressAttempt(1);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const { data: customFoods } = await supabaseLovable
        .from("custom_foods")
        .select("name, serving_size_g, calories_per_100g, proteins_per_100g, carbs_per_100g, fats_per_100g, nutrients_std, nutrients_custom")
        .eq("user_id", userId);

      const result = await analyzeMeal({
        image: base64,
        custom_foods: customFoods || [],
        custom_nutrients: customNutrients,
        onProgress: onAnalyzeProgress,
      });
      setRawTextInput(null);
      handleAIResponse(result, customFoods || []);
    } catch (error: any) {
      toast({ title: "Erreur d'analyse", description: error.message, variant: "destructive" });
    } finally {
      releaseWakeLock();
      setAnalyzing(false);
    }
  };

  const analyzeText = async (overrideText?: string) => {
    const text = (overrideText ?? textInput).trim();
    if (!text) return;
    setAnalyzing(true);
    const releaseWakeLock = await acquireAnalysisWakeLock();
    setSource("text");
    setProgressStep("preparing");
    setProgressModel("");
    setProgressFallback(false);
    setProgressAttempt(1);
    try {
      const { data: customFoods } = await supabaseLovable
        .from("custom_foods")
        .select("name, serving_size_g, calories_per_100g, proteins_per_100g, carbs_per_100g, fats_per_100g, nutrients_std, nutrients_custom")
        .eq("user_id", userId);

      const result = await analyzeMeal({
        text,
        custom_foods: customFoods || [],
        custom_nutrients: customNutrients,
        local_time: new Date().toLocaleString("fr-FR"),
        onProgress: onAnalyzeProgress,
      });
      setRawTextInput(text);
      handleAIResponse(result, customFoods || []);
    } catch (error: any) {
      toast({ title: "Erreur d'analyse", description: error.message, variant: "destructive" });
    } finally {
      releaseWakeLock();
      setAnalyzing(false);
    }
  };



  const handleAIResponse = (data: any, customFoods: any[]) => {
    setRawAnalysis(JSON.stringify(data));
    setHybridPipeline(data?.pipeline ?? null);
    if (data?._model_used) setModelUsed(data._model_used);
    if (data?._confidence_score != null) setConfidenceScore(Number(data._confidence_score));
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

    const mapOne = (item: any, cloudHybrid: boolean): MealItem => {
      const itemName = item.food_name || item.name || "Aliment";
      const customMatch = cloudHybrid ? undefined : customFoodMap.get(itemName.toLowerCase());
      const aiWeight = parseFloat(item.quantity || item.estimated_weight_g || item.weight_g || "100") || 100;
      const hasExplicitWeight = Boolean(item.quantity || item.estimated_weight_g || item.weight_g);
      const customDefaultWeight = Number(customMatch?.serving_size_g) || 100;
      const weight = customMatch && (!hasExplicitWeight || aiWeight === 100) ? customDefaultWeight : aiWeight;
      let proteins = Number(item.proteins) || 0;
      let carbs = Number(item.carbs) || 0;
      let fats = Number(item.fats) || 0;
      let calories = Number(item.calories) || Math.round(proteins * 4 + carbs * 4 + fats * 9);
      let fiber = knownNutrient(item.fiber);
      let sugar = knownNutrient(item.sugar);
      let saturated_fat = knownNutrient(item.saturated_fat);
      let omega3_mg = knownNutrient(item.omega3_mg);
      let sodium_mg = knownNutrient(item.sodium_mg);
      let potassium_mg = knownNutrient(item.potassium_mg);
      let magnesium_mg = knownNutrient(item.magnesium_mg);
      let calcium_mg = knownNutrient(item.calcium_mg);
      let iron_mg = knownNutrient(item.iron_mg);
      let zinc_mg = knownNutrient(item.zinc_mg);
      let vitamin_b_mg = knownNutrient(item.vitamin_b_mg);
      let vitamin_b9_mcg = knownNutrient(item.vitamin_b9_mcg);
      let vitamin_b12_mcg = knownNutrient(item.vitamin_b12_mcg);
      let vitamin_c_mg = knownNutrient(item.vitamin_c_mg);
      let vitamin_d_mcg = knownNutrient(item.vitamin_d_mcg);
      let vitamin_e_mg = knownNutrient(item.vitamin_e_mg);
      let isCustom = false;

      if (customMatch) {
        proteins = roundNutrient((Number(customMatch.proteins_per_100g) || 0) * weight / 100);
        carbs = roundNutrient((Number(customMatch.carbs_per_100g) || 0) * weight / 100);
        fats = roundNutrient((Number(customMatch.fats_per_100g) || 0) * weight / 100);
        calories = Math.round((Number(customMatch.calories_per_100g) || 0) * weight / 100);
        const cmStd = (customMatch.nutrients_std || {}) as Record<string, number>;
        const cmCol = (col: string, key: string) =>
          scaledNutrient(customMatch[col] ?? cmStd[key], weight / 100);
        fiber = cmCol("fiber_per_100g", "fiber");
        sugar = cmCol("sugar_per_100g", "sugar");
        saturated_fat = cmCol("saturated_fat_per_100g", "saturated_fat");
        omega3_mg = cmCol("omega3_mg_per_100g", "omega3_mg");
        sodium_mg = cmCol("sodium_mg_per_100g", "sodium_mg");
        potassium_mg = cmCol("potassium_mg_per_100g", "potassium_mg");
        magnesium_mg = cmCol("magnesium_mg_per_100g", "magnesium_mg");
        calcium_mg = cmCol("calcium_mg_per_100g", "calcium_mg");
        iron_mg = cmCol("iron_mg_per_100g", "iron_mg");
        zinc_mg = cmCol("zinc_mg_per_100g", "zinc_mg");
        vitamin_b_mg = cmCol("vitamin_b_per_100g", "vitamin_b_mg");
        vitamin_b9_mcg = cmCol("vitamin_b9_mcg_per_100g", "vitamin_b9_mcg");
        vitamin_b12_mcg = cmCol("vitamin_b12_mcg_per_100g", "vitamin_b12_mcg");
        vitamin_c_mg = cmCol("vitamin_c_per_100g", "vitamin_c_mg");
        vitamin_d_mcg = cmCol("vitamin_d_per_100g", "vitamin_d_mcg");
        vitamin_e_mg = cmCol("vitamin_e_per_100g", "vitamin_e_mg");
        isCustom = true;
      }

      const unitCount = item.unit_count ? parseInt(item.unit_count) : undefined;
      const unitWeightG = item.unit_weight_g ? parseInt(item.unit_weight_g) : undefined;
      const unitLabel = item.unit_label || undefined;

      // Extraire les valeurs custom_nutrients renvoyées par l'IA
      const customExtras: Record<string, number> = {};
      for (const c of customNutrients) {
        const libraryValue = customMatch?.nutrients_custom?.[c.key] != null
          ? Number(customMatch.nutrients_custom[c.key]) * weight / 100
          : undefined;
        const v = libraryValue ?? Number(item[c.key]);
        if (Number.isFinite(v) && v !== 0) customExtras[c.key] = v;
      }

      return {
        name: itemName,
        quantity: `${weight}g`,
        calories, proteins, carbs, fats,
        protDensity: proteins / weight,
        carbsDensity: carbs / weight,
        fatsDensity: fats / weight,
        isCustom,
        ...(cloudHybrid ? { nutritionSource: item.source } : {}),
        ...(cloudHybrid && Array.isArray(item.choices) && item.choices.length ? { choices: item.choices.map(String) } : {}),
        fiber, sugar, saturated_fat, omega3_mg, sodium_mg, potassium_mg, magnesium_mg, calcium_mg,
        iron_mg, zinc_mg, vitamin_b_mg, vitamin_b9_mcg, vitamin_b12_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg,
        ...(Object.keys(customExtras).length ? { customExtras } : {}),
        ...(unitCount && unitWeightG ? { unitCount, unitWeightG, unitLabel: unitLabel || "unité" } : {}),
      };
    };
    mapItemRef.current = (item: any) => mapOne(item, true);
    const mappedItems: MealItem[] = (data.items || []).map((item: any) => mapOne(item, Boolean(data?.pipeline?.detector)));
    setItems(mappedItems);
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
      fiber: knownNutrient(product.fiber),
      sugar: knownNutrient(product.sugar),
      saturated_fat: knownNutrient(product.saturated_fat),
      omega3_mg: knownNutrient(product.omega3_mg),
      sodium_mg: knownNutrient(product.sodium_mg),
      potassium_mg: knownNutrient(product.potassium_mg),
      magnesium_mg: knownNutrient(product.magnesium_mg),
      calcium_mg: knownNutrient(product.calcium_mg),
      iron_mg: knownNutrient(product.iron_mg),
      zinc_mg: knownNutrient(product.zinc_mg),
      vitamin_b_mg: knownNutrient(product.vitamin_b_mg),
      vitamin_b9_mcg: knownNutrient(product.vitamin_b9_mcg),
      vitamin_b12_mcg: knownNutrient(product.vitamin_b12_mcg),
      vitamin_c_mg: knownNutrient(product.vitamin_c_mg),
      vitamin_d_mcg: knownNutrient(product.vitamin_d_mcg),
      vitamin_e_mg: knownNutrient(product.vitamin_e_mg),
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

  /** Choix rapide : renomme l'aliment et le re-résout sur les bases officielles (poids conservé). */
  const applyItemChoice = async (idx: number, choice: string) => {
    const current = items[idx];
    if (!current || !mapItemRef.current) return;
    setChoiceBusyIdx(idx);
    try {
      const { data: customFoods } = await supabaseLovable
        .from("custom_foods")
        .select("name, serving_size_g, calories_per_100g, proteins_per_100g, carbs_per_100g, fats_per_100g, nutrients_std, nutrients_custom")
        .eq("user_id", userId);
      const resolved = await resolveCloudChoice(choice, getItemWeight(current), {
        custom_foods: customFoods || [],
        custom_nutrients: customNutrients as any,
        fromImage: mode === "image",
        unitCount: current.unitCount,
        unitWeightG: current.unitWeightG,
        unitLabel: current.unitLabel,
      });
      if (!resolved) throw new Error("Résolution impossible");
      const next = mapItemRef.current(resolved);
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...next, isCooked: it.isCooked } : it)));
      setOtherIdx(null);
      if (resolved.source === "unresolved") {
        toast({ title: "Toujours introuvable", description: `« ${choice} » n'a pas de fiche officielle ; essaie un nom plus courant.` });
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setChoiceBusyIdx(null);
    }
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
      const cfStd = (cf.nutrients_std || {}) as Record<string, number>;
      const cfCol = (col: string, key: string) =>
        scaledNutrient(cf[col] ?? cfStd[key], nutrientWeight / 100);
      const fiber = cfCol("fiber_per_100g", "fiber");
      const sugar = cfCol("sugar_per_100g", "sugar");
      const saturated_fat = cfCol("saturated_fat_per_100g", "saturated_fat");
      const omega3_mg = cfCol("omega3_mg_per_100g", "omega3_mg");
      const sodium_mg = cfCol("sodium_mg_per_100g", "sodium_mg");
      const potassium_mg = cfCol("potassium_mg_per_100g", "potassium_mg");
      const magnesium_mg = cfCol("magnesium_mg_per_100g", "magnesium_mg");
      const calcium_mg = cfCol("calcium_mg_per_100g", "calcium_mg");
      const iron_mg = cfCol("iron_mg_per_100g", "iron_mg");
      const zinc_mg = cfCol("zinc_mg_per_100g", "zinc_mg");
      const vitamin_b_mg = roundNutrient((cf.vitamin_b_per_100g || 0) * nutrientWeight / 100);
      const vitamin_b9_mcg = cfCol("vitamin_b9_mcg_per_100g", "vitamin_b9_mcg");
      const vitamin_b12_mcg = cfCol("vitamin_b12_mcg_per_100g", "vitamin_b12_mcg");
      const vitamin_c_mg = cfCol("vitamin_c_per_100g", "vitamin_c_mg");
      const vitamin_d_mcg = cfCol("vitamin_d_per_100g", "vitamin_d_mcg");
      const vitamin_e_mg = cfCol("vitamin_e_per_100g", "vitamin_e_mg");
      const customExtras = Object.fromEntries(
        Object.entries((cf.nutrients_custom || {}) as Record<string, number>)
          .map(([k, v]) => [k, roundNutrient((Number(v) || 0) * nutrientWeight / 100)])
          .filter(([, v]) => Number(v) !== 0)
      );
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
        ...(Object.keys(customExtras).length ? { customExtras } : {}),
      }]);
      toast({ title: `${cf.name} ajouté`, description: `Portion : ${weight}g${manualIsCooked ? " (cuit)" : ""}` });
    } else {
      const weight = parseFloat(manualItem.weight) || 100;
      const queryWeight = manualIsCooked ? Math.round(weight / RAW_TO_COOKED_RATIO) : weight;
      setAnalyzing(true);
      try {
        const result = await analyzeMeal({
          text: `${queryWeight}g de ${manualItem.name}`,
          custom_nutrients: customNutrients,
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
            fiber: knownNutrient(item.fiber),
            sugar: knownNutrient(item.sugar),
            saturated_fat: knownNutrient(item.saturated_fat),
            omega3_mg: knownNutrient(item.omega3_mg),
            sodium_mg: knownNutrient(item.sodium_mg),
            potassium_mg: knownNutrient(item.potassium_mg),
            magnesium_mg: knownNutrient(item.magnesium_mg),
            calcium_mg: knownNutrient(item.calcium_mg),
            iron_mg: knownNutrient(item.iron_mg),
            zinc_mg: knownNutrient(item.zinc_mg),
            vitamin_b_mg: knownNutrient(item.vitamin_b_mg),
            vitamin_b9_mcg: knownNutrient(item.vitamin_b9_mcg),
            vitamin_b12_mcg: knownNutrient(item.vitamin_b12_mcg),
            vitamin_c_mg: knownNutrient(item.vitamin_c_mg),
            vitamin_d_mcg: knownNutrient(item.vitamin_d_mcg),
            vitamin_e_mg: knownNutrient(item.vitamin_e_mg),
            customExtras: Object.fromEntries(customNutrients
              .map((c) => [c.key, Number(item[c.key]) || 0] as const)
              .filter(([, v]) => v !== 0)),
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
        const up = await uploadMealImage(userId, imageFile);
        imageUrl = up.url;
        if (up.failed) {
          toast({
            title: "Photo non envoyée",
            description: "Réseau instable : le repas est enregistré sans la photo.",
          });
        }
      }

      const totals = computeTotals();
      const timestamp = mealTimestamp ? localDateTimeToISO(mealTimestamp) : new Date().toISOString();

      // S'assurer que l'utilisateur existe dans la BDD perso
      await ensureUserInPersonalDB(userId);

      // Sauvegarde Dual Write (Lovable + Perso)
      console.log("[MealInput] Appel saveMealWithDualWrite avec", items.length, "items");
      const result = await saveMealWithDualWrite({
        userId,
        mealData: {
          meal_name: mealName || "Repas",
          total_calories: totals.calories,
          total_proteins: totals.proteins,
          total_carbs: totals.carbs,
          total_fats: totals.fats,
          image_url: imageUrl,
          timestamp,
          peri_workout: workoutContext,
          raw_ai_analysis: rawAnalysis || null,
          raw_text_input: rawTextInput,
          is_confirmed: true,
          source: source,
          model_used: modelUsed,
          confidence_score: confidenceScore,
          capture_distance_m: captureScale?.distanceM ?? null,
        },
        items: items.map(item => ({
          food_name: item.name,
          name: item.name,
          calories: Number(item.calories),
          proteins: Number(item.proteins),
          carbs: Number(item.carbs),
          fats: Number(item.fats),
          fiber: knownNutrient(item.fiber),
          sugar: knownNutrient(item.sugar),
          sodium_mg: knownNutrient(item.sodium_mg),
          potassium_mg: knownNutrient(item.potassium_mg),
          magnesium_mg: knownNutrient(item.magnesium_mg),
          calcium_mg: knownNutrient(item.calcium_mg),
          iron_mg: knownNutrient(item.iron_mg),
          zinc_mg: knownNutrient(item.zinc_mg),
          vitamin_c_mg: knownNutrient(item.vitamin_c_mg),
          vitamin_d_mcg: knownNutrient(item.vitamin_d_mcg),
          vitamin_b9_mcg: knownNutrient(item.vitamin_b9_mcg),
          vitamin_b12_mcg: knownNutrient(item.vitamin_b12_mcg),
          vitamin_e_mg: knownNutrient(item.vitamin_e_mg),
          omega3_mg: knownNutrient(item.omega3_mg),
          saturated_fat: knownNutrient(item.saturated_fat),
          vitamin_b_mg: knownNutrient(item.vitamin_b_mg),
          quantity: parseFloat(item.quantity?.replace("g", "") || "100") || 100,
          unit_count: item.unitCount || null,
          unit_label: item.unitLabel || null,
          unit_weight_g: item.unitWeightG || null,
          // Spread custom nutrient values so buildCustomNutrients() can pick them up
          ...(item.customExtras || {}),
        }))
      });
      
      console.log("[MealInput] Résultat saveMealWithDualWrite:", result);

      toast({ title: "Repas enregistré !" });
      resetState();
      onMealSaved();
    } catch (error: any) {
      console.error("[MealInput] Erreur sauvegarde:", error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const resetState = () => {
    setHybridPipeline(null);
    setPreview(null);
    setItems([]);
    setImageFile(null);
    setCaptureScaleState(null);
    setTextInput("");
    setRawAnalysis("");
    setModelUsed(null);
    setConfidenceScore(null);
    setMealName("");
    setMealTimestamp("");
    setWorkoutContext("none");
    setContextChosen(false);
    setEditingIdx(null);
    setEditingName(false);
    setAddingManual(false);
    setManualIsCooked(false);
    setRawTextInput(null);
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
          onClick={() => {
            const logs = appLogger.getLogs();
            setLogsContent(logs.map(l => {
              const detailStr = l.details != null
                ? ` — ${typeof l.details === 'object' ? JSON.stringify(l.details) : l.details}`
                : '';
              return `[${l.timestamp}] [${l.level}] ${l.module}: ${l.message}${detailStr}`;
            }).join('\n'));
            setShowLogsModal(true);
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          title="Voir les logs pour debug"
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
                onClick={() => void startCapture("camera")}
                className="flex-1 h-36 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 flex flex-col items-center justify-center gap-3 hover:border-primary/60 transition-colors active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                  <Camera className="w-6 h-6 text-primary-foreground" />
                </div>
                <span className="text-sm font-semibold text-primary">Photo</span>
              </button>
              <button
                onClick={() => void startCapture("gallery")}
                className="flex-1 h-36 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 flex flex-col items-center justify-center gap-3 hover:border-primary/60 transition-colors active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                </div>
                <span className="text-sm font-semibold text-primary">Galerie</span>
              </button>
            </div>
          )}
          {preview && !analyzing && (
            <div className="relative rounded-2xl overflow-hidden shadow-card">
              <img src={preview} alt="Repas" className="w-full h-44 object-cover" />
              <DistanceBadge scale={captureScale} onChange={handleDistanceChange} />
            </div>
          )}
          {preview && analyzing && (
            <AnalysisProgressCard
              preview={preview}
              currentStep={progressStep}
              modelLabel={progressModel || "Préparation…"}
              isFallback={progressFallback}
              attempt={progressAttempt}
            />
          )}
        </>
      )}

      {mode === "text" && !hasResults && (
        <div className="space-y-3">
          {analyzing && (
            <AnalysisProgressCard
              preview={null}
              mode="text"
              currentStep={progressStep}
              modelLabel={progressModel || "Préparation…"}
              isFallback={progressFallback}
              attempt={progressAttempt}
            />
          )}
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Décrivez votre repas... Ex: Hier à 22h, un café au lait et deux tartines de beurre"
            className="min-h-[100px] rounded-xl text-sm resize-none"
          />
          <Button
            onClick={() => analyzeText()}
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

          {mode === "image" && preview && (
            <div className="relative rounded-2xl overflow-hidden shadow-card">
              <img src={preview} alt="Repas" className="w-full h-44 object-cover" />
              <DistanceBadge scale={captureScale} onChange={handleDistanceChange} disabled={analyzing} />
            </div>
          )}

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
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {item.nutritionSource === "unresolved" && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-semibold">Non résolu</span>}
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
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setEditingIdx(editingIdx === idx ? null : idx)} className="p-1 rounded-lg hover:bg-muted">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => removeItem(idx)} className="p-1 rounded-lg hover:bg-destructive/10">
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>

              {item.nutritionSource && (item.choices?.length || item.nutritionSource === "unresolved") ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    {item.choices?.length ? "Pas sûr de l'aliment ? Précise :" : "Aliment non trouvé : précise ou renomme-le."}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(item.choices ?? []).map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={choiceBusyIdx === idx}
                        onClick={() => applyItemChoice(idx, c)}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-accent hover:bg-primary/15 disabled:opacity-50"
                      >
                        {c}
                      </button>
                    ))}
                    {otherIdx === idx ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => { e.preventDefault(); if (otherText.trim()) applyItemChoice(idx, otherText.trim()); }}
                      >
                        <Input autoFocus value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="ex : Veau" className="h-7 text-xs rounded-md w-32" />
                        <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={!otherText.trim() || choiceBusyIdx === idx}>OK</Button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setOtherIdx(idx); setOtherText(""); }}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground"
                      >
                        ✏️ Autre
                      </button>
                    )}
                    {choiceBusyIdx === idx && <Loader2 className="w-4 h-4 animate-spin text-primary self-center" />}
                  </div>
                </div>
              ) : null}

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

          <WorkoutContextPicker userId={userId} timestamp={mealTimestamp ? localDateTimeToISO(mealTimestamp) : new Date().toISOString()}
            value={workoutContext} allowSuggestion={!contextChosen} onChange={value => { setWorkoutContext(value); setContextChosen(true); }} />
          <NutritionQuality preset={sportPreset} input={{ ...totals, nutrients_std: sumQualityNutrients(items as unknown as Record<string, unknown>[]), carbohydrateBasis: "unknown", peri_workout: workoutContext }} />
          <div className="bg-accent rounded-xl p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{items.some((item) => item.nutritionSource === "unresolved") ? "Total partiel" : "Total"}</span>
              <span className="font-bold text-primary">{Math.round(totals.calories)} kcal</span>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground mt-1">
              <span>P: {Math.round(totals.proteins)}g</span>
              <span>G: {Math.round(totals.carbs)}g</span>
              <span>L: {Math.round(totals.fats)}g</span>
            </div>
            <AiBadges model={modelUsed} confidence={confidenceScore} />
            {hybridPipeline && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  ⚡ {hybridPipeline.detector ? "Hybride cloud" : "Local"} · {hybridPipeline.totalMs} ms
                </span>
                {Object.entries(hybridPipeline.sources || {}).map(([src, n]) => (
                  <span key={src} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {({ library: "Bibliothèque", reference: "CIQUAL", openfoodfacts: "Open Food Facts", usda: "USDA", micro_llm: "Micro-LLM", unresolved: "Non résolu" } as Record<string, string>)[src] ?? src} ×{String(n)}
                  </span>
                ))}
              </div>
            )}
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

      {/* Modal de logs debug */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Logs de debug</h3>
              <button 
                onClick={() => setShowLogsModal(false)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <textarea
                readOnly
                value={logsContent}
                className="w-full h-64 text-xs font-mono bg-muted rounded p-2 resize-none"
              />
            </div>
            <div className="p-4 border-t flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  navigator.clipboard.writeText(logsContent);
                  toast({ title: "Logs copiés !" });
                }}
                className="flex-1"
              >
                Copier
              </Button>
              <Button onClick={() => setShowLogsModal(false)} className="flex-1">
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealInput;
