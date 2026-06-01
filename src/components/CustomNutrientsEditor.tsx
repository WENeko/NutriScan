/**
 * CRUD pour les nutriments personnalisés de l'utilisateur.
 * Stocke dans profiles.custom_nutrients (JSONB) — typage : CustomNutrientDef[].
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, FlaskConical, Save, X, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  type CustomNutrientDef,
  validateCustomNutrient,
} from "@/utils/nutrients-helpers";
import { useMicroCategories } from "@/hooks/useMicroCategories";

interface Props {
  userId: string;
}

const UNIT_OPTIONS = ["g", "mg", "µg", "kcal", "kJ", "IU", "ml"] as const;
const UNIT_SUFFIX: Record<string, string> = { g: "g", mg: "mg", "µg": "mcg", kcal: "kcal", kJ: "kj", IU: "iu", ml: "ml" };

const EMPTY: Partial<CustomNutrientDef> = {
  key: "",
  label: "",
  unit: "mg",
  category: "vitamin",
  goal: undefined,
  is_limit: false,
};

// Catégories chargées depuis micronutrient_categories (cf. useMicroCategories)

/** Génère une clé technique à partir du label + unité. */
function generateKey(label: string, unit: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  const suffix = UNIT_SUFFIX[unit] ?? unit.toLowerCase();
  return slug ? `${slug}_${suffix}` : "";
}

const CustomNutrientsEditor: React.FC<Props> = ({ userId }) => {
  const { categories } = useMicroCategories();
  const [items, setItems] = useState<CustomNutrientDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<CustomNutrientDef> | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [userId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("custom_nutrients")
      .eq("user_id", userId)
      .single();
    if (error) {
      toast({ title: "Erreur de chargement", description: error.message, variant: "destructive" });
    } else {
      const arr = Array.isArray((data as any)?.custom_nutrients) ? (data as any).custom_nutrients : [];
      setItems(arr as CustomNutrientDef[]);
    }
    setLoading(false);
  }

  async function persist(next: CustomNutrientDef[]) {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ custom_nutrients: next as any })
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
      return false;
    }
    setItems(next);
    return true;
  }

  function startCreate() {
    setEditKey(null);
    setDraft({ ...EMPTY });
  }

  function startEdit(n: CustomNutrientDef) {
    setEditKey(n.key);
    setDraft({ ...n });
  }

  function cancelDraft() {
    setDraft(null);
    setEditKey(null);
  }

  async function submitDraft() {
    if (!draft) return;
    const existingKeys = items.filter((i) => i.key !== editKey).map((i) => i.key);
    const v = validateCustomNutrient(draft, existingKeys);
    if (v.ok !== true) {
      toast({ title: "Champs invalides", description: (v as { error: string }).error, variant: "destructive" });
      return;
    }
    const value = v.value;

    // Génère (ou régénère) la description IA pour le tooltip si absente ou si le
    // label/objectif a changé en édition.
    const prev = editKey ? items.find((i) => i.key === editKey) : undefined;
    const needsDesc =
      !value.description ||
      !prev ||
      prev.label !== value.label ||
      prev.unit !== value.unit ||
      prev.goal !== value.goal ||
      prev.is_limit !== value.is_limit;
    if (needsDesc) {
      try {
        const { data, error } = await supabase.functions.invoke("describe-nutrient", {
          body: {
            label: value.label,
            unit: value.unit,
            goal: value.goal,
            is_limit: value.is_limit,
            category: value.category,
          },
        });
        if (!error && data?.description) {
          value.description = String(data.description).slice(0, 240);
        } else if (prev?.description) {
          value.description = prev.description;
        }
      } catch {
        if (prev?.description) value.description = prev.description;
      }
    }

    const next = editKey
      ? items.map((i) => (i.key === editKey ? value : i))
      : [...items, value];
    const ok = await persist(next);
    if (ok) {
      toast({ title: editKey ? "Nutriment modifié" : "Nutriment ajouté" });
      cancelDraft();
    }

  }

  async function remove(key: string) {
    if (!confirm("Supprimer ce nutriment custom ?")) return;
    const next = items.filter((i) => i.key !== key);
    const ok = await persist(next);
    if (ok) toast({ title: "Supprimé" });
  }

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Nutriments personnalisés</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Ajoutez des nutriments à suivre en plus de la liste standard. Ils seront
        enregistrés dans <code className="text-[10px]">nutrients_custom</code> de chaque repas.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-2">
          {items.length === 0 && !draft && (
            <p className="text-xs text-muted-foreground italic">Aucun nutriment personnalisé.</p>
          )}
          {items.map((n) => (
            <div
              key={n.key}
              className="flex items-center gap-2 bg-accent rounded-xl p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {n.label} <span className="text-xs text-muted-foreground">({n.unit})</span>
                  {n.is_limit ? (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-destructive bg-destructive/10 rounded px-1 py-0.5">
                      <ArrowDown className="w-2.5 h-2.5" /> Max
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-primary bg-primary/10 rounded px-1 py-0.5">
                      <ArrowUp className="w-2.5 h-2.5" /> Min
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {n.key} · {n.category}{n.goal != null ? ` · obj. ${n.goal}${n.unit}` : ""}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(n)} aria-label="Modifier">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(n.key)} aria-label="Supprimer">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}

          {draft ? (
            <div className="bg-accent rounded-xl p-3 space-y-2 animate-fade-up">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Nom</Label>
                  <Input
                    value={draft.label ?? ""}
                    onChange={(e) => {
                      const label = e.target.value;
                      setDraft((d) => {
                        const next = { ...(d ?? {}), label };
                        if (!editKey) next.key = generateKey(label, next.unit ?? "mg");
                        return next;
                      });
                    }}
                    placeholder="Choline"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Unité</Label>
                  <select
                    value={draft.unit ?? "mg"}
                    onChange={(e) => {
                      const unit = e.target.value;
                      setDraft((d) => {
                        const next = { ...(d ?? {}), unit };
                        if (!editKey) next.key = generateKey(next.label ?? "", unit);
                        return next;
                      });
                    }}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Catégorie</Label>
                  <select
                    value={draft.category ?? "vitamin"}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value as CustomNutrientDef["category"] })}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Clé technique (auto)</Label>
                  <Input
                    value={draft.key ?? ""}
                    readOnly
                    disabled
                    className="h-9 font-mono text-xs opacity-70"
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Objectif quotidien (optionnel)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.goal ?? ""}
                    onChange={(e) => setDraft({ ...draft, goal: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="400"
                    className="h-9"
                  />
                </div>

                <div className="col-span-2 flex items-center justify-between bg-card rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    {draft.is_limit ? (
                      <ArrowDown className="w-4 h-4 text-destructive" />
                    ) : (
                      <ArrowUp className="w-4 h-4 text-primary" />
                    )}
                    <div>
                      <div className="text-xs font-semibold">
                        {draft.is_limit ? "Limite à ne pas dépasser" : "Minimum à atteindre"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Affecte la coloration des graphiques
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={!!draft.is_limit}
                    onCheckedChange={(v) => setDraft({ ...draft, is_limit: v })}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitDraft} disabled={saving} className="flex-1 h-9">
                  <Save className="w-4 h-4 mr-1" />
                  {editKey ? "Modifier" : "Ajouter"}
                </Button>
                <Button onClick={cancelDraft} variant="ghost" className="h-9">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={startCreate} variant="outline" className="w-full h-10 rounded-xl">
              <Plus className="w-4 h-4 mr-1" />
              Ajouter un nutriment
            </Button>
          )}
        </div>
      )}
    </section>
  );
};

export default CustomNutrientsEditor;
