/**
 * Éditeur de la cascade de modèles IA par fonctionnalité (par utilisateur).
 *
 * - Interrupteur « Personnaliser les modèles » (routing_config.enabled).
 * - 4 sections : Analyse photo, Analyse texte, Nutri-Coach, Recettes.
 * - Sélection multiple des modèles disponibles (Edge Function Lovable + clés perso)
 *   et réordonnancement de la priorité par flèches haut/bas.
 *
 * Tout est enregistré uniquement sur la base Supabase principale (profiles.routing_config).
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Workflow, ArrowUp, ArrowDown, Save, Loader2, RefreshCw } from "lucide-react";
import {
  type RoutingConfig,
  type RoutingStep,
  type FeatureKey,
  FEATURE_LABELS,
  EDGE_LABEL,
  emptyRoutingConfig,
  normalizeRoutingConfig,
} from "@/lib/aiRouting";
import { fetchProviderModels } from "@/lib/aiProviders";
import type { ApiType } from "@/lib/aiAccess";

interface Props {
  userId: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  apiType: ApiType;
  baseUrl: string;
  modelsEndpoint: string;
  apiKey: string;
}

const FEATURES: FeatureKey[] = ["photo", "text", "coach", "recipe"];

/** Identifiant unique d'une étape pour la (dé)sélection. */
const stepKey = (s: RoutingStep) =>
  s.type === "edge_function" ? "edge" : `byok:${s.providerId}:${s.model ?? ""}`;

