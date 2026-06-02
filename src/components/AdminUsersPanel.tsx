/**
 * Panneau admin : gestion de l'accès des utilisateurs aux edge functions IA Lovable.
 * Visible uniquement par les administrateurs (rôle 'admin').
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, Search, Loader2 } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface Props {
  userId: string;
}

interface Row {
  user_id: string;
  email: string | null;
  lovable_ai_enabled: boolean;
}

const AdminUsersPanel: React.FC<Props> = ({ userId }) => {
  const { isAdmin, loading: roleLoading } = useIsAdmin(userId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, lovable_ai_enabled")
        .order("email", { ascending: true });
      if (error) {
        toast({ title: "Chargement KO", description: error.message, variant: "destructive" });
      } else {
        setRows((data as Row[]) ?? []);
      }
      setLoading(false);
    })();
  }, [isAdmin]);

  async function toggle(row: Row, next: boolean) {
    setBusy(row.user_id);
    const { error } = await supabase
      .from("profiles")
      .update({ lovable_ai_enabled: next })
      .eq("user_id", row.user_id);
    setBusy(null);
    if (error) {
      toast({ title: "Mise à jour KO", description: error.message, variant: "destructive" });
      return;
    }
    setRows((rs) => rs.map((r) => (r.user_id === row.user_id ? { ...r, lovable_ai_enabled: next } : r)));
    toast({ title: next ? "Accès IA Lovable activé" : "Accès IA Lovable désactivé" });
  }

  if (roleLoading || !isAdmin) return null;

  const filtered = rows.filter((r) => (r.email ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "60ms" }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Administration — Accès IA</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Activez l'IA Lovable (edge functions) pour les utilisateurs autorisés. Les autres devront
        utiliser leur propre clé Gemini.
      </p>

      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un e-mail…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">Aucun utilisateur.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.user_id} className="flex items-center gap-2 bg-accent rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.email ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {r.lovable_ai_enabled ? "IA Lovable activée" : "Clé Gemini perso requise"}
                </div>
              </div>
              {busy === r.user_id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={r.lovable_ai_enabled}
                  onCheckedChange={(v) => toggle(r, v)}
                  disabled={r.user_id === userId}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default AdminUsersPanel;
