import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSportPreset, type UserPreset } from "@/utils/metabolic-quality";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export default function SportPresetPicker({ userId }: { userId: string }) {
  const [preset, setPreset] = useState<UserPreset>("hypertrophy");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void supabase.from("profiles").select("sport_preset").eq("user_id", userId).single().then(({ data }) => { if (active) setPreset(normalizeSportPreset(data?.sport_preset)); }); return () => { active = false; }; }, [userId]);
  const save = async (value: string) => {
    const next = normalizeSportPreset(value);
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ sport_preset: next }).eq("user_id", userId);
    setBusy(false);
    if (error) { toast({ title: "Profil non enregistré", description: error.message, variant: "destructive" }); return; }
    setPreset(next);
    window.dispatchEvent(new Event("nutriscan:quality-profile"));
    toast({ title: "Profil IQM enregistré" });
  };
  return <div className="space-y-2 py-3"><Label>Profil de qualité nutritionnelle (IQM)</Label>
    <Select value={preset} onValueChange={save} disabled={busy}><SelectTrigger aria-label="Profil de qualité nutritionnelle"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="hypertrophy">Hypertrophie / Force</SelectItem><SelectItem value="cut">Sèche</SelectItem><SelectItem value="endurance">Endurance</SelectItem><SelectItem value="health">Santé / Recomposition</SelectItem>
    </SelectContent></Select>
  </div>;
}