const RoutingCascadeEditor: React.FC<Props> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lovableEnabled, setLovableEnabled] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [config, setConfig] = useState<RoutingConfig>(emptyRoutingConfig());
  // Modèle choisi par fournisseur pour ajouter une étape + cache des modèles dispo.
  const [chosenModel, setChosenModel] = useState<Record<string, string>>({});
  const [modelsCache, setModelsCache] = useState<Record<string, string[]>>({});
  const [fetching, setFetching] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function load() {
    setLoading(true);
    const [{ data: profile }, { data: provs }, { data: keys }] = await Promise.all([
      supabase.from("profiles").select("lovable_ai_enabled, routing_config").eq("user_id", userId).maybeSingle(),
      supabase.from("ai_providers").select("id, name, api_type, base_url, models_endpoint").eq("is_active", true).order("display_order"),
      supabase.from("user_provider_keys").select("provider_id, api_key").eq("user_id", userId),
    ]);

    const keyMap = new Map<string, string>();
    (keys as any[] | null)?.forEach((k) => keyMap.set(k.provider_id, k.api_key));

    const list: ProviderInfo[] = ((provs as any[] | null) ?? [])
      .filter((p) => keyMap.get(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        apiType: (p.api_type as ApiType) ?? "gemini",
        baseUrl: p.base_url,
        modelsEndpoint: p.models_endpoint,
        apiKey: keyMap.get(p.id)!,
      }));

    setLovableEnabled(!!(profile as any)?.lovable_ai_enabled);
    setProviders(list);
    setConfig(normalizeRoutingConfig((profile as any)?.routing_config));
    setChosenModel(Object.fromEntries(list.map((p) => [p.id, p.apiType === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash"])));
    setLoading(false);
  }

  async function loadModels(p: ProviderInfo) {
    setFetching(p.id);
    try {
      const models = await fetchProviderModels(
        { api_type: p.apiType, base_url: p.baseUrl, models_endpoint: p.modelsEndpoint },
        p.apiKey
      );
      setModelsCache((c) => ({ ...c, [p.id]: models }));
      if (models.length) setChosenModel((m) => ({ ...m, [p.id]: m[p.id] && models.includes(m[p.id]) ? m[p.id] : models[0] }));
    } catch (e: any) {
      toast({ title: "Modèles indisponibles", description: e.message, variant: "destructive" });
    } finally {
      setFetching(null);
    }
  }

  function toggleEnabled(v: boolean) {
    setConfig((c) => ({ ...c, enabled: v }));
  }

  /** Liste des étapes candidates pour l'ajout (edge + chaque fournisseur avec son modèle choisi). */
  function candidates(): RoutingStep[] {
    const out: RoutingStep[] = [];
    if (lovableEnabled) out.push({ type: "edge_function" });
    for (const p of providers) {
      out.push({ type: "byok", providerId: p.id, model: chosenModel[p.id] });
    }
    return out;
  }

  function labelForStep(s: RoutingStep): string {
    if (s.type === "edge_function") return EDGE_LABEL;
    const p = providers.find((x) => x.id === s.providerId);
    return p ? `${p.name} · ${s.model ?? "modèle"}` : "Fournisseur";
  }

  function isSelected(feature: FeatureKey, s: RoutingStep): boolean {
    if (s.type === "edge_function") return config[feature].some((x) => x.type === "edge_function");
    return config[feature].some((x) => x.type === "byok" && x.providerId === s.providerId);
  }

  function toggleStep(feature: FeatureKey, s: RoutingStep, checked: boolean) {
    setConfig((c) => {
      const current = c[feature];
      let next: RoutingStep[];
      if (checked) {
        next = [...current, s];
      } else {
        next = current.filter((x) =>
          s.type === "edge_function" ? x.type !== "edge_function" : !(x.type === "byok" && x.providerId === s.providerId)
        );
      }
      return { ...c, [feature]: next };
    });
  }

  function move(feature: FeatureKey, idx: number, dir: -1 | 1) {
    setConfig((c) => {
      const arr = [...c[feature]];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return c;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...c, [feature]: arr };
    });
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ routing_config: config as any }).eq("user_id", userId);
    setSaving(false);
    if (error) toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
    else toast({ title: "Cascade enregistrée" });
  }

  if (loading) {
    return (
      <section className="bg-card rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      </section>
    );
  }

  const allCandidates = candidates();

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "100ms" }}>
      <div className="flex items-center gap-2 mb-1">
        <Workflow className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Cascade de modèles IA</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Définissez l'ordre de priorité des modèles par fonctionnalité. En cas d'échec, le modèle suivant est utilisé automatiquement.
      </p>

      <div className="flex items-center justify-between bg-accent rounded-xl p-3 mb-3">
        <div>
          <div className="text-sm font-semibold">Personnaliser les modèles</div>
          <div className="text-[11px] text-muted-foreground">Sinon, l'application choisit automatiquement.</div>
        </div>
        <Switch checked={config.enabled} onCheckedChange={toggleEnabled} />
      </div>

      {/* Sélecteur de modèle par fournisseur (pour l'ajout) */}
      {config.enabled && providers.length > 0 && (
        <div className="space-y-2 mb-3">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
              <span className="text-xs font-medium flex-1 truncate">{p.name}</span>
              <select
                value={chosenModel[p.id] ?? ""}
                onChange={(e) => setChosenModel((m) => ({ ...m, [p.id]: e.target.value }))}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs max-w-[55%]"
              >
                {(modelsCache[p.id]?.length ? modelsCache[p.id] : [chosenModel[p.id]].filter(Boolean)).map((mdl) => (
                  <option key={mdl} value={mdl}>{mdl}</option>
                ))}
              </select>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => loadModels(p)} aria-label="Rafraîchir les modèles">
                {fetching === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {config.enabled && allCandidates.length === 0 && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          Aucun modèle disponible. Activez l'IA de l'application ou ajoutez une clé API dans la section ci-dessus.
        </p>
      )}

      {config.enabled && allCandidates.length > 0 && (
        <div className="space-y-4">
          {FEATURES.map((feature) => (
            <div key={feature} className="border border-border rounded-xl p-3">
              <div className="text-sm font-semibold mb-2">{FEATURE_LABELS[feature]}</div>

              {/* Sélection multiple */}
              <div className="space-y-1.5 mb-2">
                {allCandidates.map((cand) => {
                  const k = stepKey({ ...cand, model: undefined });
                  const checked = isSelected(feature, cand);
                  return (
                    <label key={k + feature} className="flex items-center gap-2 cursor-pointer text-xs">
                      <Checkbox checked={checked} onCheckedChange={(v) => toggleStep(feature, cand, !!v)} />
                      <span className="truncate">{labelForStep(cand)}</span>
                    </label>
                  );
                })}
              </div>

              {/* Ordre de priorité */}
              {config[feature].length > 0 && (
                <div className="bg-muted/40 rounded-lg p-2 space-y-1">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Ordre de priorité</div>
                  {config[feature].map((s, idx) => (
                    <div key={stepKey(s) + idx} className="flex items-center gap-2 bg-card rounded-md px-2 py-1.5">
                      <span className="text-[10px] font-bold text-primary w-4">{idx + 1}</span>
                      <span className="text-xs flex-1 truncate">{labelForStep(s)}</span>
                      <button
                        onClick={() => move(feature, idx, -1)}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30"
                        aria-label="Monter"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => move(feature, idx, 1)}
                        disabled={idx === config[feature].length - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30"
                        aria-label="Descendre"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Button onClick={save} disabled={saving} className="w-full h-10 rounded-xl mt-4">
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
        Enregistrer la cascade
      </Button>
    </section>
  );
};

export default RoutingCascadeEditor;
