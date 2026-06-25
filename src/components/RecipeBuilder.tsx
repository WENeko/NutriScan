import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Check, Loader2, Trash2, MessageSquareText, ScanBarcode, BadgeCheck } from "lucide-react";
import NumericInput from "./NumericInput";
import BarcodeScanner from "./BarcodeScanner";

interface Per100 {
  proteins: number; carbs: number; fats: number; fiber: number; sugar: number;
  saturated_fat: number; omega3_mg: number; sodium_mg: number; potassium_mg: number;
  magnesium_mg: number; calcium_mg: number; vitamin_b: number; vitamin_c: number;
  vitamin_d: number; vitamin_e: number;
}

interface Ingredient {
  id?: string;
  name: string;
  weightG: number;
  isCustom?: boolean;
  per100: Per100;
}

interface RecipeBuilderProps {
  userId: string;
  onDone: () => void;
  editFoodId?: string;
}

type AddMode = "manual" | "text" | "barcode";

const emptyPer100 = (): Per100 => ({
  proteins: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0,
  saturated_fat: 0, omega3_mg: 0, sodium_mg: 0, potassium_mg: 0,
  magnesium_mg: 0, calcium_mg: 0, vitamin_b: 0, vitamin_c: 0, vitamin_d: 0, vitamin_e: 0,
});

// Correspondance Per100 (vitamin_b/c/d/e) <-> nutrients_std (vitamin_b_mg/vitamin_c_mg/…)
const PER100_TO_STD: Partial<Record<keyof Per100, string>> = {
  fiber: "fiber", sugar: "sugar", saturated_fat: "saturated_fat", omega3_mg: "omega3_mg",
  sodium_mg: "sodium_mg", potassium_mg: "potassium_mg", magnesium_mg: "magnesium_mg", calcium_mg: "calcium_mg",
  vitamin_b: "vitamin_b_mg", vitamin_c: "vitamin_c_mg", vitamin_d: "vitamin_d_mcg", vitamin_e: "vitamin_e_mg",
};

/** Reconstruit les micros Per100 depuis un map nutrients_std. */
const stdToPer100Micros = (std: Record<string, number> = {}): Partial<Per100> => {
  const out: Partial<Per100> = {};
  (Object.keys(PER100_TO_STD) as (keyof Per100)[]).forEach((k) => {
    const sk = PER100_TO_STD[k];
    if (sk) (out as any)[k] = Number(std[sk]) || 0;
  });
  return out;
};

/** Convertit les micros Per100 en map nutrients_std. */
const per100MicrosToStd = (p: Per100): Record<string, number> => {
  const out: Record<string, number> = {};
  (Object.keys(PER100_TO_STD) as (keyof Per100)[]).forEach((k) => {
    const sk = PER100_TO_STD[k];
    const v = Number(p[k]);
    if (sk && Number.isFinite(v) && v > 0) out[sk] = v;
  });
  return out;
};

const toPer100FromItem = (item: any, weight: number): Per100 => {
  const w = weight > 0 ? weight : 100;
  const r = (v: number) => Math.round((v / w) * 100 * 10) / 10;
  return {
    proteins: r(item.proteins || 0),
    carbs: r(item.carbs || 0),
    fats: r(item.fats || 0),
    fiber: r(item.fiber || 0),
    sugar: r(item.sugar || 0),
    saturated_fat: r(item.saturated_fat || 0),
    omega3_mg: r(item.omega3_mg || 0),
    sodium_mg: r(item.sodium_mg || 0),
    potassium_mg: r(item.potassium_mg || 0),
    magnesium_mg: r(item.magnesium_mg || 0),
    calcium_mg: r(item.calcium_mg || 0),
    vitamin_b: r(item.vitamin_b_mg || 0),
    vitamin_c: r(item.vitamin_c_mg || 0),
    vitamin_d: r(item.vitamin_d_mcg || 0),
    vitamin_e: r(item.vitamin_e_mg || 0),
  };
};

