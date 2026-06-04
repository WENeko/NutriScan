/**
 * Nutri-Coach : chat interactif (conseils + recettes anti-gaspillage).
 *
 * - Thème sombre premium, accents vert émeraude (token `primary`).
 * - Contexte temps réel envoyé en arrière-plan (profil, objectifs, consommé, sport).
 * - Routage IA en cascade via executeAIFeatureWithFallback ('coach' / 'recipe').
 * - Historique persisté dans la table coach_messages (Supabase principal uniquement).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Leaf, Send, ChefHat, BarChart3, Loader2, Trash2 } from "lucide-react";
import { executeAIFeatureWithFallback, type FeatureKey } from "@/lib/aiRouting";
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

interface Props {
  userId: string;
  context: CoachContext;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const BASE_SYSTEM =
  "Tu es Nutri-Coach, un conseiller expert en nutrition. Sois de bon conseil et encourageant. Si l'utilisateur demande une recette, calcule-la pour qu'elle s'insère parfaitement dans ses calories et macros restantes pour la journée. Réponds en français, de façon concise et structurée.";

const CoachPage: React.FC<Props> = ({ userId, context }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const remaining: Macro = useMemo(
    () => ({
      calories: Math.round(context.goals.calories - context.consumed.calories),
      proteins: Math.round(context.goals.proteins - context.consumed.proteins),
      carbs: Math.round(context.goals.carbs - context.consumed.carbs),
      fats: Math.round(context.goals.fats - context.consumed.fats),
    }),
    [context]
  );

  const buildSystem = (availableFoods?: string[]) => {
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
    if (availableFoods?.length) {
      lines.push(`- Aliments disponibles (bibliothèque/frigo): ${availableFoods.join(", ")}.`);
    }
    return lines.join("\n");
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("coach_messages")
        .select("id, role, content")
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
    if (!loading && !sending) inputRef.current?.focus();
  }, [loading, sending]);

  async function persist(role: "user" | "assistant", content: string) {
    const { data } = await supabase
      .from("coach_messages")
      .insert({ user_id: userId, role, content })
      .select("id")
      .maybeSingle();
    return (data as any)?.id as string | undefined;
  }

  async function send(text: string, feature: FeatureKey, availableFoods?: string[]) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, role: "user", content: trimmed };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    void persist("user", trimmed);

    try {
      const { result, modelUsed } = await executeAIFeatureWithFallback(feature, {
        system: buildSystem(availableFoods),
        userText: trimmed,
      });
      const reply = String(result);
      setMessages((m) => [...m, { id: `tmp-a-${Date.now()}`, role: "assistant", content: reply }]);
      void persist("assistant", reply);
      void modelUsed;
    } catch (e: any) {
      toast({ title: "Coach indisponible", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function recipeAction() {
    const { data: foods } = await supabase
      .from("custom_foods")
      .select("name")
      .eq("user_id", userId)
      .limit(40);
    const available = (foods as any[] | null)?.map((f) => f.name).filter(Boolean) ?? [];
    await send(
      "Propose-moi une recette anti-gaspillage avec ce qu'il me reste, qui rentre dans mes macros restantes du jour.",
      "recipe",
      available
    );
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
              ou le bilan de votre journée grâce aux boutons ci-dessous.
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
              <div key={m.id} className="flex gap-2">
                <div className="w-7 h-7 rounded-lg nutri-gradient flex items-center justify-center shrink-0 mt-0.5">
                  <Leaf className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div className="max-w-[85%] text-sm text-foreground whitespace-pre-wrap leading-relaxed">{m.content}</div>
              </div>
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

      {/* Actions rapides */}
      <div className="flex gap-2 mt-3 mb-2">
        <button
          onClick={recipeAction}
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
