import React, { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2, Check, X, Pencil, MessageSquareText, ScanBarcode, Plus, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import BarcodeScanner from "./BarcodeScanner";
import NumericInput from "./NumericInput";
import { getLocalDateTimeString, localDateTimeToISO } from "@/lib/numeric-input";

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
}

interface MealInputProps {
  userId: string;
  onMealSaved: () => void;
}

type InputMode = "image" | "text" | "barcode";

const MealInput: React.FC<MealInputProps> = ({ userId, onMealSaved }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
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

      // Get custom foods for context
      const { data: customFoods } = await supabase
        .from("custom_foods")
        .select("name, proteins_per_100g, carbs_per_100g, fats_per_100g, calories_per_100g")
        .eq("user_id", userId);

      const response = await supabase.functions.invoke("analyze-meal", {
        body: { image: base64, custom_foods: customFoods || [] },
      });
      if (response.error) throw new Error(response.error.message);
      handleAIResponse(response.data, customFoods || []);
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
      const { data: customFoods } = await supabase
        .from("custom_foods")
        .select("name, proteins_per_100g, carbs_per_100g, fats_per_100g, calories_per_100g")
        .eq("user_id", userId);

      const response = await supabase.functions.invoke("analyze-meal", {
        body: { text: textInput, custom_foods: customFoods || [], local_time: new Date().toLocaleString("fr-FR") },
      });
      if (response.error) throw new Error(response.error.message);
      handleAIResponse(response.data, customFoods || []);
    } catch (error: any) {
      toast({ title: "Erreur d'analyse", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAIResponse = (data: any, customFoods: any[]) => {
    setRawAnalysis(JSON.stringify(data));
    setMealName(data.meal_name || "");
    if (data.suggested_timestamp) {
      setMealTimestamp(data.suggested_timestamp);
    }
    const customFoodMap = new Map(customFoods.map((f: any) => [f.name.toLowerCase(), f]));

    const mappedItems: MealItem[] = (data.items || []).map((item: any) => {
      const weight = parseFloat(item.estimated_weight_g || item.weight_g || "100") || 100;
      const customMatch = customFoodMap.get(item.name?.toLowerCase());
      let proteins = item.proteins || 0;
      let carbs = item.carbs || 0;
      let fats = item.fats || 0;
      let isCustom = false;

      if (customMatch) {
        proteins = Math.round(customMatch.proteins_per_100g * weight / 100 * 10) / 10;
        carbs = Math.round(customMatch.carbs_per_100g * weight / 100 * 10) / 10;
        fats = Math.round(customMatch.fats_per_100g * weight / 100 * 10) / 10;
        isCustom = true;
      }

      return {
        name: item.name,
        quantity: `${weight}g`,
        calories: Math.round(proteins * 4 + carbs * 4 + fats * 9),
        proteins,
        carbs,
        fats,
        protDensity: proteins / weight,
        carbsDensity: carbs / weight,
        fatsDensity: fats / weight,
        isCustom,
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
      calories: Math.round(proteins * 4 + carbs * 4 + fats * 9),
      proteins,
      carbs,
      fats,
      protDensity: proteins / weight,
      carbsDensity: carbs / weight,
      fatsDensity: fats / weight,
    }]);
  };

  const updateItemWeight = (idx: number, rawValue: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, quantity: rawValue ? `${rawValue}g` : "" };
        const newWeight = parseFloat(rawValue);
        if (!isNaN(newWeight) && newWeight > 0) {
          updated.proteins = Math.round(item.protDensity * newWeight * 10) / 10;
          updated.carbs = Math.round(item.carbsDensity * newWeight * 10) / 10;
          updated.fats = Math.round(item.fatsDensity * newWeight * 10) / 10;
          updated.calories = Math.round(updated.proteins * 4 + updated.carbs * 4 + updated.fats * 9);
        }
        return updated;
      })
    );
  };

  const updateItemName = (idx: number, name: string) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, name } : item));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addManualItem = async () => {
    if (!manualItem.name.trim()) return;
    const weight = parseFloat(manualItem.weight) || 100;

    // Check custom foods first
    const { data: customFoods } = await supabase
      .from("custom_foods")
      .select("*")
      .eq("user_id", userId)
      .ilike("name", `%${manualItem.name}%`)
      .limit(1);

    if (customFoods && customFoods.length > 0) {
      const cf = customFoods[0] as any;
      const proteins = Math.round(cf.proteins_per_100g * weight / 100 * 10) / 10;
      const carbs = Math.round(cf.carbs_per_100g * weight / 100 * 10) / 10;
      const fats = Math.round(cf.fats_per_100g * weight / 100 * 10) / 10;
      setItems((prev) => [...prev, {
        name: cf.name,
        quantity: `${weight}g`,
        calories: Math.round(proteins * 4 + carbs * 4 + fats * 9),
        proteins, carbs, fats,
        protDensity: cf.proteins_per_100g / 100,
        carbsDensity: cf.carbs_per_100g / 100,
        fatsDensity: cf.fats_per_100g / 100,
        isCustom: true,
      }]);
    } else {
      // Quick AI lookup for this single item
      setAnalyzing(true);
      try {
        const response = await supabase.functions.invoke("analyze-meal", {
          body: { text: `${weight}g de ${manualItem.name}` },
        });
        if (response.error) throw new Error(response.error.message);
        const data = response.data;
        const item = data.items?.[0];
        if (item) {
          const p = item.proteins || 0;
          const c = item.carbs || 0;
          const f = item.fats || 0;
          setItems((prev) => [...prev, {
            name: item.name || manualItem.name,
            quantity: `${weight}g`,
            calories: Math.round(p * 4 + c * 4 + f * 9),
            proteins: p, carbs: c, fats: f,
            protDensity: p / weight,
            carbsDensity: c / weight,
            fatsDensity: f / weight,
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
  };

  const computeTotals = () =>
    items.reduce(
      (acc, item) => ({
        calories: acc.calories + (Number(item.proteins) * 4 + Number(item.carbs) * 4 + Number(item.fats) * 9),
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
        const { error: uploadError } = await supabase.storage.from("meal-images").upload(path, imageFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("meal-images").getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const totals = computeTotals();
      const timestamp = mealTimestamp ? localDateTimeToISO(mealTimestamp) : new Date().toISOString();

      const { data: meal, error: mealError } = await supabase
        .from("meals")
        .insert({
          user_id: userId,
          image_url: imageUrl,
          raw_ai_analysis: rawAnalysis || null,
          meal_name: mealName || null,
          total_calories: totals.calories,
          total_proteins: totals.proteins,
          total_carbs: totals.carbs,
          total_fats: totals.fats,
          is_confirmed: true,
          source,
          timestamp,
        } as any)
        .select()
        .single();
      if (mealError) throw mealError;

      const { error: itemsError } = await supabase.from("meal_items").insert(
        items.map((item) => ({
          meal_id: meal.id,
          name: item.name,
          quantity: item.quantity,
          calories: Math.round(Number(item.proteins) * 4 + Number(item.carbs) * 4 + Number(item.fats) * 9),
          proteins: Number(item.proteins),
          carbs: Number(item.carbs),
          fats: Number(item.fats),
        }))
      );
      if (itemsError) throw itemsError;

      toast({ title: "Repas enregistré !" });
      resetState();
      onMealSaved();
    } catch (error: any) {
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
      {/* Mode tabs - always visible when building a multi-source meal */}
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

      {/* Image input */}
      {mode === "image" && !hasResults && (
        <>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          {!preview && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-36 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 flex flex-col items-center justify-center gap-3 hover:border-primary/60 transition-colors active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-full nutri-gradient flex items-center justify-center animate-pulse-ring">
                <Camera className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-primary">Prendre une photo</span>
            </button>
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

      {/* Text input */}
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
            className="w-full rounded-xl h-11 nutri-gradient text-primary-foreground shadow-float hover:opacity-90"
          >
            {analyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyse en cours...</>
            ) : (
              "Analyser mon repas"
            )}
          </Button>
        </div>
      )}

      {/* Barcode */}
      {mode === "barcode" && !hasResults && (
        <BarcodeScanner onProductFound={handleBarcodeProduct} />
      )}

      {/* Results - multi-source editing */}
      {hasResults && (
        <div className="space-y-3 animate-fade-up">
          {/* Editable meal name */}
          <div className="flex items-center gap-2">
            {editingName ? (
              <Input
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                className="h-9 rounded-lg font-display font-semibold"
                autoFocus
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="flex items-center gap-1.5 text-left">
                <h3 className="font-display font-semibold text-base">{mealName || "Mon repas"}</h3>
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="datetime-local"
              value={mealTimestamp || getLocalDateTimeString()}
              onChange={(e) => setMealTimestamp(e.target.value)}
              className="h-8 text-xs rounded-lg flex-1"
            />
          </div>

          {/* Items */}
          {items.map((item, idx) => (
            <div key={idx} className="bg-card rounded-xl p-3 shadow-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {item.isCustom && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">✓ Vérifié</span>}
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

              {editingIdx === idx ? (
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
              ) : (
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>P: {Math.round(Number(item.proteins))}g</span>
                  <span>G: {Math.round(Number(item.carbs))}g</span>
                  <span>L: {Math.round(Number(item.fats))}g</span>
                  <span className="ml-auto font-medium text-foreground">
                    {Math.round(Number(item.proteins) * 4 + Number(item.carbs) * 4 + Number(item.fats) * 9)} kcal
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Add more items */}
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
                <button onClick={() => setAddingManual(false)} className="flex-1 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/80">Annuler</button>
                <button onClick={addManualItem} disabled={analyzing} className="flex-1 py-1.5 rounded-lg text-xs nutri-gradient text-primary-foreground">
                  {analyzing ? "..." : "Ajouter"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setAddingManual(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-primary/30 text-xs font-semibold text-primary hover:border-primary/60">
                <Plus className="w-3.5 h-3.5" /> Ajouter un aliment
              </button>
              {/* Allow adding from other sources */}
              <button
                onClick={() => { setMode("barcode"); }}
                className="p-2.5 rounded-xl border border-dashed border-primary/30 text-primary hover:border-primary/60"
                title="Scanner un code-barres"
              >
                <ScanBarcode className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* If switched to barcode while building meal */}
          {hasResults && mode === "barcode" && (
            <div className="mt-2">
              <BarcodeScanner onProductFound={(product) => { handleBarcodeProduct(product); setMode("image"); }} />
            </div>
          )}

          {/* Totals */}
          <div className="bg-accent rounded-xl p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-display font-semibold">Total</span>
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
            <Button onClick={saveMeal} className="flex-1 rounded-xl h-11 nutri-gradient text-primary-foreground shadow-float hover:opacity-90">
              <Check className="w-4 h-4 mr-1" /> Valider
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealInput;
