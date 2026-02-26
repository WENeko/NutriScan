import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, X, Check, BookOpen } from "lucide-react";

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
}

interface NutriLibraryProps {
  userId: string;
}

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
};

const NutriLibrary: React.FC<NutriLibraryProps> = ({ userId }) => {
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomFood | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<CustomFood, "id">>(emptyFood);

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
    // Auto-calc calories from macros
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
    });
  };

  const filtered = foods.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.brand && f.brand.toLowerCase().includes(search.toLowerCase()))
  );

  const updateField = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (creating) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h2 className="font-display font-semibold text-lg">{editing ? "Modifier" : "Nouvel"} aliment</h2>

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
              <Input type="number" value={form.serving_size_g} onChange={(e) => updateField("serving_size_g", Number(e.target.value))} className="h-10 rounded-xl" />
            </div>
          </div>

          <h3 className="text-xs font-semibold text-muted-foreground pt-2">Macros pour 100g</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Protéines (g)</Label>
              <Input type="number" value={form.proteins_per_100g} onChange={(e) => updateField("proteins_per_100g", Number(e.target.value))} className="h-9 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Glucides (g)</Label>
              <Input type="number" value={form.carbs_per_100g} onChange={(e) => updateField("carbs_per_100g", Number(e.target.value))} className="h-9 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Lipides (g)</Label>
              <Input type="number" value={form.fats_per_100g} onChange={(e) => updateField("fats_per_100g", Number(e.target.value))} className="h-9 rounded-lg text-sm" />
            </div>
          </div>

          <div className="bg-accent rounded-xl p-2 text-center text-sm">
            Calories calculées : <strong className="text-primary">{Math.round(form.proteins_per_100g * 4 + form.carbs_per_100g * 4 + form.fats_per_100g * 9)} kcal/100g</strong>
          </div>

          <h3 className="text-xs font-semibold text-muted-foreground pt-2">Détails (optionnel)</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Fibres (g)</Label>
              <Input type="number" value={form.fiber_per_100g} onChange={(e) => updateField("fiber_per_100g", Number(e.target.value))} className="h-9 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Sucres (g)</Label>
              <Input type="number" value={form.sugar_per_100g} onChange={(e) => updateField("sugar_per_100g", Number(e.target.value))} className="h-9 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Sodium (mg)</Label>
              <Input type="number" value={form.sodium_mg_per_100g} onChange={(e) => updateField("sodium_mg_per_100g", Number(e.target.value))} className="h-9 rounded-lg text-sm" />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => { setCreating(false); setEditing(null); setForm(emptyFood); }}>
            <X className="w-4 h-4 mr-1" /> Annuler
          </Button>
          <Button className="flex-1 rounded-xl h-11 nutri-gradient text-primary-foreground" onClick={handleSave}>
            <Check className="w-4 h-4 mr-1" /> {editing ? "Modifier" : "Ajouter"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">Mes Produits</h2>
        <Button size="sm" className="rounded-xl nutri-gradient text-primary-foreground" onClick={() => { setCreating(true); setForm(emptyFood); }}>
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
