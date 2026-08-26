/**
 * Dialogue de réévaluation d'un repas existant par un modèle IA au choix.
 *
 * - Liste dynamiquement les modèles disponibles (Edge Function Lovable + clés BYOK).
 * - Health-check en temps réel (🟢 opérationnel, 🟡 latence, 🔴 indisponible).
 * - Relance l'analyse sur l'image d'origine ou sur le texte brut (`raw_text_input`).
 * - Affiche un comparatif old vs new (kcal, macros, nombre d'ingrédients).
 * - Permet d'appliquer les nouvelles valeurs (remplacement des items + totaux).
 */
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { analyzeMeal } from "@/services/mealAnalysisService";
import AnalysisProgressCard from "./AnalysisProgressCard";
import {
  listAvailableStepsForUser,
  checkStepHealth,
  type AvailableStep,
  type HealthCheckResult,
  type RoutingProgressStep,
  type RoutingStep,
} from "@/lib/aiRouting";
import { buildStdNutrients } from "@/utils/nutrients-helpers";
import { MACRO_COLORS } from "@/lib/macro-colors";
import { acquireAnalysisWakeLock } from "@/lib/analysisWakeLock";

interface Meal {
  id: string;
  image_url: string | null;
  meal_name?: string | null;
  total_calories: number;
  total_proteins: number;
  total_carbs: number;
  total_fats: number;
  model_used?: string | null;
  confidence_score?: number | null;
}

interface Props {
  meal: Meal;
  userId: string;
  customDefs?: { key: string; label?: string; unit: string }[];
  onClose: () => void;
  onApplied: () => void;
}

function statusColor(s: HealthCheckResult["status"]) {
  if (s === "ok") return "bg-emerald-500";
  if (s === "slow") return "bg-amber-500";
  return "bg-red-500";
}
function statusLabel(s: HealthCheckResult["status"]) {
  if (s === "ok") return "Opérationnel";
  if (s === "slow") return "Latence élevée";
  return "Indisponible";
}

