/**
 * Paramètres IA — gestion unifiée des fournisseurs ET des modèles (par cartes).
 *
 * Une seule clé API par fournisseur, mais autant de modèles que souhaité gérés
 * directement dans la carte du fournisseur (ajout / édition / suppression /
 * vérification d'état). La liste de modèles par fournisseur est persistée dans
 * profiles.routing_config.models — la même persistance que celle (fonctionnelle)
 * de la cascade, désormais déplacée ici.
 *
 * Structure de l'écran :
 *  1. Interrupteur « Personnaliser les modèles » (routing_config.enabled).
 *     -> S'il est désactivé : les réglages de modèles et la cascade sont
 *        désactivés visuellement MAIS conservés (persistés), réactivables.
 *  2. Cartes fournisseurs (clé + guide + modèles + vérification + admin).
 *  3. Cascade de priorité par fonctionnalité (utilise les modèles gérés).
 */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import {
  Save, ExternalLink, Eye, EyeOff, ShieldCheck, Trash2, RefreshCw, Loader2,
  Cpu, CheckCircle2, XCircle, HelpCircle, CircleDashed, Sparkles, Gift, Pencil,
  Plus, X, Server, Workflow, ArrowUp, ArrowDown, Check,
} from "lucide-react";
import { isLovableAiEnabled, loadAiAccess, isLocalApiType } from "@/lib/aiAccess";
import {
  listProviders,
  fetchProviderModels,
  saveUserProviderKey,
  deleteUserProviderKey,
  saveUserSelection,
  type AiProvider,
} from "@/lib/aiProviders";
import { getCatalogEntry, popularityOf, isKeyFormatValid } from "@/lib/providerCatalog";
import {
  type RoutingConfig,
  type RoutingStep,
  type FeatureKey,
  FEATURE_LABELS,
  EDGE_LABEL,
  emptyRoutingConfig,
  normalizeRoutingConfig,
} from "@/lib/aiRouting";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { importLocalIntentModel, listLocalIntentModels } from "@/services/localAiBridge";

interface Props {
  userId: string;
}

type ModelStatus = "ok" | "obsolete" | "unknown";

interface CardState {
  key: string;
  show: boolean;
  hasStored: boolean;
  available: string[];      // modèles remontés dynamiquement du fournisseur
  loadingModels: boolean;
  savingKey: boolean;
  newModel: string;         // valeur du sélecteur/champ d'ajout
  editingIdx: number | null;
  editValue: string;
  status: Record<string, ModelStatus>;
  verifying: boolean;
}

const blankCard = (): CardState => ({
  key: "",
  show: false,
  hasStored: false,
  available: [],
  loadingModels: false,
  savingKey: false,
  newModel: "",
  editingIdx: null,
  editValue: "",
  status: {},
  verifying: false,
});

