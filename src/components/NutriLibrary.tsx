import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, X, Check, BookOpen, Camera, MessageSquareText, ScanBarcode, Loader2 } from "lucide-react";
import NumericInput from "./NumericInput";
import BarcodeScanner from "./BarcodeScanner";

interface CustomFood {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_size_g: number;
  calories_per_100g: number;
  proteins_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  fiber_per_100g: number;
  sodium_mg_per_100g: number;
  sugar_per_100g: number;
  saturated_fat_per_100g: number;
  omega3_mg_per_100g: number;
  potassium_mg_per_100g: number;
  magnesium_mg_per_100g: number;
  calcium_mg_per_100g: number;
  vitamin_b_per_100g: number;
  vitamin_c_per_100g: number;
  vitamin_d_per_100g: number;
  vitamin_e_per_100g: number;
}

interface NutriLibraryProps {
  userId: string;
}

type CreateMode = "manual" | "photo" | "text" | "barcode";

const emptyFood: Omit<CustomFood, "id"> = {
  name: "",
  brand: null,
  barcode: null,
  serving_size_g: 100,
  calories_per_100g: 0,
  proteins_per_100g: 0,
  carbs_per_100g: 0,
  fats_per_100g: 0,
  fiber_per_100g: 0,
  sodium_mg_per_100g: 0,
  sugar_per_100g: 0,
  saturated_fat_per_100g: 0,
  omega3_mg_per_100g: 0,
  potassium_mg_per_100g: 0,
  magnesium_mg_per_100g: 0,
  calcium_mg_per_100g: 0,
  vitamin_b_per_100g: 0,
  vitamin_c_per_100g: 0,
  vitamin_d_per_100g: 0,
  vitamin_e_per_100g: 0,
};