const ReevaluateMealDialog: React.FC<Props> = ({ meal, userId, customDefs, onClose, onApplied }) => {
  const [rawText, setRawText] = useState<string | null>(null);
  const [available, setAvailable] = useState<AvailableStep[]>([]);
  const [health, setHealth] = useState<Record<string, HealthCheckResult | "loading">>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState<RoutingProgressStep>("preparing");
  const [progressModel, setProgressModel] = useState<string>("");
  const [newResult, setNewResult] = useState<any | null>(null);
  const [applying, setApplying] = useState(false);

  const canReevaluate = !!meal.image_url || !!rawText;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("meals")
        .select("raw_text_input")
        .eq("id", meal.id)
        .maybeSingle();
      setRawText((data as any)?.raw_text_input ?? null);
    })();
  }, [meal.id]);

  useEffect(() => {
    (async () => {
      setLoadingAvailable(true);
      const feature = meal.image_url ? "photo" : "text";
      const steps = await listAvailableStepsForUser(userId, feature);
      setAvailable(steps);
      if (steps.length > 0) {
        const k = stepKey(steps[0].step);
        setSelectedKey(k);
      }
      setLoadingAvailable(false);
      // Health-check en parallèle
      steps.forEach(async (s) => {
        const k = stepKey(s.step);
        setHealth((h) => ({ ...h, [k]: "loading" }));
        const r = await checkStepHealth(userId, s.step);
        setHealth((h) => ({ ...h, [k]: r }));
      });
    })();
  }, [userId, meal.image_url]);

  function stepKey(s: RoutingStep): string {
    if (s.type === "edge_function") return "edge";
    return `byok::${s.providerId}::${s.model ?? ""}`;
  }

  const selected = useMemo(
    () => available.find((s) => stepKey(s.step) === selectedKey) ?? null,
    [available, selectedKey]
  );

  async function runReevaluate() {
    if (!selected) return;
    setAnalyzing(true);
    const releaseWakeLock = await acquireAnalysisWakeLock();
    setNewResult(null);
    setProgressStep("preparing");
    setProgressModel(selected.label);
    try {
      let imageBase64: string | undefined;
      if (meal.image_url) {
        const res = await fetch(meal.image_url);
        const blob = await res.blob();
        imageBase64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      }
      const { data: customFoods } = await supabase
        .from("custom_foods")
        .select("name, serving_size_g, calories_per_100g, proteins_per_100g, carbs_per_100g, fats_per_100g, nutrients_std, nutrients_custom")
        .eq("user_id", userId);
      const result = await analyzeMeal({
        image: imageBase64,
        text: !imageBase64 ? rawText ?? undefined : undefined,
        custom_foods: customFoods || [],
        custom_nutrients: customDefs,
        local_time: new Date().toLocaleString("fr-FR"),
        overrideSteps: [selected.step],
        onProgress: (evt) => {
          setProgressStep(evt.step);
          setProgressModel(evt.modelLabel);
        },
      });
      setNewResult(result);
    } catch (e: any) {
      toast({ title: "Réévaluation échouée", description: e.message, variant: "destructive" });
    } finally {
      releaseWakeLock();
      setAnalyzing(false);
    }
  }

  async function applyResult() {
    if (!newResult) return;
    setApplying(true);
    try {
      const items: any[] = newResult.items || [];
      const totals = items.reduce(
        (acc, it) => {
          const p = Number(it.proteins) || 0;
          const c = Number(it.carbs) || 0;
          const f = Number(it.fats) || 0;
          return {
            calories: acc.calories + (Number(it.calories) || p * 4 + c * 4 + f * 9),
            proteins: acc.proteins + p,
            carbs: acc.carbs + c,
            fats: acc.fats + f,
          };
        },
        { calories: 0, proteins: 0, carbs: 0, fats: 0 }
      );
      await supabase.from("meal_items").delete().eq("meal_id", meal.id);
      if (items.length > 0) {
        await supabase.from("meal_items").insert(
          items.map((it) => {
            const weight =
              parseFloat(it.quantity || it.estimated_weight_g || it.weight_g || "100") || 100;
            const p = Number(it.proteins) || 0;
            const c = Number(it.carbs) || 0;
            const f = Number(it.fats) || 0;
            return {
              meal_id: meal.id,
              name: it.food_name || it.name || "Aliment",
              quantity: `${weight}g`,
              calories: Number(it.calories) || Math.round(p * 4 + c * 4 + f * 9),
              proteins: p,
              carbs: c,
              fats: f,
              nutrients_std: buildStdNutrients(it as Record<string, unknown>),
              nutrients_custom: {},
            } as any;
          })
        );
      }
      await supabase
        .from("meals")
        .update({
          total_calories: Math.round(totals.calories),
          total_proteins: Math.round(totals.proteins * 10) / 10,
          total_carbs: Math.round(totals.carbs * 10) / 10,
          total_fats: Math.round(totals.fats * 10) / 10,
          model_used: newResult._model_used ?? meal.model_used ?? null,
          confidence_score: newResult._confidence_score ?? null,
          raw_ai_analysis: JSON.stringify(newResult),
        } as any)
        .eq("id", meal.id);
      // Resync Santé Connect après réévaluation (non bloquant)
      void resyncMealToHealthConnect(
        meal.id,
        {
          meal_name: (meal as any).meal_name || "Repas",
          total_calories: Math.round(totals.calories),
          total_proteins: Math.round(totals.proteins * 10) / 10,
          total_carbs: Math.round(totals.carbs * 10) / 10,
          total_fats: Math.round(totals.fats * 10) / 10,
          timestamp: (meal as any).timestamp,
        },
        items,
      ).catch(() => {});
      toast({ title: "Repas réévalué !" });
      onApplied();
      onClose();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  const newTotals = useMemo(() => {
    if (!newResult) return null;
    const items: any[] = newResult.items || [];
    return items.reduce(
      (acc, it) => {
        const p = Number(it.proteins) || 0;
        const c = Number(it.carbs) || 0;
        const f = Number(it.fats) || 0;
        return {
          calories: acc.calories + (Number(it.calories) || p * 4 + c * 4 + f * 9),
          proteins: acc.proteins + p,
          carbs: acc.carbs + c,
          fats: acc.fats + f,
          count: acc.count + 1,
        };
      },
      { calories: 0, proteins: 0, carbs: 0, fats: 0, count: 0 }
    );
  }, [newResult]);

  return createPortal(
    <div className="fixed top-0 left-0 w-[100dvw] h-[100dvh] z-[100] flex items-end sm:items-center justify-center bg-black/60 p-3 animate-fade-up">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-float max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-display font-semibold text-sm">Réévaluer avec l'IA</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!canReevaluate && (
            <p className="text-xs text-muted-foreground">
              Ce repas ne possède ni photo ni texte d'origine — impossible de le réévaluer.
            </p>
          )}

          {canReevaluate && (
            <>
              <div className="text-xs text-muted-foreground">
                Source : {meal.image_url ? "photo d'origine" : `texte : « ${rawText?.slice(0, 80)}${(rawText?.length ?? 0) > 80 ? "…" : ""} »`}
              </div>

              <div>
                <h3 className="text-[10px] uppercase font-semibold text-muted-foreground mb-2">
                  Modèle à utiliser
                </h3>
                {loadingAvailable ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Chargement…
                  </div>
                ) : available.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun modèle configuré.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {available.map((s) => {
                      const k = stepKey(s.step);
                      const h = health[k];
                      const status = h === "loading" || !h ? null : h.status;
                      return (
                        <li key={k}>
                          <button
                            onClick={() => setSelectedKey(k)}
                            className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                              selectedKey === k
                                ? "bg-primary/10 border border-primary/40"
                                : "bg-accent hover:bg-accent/70"
                            }`}
                          >
                            <span className="text-xs font-medium flex-1 truncate">{s.label}</span>
                            <div className="flex items-center gap-1.5">
                              {h === "loading" || !h ? (
                                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                              ) : (
                                <>
                                  <span
                                    className={`w-2 h-2 rounded-full ${statusColor(status!)}`}
                                    title={statusLabel(status!)}
                                  />
                                  <span className="text-[10px] text-muted-foreground tabular-nums">
                                    {h.latencyMs}ms
                                  </span>
                                </>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {analyzing && (
                <AnalysisProgressCard
                  preview={meal.image_url}
                  mode={meal.image_url ? "photo" : "text"}
                  currentStep={progressStep}
                  modelLabel={progressModel}
                  isFallback={false}
                  attempt={1}
                />
              )}

              {newResult && newTotals && (
                <div className="bg-accent rounded-xl p-3 space-y-2 animate-fade-up">
                  <h3 className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Comparatif
                  </h3>
                  <div className="grid grid-cols-3 text-[11px] gap-1">
                    <div />
                    <div className="text-center font-semibold">Avant</div>
                    <div className="text-center font-semibold text-primary">Après</div>
                    {(
                      [
                        ["Calories", meal.total_calories, newTotals.calories, MACRO_COLORS.calorie, " kcal"],
                        ["Protéines", meal.total_proteins, newTotals.proteins, MACRO_COLORS.protein, " g"],
                        ["Glucides", meal.total_carbs, newTotals.carbs, MACRO_COLORS.carb, " g"],
                        ["Lipides", meal.total_fats, newTotals.fats, MACRO_COLORS.fat, " g"],
                      ] as const
                    ).map(([label, oldV, newV, color, unit]) => {
                      const delta = Math.round(newV as number) - Math.round(oldV as number);
                      return (
                        <React.Fragment key={label}>
                          <div className="text-muted-foreground">{label}</div>
                          <div className="text-center">{Math.round(oldV as number)}{unit}</div>
                          <div className="text-center font-medium" style={{ color: color as string }}>
                            {Math.round(newV as number)}{unit}
                            {delta !== 0 && (
                              <span className="ml-1 text-[9px] text-muted-foreground">
                                ({delta > 0 ? "+" : ""}{delta})
                              </span>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}
                    <div className="text-muted-foreground">Ingrédients</div>
                    <div className="text-center">—</div>
                    <div className="text-center font-medium">{newTotals.count}</div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={runReevaluate}
                  disabled={!selected || analyzing || applying}
                  className="flex-1 h-10 rounded-xl"
                >
                  {analyzing ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyse…</>
                  ) : (
                    <><RefreshCw className="w-4 h-4 mr-2" /> {newResult ? "Relancer" : "Réévaluer"}</>
                  )}
                </Button>
                {newResult && (
                  <Button
                    onClick={applyResult}
                    disabled={applying}
                    variant="default"
                    className="flex-1 h-10 rounded-xl bg-primary"
                  >
                    {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Appliquer"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReevaluateMealDialog;
