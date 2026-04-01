import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Check, Search, Loader2, Trash2 } from "lucide-react";
import NumericInput from "./NumericInput";

interface Ingredient {
  name: string;
  weightG: number;
  per100: {
    proteins: number; carbs: number; fats: number; fiber: number; sugar: number;
    saturated_fat: number; omega3_mg: number; sodium_mg: number; potassium_mg: number;
    magnesium_mg: number; calcium_mg: number; vitamin_b: number; vitamin_c: number;
    vitamin_d: number; vitamin_e: number;
  };
}

interface RecipeBuilderProps {
  userId: string;
  onDone: () => void;
}

const RecipeBuilder: React.FC<RecipeBuilderProps> = ({ userId, onDone }) => {
  const [recipeName, setRecipeName] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [portions, setPortions] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchWeight, setSearchWeight] = useState("");
  const [searching, setSearching] = useState(false);

  const addIngredient = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      // Check custom foods first
      const { data: customFoods } = await supabase
        .from("custom_foods")
        .select("*")
        .eq("user_id", userId)
        .ilike("name", `%${searchQuery}%`)
        .limit(1);

      const weight = parseFloat(searchWeight) || 100;

      if (customFoods && customFoods.length > 0) {
        const cf = customFoods[0] as any;
        setIngredients((prev) => [...prev, {
          name: cf.name,
          weightG: weight,
          per100: {
            proteins: cf.proteins_per_100g, carbs: cf.carbs_per_100g, fats: cf.fats_per_100g,
            fiber: cf.fiber_per_100g || 0, sugar: cf.sugar_per_100g || 0,
            saturated_fat: cf.saturated_fat_per_100g || 0, omega3_mg: cf.omega3_mg_per_100g || 0,
            sodium_mg: cf.sodium_mg_per_100g || 0, potassium_mg: cf.potassium_mg_per_100g || 0,
            magnesium_mg: cf.magnesium_mg_per_100g || 0, calcium_mg: cf.calcium_mg_per_100g || 0,
            vitamin_b: cf.vitamin_b_per_100g || 0, vitamin_c: cf.vitamin_c_per_100g || 0,
            vitamin_d: cf.vitamin_d_per_100g || 0, vitamin_e: cf.vitamin_e_per_100g || 0,
          },
        }]);
      } else {
        // AI lookup
        const response = await supabase.functions.invoke("analyze-meal", {
          body: { text: `Donne-moi les valeurs nutritionnelles pour 100g de : ${searchQuery}` },
        });
        if (response.error) throw new Error(response.error.message);
        const item = response.data?.items?.[0];
        if (item) {
          const w = parseFloat(item.estimated_weight_g || item.weight_g || "100") || 100;
          setIngredients((prev) => [...prev, {
            name: item.name || searchQuery,
            weightG: weight,
            per100: {
              proteins: Math.round(((item.proteins || 0) / w) * 100 * 10) / 10,
              carbs: Math.round(((item.carbs || 0) / w) * 100 * 10) / 10,
              fats: Math.round(((item.fats || 0) / w) * 100 * 10) / 10,
              fiber: Math.round(((item.fiber || 0) / w) * 100 * 10) / 10,
              sugar: Math.round(((item.sugar || 0) / w) * 100 * 10) / 10,
              saturated_fat: Math.round(((item.saturated_fat || 0) / w) * 100 * 10) / 10,
              omega3_mg: Math.round(((item.omega3_mg || 0) / w) * 100 * 10) / 10,
              sodium_mg: Math.round(((item.sodium_mg || 0) / w) * 100 * 10) / 10,
              potassium_mg: Math.round(((item.potassium_mg || 0) / w) * 100 * 10) / 10,
              magnesium_mg: Math.round(((item.magnesium_mg || 0) / w) * 100 * 10) / 10,
              calcium_mg: Math.round(((item.calcium_mg || 0) / w) * 100 * 10) / 10,
              vitamin_b: 0, vitamin_c: 0, vitamin_d: 0, vitamin_e: 0,
            },
          }]);
        }
      }
      setSearchQuery("");
      setSearchWeight("");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  // Calculate totals
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

  // Per 100g of final product (considering portions)
  const portionWeightG = portions > 0 ? Math.round(totalWeightG / portions) : totalWeightG;
  const to100 = totalWeightG > 0 ? 100 / totalWeightG : 0;
  const per100 = {
    proteins: Math.round(totals.proteins * to100 * 10) / 10,
    carbs: Math.round(totals.carbs * to100 * 10) / 10,
    fats: Math.round(totals.fats * to100 * 10) / 10,
    calories: Math.round((totals.proteins * to100 * 4 + totals.carbs * to100 * 4 + totals.fats * to100 * 9)),
  };

  const saveAsProduct = async () => {
    if (!recipeName.trim()) {
      toast({ title: "Nom requis", variant: "destructive" });
      return;
    }
    if (ingredients.length === 0) {
      toast({ title: "Ajoutez au moins un ingrédient", variant: "destructive" });
      return;
    }
    try {
      await supabase.from("custom_foods").insert({
        user_id: userId,
        name: recipeName,
        serving_size_g: portionWeightG,
        calories_per_100g: per100.calories,
        proteins_per_100g: per100.proteins,
        carbs_per_100g: per100.carbs,
        fats_per_100g: per100.fats,
        fiber_per_100g: Math.round(totals.fiber * to100 * 10) / 10,
        sugar_per_100g: Math.round(totals.sugar * to100 * 10) / 10,
        saturated_fat_per_100g: Math.round(totals.saturated_fat * to100 * 10) / 10,
        omega3_mg_per_100g: Math.round(totals.omega3_mg * to100 * 10) / 10,
        sodium_mg_per_100g: Math.round(totals.sodium_mg * to100 * 10) / 10,
        potassium_mg_per_100g: Math.round(totals.potassium_mg * to100 * 10) / 10,
        magnesium_mg_per_100g: Math.round(totals.magnesium_mg * to100 * 10) / 10,
        calcium_mg_per_100g: Math.round(totals.calcium_mg * to100 * 10) / 10,
        vitamin_b_per_100g: Math.round(totals.vitamin_b * to100 * 10) / 10,
        vitamin_c_per_100g: Math.round(totals.vitamin_c * to100 * 10) / 10,
        vitamin_d_per_100g: Math.round(totals.vitamin_d * to100 * 10) / 10,
        vitamin_e_per_100g: Math.round(totals.vitamin_e * to100 * 10) / 10,
      } as any);
      toast({ title: "Produit créé à partir de la recette !" });
      onDone();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <h2 className="font-display font-semibold text-lg">Créer à partir d'ingrédients</h2>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Nom de la recette *</Label>
        <Input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="Ex: Mon granola maison" className="h-10 rounded-xl" />
      </div>

      {/* Search ingredient */}
      <div className="bg-card rounded-2xl p-3 shadow-card space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground">Ajouter un ingrédient</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Nom..." className="h-9 pl-8 rounded-lg text-sm" onKeyDown={(e) => e.key === "Enter" && addIngredient()} />
          </div>
          <Input value={searchWeight} onChange={(e) => setSearchWeight(e.target.value)} placeholder="g" className="h-9 w-16 rounded-lg text-sm text-center" type="number" />
          <Button size="sm" onClick={addIngredient} disabled={searching} className="h-9 rounded-lg nutri-gradient text-primary-foreground px-3">
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Ingredients list */}
      {ingredients.length > 0 && (
        <div className="space-y-1.5">
          {ingredients.map((ing, idx) => (
            <div key={idx} className="bg-card rounded-xl p-2.5 shadow-card flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{ing.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {ing.weightG}g · P:{Math.round(ing.per100.proteins * ing.weightG / 100)}g G:{Math.round(ing.per100.carbs * ing.weightG / 100)}g L:{Math.round(ing.per100.fats * ing.weightG / 100)}g
                </p>
              </div>
              <button onClick={() => removeIngredient(idx)} className="p-1 rounded-lg hover:bg-destructive/10">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Portions */}
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
            <Check className="w-4 h-4 mr-1" /> Créer le produit
          </Button>
        )}
      </div>
    </div>
  );
};

export default RecipeBuilder;
