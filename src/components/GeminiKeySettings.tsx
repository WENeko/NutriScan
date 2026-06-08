/**
 * Fournisseurs d'IA — section unifiée (par cartes).
 *
 * Chaque fournisseur (Google AI Studio, Groq, OpenRouter, GitHub Models, …) est
 * présenté dans une carte distincte :
 *  - En-tête : icône catalogue + NOM PERSONNALISÉ donné par l'admin, badge de statut.
 *  - Champ de clé masqué, validation de format en temps réel, guide d'obtention.
 *  - Modèle remonté DYNAMIQUEMENT du fournisseur, persisté sur le profil.
 *
 * Les administrateurs peuvent gérer les fournisseurs (ajouter / éditer / supprimer /
 * activer) directement depuis ces mêmes cartes : toute la gestion vit ici.
 *
 * Chaque utilisateur saisit sa propre clé. La sélection (fournisseur + modèle)
 * est persistée sur le profil Supabase.
 */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import {
  Save, ExternalLink, Eye, EyeOff, ShieldCheck, Trash2, RefreshCw, Loader2,
  Cpu, CheckCircle2, HelpCircle, CircleDashed, Sparkles, Gift, Pencil, Plus, X, Server,
} from "lucide-react";
import { isLovableAiEnabled, loadAiAccess } from "@/lib/aiAccess";
import {
  listProviders,
  fetchProviderModels,
  saveUserProviderKey,
  deleteUserProviderKey,
  saveUserSelection,
  type AiProvider,
} from "@/lib/aiProviders";
import { getCatalogEntry, popularityOf, isKeyFormatValid } from "@/lib/providerCatalog";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface Props {
  userId: string;
}

interface CardState {
  key: string;
  show: boolean;
  hasStored: boolean;
  model: string;
  models: string[];
  loadingModels: boolean;
  savingKey: boolean;
  savingSel: boolean;
}

const blankCard = (): CardState => ({
  key: "",
  show: false,
  hasStored: false,
  model: "",
  models: [],
  loadingModels: false,
  savingKey: false,
  savingSel: false,
});

type AdminDraft = {
  id?: string;
  name: string;
  api_type: "gemini" | "openai";
  base_url: string;
  models_endpoint: string;
  is_active: boolean;
};

const EMPTY_DRAFT: AdminDraft = {
  name: "",
  api_type: "openai",
  base_url: "",
  models_endpoint: "/models",
  is_active: true,
};

