/**
 * Parcours d'onboarding (nouvel utilisateur).
 *
 * Modal plein écran avec un assistant (stepper) :
 *  1. Bienvenue + choix de la méthode (IA de l'app si autorisée, ou clé perso).
 *  2. Saisie de la clé principale (Google Gemini recommandé : simple & gratuit).
 *  3. Test de connexion réussi → accès au Dashboard.
 *
 * Option « Plus tard » : on peut passer cette étape. Un rappel reste affiché sur
 * le Dashboard tant qu'aucune IA n'est fonctionnelle.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Leaf, Sparkles, ArrowRight, ArrowLeft, Eye, EyeOff, CheckCircle2, Loader2,
  ExternalLink, Gift, ShieldCheck, KeyRound, Rocket,
} from "lucide-react";
import { isLovableAiEnabled, loadAiAccess } from "@/lib/aiAccess";
import {
  listProviders,
  fetchProviderModels,
  saveUserProviderKey,
  saveUserSelection,
  type AiProvider,
} from "@/lib/aiProviders";
import { getCatalogEntry, popularityOf, isKeyFormatValid } from "@/lib/providerCatalog";

interface Props {
  userId: string;
  onComplete: () => void;
}

const onboardingFlag = (userId: string) => `onboarding_done_${userId}`;

export function markOnboardingDone(userId: string) {
  localStorage.setItem(onboardingFlag(userId), "true");
}

export function isOnboardingDone(userId: string) {
  return localStorage.getItem(onboardingFlag(userId)) === "true";
}

const OnboardingFlow: React.FC<Props> = ({ userId, onComplete }) => {
  const lovableEnabled = isLovableAiEnabled();
  const [step, setStep] = useState(0);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const provs = await listProviders();
        setProviders(provs);
        // Recommande Google Gemini (popularité 1) par défaut.
        const recommended =
          [...provs].sort((a, b) => popularityOf(a.base_url) - popularityOf(b.base_url))[0];
        if (recommended) setProviderId(recommended.id);
      } catch {
        /* silencieux */
      }
    })();
  }, []);

  const provider = providers.find((p) => p.id === providerId);
  const entry = provider ? getCatalogEntry(provider.base_url) : null;
  const formatOk = useMemo(
    () => provider != null && apiKey.trim().length > 0 && isKeyFormatValid(provider.base_url, apiKey),
    [provider, apiKey],
  );

  function finish() {
    markOnboardingDone(userId);
    onComplete();
  }

  function useAppAi() {
    // L'IA de l'application est déjà activée (lovable_ai_enabled).
    toast({ title: "IA de l'application activée ✨" });
    finish();
  }

  async function testAndSave() {
    if (!provider) return;
    const k = apiKey.trim();
    if (!k) {
      toast({ title: "Clé requise", description: "Entrez votre clé API.", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const models = await fetchProviderModels(provider, k);
      // Sauvegarde clé + sélection (1er modèle si dispo).
      const { error: ek } = await saveUserProviderKey(userId, provider.id, k);
      if (ek) throw new Error(ek.message);
      const { error: es } = await saveUserSelection(userId, provider.id, models[0] ?? null);
      if (es) throw new Error(es.message);
      await loadAiAccess(userId);
      setStep(2);
    } catch (e: any) {
      toast({ title: "Échec du test", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col items-center justify-center px-5 overflow-y-auto">
      <div className="w-full max-w-sm py-8 space-y-6">
        {/* Indicateur d'étapes */}
        <div className="flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/50" : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Étape 0 — Bienvenue + choix méthode */}
        {step === 0 && (
          <div className="space-y-5 animate-fade-up text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl nutri-gradient flex items-center justify-center shadow-float">
                <Leaf className="w-8 h-8 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-display font-bold">Bienvenue sur NutriScan</h1>
              <p className="text-sm text-muted-foreground">
                NutriScan utilise l'<strong>intelligence artificielle</strong> pour analyser vos
                repas à partir d'une photo ou d'une description, et estimer calories &
                micronutriments.
              </p>
            </div>

            <div className="space-y-2 text-left">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Comment voulez-vous démarrer ?</p>

              {lovableEnabled && (
                <button
                  onClick={useAppAi}
                  className="w-full flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-2xl p-4 text-left hover:border-primary transition-colors"
                >
                  <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">Utiliser l'IA de l'application</div>
                    <div className="text-xs text-muted-foreground">Aucune configuration. Prêt immédiatement.</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-primary" />
                </button>
              )}

              <button
                onClick={() => setStep(1)}
                className="w-full flex items-center gap-3 bg-card border border-primary/20 rounded-2xl p-4 text-left hover:border-primary/40 transition-colors"
              >
                <KeyRound className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">Utiliser mes propres clés API</div>
                  <div className="text-xs text-muted-foreground">Google, Groq, OpenRouter, GitHub… souvent gratuit.</div>
                </div>
                <ArrowRight className="w-4 h-4 text-primary" />
              </button>
            </div>

            <button onClick={finish} className="text-xs text-muted-foreground hover:underline">
              Plus tard
            </button>
          </div>
        )}

        {/* Étape 1 — Saisie de la clé principale */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-up">
            <div className="flex flex-col items-center gap-2 text-center">
              <Sparkles className="w-7 h-7 text-primary" />
              <h2 className="text-xl font-display font-bold">Connectez un fournisseur d'IA</h2>
              <p className="text-xs text-muted-foreground">
                Nous recommandons <strong>Google AI Studio</strong> : simple et gratuit.
              </p>
            </div>

            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Fournisseur</Label>
              <select
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  setApiKey("");
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm mt-1"
              >
                {[...providers]
                  .sort((a, b) => popularityOf(a.base_url) - popularityOf(b.base_url))
                  .map((p) => {
                    const e = getCatalogEntry(p.base_url);
                    return (
                      <option key={p.id} value={p.id}>
                        {e?.icon ?? "🔌"} {e?.label ?? p.name}
                      </option>
                    );
                  })}
              </select>
            </div>

            {entry && (
              <div className="rounded-xl bg-accent p-3 text-xs space-y-1.5">
                <p className="font-semibold flex items-center gap-1">
                  Obtenir une clé {entry.label}
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
              </div>
            )}

            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Votre clé</Label>
              <div className="relative mt-1">
                <Input
                  type={show ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={entry?.keyPlaceholder ?? "Votre clé API"}
                  className="h-10 pr-16 font-mono text-xs"
                  autoComplete="off"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {formatOk && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  <button type="button" onClick={() => setShow((s) => !s)} className="text-muted-foreground">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button onClick={testAndSave} disabled={testing} className="w-full h-11 rounded-xl">
              {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Tester la connexion
            </Button>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(0)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                <ArrowLeft className="w-3 h-3" /> Retour
              </button>
              <button onClick={finish} className="text-xs text-muted-foreground hover:underline">
                Plus tard
              </button>
            </div>
          </div>
        )}

        {/* Étape 2 — Succès */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-up text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-primary" />
              </div>
              <h2 className="text-2xl font-display font-bold">Tout est prêt !</h2>
              <p className="text-sm text-muted-foreground">
                Votre IA est connectée. Vous pouvez analyser votre premier repas.
              </p>
            </div>
            <Button onClick={finish} className="w-full h-11 rounded-xl nutri-gradient text-primary-foreground font-semibold">
              <Rocket className="w-4 h-4 mr-1" /> Accéder au Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingFlow;
