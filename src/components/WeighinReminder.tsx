import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, X } from "lucide-react";
import { format, differenceInDays, startOfDay } from "date-fns";

interface WeighinReminderProps {
  userId: string;
  onGoToProfile: () => void;
}

const WeighinReminder: React.FC<WeighinReminderProps> = ({ userId, onGoToProfile }) => {
  const [showReminder, setShowReminder] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkReminder();
  }, [userId]);

  const checkReminder = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("weighin_frequency, weighin_day, weighin_hour, last_weighin_date")
      .eq("user_id", userId)
      .single();

    if (!profile) return;
    const p = profile as any;
    const freq = p.weighin_frequency || "weekly";
    const targetDay = p.weighin_day ?? 1;
    const now = new Date();
    const today = startOfDay(now);

    // Check last body_composition entry
    const { data: lastEntries } = await supabase
      .from("body_composition")
      .select("recorded_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(1);

    const lastEntry = lastEntries && lastEntries.length > 0 ? lastEntries[0] : null;

    const lastDate = lastEntry ? new Date((lastEntry as any).recorded_at) : null;
    const daysSinceLast = lastDate ? differenceInDays(today, startOfDay(lastDate)) : 999;

    let isDue = false;
    if (freq === "daily") {
      isDue = daysSinceLast >= 1;
    } else if (freq === "weekly") {
      isDue = daysSinceLast >= 7 || (daysSinceLast >= 1 && now.getDay() === targetDay);
    } else if (freq === "biweekly") {
      isDue = daysSinceLast >= 14;
    }

    setShowReminder(isDue);
  };

  if (!showReminder || dismissed) return null;

  return (
    <div className="bg-secondary/10 border border-secondary/30 rounded-2xl p-4 flex items-center gap-3 animate-fade-up">
      <Scale className="w-5 h-5 text-secondary flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-secondary">Pesée due !</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Mets à jour ton poids dans ton profil pour un meilleur suivi.
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onGoToProfile}
          className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
        >
          Peser
        </button>
        <button onClick={() => setDismissed(true)} className="p-1 hover:bg-muted rounded-lg transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
};

export default WeighinReminder;
