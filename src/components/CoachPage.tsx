/**
 * Nutri-Coach : chat interactif (conseils + recettes anti-gaspillage).
 *
 * - Thème sombre premium, accents vert émeraude (token `primary`).
 * - Contexte temps réel envoyé en arrière-plan (profil, objectifs, consommé, sport).
 * - Routage IA en cascade via executeAIFeatureWithFallback ('coach' / 'recipe').
 * - Historique persisté dans la table coach_messages (Supabase principal uniquement).
 * - Le modèle IA ayant répondu est affiché sous chaque réponse.
 * - L'assistant de recettes utilise une description libre (texte + photos) des
 *   ingrédients disponibles, et non « mes produits ».
 * - Les recettes générées peuvent être exportées vers l'éditeur de recette.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Leaf, Send, ChefHat, BarChart3, Loader2, Trash2, Camera, X, Cpu, FileEdit } from "lucide-react";
import { executeAIFeatureWithFallback, type FeatureKey } from "@/lib/aiRouting";
import { analyzeMeal } from "@/services/mealAnalysisService";
import type { UserProfile } from "@/lib/micro-goals";

interface Macro {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

export interface CoachContext {
  goals: Macro;
  consumed: Macro;
  sportCalories: number;
  weight: number;
  targetWeight: number | null;
  phase?: string | null;
  userProfile: UserProfile;
}

export interface ExportRecipe {
  title: string;
  portions: number;
  ingredients: { name: string; grams: number }[];
}

interface Props {
  userId: string;
  context: CoachContext;
  onExportRecipe?: (recipe: ExportRecipe) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model_used?: string | null;
}

const BASE_SYSTEM =
  "Tu es Nutri-Coach, un conseiller expert en nutrition. Sois de bon conseil et encourageant. Si l'utilisateur demande une recette, calcule-la pour qu'elle s'insère parfaitement dans ses calories et macros restantes pour la journée. Réponds en français, de façon concise et structurée.";

// Instruction ajoutée pour les recettes : produire un bloc structuré exportable.
const RECIPE_EXPORT_RULE =
  "À la FIN de toute recette, ajoute un bloc de code délimité par ```recipe-json contenant un JSON STRICT de la forme " +
  '{"title":"Nom de la recette","portions":1,"ingredients":[{"name":"ingrédient","grams":100}]}. ' +
  "Mets des grammes réalistes pour chaque ingrédient. Ce bloc sert à l'export et ne doit pas être commenté.";

/** Extrait la recette structurée d'un message assistant (bloc ```recipe-json). */
function parseExportRecipe(content: string): ExportRecipe | null {
  const m = content.match(/```recipe-json\s*([\s\S]*?)```/i);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1].trim());
    const ingredients = Array.isArray(obj.ingredients)
      ? obj.ingredients
          .map((i: any) => ({ name: String(i.name || "").trim(), grams: Number(i.grams) || 0 }))
          .filter((i: any) => i.name && i.grams > 0)
      : [];
    if (ingredients.length === 0) return null;
    return {
      title: String(obj.title || "Recette du Coach"),
      portions: Math.max(1, Number(obj.portions) || 1),
      ingredients,
    };
  } catch {
    return null;
  }
}

/** Retire le bloc ```recipe-json``` de l'affichage (gardé pour l'export uniquement). */
function stripRecipeBlock(content: string): string {
  return content.replace(/```recipe-json\s*[\s\S]*?```/i, "").trim();
}

