import React, { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2, Check, X, Pencil, MessageSquareText, ScanBarcode } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import BarcodeScanner from "./BarcodeScanner";

interface MealItem {
  name: string;
  quantity: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
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
  const [source, setSource] = useState<"ai" | "text" | "barcode">("ai");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setItems([]);
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

      const response = await supabase.functions.invoke("analyze-meal", {
        body: { image: base64 },
      });
      if (response.error) throw new Error(response.error.message);
      handleAIResponse(response.data);
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
      const response = await supabase.functions.invoke("analyze-meal", {
        body: { text: textInput },
      });
      if (response.error) throw new Error(response.error.message);
      handleAIResponse(response.data);
    } catch (error: any) {
      toast({ title: "Erreur d'analyse", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAIResponse = (data: any) => {
    setRawAnalysis(JSON.stringify(data));
    setMealName(data.meal_name || "");
    const mappedItems: MealItem[] = (data.items || []).map((item: any) => ({
      name: item.name,
      quantity: item.estimated_weight_g ? `${item.estimated_weight_g}g` : "",
      calories: item.calories || 0,
      proteins: item.proteins || 0,
      carbs: item.carbs || 0,
      fats: item.fats || 0,
    }));
    setItems(mappedItems);
  };

  const handleBarcodeProduct = (product: any) => {
    setSource("barcode");
    setMealName(product.name);
    setItems([{
      name: product.name,
      quantity: `${product.weight_g}g`,
      calories: product.calories,
      proteins: product.proteins,
      carbs: product.carbs,
      fats: product.fats,
    }]);
  };

  const updateItem = (idx: number, field: keyof MealItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (["proteins", "carbs", "fats"].includes(field)) {
          updated.calories = Number(updated.proteins) * 4 + Number(updated.carbs) * 4 + Number(updated.fats) * 9;
        }
        return updated;
      })
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
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
      const { data: meal, error: mealError } = await supabase
        .from("meals")
        .insert({
          user_id: userId,
          image_url: imageUrl,
          raw_ai_analysis: rawAnalysis || null,
          total_calories: totals.calories,
          total_proteins: totals.proteins,
          total_carbs: totals.carbs,
          total_fats: totals.fats,
          is_confirmed: true,
          source,
        })
        .select()
        .single();
      if (mealError) throw mealError;

      const { error: itemsError } = await supabase.from("meal_items").insert(
        items.map((item) => ({
          meal_id: meal.id,
          name: item.name,
          quantity: item.quantity,
          calories: Number(item.proteins) * 4 + Number(item.carbs) * 4 + Number(item.fats) * 9,
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
    setEditingIdx(null);
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
      {/* Tabs */}
      {!hasResults && (
        <div className="flex rounded-xl bg-muted p-1 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setMode(tab.id); resetState(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                mode === tab.id
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground"
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
            placeholder="Décrivez votre repas... Ex: Un café au lait et deux tartines de beurre"
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

      {/* Results */}
      {hasResults && (
        <div className="space-y-3 animate-fade-up">
          {mealName && (
            <h3 className="font-display font-semibold text-base">{mealName}</h3>
          )}

          {items.map((item, idx) => (
            <div key={idx} className="bg-card rounded-xl p-3 shadow-card space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm">{item.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{item.quantity}</span>
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
                <div className="grid grid-cols-3 gap-2">
                  {(["proteins", "carbs", "fats"] as const).map((field) => (
                    <div key={field}>
                      <label className="text-[10px] text-muted-foreground">
                        {field === "proteins" ? "Prot (g)" : field === "carbs" ? "Gluc (g)" : "Lip (g)"}
                      </label>
                      <Input
                        type="number"
                        value={item[field]}
                        onChange={(e) => updateItem(idx, field, Number(e.target.value))}
                        className="h-8 text-sm rounded-lg"
                      />
                    </div>
                  ))}
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