type AdminDraft = {
  id?: string;
  name: string;
  api_type: "gemini" | "openai" | "local" | "local_intent";
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

const FEATURES: FeatureKey[] = ["photo", "text", "coach", "recipe"];

const GeminiKeySettings: React.FC<Props> = ({ userId }) => {
  const lovableEnabled = isLovableAiEnabled();
  const { isAdmin } = useIsAdmin(userId);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [config, setConfig] = useState<RoutingConfig>(emptyRoutingConfig());

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
      const provs = await listProviders(isAdmin);
      setProviders(provs);

      const { data: profile } = await supabase
        .from("profiles")
        .select("selected_ai_provider_id, selected_ai_model, routing_config")
        .eq("user_id", userId)
        .maybeSingle();
      const selId = ((profile as any)?.selected_ai_provider_id as string) || null;
      const selModel = ((profile as any)?.selected_ai_model as string) || "";
      setSelectedProviderId(selId);
      setSelectedModel(selModel);

      // Nettoyage : retire de la cascade et de la liste des modèles tout
      // fournisseur supprimé ou tout modèle qui n'existe plus.
      const norm = normalizeRoutingConfig((profile as any)?.routing_config);
      const validIds = new Set(provs.map((p) => p.id));
      const prunedModels: Record<string, string[]> = {};
      for (const [pid, list] of Object.entries(norm.models)) {
        if (validIds.has(pid)) prunedModels[pid] = list;
      }
      const modelOk = (pid: string, model?: string) => (prunedModels[pid] ?? []).includes(model || "");
      const cleaned: RoutingConfig = { ...norm, models: prunedModels };
      let changed = JSON.stringify(prunedModels) !== JSON.stringify(norm.models);
      for (const f of FEATURES) {
        const filtered = norm[f].filter((s) =>
          s.type === "edge_function" ? true : !!s.providerId && validIds.has(s.providerId) && modelOk(s.providerId, s.model),
        );
        if (filtered.length !== norm[f].length) changed = true;
        cleaned[f] = filtered;
      }
      setConfig(cleaned);
      if (changed) {
        await supabase.from("profiles").update({ routing_config: cleaned as any }).eq("user_id", userId);
      }

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
  }

  const patch = (id: string, p: Partial<CardState>) =>
    setCards((cs) => ({ ...cs, [id]: { ...cs[id], ...p } }));

  const getModels = (pid: string): string[] => config.models?.[pid] ?? [];

  /** Persiste silencieusement la config (modèles + cascade + interrupteur). */
  async function persistConfig(next: RoutingConfig) {
    setConfig(next);
    const { error } = await supabase
      .from("profiles")
      .update({ routing_config: next as any })
      .eq("user_id", userId);
    if (error) toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
  }

  function setModels(pid: string, list: string[], nextConfig?: RoutingConfig) {
    const base = nextConfig ?? config;
    void persistConfig({ ...base, models: { ...base.models, [pid]: list } });
  }

  // ── Clés ────────────────────────────────────────────────────────────────────
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
    patch(p.id, { key: "", hasStored: false, available: [] });
    await loadAiAccess(userId);
    toast({ title: "Clé supprimée" });
  }

  // ── Modèles (liste dynamique + gestion par fournisseur) ──────────────────────
  async function loadAvailable(p: AiProvider) {
    const k = (cards[p.id]?.key ?? "").trim();
    if (!k) {
      toast({ title: "Clé requise", description: "Entrez votre clé pour lister les modèles.", variant: "destructive" });
      return;
    }
    patch(p.id, { loadingModels: true });
    try {
      const list = await fetchProviderModels(p, k);
      patch(p.id, { available: list });
      if (list.length === 0) toast({ title: "Aucun modèle", description: "Le fournisseur n'a renvoyé aucun modèle." });
      else toast({ title: `${list.length} modèles disponibles`, description: p.name });
    } catch (e: any) {
      toast({ title: "Liste des modèles KO", description: e.message, variant: "destructive" });
    } finally {
      patch(p.id, { loadingModels: false });
    }
  }

  /** Vérifie l'état des modèles ajoutés (✅ disponible / ❌ obsolète). */
  async function verifyModels(p: AiProvider) {
    const k = (cards[p.id]?.key ?? "").trim();
    if (!k) {
      toast({ title: "Clé requise", description: "Entrez votre clé pour vérifier les modèles.", variant: "destructive" });
      return;
    }
    patch(p.id, { verifying: true });
    try {
      const list = await fetchProviderModels(p, k);
      const status: Record<string, ModelStatus> = {};
      for (const m of getModels(p.id)) status[m] = list.includes(m) ? "ok" : "obsolete";
      patch(p.id, { available: list, status });
    } catch (e: any) {
      toast({ title: "Vérification KO", description: e.message, variant: "destructive" });
    } finally {
      patch(p.id, { verifying: false });
    }
  }

  function addModel(p: AiProvider) {
    const m = (cards[p.id]?.newModel ?? "").trim();
    if (!m) return;
    const list = getModels(p.id);
    if (list.includes(m)) {
      toast({ title: "Modèle déjà ajouté", variant: "destructive" });
      return;
    }
    const next = [...list, m];
    patch(p.id, { newModel: "" });
    // Premier modèle ajouté : devient le modèle par défaut du fournisseur.
    if (!selectedProviderId || !selectedModel) {
      void saveUserSelection(userId, p.id, m).then(() => {
        setSelectedProviderId(p.id);
        setSelectedModel(m);
        loadAiAccess(userId);
      });
    }
    setModels(p.id, next);
    toast({ title: "Modèle ajouté", description: `${p.name} · ${m}` });
  }

  async function importNativeLocalModel(p: AiProvider) {
    patch(p.id, { loadingModels: true });
    try {
      const imported = await importLocalIntentModel();
      const m = imported.model?.trim();
      if (!m) throw new Error("Le fichier a été importé mais son nom de modèle est vide.");

      const list = getModels(p.id);
      const next = list.includes(m) ? list : [...list, m];
      if (!selectedProviderId || !selectedModel) {
        void saveUserSelection(userId, p.id, m).then(() => {
          setSelectedProviderId(p.id);
          setSelectedModel(m);
          loadAiAccess(userId);
        });
      }
      setModels(p.id, next);
      patch(p.id, { status: { ...cards[p.id]?.status, [m]: "ok" }, newModel: "" });
      toast({
        title: list.includes(m) ? "Modèle déjà importé" : "Modèle local importé",
        description: `${p.name} · ${m}`,
      });
    } catch (e: any) {
      toast({ title: "Import du modèle KO", description: e.message, variant: "destructive" });
    } finally {
      patch(p.id, { loadingModels: false });
    }
  }

  /** Recherche auto des modèles .litertlm/.task compatibles dans les emplacements connus (local natif). */
  async function scanNativeLocalModels(p: AiProvider) {
    patch(p.id, { loadingModels: true });
    try {
      const found = await listLocalIntentModels();
      patch(p.id, { available: found });
      if (found.length === 0) {
        toast({
          title: "Aucun modèle trouvé",
          description: "Placez un fichier .litertlm (ou .task) compatible dans les dossiers recherchés, ou utilisez « Importer un modèle ».",
        });
      } else {
        toast({ title: `${found.length} modèle(s) trouvé(s)`, description: p.name });
      }
    } catch (e: any) {
      toast({ title: "Recherche KO", description: e.message, variant: "destructive" });
    } finally {
      patch(p.id, { loadingModels: false });
    }
  }

  function deleteModel(p: AiProvider, model: string) {
    const next = getModels(p.id).filter((m) => m !== model);
    // Retire aussi ce modèle de la cascade.
    const cleaned: RoutingConfig = { ...config, models: { ...config.models, [p.id]: next } };
    for (const f of FEATURES) {
      cleaned[f] = cleaned[f].filter((s) => !(s.type === "byok" && s.providerId === p.id && s.model === model));
    }
    void persistConfig(cleaned);
    patch(p.id, { status: {} });
  }

  function startEditModel(p: AiProvider, idx: number) {
    patch(p.id, { editingIdx: idx, editValue: getModels(p.id)[idx] ?? "" });
  }

  function commitEditModel(p: AiProvider) {
    const st = cards[p.id];
    if (!st || st.editingIdx == null) return;
    const value = st.editValue.trim();
    const list = [...getModels(p.id)];
    const old = list[st.editingIdx];
    if (!value || value === old) {
      patch(p.id, { editingIdx: null, editValue: "" });
      return;
    }
    list[st.editingIdx] = value;
    // Répercute le renommage dans la cascade.
    const cleaned: RoutingConfig = { ...config, models: { ...config.models, [p.id]: list } };
    for (const f of FEATURES) {
      cleaned[f] = cleaned[f].map((s) =>
        s.type === "byok" && s.providerId === p.id && s.model === old ? { ...s, model: value } : s,
      );
    }
    void persistConfig(cleaned);
    patch(p.id, { editingIdx: null, editValue: "" });
  }

  // ── Cascade ──────────────────────────────────────────────────────────────────
  function toggleEnabled(v: boolean) {
    void persistConfig({ ...config, enabled: v });
  }

  function providerById(id?: string): AiProvider | undefined {
    return providers.find((p) => p.id === id);
  }

  function candidates(): RoutingStep[] {
    const out: RoutingStep[] = [];
    if (lovableEnabled) out.push({ type: "edge_function" });
    for (const p of sorted) {
      // Les fournisseurs locaux (HTTP ou Intent natif) n'ont pas besoin de clé enregistrée.
      if (!isLocalApiType(p.api_type as any) && !cards[p.id]?.hasStored) continue;
      for (const m of getModels(p.id)) out.push({ type: "byok", providerId: p.id, model: m });
    }
    return out;
  }

  function labelForStep(s: RoutingStep): string {
    if (s.type === "edge_function") return EDGE_LABEL;
    const p = providerById(s.providerId);
    return `${p?.name ?? "Fournisseur"} · ${s.model || "modèle par défaut"}`;
  }

  /** Un step est valide si edge, ou si son fournisseur + modèle existent encore. */
  function stepIsValid(s: RoutingStep): boolean {
    if (s.type === "edge_function") return true;
    if (!s.providerId) return false;
    if (!providers.some((p) => p.id === s.providerId)) return false;
    return getModels(s.providerId).includes(s.model || "");
  }

  const sameStep = (a: RoutingStep, b: RoutingStep) =>
    a.type === b.type &&
    (a.type === "edge_function" || (a.providerId === b.providerId && a.model === b.model));

  function isSelected(feature: FeatureKey, s: RoutingStep): boolean {
    return config[feature].some((x) => sameStep(x, s));
  }

  function toggleStep(feature: FeatureKey, s: RoutingStep, checked: boolean) {
    const current = config[feature];
    const next = checked ? [...current, s] : current.filter((x) => !sameStep(x, s));
    void persistConfig({ ...config, [feature]: next });
  }

  function move(feature: FeatureKey, idx: number, dir: -1 | 1) {
    const arr = [...config[feature]];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    void persistConfig({ ...config, [feature]: arr });
  }

  // ── Admin fournisseurs ───────────────────────────────────────────────────────
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

  function onDraftType(t: "gemini" | "openai" | "local" | "local_intent") {
    setDraft((d) =>
      d
        ? {
            ...d,
            api_type: t,
            base_url:
              d.base_url ||
              (t === "gemini"
                ? "https://generativelanguage.googleapis.com"
                : t === "local"
                ? "http://localhost:11434/v1"
                : t === "local_intent"
                ? "intent://google-ai-edge-gallery"
                : "https://api.openai.com/v1"),
            models_endpoint: d.models_endpoint || (t === "gemini" ? "/v1beta/models" : "/models"),
          }
        : d,
    );
  }

  async function submitDraft() {
    if (!draft) return;
    // L'IA locale native n'a besoin ni d'URL ni d'endpoint : on les renseigne par défaut.
    if (draft.api_type === "local_intent") {
      draft.base_url = draft.base_url.trim() || "intent://google-ai-edge-gallery";
      draft.models_endpoint = draft.models_endpoint.trim() || "/models";
    }
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

  const cfgDisabled = !config.enabled;
  const disabledCls = cfgDisabled ? "opacity-50 pointer-events-none select-none" : "";
  const allCandidates = candidates();

  return (
    <section className="space-y-3 animate-fade-up" style={{ animationDelay: "45ms" }}>
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">
          {isAdmin ? "Administration — Fournisseurs d'IA" : "Fournisseurs & modèles d'IA"}
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
          Configurez au moins un fournisseur, ajoutez un modèle, puis activez la personnalisation.
        </p>
      )}

      {/* 1. Interrupteur « Personnaliser les modèles » (avant les cartes) */}
      <div className="flex items-center justify-between bg-accent rounded-xl p-3">
        <div>
          <div className="text-sm font-semibold">Personnaliser les modèles</div>
          <div className="text-[11px] text-muted-foreground">
            Désactivé : réglages de modèles et cascade conservés mais inactifs.
          </div>
        </div>
        <Switch checked={config.enabled} onCheckedChange={toggleEnabled} />
      </div>

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
          const models = getModels(p.id);
          const addOptions = st.available.filter((m) => !models.includes(m));
          const isLocal = isLocalApiType(p.api_type as any);

          return (
            <Card
              key={p.id}
              className={`bg-card rounded-2xl p-4 border transition-colors ${
                active ? "border-primary shadow-card" : "border-primary/20 hover:border-primary/40"
              } ${!p.is_active ? "opacity-60" : ""}`}
            >
              {/* En-tête : NOM du fournisseur */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
                  {entry?.icon ?? "🔌"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {p.api_type === "gemini"
                      ? "Google Gemini"
                      : p.api_type === "local"
                      ? "Local HTTP (sur l'appareil)"
                      : p.api_type === "local_intent"
                      ? "Local natif (on-device)"
                      : "Compatible OpenAI"}
                    {entry && entry.label !== p.name ? ` · ${entry.label}` : ""}
                    {!p.is_active ? " · inactif" : ""}
                  </div>
                </div>
                {isLocal ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-1">
                    <CheckCircle2 className="w-3 h-3" /> Sans clé
                  </span>
                ) : st.hasStored ? (
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

              {/* Clé + guide d'obtention (masqué pour les IA locales sans clé) */}
              {isLocal ? (
                <div className="rounded-xl bg-accent/60 px-3 py-2 text-[11px] text-muted-foreground space-y-1.5">
                  {p.api_type === "local_intent" ? (
                    <>
                      <p>
                        IA locale native (moteur on-device MediaPipe) — aucune clé ni URL requise.
                        Téléchargez un modèle <span className="font-mono">.litertlm</span> (format LiteRT-LM moderne, ou l'ancien <span className="font-mono">.task</span>), puis utilisez
                        le bouton d'import ci-dessous. L'app le copiera dans son stockage privé pour éviter les erreurs Android <span className="font-mono">open() failed</span>.
                      </p>
                      <p className="font-semibold text-foreground">Où placer le fichier (cherché dans cet ordre) :</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        <li>Import via le bouton <span className="font-semibold">Importer un modèle</span> (recommandé)</li>
                        <li><span className="font-mono">Android/data/{`{app}`}/files/llm/</span></li>
                        <li>dossier privé de l'app (<span className="font-mono">filesDir/llm</span>)</li>
                      </ul>
                      <p>
                        Modèles compatibles :{" "}
                        <a
                          href="https://huggingface.co/litert-community"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary underline"
                        >
                          LiteRT Community (Hugging Face)
                        </a>{" "}
                        — ex. <span className="font-mono">gemma-3n</span>, <span className="font-mono">gemma-3-1b-it</span> (int4).
                      </p>
                    </>
                  ) : (
                    "IA locale HTTP (Ollama, LM Studio…) — aucune clé requise. Vérifiez l'URL de base puis ajoutez vos modèles ci-dessous."
                  )}
                </div>
              ) : (
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
              )}

              {/* Modèles : gestion complète (ajout / édition / suppression / vérification) */}
              <div className={`mt-4 border-t border-border pt-3 ${disabledCls}`}>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <Cpu className="w-3 h-3" /> Modèles
                  </Label>
                  {!isLocal && (
                  <Button
                    onClick={() => verifyModels(p)}
                    disabled={st.verifying || models.length === 0}
                    variant="ghost"
                    className="h-7 text-[11px] px-2"
                  >
                    {st.verifying ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
                    Vérifier l'état
                  </Button>
                  )}
                </div>

                {/* Liste des modèles ajoutés */}
                {models.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic mb-2">
                    Aucun modèle. Ajoutez-en un ci-dessous.
                  </p>
                ) : (
                  <div className="space-y-1.5 mb-2">
                    {models.map((m, idx) => {
                      const status = st.status[m];
                      return (
                        <div key={m} className="flex items-center gap-2 bg-muted/40 rounded-lg px-2 py-1.5">
                          {status === "ok" ? (
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-label="Disponible" />
                          ) : status === "obsolete" ? (
                            <XCircle className="w-4 h-4 text-destructive shrink-0" aria-label="Obsolète" />
                          ) : (
                            <CircleDashed className="w-4 h-4 text-muted-foreground shrink-0" aria-label="Non vérifié" />
                          )}
                          {st.editingIdx === idx ? (
                            <>
                              <Input
                                value={st.editValue}
                                onChange={(e) => patch(p.id, { editValue: e.target.value })}
                                className="h-7 flex-1 font-mono text-xs"
                                autoFocus
                              />
                              <button onClick={() => commitEditModel(p)} className="text-primary" aria-label="Valider">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => patch(p.id, { editingIdx: null })} className="text-muted-foreground" aria-label="Annuler">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-mono flex-1 truncate">{m}</span>
                              {active && selectedModel === m && (
                                <span className="text-[9px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                                  défaut
                                </span>
                              )}
                              <button onClick={() => startEditModel(p, idx)} className="text-muted-foreground hover:text-foreground" aria-label="Éditer">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteModel(p, m)} className="text-muted-foreground hover:text-destructive" aria-label="Supprimer">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Ajout d'un modèle */}
                <div className="flex flex-wrap gap-2">
                  {addOptions.length > 0 ? (
                    <select
                      value={st.newModel}
                      onChange={(e) => patch(p.id, { newModel: e.target.value })}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="">Choisir un modèle à ajouter…</option>
                      {addOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={st.newModel}
                      onChange={(e) => patch(p.id, { newModel: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && addModel(p)}
                      placeholder={
                        isLocal
                          ? "nom du modèle local (ex: gemma-3n)"
                          : entry?.modelPlaceholder ?? (p.api_type === "gemini" ? "gemini-flash-latest" : "gpt-4o-mini")
                      }
                      className="h-9 flex-1 font-mono text-xs"
                    />
                  )}
                  <Button onClick={() => addModel(p)} disabled={!st.newModel.trim()} className="h-9 px-3" aria-label="Ajouter le modèle">
                    <Plus className="w-4 h-4" />
                  </Button>
                  {p.api_type === "local_intent" && (
                    <>
                      <Button onClick={() => scanNativeLocalModels(p)} disabled={st.loadingModels} variant="outline" className="h-9 px-3" aria-label="Rechercher les modèles locaux">
                        {st.loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </Button>
                      <Button onClick={() => importNativeLocalModel(p)} disabled={st.loadingModels} variant="outline" className="h-9 px-3 text-xs flex-1 min-w-[8.5rem]">
                        {st.loadingModels ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-1" />}
                        Importer un modèle
                      </Button>
                    </>
                  )}
                  {p.api_type !== "local_intent" && (
                  <Button onClick={() => loadAvailable(p)} disabled={st.loadingModels} variant="outline" className="h-9 px-3" aria-label="Rafraîchir la liste">
                    {st.loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {p.api_type === "local_intent"
                    ? "Utilisez 🔄 pour rechercher automatiquement les modèles .litertlm/.task présents sur l'appareil, ou « Importer un modèle » pour en ajouter un depuis vos fichiers."
                    : "Rafraîchissez pour charger les modèles du fournisseur, puis ajoutez-en autant que voulu."}
                </p>
              </div>
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
              onChange={(e) => onDraftType(e.target.value as "gemini" | "openai" | "local" | "local_intent")}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="openai">Compatible OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="local">Local HTTP (Ollama, LM Studio… — sans clé)</option>
              <option value="local_intent">Local natif (on-device — sans clé)</option>

            </select>
          </div>
          {draft.api_type === "local_intent" ? (
            <div className="rounded-xl bg-card px-3 py-2 text-[11px] text-muted-foreground space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" /> IA locale native (on-device)
              </p>
              <p>
                Aucune clé, aucune URL ni endpoint : le moteur MediaPipe/LiteRT tourne 100% hors-ligne.
                Après création, ouvrez la carte du fournisseur puis utilisez <span className="font-semibold">🔄 Rechercher</span> pour
                détecter automatiquement les modèles <span className="font-mono">.litertlm</span>/<span className="font-mono">.task</span> présents, ou <span className="font-semibold">Importer un modèle</span>.
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">URL de base</Label>
                <Input value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} placeholder={draft.api_type === "local" ? "http://localhost:11434/v1" : "https://api.openai.com/v1"} className="h-9 font-mono text-xs" />
                {draft.api_type === "local" && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Serveur local compatible OpenAI (Ollama, LM Studio…) — aucune clé requise.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Endpoint liste des modèles</Label>
                <Input value={draft.models_endpoint} onChange={(e) => setDraft({ ...draft, models_endpoint: e.target.value })} placeholder="/models" className="h-9 font-mono text-xs" />
              </div>
            </>
          )}
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

      {/* 3. Cascade de priorité par fonctionnalité */}
      {!loading && (
        <Card className={`bg-card rounded-2xl p-4 shadow-card mt-2 ${disabledCls}`}>
          <div className="flex items-center gap-2 mb-1">
            <Workflow className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Cascade de modèles IA</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Ordre de priorité par fonctionnalité. En cas d'échec, le modèle suivant est utilisé automatiquement.
          </p>

          {allCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              Aucun modèle disponible. Activez l'IA de l'application ou ajoutez des modèles dans les cartes ci-dessus.
            </p>
          ) : (
            <div className="space-y-4">
              {FEATURES.map((feature) => (
                <div key={feature} className="border border-border rounded-xl p-3">
                  <div className="text-sm font-semibold mb-2">{FEATURE_LABELS[feature]}</div>

                  <div className="space-y-1.5 mb-2">
                    {allCandidates.map((cand) => (
                      <label key={labelForStep(cand) + feature} className="flex items-center gap-2 cursor-pointer text-xs">
                        <Checkbox
                          checked={isSelected(feature, cand)}
                          onCheckedChange={(v) => toggleStep(feature, cand, !!v)}
                        />
                        <span className="truncate">{labelForStep(cand)}</span>
                      </label>
                    ))}
                  </div>

                  {config[feature].length > 0 && (
                    <div className="bg-muted/40 rounded-lg p-2 space-y-1">
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">Ordre de priorité</div>
                      {config[feature].map((s, idx) => (
                        !stepIsValid(s) ? null : (
                        <div key={labelForStep(s) + idx} className="flex items-center gap-2 bg-card rounded-md px-2 py-1.5">
                          <span className="text-[10px] font-bold text-primary w-4">{idx + 1}</span>
                          <span className="text-xs flex-1 truncate">{labelForStep(s)}</span>
                          <button onClick={() => move(feature, idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Monter">
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => move(feature, idx, 1)} disabled={idx === config[feature].length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Descendre">
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </section>
  );
};

export default GeminiKeySettings;