const CoachPage: React.FC<Props> = ({ userId, context, onExportRecipe }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRecipe, setShowRecipe] = useState(false);
  const [recipeText, setRecipeText] = useState("");
  const [recipePhotos, setRecipePhotos] = useState<string[]>([]);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const remaining: Macro = useMemo(
    () => ({
      calories: Math.round(context.goals.calories - context.consumed.calories),
      proteins: Math.round(context.goals.proteins - context.consumed.proteins),
      carbs: Math.round(context.goals.carbs - context.consumed.carbs),
      fats: Math.round(context.goals.fats - context.consumed.fats),
    }),
    [context]
  );

  const buildSystem = (opts?: { availableFoods?: string[]; recipe?: boolean }) => {
    const p = context.userProfile || {};
    const lines = [
      BASE_SYSTEM,
      "",
      "CONTEXTE TEMPS RÉEL (privé, ne pas recopier tel quel) :",
      `- Profil: ${p.gender ?? "n/a"}, ${p.age ?? "n/a"} ans, poids ${context.weight} kg, cible ${context.targetWeight ?? "n/a"} kg, phase ${context.phase ?? "maintien"}.`,
      `- Objectifs du jour: ${context.goals.calories} kcal, P ${context.goals.proteins}g / G ${context.goals.carbs}g / L ${context.goals.fats}g.`,
      `- Consommé aujourd'hui: ${Math.round(context.consumed.calories)} kcal, P ${Math.round(context.consumed.proteins)}g / G ${Math.round(context.consumed.carbs)}g / L ${Math.round(context.consumed.fats)}g.`,
      `- Restant aujourd'hui: ${remaining.calories} kcal, P ${remaining.proteins}g / G ${remaining.carbs}g / L ${remaining.fats}g.`,
      `- Calories sportives (lissées): ${Math.round(context.sportCalories)} kcal.`,
    ];
    if (opts?.availableFoods?.length) {
      lines.push(`- Ingrédients disponibles décrits par l'utilisateur: ${opts.availableFoods.join(", ")}.`);
    }
    if (opts?.recipe) {
      lines.push("", RECIPE_EXPORT_RULE);
    }
    return lines.join("\n");
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("coach_messages")
        .select("id, role, content, model_used")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      setMessages((data as ChatMessage[]) ?? []);
      setLoading(false);
    })();
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!loading && !sending && !showRecipe) inputRef.current?.focus();
  }, [loading, sending, showRecipe]);

  async function persist(role: "user" | "assistant", content: string, model?: string | null) {
    const { data } = await supabase
      .from("coach_messages")
      .insert({ user_id: userId, role, content, model_used: model ?? null })
      .select("id")
      .maybeSingle();
    return (data as any)?.id as string | undefined;
  }

  async function send(text: string, feature: FeatureKey, opts?: { availableFoods?: string[]; recipe?: boolean }) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, role: "user", content: trimmed };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    void persist("user", trimmed);

    try {
      const { result, modelUsed } = await executeAIFeatureWithFallback(feature, {
        system: buildSystem(opts),
        userText: trimmed,
      });
      const reply = String(result);
      setMessages((m) => [...m, { id: `tmp-a-${Date.now()}`, role: "assistant", content: reply, model_used: modelUsed }]);
      void persist("assistant", reply, modelUsed);
    } catch (e: any) {
      toast({ title: "Coach indisponible", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  // ── Composer recette : photos + texte décrivant les ingrédients disponibles ──
  async function onRecipePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      const base64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(file);
      });
      setRecipePhotos((p) => [...p, base64]);
    }
  }

  async function submitRecipe() {
    if (recipePhotos.length === 0 && !recipeText.trim()) {
      toast({ title: "Décrivez vos ingrédients", description: "Ajoutez une photo ou un texte.", variant: "destructive" });
      return;
    }
    setRecipeBusy(true);
    try {
      const detected: string[] = [];
      // Analyse des photos pour extraire les ingrédients visibles (vision).
      for (const img of recipePhotos) {
        try {
          const data = await analyzeMeal({ image: img });
          (data?.items ?? []).forEach((it: any) => {
            const n = it?.food_name || it?.name;
            if (n) detected.push(String(n));
          });
        } catch {
          /* ignore une photo illisible */
        }
      }
      const available = [...detected];
      if (recipeText.trim()) available.push(recipeText.trim());

      const composer = { ...recipePhotos };
      void composer;
      setShowRecipe(false);
      setRecipePhotos([]);
      setRecipeText("");

      await send(
        "Propose-moi une recette anti-gaspillage avec les ingrédients ci-dessus, qui rentre dans mes macros restantes du jour.",
        "recipe",
        { availableFoods: available, recipe: true }
      );
    } finally {
      setRecipeBusy(false);
    }
  }

  async function reportAction() {
    await send("Fais le bilan de ma journée : repas consommés vs dépenses sportives, et conseils pour la suite.", "coach");
  }

  async function clearHistory() {
    if (!confirm("Effacer tout l'historique du Coach ?")) return;
    await supabase.from("coach_messages").delete().eq("user_id", userId);
    setMessages([]);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl nutri-gradient flex items-center justify-center shrink-0">
          <Leaf className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-bold text-lg leading-tight">Nutri-Coach</h1>
          <p className="text-xs text-muted-foreground">Conseils & recettes adaptés à vos objectifs</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clearHistory} className="text-muted-foreground hover:text-destructive" aria-label="Effacer l'historique">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-card rounded-2xl p-5 text-sm text-muted-foreground shadow-card">
            <p className="font-semibold text-foreground mb-1">Bonjour 👋</p>
            <p>
              Je suis votre Nutri-Coach. Posez-moi une question, demandez une recette anti-gaspillage
              (décrivez vos ingrédients par photo ou texte) ou le bilan de votre journée.
            </p>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              (() => {
                const recipe = parseExportRecipe(m.content);
                const display = recipe ? stripRecipeBlock(m.content) : m.content;
                return (
                  <div key={m.id} className="flex gap-2">
                    <div className="w-7 h-7 rounded-lg nutri-gradient flex items-center justify-center shrink-0 mt-0.5">
                      <Leaf className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                    <div className="max-w-[85%] space-y-1.5">
                      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{display}</div>
                      {recipe && onExportRecipe && (
                        <button
                          onClick={() => onExportRecipe(recipe)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold"
                        >
                          <FileEdit className="w-3.5 h-3.5" /> Ajouter à ma journée
                        </button>
                      )}
                      {m.model_used && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Cpu className="w-3 h-3" /> {m.model_used}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )
          )
        )}
        {sending && (
          <div className="flex gap-2 items-center">
            <div className="w-7 h-7 rounded-lg nutri-gradient flex items-center justify-center shrink-0">
              <Leaf className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div className="flex gap-1 py-2">
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Composer recette (photos + texte) */}
      {showRecipe && (
        <div className="bg-card rounded-2xl p-3 mt-3 shadow-card space-y-2 animate-fade-up">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-primary" /> Ingrédients disponibles
            </p>
            <button onClick={() => setShowRecipe(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Décrivez ce que vous avez (frigo, placard…) en texte et/ou ajoutez des photos. L'IA proposera une recette adaptée.
          </p>
          <textarea
            value={recipeText}
            onChange={(e) => setRecipeText(e.target.value)}
            rows={2}
            placeholder="Ex : 2 œufs, reste de riz, courgette, parmesan…"
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          {recipePhotos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recipePhotos.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} alt={`Ingrédient ${i + 1}`} className="w-14 h-14 rounded-lg object-cover" />
                  <button
                    onClick={() => setRecipePhotos((p) => p.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    aria-label="Retirer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onRecipePhotos} />
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={recipeBusy}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-muted text-foreground text-xs font-semibold disabled:opacity-50"
            >
              <Camera className="w-4 h-4" /> Ajouter une photo
            </button>
            <button
              onClick={submitRecipe}
              disabled={recipeBusy}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl nutri-gradient text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              {recipeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChefHat className="w-4 h-4" />} Générer la recette
            </button>
          </div>
        </div>
      )}

      {/* Actions rapides */}
      {!showRecipe && (
        <div className="flex gap-2 mt-3 mb-2">
          <button
            onClick={() => setShowRecipe(true)}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary/10 text-primary text-xs font-semibold disabled:opacity-50"
          >
            <ChefHat className="w-4 h-4" /> Recette anti-gaspillage
          </button>
          <button
            onClick={reportAction}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary/10 text-primary text-xs font-semibold disabled:opacity-50"
          >
            <BarChart3 className="w-4 h-4" /> Bilan de ma journée
          </button>
        </div>
      )}

      {/* Saisie */}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input, "coach");
            }
          }}
          rows={1}
          placeholder="Écrivez votre message…"
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm max-h-32"
        />
        <button
          onClick={() => void send(input, "coach")}
          disabled={sending || !input.trim()}
          className="w-11 h-11 rounded-xl nutri-gradient flex items-center justify-center shrink-0 disabled:opacity-50"
          aria-label="Envoyer"
        >
          {sending ? (
            <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
          ) : (
            <Send className="w-5 h-5 text-primary-foreground" />
          )}
        </button>
      </div>
    </div>
  );
};

export default CoachPage;
