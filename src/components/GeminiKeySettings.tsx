/**
 * Réglage du fournisseur d'IA et du modèle utilisés pour l'analyse des repas.
 *
 * - Les fournisseurs disponibles sont gérés par l'admin (table ai_providers).
 * - Chaque utilisateur saisit sa propre clé pour le fournisseur choisi.
 * - La liste des modèles est remontée DYNAMIQUEMENT depuis le fournisseur
 *   (aucun nom de modèle figé dans le code).
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { KeyRound, Save, ExternalLink, Eye, EyeOff, ShieldCheck, Trash2, RefreshCw, Loader2, Cpu } from "lucide-react";
import { isLovableAiEnabled, loadAiAccess } from "@/lib/aiAccess";
import {
  listProviders,
  fetchProviderModels,
  getUserProviderKey,
  saveUserProviderKey,
  deleteUserProviderKey,
  saveUserSelection,
  type AiProvider,
} from "@/lib/aiProviders";

interface Props {
  userId: string;
}

const GeminiKeySettings: React.FC<Props> = ({ userId }) => {
  const lovableEnabled = isLovableAiEnabled();
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [key, setKey] = useState("");
  const [hasStored, setHasStored] = useState(false);
  const [show, setShow] = useState(false);
  const [model, setModel] = useState<string>("");
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  const provider = providers.find((p) => p.id === providerId);

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
        const selectedId = ((profile as any)?.selected_ai_provider_id as string) || provs[0]?.id || "";
        setProviderId(selectedId);
        setModel(((profile as any)?.selected_ai_model as string) || "");
      } catch (e: any) {
        toast({ title: "Chargement KO", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Charge la clé stockée quand le fournisseur change
  useEffect(() => {
    if (!providerId) return;
    (async () => {
      const stored = (await getUserProviderKey(userId, providerId)) ?? "";
      setKey(stored);
      setHasStored(!!stored);
      setModels([]);
    })();
  }, [providerId, userId]);

  async function saveKey() {
    const trimmed = key.trim();
    if (!trimmed) {
      toast({ title: "Clé vide", description: "Entrez votre clé API.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await saveUserProviderKey(userId, providerId, trimmed);
    setSaving(false);
    if (error) {
      toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
      return;
    }
    setHasStored(true);
    await loadAiAccess(userId);
    toast({ title: "Clé enregistrée", description: "Stockée de façon sécurisée." });
  }

  async function removeKey() {
    if (!confirm("Supprimer votre clé enregistrée pour ce fournisseur ?")) return;
    setSaving(true);
    const { error } = await deleteUserProviderKey(userId, providerId);
    setSaving(false);
    if (error) {
      toast({ title: "Suppression KO", description: error.message, variant: "destructive" });
      return;
    }
    setKey("");
    setHasStored(false);
    setModels([]);
    await loadAiAccess(userId);
    toast({ title: "Clé supprimée" });
  }

  async function loadModels() {
    if (!provider) return;
    const k = key.trim();
    if (!k) {
      toast({ title: "Clé requise", description: "Entrez votre clé pour lister les modèles.", variant: "destructive" });
      return;
    }
    setLoadingModels(true);
    try {
      const list = await fetchProviderModels(provider, k);
      setModels(list);
      if (list.length === 0) {
        toast({ title: "Aucun modèle", description: "Le fournisseur n'a renvoyé aucun modèle." });
      } else if (!list.includes(model)) {
        setModel(list[0]);
      }
    } catch (e: any) {
      toast({ title: "Liste des modèles KO", description: e.message, variant: "destructive" });
    } finally {
      setLoadingModels(false);
    }
  }

  async function saveSelection() {
    setSaving(true);
    const { error } = await saveUserSelection(userId, providerId, model || null);
    setSaving(false);
    if (error) {
      toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
      return;
    }
    await loadAiAccess(userId);
    toast({ title: "Sélection enregistrée", description: `${provider?.name} · ${model || "modèle par défaut"}` });
  }

  const isGemini = provider?.api_type === "gemini";

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "45ms" }}>
      <div className="flex items-center gap-2 mb-3">
        <KeyRound className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Fournisseur d'IA & modèle</h2>
      </div>

      {lovableEnabled ? (
        <div className="flex items-start gap-2 bg-primary/10 text-primary rounded-xl p-3 mb-3">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">
            L'IA Lovable est activée sur votre compte : l'analyse l'utilise en priorité.
            Vous pouvez tout de même configurer un fournisseur de secours ci-dessous.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">
          L'analyse de repas par IA utilise <strong>votre</strong> clé auprès du fournisseur choisi.
          Sélectionnez un fournisseur, entrez votre clé, puis choisissez un modèle.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : providers.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          Aucun fournisseur disponible. Demandez à un administrateur d'en ajouter.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Fournisseur */}
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Fournisseur</Label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm mt-1"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.api_type === "gemini" ? "Gemini" : "OpenAI-compatible"})
                </option>
              ))}
            </select>
          </div>

          {/* Guide d'obtention (Gemini uniquement) */}
          {isGemini && (
            <div className="rounded-xl bg-accent p-3">
              <p className="text-[11px] font-semibold mb-1.5">Comment obtenir une clé Gemini gratuite ?</p>
              <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Ouvrez Google AI Studio.</li>
                <li>Connectez-vous avec votre compte Google.</li>
                <li>Cliquez sur « Create API key » puis copiez la clé.</li>
              </ol>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary mt-2"
              >
                Obtenir ma clé Gemini <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Clé */}
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Votre clé</Label>
            <div className="relative mt-1">
              <Input
                type={show ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={isGemini ? "AIza..." : "sk-..."}
                className="h-10 pr-10 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={show ? "Masquer" : "Afficher"}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={saveKey} disabled={saving} className="flex-1 h-10 rounded-xl">
                <Save className="w-4 h-4 mr-1" /> Enregistrer la clé
              </Button>
              {hasStored && (
                <Button onClick={removeKey} disabled={saving} variant="ghost" className="h-10">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>

          {/* Modèle (dynamique) */}
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Modèle d'analyse</Label>
            <div className="flex gap-2 mt-1">
              {models.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={isGemini ? "gemini-2.5-flash" : "gpt-4o-mini"}
                  className="h-10 flex-1 font-mono text-xs"
                />
              )}
              <Button onClick={loadModels} disabled={loadingModels} variant="outline" className="h-10">
                {loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Cliquez sur l'icône pour charger la liste des modèles à jour du fournisseur.
            </p>
          </div>

          <Button onClick={saveSelection} disabled={saving} className="w-full h-10 rounded-xl">
            <Cpu className="w-4 h-4 mr-1" /> Utiliser ce fournisseur & modèle
          </Button>
        </div>
      )}
    </section>
  );
};

export default GeminiKeySettings;