const NutriLibrary: React.FC<NutriLibraryProps> = ({ userId }) => {
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomFood | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<CustomFood, "id">>(emptyFood);
  const [createMode, setCreateMode] = useState<CreateMode>("manual");
  const [analyzing, setAnalyzing] = useState(false);
  const [textInput, setTextInput] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFoods();
  }, [userId]);

  const fetchFoods = async () => {
    const { data } = await supabase
      .from("custom_foods")
      .select("*")
      .eq("user_id", userId)
      .order("name");
    if (data) setFoods(data as any);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nom requis", variant: "destructive" });
      return;
    }
    const cals = Math.round(form.proteins_per_100g * 4 + form.carbs_per_100g * 4 + form.fats_per_100g * 9);
    try {
      if (editing) {
        await supabase.from("custom_foods").update({ ...form, calories_per_100g: cals } as any).eq("id", editing.id);
        toast({ title: "Aliment modifié !" });
      } else {
        await supabase.from("custom_foods").insert({ ...form, calories_per_100g: cals, user_id: userId } as any);
        toast({ title: "Aliment ajouté !" });
      }
      setEditing(null);
      setCreating(false);
      setForm(emptyFood);
      fetchFoods();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("custom_foods").delete().eq("id", id);
    toast({ title: "Aliment supprimé" });
    fetchFoods();
  };

  const startEdit = (food: CustomFood) => {
    setEditing(food);
    setCreating(true);
    setCreateMode("manual");
    setForm({
      name: food.name,
      brand: food.brand,
      barcode: food.barcode,
      serving_size_g: food.serving_size_g,
      calories_per_100g: food.calories_per_100g,
      proteins_per_100g: food.proteins_per_100g,
      carbs_per_100g: food.carbs_per_100g,
      fats_per_100g: food.fats_per_100g,
      fiber_per_100g: food.fiber_per_100g,
      sodium_mg_per_100g: food.sodium_mg_per_100g,
      sugar_per_100g: food.sugar_per_100g,
      saturated_fat_per_100g: food.saturated_fat_per_100g,
      omega3_mg_per_100g: food.omega3_mg_per_100g,
      potassium_mg_per_100g: food.potassium_mg_per_100g,
      magnesium_mg_per_100g: food.magnesium_mg_per_100g,
      calcium_mg_per_100g: food.calcium_mg_per_100g,
      vitamin_b_per_100g: food.vitamin_b_per_100g,
      vitamin_c_per_100g: food.vitamin_c_per_100g,
      vitamin_d_per_100g: food.vitamin_d_per_100g,
      vitamin_e_per_100g: food.vitamin_e_per_100g,
    });
  };

  const analyzeForLibrary = async (payload: { image?: string; text?: string }) => {
    setAnalyzing(true);
    try {
      const response = await supabase.functions.invoke("analyze-meal", { body: payload });
      if (response.error) throw new Error(response.error.message);
      const data = response.data;
      const item = data.items?.[0];
      if (item) {
        const weight = parseFloat(item.estimated_weight_g || item.weight_g || "100") || 100;
        setForm((prev) => ({
          ...prev,
          name: item.name || prev.name,
          proteins_per_100g: Math.round(((item.proteins || 0) / weight) * 100 * 10) / 10,
          carbs_per_100g: Math.round(((item.carbs || 0) / weight) * 100 * 10) / 10,
          fats_per_100g: Math.round(((item.fats || 0) / weight) * 100 * 10) / 10,
          fiber_per_100g: Math.round(((item.fiber || 0) / weight) * 100 * 10) / 10,
          sugar_per_100g: Math.round(((item.sugar || 0) / weight) * 100 * 10) / 10,
          sodium_mg_per_100g: Math.round(((item.sodium_mg || 0) / weight) * 100 * 10) / 10,
          saturated_fat_per_100g: Math.round(((item.saturated_fat || 0) / weight) * 100 * 10) / 10,
        }));
        setCreateMode("manual"); // Switch to manual to let user review
        toast({ title: "Données extraites par l'IA !", description: "Vérifiez et ajustez si nécessaire." });
      }
    } catch (e: any) {
      toast({ title: "Erreur d'analyse", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    await analyzeForLibrary({ image: base64 });
  };

  const handleTextAnalyze = async () => {
    if (!textInput.trim()) return;
    await analyzeForLibrary({ text: `Donne-moi les valeurs nutritionnelles pour 100g de : ${textInput}` });
  };

  const handleBarcodeProduct = (product: any) => {
    const weight = product.weight_g || 100;
    setForm((prev) => ({
      ...prev,
      name: product.name || prev.name,
      barcode: product.barcode || null,
      proteins_per_100g: Math.round(((product.proteins || 0) / weight) * 100 * 10) / 10,
      carbs_per_100g: Math.round(((product.carbs || 0) / weight) * 100 * 10) / 10,
      fats_per_100g: Math.round(((product.fats || 0) / weight) * 100 * 10) / 10,
    }));
    setCreateMode("manual");
    toast({ title: "Produit scanné !", description: "Vérifiez les données." });
  };

  const filtered = foods.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.brand && f.brand.toLowerCase().includes(search.toLowerCase()))
  );

  const updateField = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const modeTabs: { id: CreateMode; label: string; icon: React.ReactNode }[] = [
    { id: "manual", label: "Manuel", icon: <Pencil className="w-3.5 h-3.5" /> },
    { id: "photo", label: "Photo", icon: <Camera className="w-3.5 h-3.5" /> },
    { id: "text", label: "Texte", icon: <MessageSquareText className="w-3.5 h-3.5" /> },
    { id: "barcode", label: "Scan", icon: <ScanBarcode className="w-3.5 h-3.5" /> },
  ];

  if (creating) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h2 className="font-display font-semibold text-lg">{editing ? "Modifier" : "Nouvel"} aliment</h2>

        {/* Input mode tabs */}
        {!editing && (
          <div className="flex rounded-xl bg-muted p-1 gap-1">
            {modeTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCreateMode(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                  createMode === tab.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Photo mode */}
        {createMode === "photo" && (
          <div className="space-y-3">
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzing}
              className="w-full h-28 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 flex flex-col items-center justify-center gap-2 hover:border-primary/60 transition-colors"
            >
              {analyzing ? (
                <><Loader2 className="w-6 h-6 animate-spin text-primary" /><span className="text-xs text-primary">Analyse en cours...</span></>
              ) : (
                <><Camera className="w-6 h-6 text-primary" /><span className="text-xs font-semibold text-primary">Photographier l'étiquette</span></>
              )}
            </button>
          </div>
        )}

        {/* Text mode */}
        {createMode === "text" && (
          <div className="space-y-3">
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Ex: Blanc de poulet, Yaourt grec..."
              className="h-10 rounded-xl text-sm"
            />
            <Button
              onClick={handleTextAnalyze}
              disabled={analyzing || !textInput.trim()}
              className="w-full rounded-xl h-10 nutri-gradient text-primary-foreground"
            >
              {analyzing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyse...</> : "Analyser"}
            </Button>
          </div>
        )}

        {/* Barcode mode */}
        {createMode === "barcode" && (
          <BarcodeScanner onProductFound={handleBarcodeProduct} />
        )}

        {/* Manual form (always shown for manual mode, shown after AI analysis for other modes) */}
        {(createMode === "manual" || editing) && (
          <div className="bg-card rounded-2xl p-4 shadow-card space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nom *</Label>
              <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} className="h-10 rounded-xl" placeholder="Ex: Blanc de poulet" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Marque</Label>
                <Input value={form.brand || ""} onChange={(e) => updateField("brand", e.target.value)} className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Portion (g)</Label>
                <NumericInput value={form.serving_size_g} onChange={(v) => updateField("serving_size_g", v)} className="h-10 rounded-xl" />
              </div>
            </div>

            <h3 className="text-xs font-semibold text-muted-foreground pt-2">Macros pour 100g</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Protéines (g)</Label>
                <NumericInput value={form.proteins_per_100g} onChange={(v) => updateField("proteins_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Glucides (g)</Label>
                <NumericInput value={form.carbs_per_100g} onChange={(v) => updateField("carbs_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Lipides (g)</Label>
                <NumericInput value={form.fats_per_100g} onChange={(v) => updateField("fats_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
            </div>

            <div className="bg-accent rounded-xl p-2 text-center text-sm">
              Calories calculées : <strong className="text-primary">{Math.round(form.proteins_per_100g * 4 + form.carbs_per_100g * 4 + form.fats_per_100g * 9)} kcal/100g</strong>
            </div>

            <h3 className="text-xs font-semibold text-muted-foreground pt-2">Détails (optionnel)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Fibres (g)</Label>
                <NumericInput value={form.fiber_per_100g} onChange={(v) => updateField("fiber_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Sucres (g)</Label>
                <NumericInput value={form.sugar_per_100g} onChange={(v) => updateField("sugar_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Sodium (mg)</Label>
                <NumericInput value={form.sodium_mg_per_100g} onChange={(v) => updateField("sodium_mg_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">AG Saturés (g)</Label>
                <NumericInput value={form.saturated_fat_per_100g} onChange={(v) => updateField("saturated_fat_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Oméga-3 (mg)</Label>
                <NumericInput value={form.omega3_mg_per_100g} onChange={(v) => updateField("omega3_mg_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Potassium (mg)</Label>
                <NumericInput value={form.potassium_mg_per_100g} onChange={(v) => updateField("potassium_mg_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Magnésium (mg)</Label>
                <NumericInput value={form.magnesium_mg_per_100g} onChange={(v) => updateField("magnesium_mg_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Calcium (mg)</Label>
                <NumericInput value={form.calcium_mg_per_100g} onChange={(v) => updateField("calcium_mg_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Vit. B (mg)</Label>
                <NumericInput value={form.vitamin_b_per_100g} onChange={(v) => updateField("vitamin_b_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Vit. C (mg)</Label>
                <NumericInput value={form.vitamin_c_per_100g} onChange={(v) => updateField("vitamin_c_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Vit. D (µg)</Label>
                <NumericInput value={form.vitamin_d_per_100g} onChange={(v) => updateField("vitamin_d_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Vit. E (mg)</Label>
                <NumericInput value={form.vitamin_e_per_100g} onChange={(v) => updateField("vitamin_e_per_100g", v)} className="h-9 rounded-lg text-sm" />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => { setCreating(false); setEditing(null); setForm(emptyFood); setTextInput(""); }}>
            <X className="w-4 h-4 mr-1" /> Annuler
          </Button>
          {(createMode === "manual" || editing) && (
            <Button className="flex-1 rounded-xl h-11 nutri-gradient text-primary-foreground" onClick={handleSave}>
              <Check className="w-4 h-4 mr-1" /> {editing ? "Modifier" : "Ajouter"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">Mes Produits</h2>
        <Button size="sm" className="rounded-xl nutri-gradient text-primary-foreground" onClick={() => { setCreating(true); setForm(emptyFood); setCreateMode("manual"); }}>
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9 h-10 rounded-xl" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <BookOpen className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Aucun aliment personnalisé</p>
          <p className="text-xs">Ajoutez vos produits habituels pour une analyse plus précise</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((food) => (
            <div key={food.id} className="bg-card rounded-xl p-3 shadow-card flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">✓</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{food.name}</p>
                {food.brand && <p className="text-[10px] text-muted-foreground">{food.brand}</p>}
                <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span>P:{food.proteins_per_100g}g</span>
                  <span>G:{food.carbs_per_100g}g</span>
                  <span>L:{food.fats_per_100g}g</span>
                  <span className="text-foreground font-medium">{food.calories_per_100g} kcal/100g</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[9px] text-muted-foreground mt-1">
                  {food.fiber_per_100g > 0 && <span>Fibres:{food.fiber_per_100g}g</span>}
                  {food.sodium_mg_per_100g > 0 && <span>Na:{food.sodium_mg_per_100g}mg</span>}
                  {food.omega3_mg_per_100g > 0 && <span>Ω3:{food.omega3_mg_per_100g}mg</span>}
                  {food.vitamin_c_per_100g > 0 && <span>VitC:{food.vitamin_c_per_100g}mg</span>}
                  {food.vitamin_d_per_100g > 0 && <span>VitD:{food.vitamin_d_per_100g}µg</span>}
                </div>
              </div>
              <div className="flex gap-0.5 flex-shrink-0">
                <button onClick={() => startEdit(food)} className="p-1.5 rounded-lg hover:bg-accent">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => handleDelete(food.id)} className="p-1.5 rounded-lg hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NutriLibrary;
