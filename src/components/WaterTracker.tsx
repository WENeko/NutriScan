import React, { useState, useEffect, useCallback } from "react";
import { Droplets, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface WaterTrackerProps {
  userId: string;
  goal: number;
  sportCalories?: number;
}

const WaterTracker: React.FC<WaterTrackerProps> = ({ userId, goal, sportCalories = 0 }) => {
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  const dynamicGoal = sportCalories > 0 ? goal + 500 : goal;

  const fetchToday = useCallback(async () => {
    const todayStart = startOfDay(new Date()).toISOString();
    const { data } = await supabase
      .from("water_logs")
      .select("amount_ml")
      .eq("user_id", userId)
      .gte("logged_at", todayStart);
    if (data) {
      setCurrent((data as any[]).reduce((sum, r) => sum + (r.amount_ml || 0), 0));
    }
  }, [userId]);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  const handleAdd = async (ml: number) => {
    setLoading(true);
    const { error } = await supabase.from("water_logs").insert({
      user_id: userId,
      amount_ml: ml,
    } as any);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setCurrent((prev) => prev + ml);
      toast({ title: `+${ml}ml 💧` });
    }
    setLoading(false);
  };

  const percent = Math.min((current / dynamicGoal) * 100, 100);
  const glasses = Math.floor(current / 250);

  return (
    <div className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-4">
      <div className="relative w-12 h-12 flex-shrink-0">
        <Droplets className="w-12 h-12 text-nutri-blue/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-nutri-blue">{glasses}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-semibold">Hydratation</span>
          <span className="text-muted-foreground">
            {current}ml / {dynamicGoal}ml
            {sportCalories > 0 && <span className="text-nutri-blue ml-1">(+500 sport)</span>}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: "hsl(var(--nutri-blue))" }} />
        </div>
      </div>
      <button
        onClick={() => handleAdd(250)}
        disabled={loading}
        className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold nutri-gradient text-primary-foreground flex-shrink-0"
      >
        <Plus className="w-3 h-3" /> 250ml
      </button>
    </div>
  );
};

export default WaterTracker;
