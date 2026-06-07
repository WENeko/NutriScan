/**
 * Paramètres IA — Refonte par cartes.
 *
 * Chaque fournisseur (Google AI Studio, Groq, OpenRouter, GitHub Models, …) est
 * présenté dans une carte distincte (thème sombre, bordure émeraude discrète) :
 *  - En-tête : icône + nom en gras, badge de statut (Connecté / Non configuré).
 *  - Champ de clé masqué par défaut (œil), validation de format en temps réel
 *    (coche verte) et guide « Comment obtenir ma clé ? ».
 *  - Liste de modèles remontée DYNAMIQUEMENT du fournisseur (jamais figée dans
 *    le code). Placeholder intelligent si la liste est indisponible.
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import {
  Save, ExternalLink, Eye, EyeOff, ShieldCheck, Trash2, RefreshCw, Loader2,
  Cpu, CheckCircle2, HelpCircle, CircleDashed, Sparkles, Gift,
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

interface Props {
  userId: string;
}

interface CardState {
  key: string;
  show: boolean;
  hasStored: boolean;
  models: string[];
  loadingModels: boolean;
  savingKey: boolean;
  savingSel: boolean;
}

const blankCard = (): CardState => ({
  key: "",
  show: false,
  hasStored: false,
  models: [],
  loadingModels: false,
  savingKey: false,
  savingSel: false,
});

const GeminiKeySettings: React.FC<Props> = ({ userId }) => {
  const lovableEnabled = isLovableAiEnabled();
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [cards, setCards] = useState<Record<string, CardState>>({});

  // Tri par popularité (fournisseurs connus en haut).
  const sorted = useMemo(
    () =>
      [...providers].sort(
        (a, b) => popularityOf(a.base_url) - popularityOf(b.base_url) || a.name.localeCompare(b.name),
      ),
    [providers],
  );

  useEffect(() => {
    (async () => {
      try {
        const provs = await listProviders();
        setProviders(provs);

        const { data: profile } = await supabase
          .from("profiles")
          .select("selected_ai_provider_id, selected_ai_model")
          .eq("user_id", userId)
          .maybeSingle();
        setSelectedProviderId(((profile as any)?.selected_ai_provider_id as string) || null);
        setSelectedModel(((profile as any)?.selected_ai_model as string) || "");

        // Charge toutes les clés de l'utilisateur en une requête.
        const { data: keys } = await supabase
          .from("user_provider_keys")
          .select("provider_id, api_key")
          .eq("user_id", userId);

        const init: Record<string, CardState> = {};
        for (const p of provs) {
          const stored = (keys as any[] | null)?.find((k) => k.provider_id === p.id)?.api_key ?? "";
          init[p.id] = { ...blankCard(), key: stored, hasStored: !!stored };
        }
        setCards(init);
      } catch (e: any) {
        toast({ title: "Chargement KO", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

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

  async function useProvider(p: AiProvider, model: string) {
    patch(p.id, { savingSel: true });
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

  return (
    <section className="space-y-3 animate-fade-up" style={{ animationDelay: "45ms" }}>
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Paramètres IA</h2>
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
          Aucun fournisseur disponible. Demandez à un administrateur d'en ajouter.
        </p>
      ) : (
        sorted.map((p) => {
          const st = cards[p.id] ?? blankCard();
          const entry = getCatalogEntry(p.base_url);
          const active = selectedProviderId === p.id;
          const keyTrimmed = st.key.trim();
          const formatOk = keyTrimmed.length > 0 && isKeyFormatValid(p.base_url, keyTrimmed);
          const modelForCard = active ? selectedModel : "";

          return (
            <Card
              key={p.id}
              className={`bg-card rounded-2xl p-4 border transition-colors ${
                active ? "border-primary shadow-card" : "border-primary/20 hover:border-primary/40"
              }`}
            >
              {/* En-tête */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
                  {entry?.icon ?? "🔌"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{entry?.label ?? p.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {p.api_type === "gemini" ? "Google Gemini" : "Compatible OpenAI"}
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

              {/* Modèle (dynamique) */}
              <div className="mt-3">
                <Label className="text-[10px] uppercase text-muted-foreground">Modèle</Label>
                <div className="flex gap-2 mt-1">
                  {st.models.length > 0 ? (
                    <select
                      value={modelForCard}
                      onChange={(e) => useProvider(p, e.target.value)}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Choisir un modèle…</option>
                      {st.models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      defaultValue={modelForCard}
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
    </section>
  );
};

export default GeminiKeySettings;