const RecipeBuilder: React.FC<RecipeBuilderProps> = ({ userId, onDone, editFoodId }) => {
  const [recipeName, setRecipeName] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [portions, setPortions] = useState(1);

  // Add ingredient state (mirrors MealHistory edit)
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [addManualName, setAddManualName] = useState("");
  const [addManualWeight, setAddManualWeight] = useState("");
  const [addTextInput, setAddTextInput] = useState("");
  const [addAnalyzing, setAddAnalyzing] = useState(false);

  useEffect(() => {
    if (editFoodId) loadExistingRecipe();
  }, [editFoodId]);

  const loadExistingRecipe = async () => {
    if (!editFoodId) return;
    const { data: food } = await supabase
      .from("custom_foods")
      .select("name, serving_size_g")
      .eq("id", editFoodId)
      .single();
    if (food) setRecipeName((food as any).name);

    const { data: ings } = await supabase
      .from("recipe_ingredients" as any)
      .select("*")
      .eq("custom_food_id", editFoodId)
      .order("created_at");

    if (ings && (ings as any[]).length > 0) {
      const loaded = (ings as any[]).map((ing: any) => ({
        id: ing.id,
        name: ing.name,
        weightG: Number(ing.weight_g),
        per100: {
          ...emptyPer100(),
          proteins: Number(ing.proteins_per_100g), carbs: Number(ing.carbs_per_100g), fats: Number(ing.fats_per_100g),
          ...stdToPer100Micros((ing.nutrients_std || {}) as Record<string, number>),
        },
      }));
      setIngredients(loaded);
      const totalW = loaded.reduce((s, i) => s + i.weightG, 0);
      const servingG = Number((food as any)?.serving_size_g) || totalW;
      if (servingG > 0 && totalW > 0) {
        setPortions(Math.max(1, Math.round(totalW / servingG)));
      }
    }
  };

  // CRUD: update name
  const updateIngredientName = (idx: number, name: string) => {
    setIngredients((prev) => prev.map((ing, i) => i === idx ? { ...ing, name } : ing));
  };

  // CRUD: update weight
  const updateIngredientWeight = (idx: number, newWeight: number) => {
    setIngredients((prev) => prev.map((ing, i) => i === idx ? { ...ing, weightG: newWeight } : ing));
  };

  // CRUD: delete
  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  // CRUD: add manual (custom food first, then AI fallback)
  const addIngredientManual = async () => {
    if (!addManualName.trim()) return;
    const userWeight = parseFloat(addManualWeight);
    const hasUserWeight = !isNaN(userWeight) && userWeight > 0;
    setAddAnalyzing(true);
    try {
      const { data: customFoods } = await supabase
        .from("custom_foods")
        .select("*")
        .eq("user_id", userId)
        .ilike("name", `%${addManualName}%`)
        .limit(1);

      if (customFoods && customFoods.length > 0) {
        const cf = customFoods[0] as any;
        let weight = hasUserWeight ? userWeight : 100;
        if (!hasUserWeight) {
          try {
            const resp = await supabase.functions.invoke("analyze-meal", { body: { text: addManualName } });
            const aiItem = resp.data?.items?.[0];
            if (aiItem) weight = parseFloat(aiItem.estimated_weight_g || aiItem.weight_g || "100") || 100;
          } catch {}
        }
        setIngredients((prev) => [...prev, {
          name: cf.name,
          weightG: weight,
          isCustom: true,
          per100: {
            ...emptyPer100(),
            proteins: cf.proteins_per_100g, carbs: cf.carbs_per_100g, fats: cf.fats_per_100g,
            ...stdToPer100Micros((cf.nutrients_std || {}) as Record<string, number>),
          },
        }]);
      } else {
        const textPrompt = hasUserWeight ? `${userWeight}g de ${addManualName}` : addManualName;
        const response = await supabase.functions.invoke("analyze-meal", { body: { text: textPrompt } });
        if (response.error) throw new Error(response.error.message);
        const item = response.data?.items?.[0];
        if (item) {
          const w = hasUserWeight ? userWeight : (parseFloat(item.estimated_weight_g || item.weight_g || "100") || 100);
          setIngredients((prev) => [...prev, {
            name: item.name || addManualName,
            weightG: w,
            per100: toPer100FromItem(item, w),
          }]);
        }
      }
      toast({ title: "Ingrédient ajouté !" });
      setAddManualName("");
      setAddManualWeight("");
      setAddMode(null);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAddAnalyzing(false);
    }
  };

  // CRUD: add via AI text
  const addIngredientText = async () => {
    if (!addTextInput.trim()) return;
    setAddAnalyzing(true);
    try {
      const response = await supabase.functions.invoke("analyze-meal", { body: { text: addTextInput } });
      if (response.error) throw new Error(response.error.message);
      const item = response.data?.items?.[0];
      if (item) {
        const w = parseFloat(item.estimated_weight_g || item.weight_g || "100") || 100;
        setIngredients((prev) => [...prev, {
          name: item.name || addTextInput,
          weightG: w,
          per100: toPer100FromItem(item, w),
        }]);
        toast({ title: "Ingrédient ajouté !" });
      }
      setAddTextInput("");
      setAddMode(null);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAddAnalyzing(false);
    }
  };

  // CRUD: add via barcode
  const handleBarcodeProduct = (product: any) => {
    const weight = product.weight_g || 100;
    setIngredients((prev) => [...prev, {
      name: product.name,
      weightG: weight,
      per100: toPer100FromItem(product, weight),
    }]);
    setAddMode(null);
    toast({ title: "Produit ajouté !" });
  };

  // Totals
  const totalWeightG = ingredients.reduce((sum, ing) => sum + ing.weightG, 0);
  const totals = ingredients.reduce((acc, ing) => {
    const ratio = ing.weightG / 100;
    return {
      proteins: acc.proteins + ing.per100.proteins * ratio,
      carbs: acc.carbs + ing.per100.carbs * ratio,
      fats: acc.fats + ing.per100.fats * ratio,
      fiber: acc.fiber + ing.per100.fiber * ratio,
      sugar: acc.sugar + ing.per100.sugar * ratio,
      saturated_fat: acc.saturated_fat + ing.per100.saturated_fat * ratio,
      omega3_mg: acc.omega3_mg + ing.per100.omega3_mg * ratio,
      sodium_mg: acc.sodium_mg + ing.per100.sodium_mg * ratio,
      potassium_mg: acc.potassium_mg + ing.per100.potassium_mg * ratio,
      magnesium_mg: acc.magnesium_mg + ing.per100.magnesium_mg * ratio,
      calcium_mg: acc.calcium_mg + ing.per100.calcium_mg * ratio,
      vitamin_b: acc.vitamin_b + ing.per100.vitamin_b * ratio,
      vitamin_c: acc.vitamin_c + ing.per100.vitamin_c * ratio,
      vitamin_d: acc.vitamin_d + ing.per100.vitamin_d * ratio,
      vitamin_e: acc.vitamin_e + ing.per100.vitamin_e * ratio,
    };
  }, { proteins: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, saturated_fat: 0, omega3_mg: 0, sodium_mg: 0, potassium_mg: 0, magnesium_mg: 0, calcium_mg: 0, vitamin_b: 0, vitamin_c: 0, vitamin_d: 0, vitamin_e: 0 });

  const portionWeightG = portions > 0 ? Math.round(totalWeightG / portions) : totalWeightG;
  const to100 = totalWeightG > 0 ? 100 / totalWeightG : 0;
  const per100 = {
    proteins: Math.round(totals.proteins * to100 * 10) / 10,
    carbs: Math.round(totals.carbs * to100 * 10) / 10,
    fats: Math.round(totals.fats * to100 * 10) / 10,
    calories: Math.round((totals.proteins * to100 * 4 + totals.carbs * to100 * 4 + totals.fats * to100 * 9)),
  };

  const saveAsProduct = async () => {
    if (!recipeName.trim()) { toast({ title: "Nom requis", variant: "destructive" }); return; }
    if (ingredients.length === 0) { toast({ title: "Ajoutez au moins un ingrédient", variant: "destructive" }); return; }
    try {
      const recipePer100: Per100 = {
        proteins: per100.proteins, carbs: per100.carbs, fats: per100.fats,
        fiber: Math.round(totals.fiber * to100 * 10) / 10,
        sugar: Math.round(totals.sugar * to100 * 10) / 10,
        saturated_fat: Math.round(totals.saturated_fat * to100 * 10) / 10,
        omega3_mg: Math.round(totals.omega3_mg * to100 * 10) / 10,
        sodium_mg: Math.round(totals.sodium_mg * to100 * 10) / 10,
        potassium_mg: Math.round(totals.potassium_mg * to100 * 10) / 10,
        magnesium_mg: Math.round(totals.magnesium_mg * to100 * 10) / 10,
        calcium_mg: Math.round(totals.calcium_mg * to100 * 10) / 10,
        vitamin_b: Math.round(totals.vitamin_b * to100 * 10) / 10,
        vitamin_c: Math.round(totals.vitamin_c * to100 * 10) / 10,
        vitamin_d: Math.round(totals.vitamin_d * to100 * 10) / 10,
        vitamin_e: Math.round(totals.vitamin_e * to100 * 10) / 10,
      };
      const foodData = {
        user_id: userId,
        name: recipeName,
        serving_size_g: portionWeightG,
        calories_per_100g: per100.calories,
        proteins_per_100g: per100.proteins,
        carbs_per_100g: per100.carbs,
        fats_per_100g: per100.fats,
        nutrients_std: per100MicrosToStd(recipePer100),
        nutrients_custom: {},
      };

      let foodId = editFoodId;
      if (editFoodId) {
        await supabase.from("custom_foods").update(foodData as any).eq("id", editFoodId);
        await (supabase.from("recipe_ingredients" as any) as any).delete().eq("custom_food_id", editFoodId);
      } else {
        const { data: newFood } = await supabase.from("custom_foods").insert(foodData as any).select("id").single();
        foodId = (newFood as any)?.id;
      }

      if (foodId) {
        const ingRows = ingredients.map((ing) => ({
          custom_food_id: foodId,
          name: ing.name,
          weight_g: ing.weightG,
          proteins_per_100g: ing.per100.proteins,
          carbs_per_100g: ing.per100.carbs,
          fats_per_100g: ing.per100.fats,
          nutrients_std: per100MicrosToStd(ing.per100),
          nutrients_custom: {},
        }));
        await (supabase.from("recipe_ingredients" as any) as any).insert(ingRows);
      }

      toast({ title: editFoodId ? "Recette mise à jour !" : "Produit créé à partir de la recette !" });
      onDone();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <h2 className="font-display font-semibold text-lg">
        {editFoodId ? "Modifier la recette" : "Créer à partir d'ingrédients"}
      </h2>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Nom de la recette *</Label>
        <Input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="Ex: Mon granola maison" className="h-10 rounded-xl" />
      </div>

      {/* Ingredients list — full CRUD inline */}
      {ingredients.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-semibold text-muted-foreground">Ingrédients</h4>
          {ingredients.map((ing, i) => (
            <div key={ing.id || i} className="bg-card rounded-lg p-2 space-y-1.5 shadow-card">
              <div className="flex items-center gap-2">
                {ing.isCustom && <BadgeCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                <Input
                  value={ing.name}
                  onChange={(e) => updateIngredientName(i, e.target.value)}
                  className="h-7 text-xs rounded-md flex-1"
                />
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={ing.weightG}
                    onChange={(v) => updateIngredientWeight(i, v)}
                    className="w-16 h-7 text-xs rounded-md text-center"
                  />
                  <span className="text-[10px] text-muted-foreground">g</span>
                </div>
                <span className="text-[10px] text-muted-foreground w-10 text-right">
                  {Math.round((ing.per100.proteins * 4 + ing.per100.carbs * 4 + ing.per100.fats * 9) * ing.weightG / 100)}
                </span>
                <button onClick={() => removeIngredient(i)} className="p-1 rounded hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground pl-1">
                P:{Math.round(ing.per100.proteins * ing.weightG / 100)}g
                · G:{Math.round(ing.per100.carbs * ing.weightG / 100)}g
                · L:{Math.round(ing.per100.fats * ing.weightG / 100)}g
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add ingredient: manual / text / barcode */}
      {addMode === null && (
        <div className="flex gap-1.5">
          <button onClick={() => setAddMode("manual")} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-primary/30 text-xs font-semibold text-primary">
            <Plus className="w-3.5 h-3.5" /> Ajouter un ingrédient
          </button>
          <button onClick={() => setAddMode("text")} className="p-2 rounded-lg border border-dashed border-primary/30 text-primary" title="Décrire en texte">
            <MessageSquareText className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setAddMode("barcode")} className="p-2 rounded-lg border border-dashed border-primary/30 text-primary" title="Scanner code-barres">
            <ScanBarcode className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {addMode === "manual" && (
        <div className="bg-card rounded-lg p-2 space-y-2 animate-fade-up shadow-card">
          <div className="flex gap-2">
            <Input value={addManualName} onChange={(e) => setAddManualName(e.target.value)} placeholder="Nom" className="h-8 text-xs rounded-md flex-1" />
            <Input value={addManualWeight} onChange={(e) => setAddManualWeight(e.target.value)} placeholder="g" className="h-8 text-xs rounded-md w-16" type="number" />
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setAddMode(null)} className="flex-1 py-1.5 text-xs rounded-md bg-muted">Annuler</button>
            <button onClick={addIngredientManual} disabled={addAnalyzing} className="flex-1 py-1.5 text-xs rounded-md nutri-gradient text-primary-foreground">
              {addAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Ajouter"}
            </button>
          </div>
        </div>
      )}

      {addMode === "text" && (
        <div className="bg-card rounded-lg p-2 space-y-2 animate-fade-up shadow-card">
          <Input value={addTextInput} onChange={(e) => setAddTextInput(e.target.value)} placeholder="Ex: 200g de riz blanc" className="h-8 text-xs rounded-md" />
          <div className="flex gap-1.5">
            <button onClick={() => setAddMode(null)} className="flex-1 py-1.5 text-xs rounded-md bg-muted">Annuler</button>
            <button onClick={addIngredientText} disabled={addAnalyzing} className="flex-1 py-1.5 text-xs rounded-md nutri-gradient text-primary-foreground">
              {addAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Analyser"}
            </button>
          </div>
        </div>
      )}

      {addMode === "barcode" && (
        <div className="animate-fade-up">
          <BarcodeScanner onProductFound={handleBarcodeProduct} />
          <button onClick={() => setAddMode(null)} className="w-full py-1.5 text-xs rounded-md bg-muted mt-1">Annuler</button>
        </div>
      )}

      {/* Portions + summary */}
      {ingredients.length > 0 && (
        <div className="bg-card rounded-2xl p-3 shadow-card space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Nombre de portions</Label>
            <NumericInput value={portions} onChange={(v) => setPortions(Math.max(1, v))} className="h-9 w-20 rounded-lg text-sm text-center" />
          </div>
          <div className="bg-accent rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold">Total : {Math.round(totalWeightG)}g → {portions} portion(s) de {portionWeightG}g</p>
            <div className="text-[10px] text-muted-foreground">
              Pour 100g : <span className="font-medium text-foreground">{per100.calories} kcal</span> · P:{per100.proteins}g · G:{per100.carbs}g · L:{per100.fats}g
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={onDone}>
          <X className="w-4 h-4 mr-1" /> Annuler
        </Button>
        {ingredients.length > 0 && (
          <Button className="flex-1 rounded-xl h-11 nutri-gradient text-primary-foreground" onClick={saveAsProduct}>
            <Check className="w-4 h-4 mr-1" /> {editFoodId ? "Mettre à jour" : "Créer le produit"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default RecipeBuilder;
