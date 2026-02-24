import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

interface Goals {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

interface GoalsEditorProps {
  userId: string;
  currentGoals: Goals;
  onUpdate: (goals: Goals) => void;
}

const GoalsEditor: React.FC<GoalsEditorProps> = ({ userId, currentGoals, onUpdate }) => {
  const [goals, setGoals] = useState<Goals>(currentGoals);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGoals(currentGoals);
  }, [currentGoals]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ goals: goals as any })
        .eq("user_id", userId);
      if (error) throw error;
      onUpdate(goals);
      toast({ title: "Objectifs mis à jour !" });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof Goals; label: string; unit: string }[] = [
    { key: "calories", label: "Calories", unit: "kcal" },
    { key: "proteins", label: "Protéines", unit: "g" },
    { key: "carbs", label: "Glucides", unit: "g" },
    { key: "fats", label: "Lipides", unit: "g" },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-display font-semibold text-base">Mes objectifs quotidiens</h3>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ key, label, unit }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {label} ({unit})
            </Label>
            <Input
              type="number"
              value={goals[key]}
              onChange={(e) => setGoals({ ...goals, [key]: Number(e.target.value) })}
              className="h-10 rounded-xl text-sm"
            />
          </div>
        ))}
      </div>
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-10 rounded-xl nutri-gradient text-primary-foreground hover:opacity-90"
      >
        <Save className="w-4 h-4 mr-1" />
        {saving ? "Enregistrement..." : "Sauvegarder"}
      </Button>
    </div>
  );
};

export default GoalsEditor;
