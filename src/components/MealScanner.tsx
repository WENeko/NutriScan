import React, { useRef, useState } from "react";
import { supabase as supabaseLovable } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Check, X, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { analyzeMeal } from "@/services/mealAnalysisService";
import { saveMealWithDualWrite } from "@/services/mealPersistenceService";
import { ensureUserInPersonalDB } from "@/services/databaseSyncService";
import AnalysisProgressCard from "@/components/AnalysisProgressCard";
import type { RoutingProgressStep } from "@/lib/aiRouting";

interface MealItem {
  name: string;
  quantity: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

interface ScannerProps {
  userId: string;
  onMealSaved: () => void;
}

const MealScanner: React.FC<ScannerProps> = ({ userId, onMealSaved }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<MealItem[]>([]);
  const [rawAnalysis, setRawAnalysis] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setItems([]);
    await analyzeImage(file);
  };

  const analyzeImage = async (file: File) => {
    setAnalyzing(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const result = await analyzeMeal({
        image: base64,
      });

      if (!result) throw new Error("Aucun résultat de l'analyse");

      setRawAnalysis(JSON.stringify(result));
      // Map items from the new AI response format
      const mappedItems: MealItem[] = (result.items || []).map((item: any) => ({
        name: item.food_name || item.name,
        quantity: item.quantity ? `${item.quantity}g` : "",
        calories: item.calories || 0,
        proteins: item.proteins || 0,
        carbs: item.carbs || 0,
        fats: item.fats || 0,
      }));
      setItems(mappedItems);
    } catch (error: any) {
      toast({
        title: "Erreur d'analyse",
        description: error.message || "Impossible d'analyser l'image",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (idx: number, field: keyof MealItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const computeTotals = () => {
    return items.reduce(
      (acc, item) => ({
        calories: acc.calories + (item.proteins * 4 + item.carbs * 4 + item.fats * 9),
        proteins: acc.proteins + item.proteins,
        carbs: acc.carbs + item.carbs,
        fats: acc.fats + item.fats,
      }),
      { calories: 0, proteins: 0, carbs: 0, fats: 0 }
    );
  };

  const saveMeal = async () => {
    if (!imageFile || items.length === 0) return;
    try {
      // Upload image vers Lovable
      const ext = imageFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseLovable.storage
        .from("meal-images")
        .upload(path, imageFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseLovable.storage
        .from("meal-images")
        .getPublicUrl(path);

      const totals = computeTotals();

      // S'assurer que l'utilisateur existe dans la BDD perso
      await ensureUserInPersonalDB(userId);

      // Sauvegarde Dual Write (Lovable + Perso)
      await saveMealWithDualWrite({
        userId,
        mealData: {
          meal_name: "Repas scanné",
          total_calories: totals.calories,
          total_proteins: totals.proteins,
          total_carbs: totals.carbs,
          total_fats: totals.fats,
          image_url: urlData.publicUrl,
          timestamp: new Date().toISOString(),
          raw_ai_analysis: rawAnalysis || null,
          is_confirmed: true,
          source: "scan"
        },
        items: items.map(item => ({
          food_name: item.name,
          name: item.name,
          calories: item.proteins * 4 + item.carbs * 4 + item.fats * 9,
          proteins: item.proteins,
          carbs: item.carbs,
          fats: item.fats,
          fiber: 0,
          sugar: 0,
          sodium_mg: 0,
          potassium_mg: 0,
          magnesium_mg: 0,
          calcium_mg: 0,
          iron_mg: 0,
          zinc_mg: 0,
          vitamin_c_mg: 0,
          vitamin_d_mcg: 0,
          vitamin_b9_mcg: 0,
          vitamin_b12_mcg: 0,
          vitamin_e_mg: 0,
          omega3_mg: 0,
          saturated_fat: 0,
          vitamin_b_mg: 0,
          quantity: parseFloat(item.quantity?.replace("g", "") || "100") || 100,
          unit_count: null,
          unit_label: null,
          unit_weight_g: null
        }))
      });

      toast({ title: "Repas enregistré !" });
      setPreview(null);
      setItems([]);
      setImageFile(null);
      onMealSaved();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const totals = computeTotals();

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {!preview && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-40 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 flex flex-col items-center justify-center gap-3 hover:border-primary/60 transition-colors active:scale-[0.98]"
        >
          <div className="w-14 h-14 rounded-full nutri-gradient flex items-center justify-center animate-pulse-ring">
            <Camera className="w-7 h-7 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-primary">Scanner mon repas</span>
        </button>
      )}

      {preview && (
        <div className="space-y-4 animate-fade-up">
          <div className="relative rounded-2xl overflow-hidden shadow-card">
            <img src={preview} alt="Repas" className="w-full h-48 object-cover" />
            {analyzing && (
              <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center">
                <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">Analyse en cours...</span>
                </div>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display font-semibold text-base">Aliments détectés</h3>
              {items.map((item, idx) => (
                <div key={idx} className="bg-card rounded-xl p-3 shadow-card space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{item.quantity}</span>
                    </div>
                    <button
                      onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                      className="p-1 rounded-lg hover:bg-muted"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>

                  {editingIdx === idx ? (
                    <div className="grid grid-cols-2 gap-2">
                      {(["proteins", "carbs", "fats"] as const).map((field) => (
                        <div key={field}>
                          <label className="text-[10px] text-muted-foreground capitalize">
                            {field === "proteins" ? "Protéines" : field === "carbs" ? "Glucides" : "Lipides"} (g)
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
                      <span>P: {item.proteins}g</span>
                      <span>G: {item.carbs}g</span>
                      <span>L: {item.fats}g</span>
                      <span className="ml-auto font-medium text-foreground">
                        {Math.round(item.proteins * 4 + item.carbs * 4 + item.fats * 9)} kcal
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
                <Button
                  onClick={() => {
                    setPreview(null);
                    setItems([]);
                    setImageFile(null);
                  }}
                  variant="outline"
                  className="flex-1 rounded-xl h-11"
                >
                  <X className="w-4 h-4 mr-1" /> Annuler
                </Button>
                <Button
                  onClick={saveMeal}
                  className="flex-1 rounded-xl h-11 nutri-gradient text-primary-foreground shadow-float hover:opacity-90"
                >
                  <Check className="w-4 h-4 mr-1" /> Valider
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MealScanner;