const GeminiKeySettings: React.FC<Props> = ({ userId }) => {
  const lovableEnabled = isLovableAiEnabled();
  const { isAdmin } = useIsAdmin(userId);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [cards, setCards] = useState<Record<string, CardState>>({});

  // Gestion admin (édition / ajout d'un fournisseur).
  const [draft, setDraft] = useState<AdminDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const sorted = useMemo(
    () =>
      [...providers].sort(
        (a, b) => popularityOf(a.base_url) - popularityOf(b.base_url) || a.name.localeCompare(b.name),
      ),
    [providers],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAdmin]);

  async function load() {
    setLoading(true);
    try {
      // Admin : voit tous les fournisseurs (même inactifs) pour les gérer.
      const provs = await listProviders(isAdmin);
      setProviders(provs);

      const { data: profile } = await supabase
        .from("profiles")
        .select("selected_ai_provider_id, selected_ai_model")
        .eq("user_id", userId)
        .maybeSingle();
      const selId = ((profile as any)?.selected_ai_provider_id as string) || null;
      const selModel = ((profile as any)?.selected_ai_model as string) || "";
      setSelectedProviderId(selId);
      setSelectedModel(selModel);

      const { data: keys } = await supabase
        .from("user_provider_keys")
        .select("provider_id, api_key")
        .eq("user_id", userId);

      const init: Record<string, CardState> = {};
      for (const p of provs) {
        const stored = (keys as any[] | null)?.find((k) => k.provider_id === p.id)?.api_key ?? "";
        init[p.id] = {
          ...blankCard(),
          key: stored,
          hasStored: !!stored,
          model: p.id === selId ? selModel : "",
        };
      }
      setCards(init);
    } catch (e: any) {
      toast({ title: "Chargement KO", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const patch = (id: string, p: Partial<CardState>) =>
    setCards((cs) => ({ ...cs, [id]: { ...cs[id], ...p } }));

  async function saveKey(p: AiProvider) {
    const trimmed = (cards[p.id]?.key ?? "").trim();
    if (!trimmed) {
      toast({ title: "Clé vide", description: "Entrez votre clé API.", variant: "destructive" });
      return;
    }
    patch(p.id, { savingKey: true });
    const { error } = await saveUserProviderKey(userId, p.id, trimmed);
    patch(p.id, { savingKey: false });
    if (error) {
      toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
      return;
    }
    patch(p.id, { hasStored: true });
    await loadAiAccess(userId);
    toast({ title: "Clé enregistrée", description: `${p.name} · stockée de façon sécurisée.` });
  }

  async function removeKey(p: AiProvider) {
    if (!confirm(`Supprimer votre clé enregistrée pour ${p.name} ?`)) return;
    patch(p.id, { savingKey: true });
    const { error } = await deleteUserProviderKey(userId, p.id);
    patch(p.id, { savingKey: false });
    if (error) {
      toast({ title: "Suppression KO", description: error.message, variant: "destructive" });
      return;
    }
    patch(p.id, { key: "", hasStored: false, models: [] });
    await loadAiAccess(userId);
    toast({ title: "Clé supprimée" });
  }

  async function loadModels(p: AiProvider) {
    const k = (cards[p.id]?.key ?? "").trim();
    if (!k) {
      toast({ title: "Clé requise", description: "Entrez votre clé pour lister les modèles.", variant: "destructive" });
      return;
    }
    patch(p.id, { loadingModels: true });
    try {
      const list = await fetchProviderModels(p, k);
      patch(p.id, { models: list });
      if (list.length === 0) {
        toast({ title: "Aucun modèle", description: "Le fournisseur n'a renvoyé aucun modèle." });
      } else {
        toast({ title: `${list.length} modèles disponibles`, description: p.name });
      }
    } catch (e: any) {
      toast({ title: "Liste des modèles KO", description: e.message, variant: "destructive" });
    } finally {
      patch(p.id, { loadingModels: false });
    }
  }

  /** Sélectionne ce fournisseur + persiste le modèle choisi (active la cascade par défaut). */
  async function useProvider(p: AiProvider, model: string) {
    patch(p.id, { savingSel: true, model });
    const { error } = await saveUserSelection(userId, p.id, model || null);
    patch(p.id, { savingSel: false });
    if (error) {
      toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
      return;
    }
    setSelectedProviderId(p.id);
    setSelectedModel(model || "");
    await loadAiAccess(userId);
    toast({ title: "Fournisseur actif", description: `${p.name} · ${model || "modèle par défaut"}` });
  }

  // ── Gestion admin des fournisseurs ──────────────────────────────────────────
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

  function onDraftType(t: "gemini" | "openai") {
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
        : d,
    );
  }

  async function submitDraft() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.base_url.trim() || !draft.models_endpoint.trim()) {
      toast({ title: "Champs requis", description: "Nom, URL de base et endpoint sont obligatoires.", variant: "destructive" });
      return;
    }
    setSavingDraft(true);
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
    setSavingDraft(false);
    if (error) {
      toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: draft.id ? "Fournisseur modifié" : "Fournisseur ajouté" });
    setDraft(null);
    void load();
  }

  async function toggleProviderActive(p: AiProvider, next: boolean) {
    const { error } = await supabase.from("ai_providers").update({ is_active: next }).eq("id", p.id);
    if (error) {
      toast({ title: "Mise à jour KO", description: error.message, variant: "destructive" });
      return;
    }
    setProviders((rs) => rs.map((r) => (r.id === p.id ? { ...r, is_active: next } : r)));
  }

  async function removeProvider(p: AiProvider) {
    if (!confirm(`Supprimer le fournisseur « ${p.name} » ? Les clés enregistrées par les utilisateurs seront perdues.`)) return;
    const { error } = await supabase.from("ai_providers").delete().eq("id", p.id);
    if (error) {
      toast({ title: "Suppression KO", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Supprimé" });
    void load();
  }

  return (
    <section className="space-y-3 animate-fade-up" style={{ animationDelay: "45ms" }}>
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">
          {isAdmin ? "Administration — Fournisseurs d'IA" : "Fournisseurs d'IA"}
        </h2>
      </div>

      {lovableEnabled ? (
        <div className="flex items-start gap-2 bg-primary/10 text-primary rounded-xl p-3">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">
            L'IA de l'application est activée sur votre compte : l'analyse l'utilise en priorité.
            Vous pouvez configurer un ou plusieurs fournisseurs de secours ci-dessous.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          L'analyse par IA utilise <strong>votre</strong> clé auprès du fournisseur choisi.
          Configurez au moins un fournisseur, puis activez-le.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          {isAdmin
            ? "Aucun fournisseur. Ajoutez-en un ci-dessous."
            : "Aucun fournisseur disponible. Demandez à un administrateur d'en ajouter."}
        </p>
      ) : (
        sorted.map((p) => {
          const st = cards[p.id] ?? blankCard();
          const entry = getCatalogEntry(p.base_url);
          const active = selectedProviderId === p.id;
          const keyTrimmed = st.key.trim();
          const formatOk = keyTrimmed.length > 0 && isKeyFormatValid(p.base_url, keyTrimmed);
          // Options du sélecteur de modèle : union des modèles chargés + modèle déjà choisi.
          const modelOptions = Array.from(new Set([...(st.model ? [st.model] : []), ...st.models]));

          return (
            <Card
              key={p.id}
              className={`bg-card rounded-2xl p-4 border transition-colors ${
                active ? "border-primary shadow-card" : "border-primary/20 hover:border-primary/40"
              } ${!p.is_active ? "opacity-60" : ""}`}
            >
              {/* En-tête */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
                  {entry?.icon ?? "🔌"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {p.api_type === "gemini" ? "Google Gemini" : "Compatible OpenAI"}
                    {entry && entry.label !== p.name ? ` · ${entry.label}` : ""}
                    {!p.is_active ? " · inactif" : ""}
                  </div>
                </div>
                {st.hasStored ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-1">
                    <CheckCircle2 className="w-3 h-3" /> Connecté
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-1">
                    <CircleDashed className="w-3 h-3" /> Non configuré
                  </span>
                )}
              </div>

              {/* Barre admin */}
              {isAdmin && (
                <div className="flex items-center gap-2 mb-3 bg-accent/60 rounded-lg px-2 py-1.5">
                  <Server className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground flex-1 truncate font-mono">{p.base_url}</span>
                  <div className="flex items-center gap-1">
                    <Switch checked={p.is_active} onCheckedChange={(v) => toggleProviderActive(p, v)} aria-label="Actif" />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)} aria-label="Modifier le fournisseur">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeProvider(p)} aria-label="Supprimer le fournisseur">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Clé */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase text-muted-foreground">Votre clé</Label>
                  {entry && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                          <HelpCircle className="w-3 h-3" /> Comment obtenir ma clé ?
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="text-xs space-y-2">
                        <p className="font-semibold flex items-center gap-1">
                          {entry.icon} {entry.label}
                          {entry.guide.free && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary ml-auto">
                              <Gift className="w-3 h-3" /> Gratuit
                            </span>
                          )}
                        </p>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          {entry.guide.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                        <a
                          href={entry.guide.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-primary"
                        >
                          Ouvrir la page <ExternalLink className="w-3 h-3" />
                        </a>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                <div className="relative mt-1">
                  <Input
                    type={st.show ? "text" : "password"}
                    value={st.key}
                    onChange={(e) => patch(p.id, { key: e.target.value })}
                    placeholder={entry?.keyPlaceholder ?? (p.api_type === "gemini" ? "AIza…" : "sk-…")}
                    className="h-10 pr-16 font-mono text-xs"
                    autoComplete="off"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {formatOk && <CheckCircle2 className="w-4 h-4 text-primary" aria-label="Format valide" />}
                    <button
                      type="button"
                      onClick={() => patch(p.id, { show: !st.show })}
                      className="text-muted-foreground"
                      aria-label={st.show ? "Masquer" : "Afficher"}
                    >
                      {st.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {keyTrimmed.length > 0 && !formatOk && entry && (
                  <p className="text-[10px] text-amber-500 mt-1">
                    Le format ne correspond pas au format attendu ({entry.keyPlaceholder}).
                  </p>
                )}

                <div className="flex gap-2 mt-2">
                  <Button onClick={() => saveKey(p)} disabled={st.savingKey} className="flex-1 h-9 rounded-xl">
                    <Save className="w-4 h-4 mr-1" /> Enregistrer la clé
                  </Button>
                  {st.hasStored && (
                    <Button onClick={() => removeKey(p)} disabled={st.savingKey} variant="ghost" className="h-9">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Modèle (dynamique, persisté) */}
              <div className="mt-3">
                <Label className="text-[10px] uppercase text-muted-foreground">Modèle</Label>
                <div className="flex gap-2 mt-1">
                  {modelOptions.length > 0 ? (
                    <select
                      value={st.model}
                      onChange={(e) => useProvider(p, e.target.value)}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Choisir un modèle…</option>
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={st.model}
                      onChange={(e) => patch(p.id, { model: e.target.value })}
                      onBlur={(e) => e.target.value.trim() && useProvider(p, e.target.value.trim())}
                      placeholder={entry?.modelPlaceholder ?? (p.api_type === "gemini" ? "gemini-flash-latest" : "gpt-4o-mini")}
                      className="h-9 flex-1 font-mono text-xs"
                    />
                  )}
                  <Button onClick={() => loadModels(p)} disabled={st.loadingModels} variant="outline" className="h-9">
                    {st.loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Cliquez sur l'icône pour charger la liste à jour des modèles du fournisseur.
                </p>
              </div>

              {active && (
                <div className="flex items-center gap-1.5 mt-3 text-[11px] font-semibold text-primary">
                  <Cpu className="w-3.5 h-3.5" /> Fournisseur actif
                  {selectedModel ? ` · ${selectedModel}` : ""}
                </div>
              )}
            </Card>
          );
        })
      )}

      {/* Édition / ajout d'un fournisseur (admin) */}
      {isAdmin && draft && (
        <Card className="bg-accent rounded-2xl p-4 space-y-2 animate-fade-up border border-primary/30">
          <div className="text-sm font-semibold">{draft.id ? "Modifier le fournisseur" : "Nouveau fournisseur"}</div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Nom personnalisé</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="OpenAI, Groq, OpenRouter…" className="h-9" />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Type d'API</Label>
            <select
              value={draft.api_type}
              onChange={(e) => onDraftType(e.target.value as "gemini" | "openai")}
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
            <Button onClick={submitDraft} disabled={savingDraft} className="flex-1 h-9">
              {savingDraft ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              {draft.id ? "Modifier" : "Ajouter"}
            </Button>
            <Button onClick={() => setDraft(null)} variant="ghost" className="h-9">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {isAdmin && !draft && !loading && (
        <Button onClick={() => setDraft({ ...EMPTY_DRAFT })} variant="outline" className="w-full h-10 rounded-xl">
          <Plus className="w-4 h-4 mr-1" /> Ajouter un fournisseur
        </Button>
      )}
    </section>
  );
};

export default GeminiKeySettings;
