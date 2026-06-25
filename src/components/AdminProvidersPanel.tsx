/**
 * Panneau admin : gestion des fournisseurs d'IA (évolutif, sans toucher au code).
 * Visible uniquement par les administrateurs (rôle 'admin').
 *
 * L'admin définit nom, type d'API (Gemini ou compatible OpenAI), URL de base,
 * endpoint de liste des modèles et l'état actif. Chaque utilisateur saisira
 * ensuite sa propre clé pour le fournisseur dans ses réglages.
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Server, Plus, Trash2, Save, X, Pencil, Loader2 } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { type AiProvider } from "@/lib/aiProviders";

interface Props {
  userId: string;
}

type Draft = {
  id?: string;
  name: string;
  api_type: "gemini" | "openai" | "local";
  base_url: string;
  models_endpoint: string;
  is_active: boolean;
};

const EMPTY: Draft = {
  name: "",
  api_type: "openai",
  base_url: "",
  models_endpoint: "/models",
  is_active: true,
};

const AdminProvidersPanel: React.FC<Props> = ({ userId }) => {
  const { isAdmin, loading: roleLoading } = useIsAdmin(userId);
  const [rows, setRows] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_providers")
      .select("id, name, api_type, base_url, models_endpoint, is_active, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) toast({ title: "Chargement KO", description: error.message, variant: "destructive" });
    else setRows((data as AiProvider[]) ?? []);
    setLoading(false);
  }

  function startCreate() {
    setDraft({ ...EMPTY });
  }

  function startEdit(p: AiProvider) {
    setDraft({
      id: p.id,
      name: p.name,
      api_type: p.api_type,
      base_url: p.base_url,
      models_endpoint: p.models_endpoint,
      is_active: p.is_active,
    });
  }

  function onTypeChange(t: "gemini" | "openai" | "local") {
    setDraft((d) =>
      d
        ? {
            ...d,
            api_type: t,
            base_url:
              d.base_url ||
              (t === "gemini" ? "https://generativelanguage.googleapis.com" : "https://api.openai.com/v1"),
            models_endpoint: d.models_endpoint || (t === "gemini" ? "/v1beta/models" : "/models"),
          }
        : d
    );
  }

  async function submitDraft() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.base_url.trim() || !draft.models_endpoint.trim()) {
      toast({ title: "Champs requis", description: "Nom, URL de base et endpoint sont obligatoires.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      api_type: draft.api_type,
      base_url: draft.base_url.trim(),
      models_endpoint: draft.models_endpoint.trim(),
      is_active: draft.is_active,
    };
    const { error } = draft.id
      ? await supabase.from("ai_providers").update(payload).eq("id", draft.id)
      : await supabase.from("ai_providers").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: draft.id ? "Fournisseur modifié" : "Fournisseur ajouté" });
    setDraft(null);
    void load();
  }

  async function toggleActive(p: AiProvider, next: boolean) {
    const { error } = await supabase.from("ai_providers").update({ is_active: next }).eq("id", p.id);
    if (error) {
      toast({ title: "Mise à jour KO", description: error.message, variant: "destructive" });
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, is_active: next } : r)));
  }

  async function remove(p: AiProvider) {
    if (!confirm(`Supprimer le fournisseur « ${p.name} » ? Les clés enregistrées par les utilisateurs seront perdues.`)) return;
    const { error } = await supabase.from("ai_providers").delete().eq("id", p.id);
    if (error) {
      toast({ title: "Suppression KO", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Supprimé" });
    void load();
  }

  if (roleLoading || !isAdmin) return null;

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "75ms" }}>
      <div className="flex items-center gap-2 mb-1">
        <Server className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Administration — Fournisseurs d'IA</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Ajoutez des fournisseurs d'IA sans modifier le code. Les utilisateurs saisiront leur propre clé.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-accent rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {p.name} <span className="text-[10px] text-muted-foreground">({p.api_type})</span>
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{p.base_url}</div>
              </div>
              <Switch checked={p.is_active} onCheckedChange={(v) => toggleActive(p, v)} />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(p)} aria-label="Modifier">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(p)} aria-label="Supprimer">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}

          {draft ? (
            <div className="bg-accent rounded-xl p-3 space-y-2 animate-fade-up">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Nom</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="OpenAI, Groq, OpenRouter…" className="h-9" />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Type d'API</Label>
                <select
                  value={draft.api_type}
                  onChange={(e) => onTypeChange(e.target.value as "gemini" | "openai" | "local")}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="openai">Compatible OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">URL de base</Label>
                <Input value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} placeholder="https://api.openai.com/v1" className="h-9 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Endpoint liste des modèles</Label>
                <Input value={draft.models_endpoint} onChange={(e) => setDraft({ ...draft, models_endpoint: e.target.value })} placeholder="/models" className="h-9 font-mono text-xs" />
              </div>
              <div className="flex items-center justify-between bg-card rounded-lg p-2">
                <div className="text-xs font-semibold">Actif</div>
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitDraft} disabled={saving} className="flex-1 h-9">
                  <Save className="w-4 h-4 mr-1" /> {draft.id ? "Modifier" : "Ajouter"}
                </Button>
                <Button onClick={() => setDraft(null)} variant="ghost" className="h-9">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={startCreate} variant="outline" className="w-full h-10 rounded-xl">
              <Plus className="w-4 h-4 mr-1" /> Ajouter un fournisseur
            </Button>
          )}
        </div>
      )}
    </section>
  );
};

export default AdminProvidersPanel;
