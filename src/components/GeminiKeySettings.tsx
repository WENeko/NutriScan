/**
 * Réglage de la clé API Gemini personnelle de l'utilisateur.
 * Stockage sécurisé en base (table user_api_keys, RLS propriétaire uniquement).
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { KeyRound, Save, ExternalLink, Eye, EyeOff, ShieldCheck, Trash2 } from "lucide-react";
import { isLovableAiEnabled, setPersonalGeminiKeyCache } from "@/lib/aiAccess";

interface Props {
  userId: string;
}

const GeminiKeySettings: React.FC<Props> = ({ userId }) => {
  const [key, setKey] = useState("");
  const [hasStored, setHasStored] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const lovableEnabled = isLovableAiEnabled();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_api_keys")
        .select("gemini_api_key")
        .eq("user_id", userId)
        .maybeSingle();
      const stored = (data as any)?.gemini_api_key ?? "";
      setKey(stored);
      setHasStored(!!stored);
      setLoading(false);
    })();
  }, [userId]);

  async function save() {
    const trimmed = key.trim();
    if (!trimmed) {
      toast({ title: "Clé vide", description: "Entrez votre clé API Gemini.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("user_api_keys")
      .upsert({ user_id: userId, gemini_api_key: trimmed }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Sauvegarde KO", description: error.message, variant: "destructive" });
      return;
    }
    setPersonalGeminiKeyCache(trimmed);
    setHasStored(true);
    toast({ title: "Clé enregistrée", description: "Votre clé Gemini est stockée de façon sécurisée." });
  }

  async function removeKey() {
    if (!confirm("Supprimer votre clé Gemini enregistrée ?")) return;
    setSaving(true);
    const { error } = await supabase.from("user_api_keys").delete().eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast({ title: "Suppression KO", description: error.message, variant: "destructive" });
      return;
    }
    setKey("");
    setHasStored(false);
    setPersonalGeminiKeyCache(null);
    toast({ title: "Clé supprimée" });
  }

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "45ms" }}>
      <div className="flex items-center gap-2 mb-3">
        <KeyRound className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Clé API Gemini</h2>
      </div>

      {lovableEnabled ? (
        <div className="flex items-start gap-2 bg-primary/10 text-primary rounded-xl p-3 mb-3">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">
            L'IA Lovable est activée sur votre compte. Vous n'avez pas besoin de clé personnelle,
            mais vous pouvez tout de même en enregistrer une.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">
          L'analyse de repas par IA utilise <strong>votre</strong> clé Gemini. Renseignez-la ci-dessous
          pour activer l'analyse des photos et descriptions.
        </p>
      )}

      <div className="rounded-xl bg-accent p-3 mb-3">
        <p className="text-[11px] font-semibold mb-1.5">Comment obtenir une clé gratuite ?</p>
        <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Ouvrez Google AI Studio.</li>
          <li>Connectez-vous avec votre compte Google.</li>
          <li>Cliquez sur « Create API key » puis copiez la clé.</li>
          <li>Collez-la ci-dessous et enregistrez.</li>
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

      <Label className="text-[10px] uppercase text-muted-foreground">Votre clé</Label>
      <div className="flex gap-2 mt-1">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={loading ? "Chargement…" : "AIza..."}
            disabled={loading}
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
      </div>

      <div className="flex gap-2 mt-3">
        <Button onClick={save} disabled={saving || loading} className="flex-1 h-10 rounded-xl">
          <Save className="w-4 h-4 mr-1" /> Enregistrer
        </Button>
        {hasStored && (
          <Button onClick={removeKey} disabled={saving} variant="ghost" className="h-10">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </div>
    </section>
  );
};

export default GeminiKeySettings;
