import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";

interface WeeklyStatsProps {
  userId: string;
  calorieGoal: number;
}

interface DayData {
  day: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

const WeeklyStats: React.FC<WeeklyStatsProps> = ({ userId, calorieGoal }) => {
  const [data, setData] = useState<DayData[]>([]);

  useEffect(() => {
    fetchWeekData();
  }, [userId]);

  const fetchWeekData = async () => {
    const today = new Date();
    const weekAgo = subDays(today, 6);

    const { data: meals } = await supabase
      .from("meals")
      .select("timestamp, total_calories, total_proteins, total_carbs, total_fats")
      .eq("user_id", userId)
      .gte("timestamp", startOfDay(weekAgo).toISOString())
      .lte("timestamp", endOfDay(today).toISOString());

    const dayMap: Record<string, DayData> = {};
    for (let i = 0; i < 7; i++) {
      const d = subDays(today, 6 - i);
      const key = format(d, "yyyy-MM-dd");
      dayMap[key] = {
        day: format(d, "EEE", { locale: fr }),
        calories: 0,
        proteins: 0,
        carbs: 0,
        fats: 0,
      };
    }

    (meals || []).forEach((m: any) => {
      const key = format(new Date(m.timestamp), "yyyy-MM-dd");
      if (dayMap[key]) {
        dayMap[key].calories += Number(m.total_calories);
        dayMap[key].proteins += Number(m.total_proteins);
        dayMap[key].carbs += Number(m.total_carbs);
        dayMap[key].fats += Number(m.total_fats);
      }
    });

    setData(Object.values(dayMap));
  };

  return (
    <div className="bg-card rounded-2xl p-4 shadow-card">
      <h3 className="font-display font-semibold text-base mb-3">Évolution (7 jours)</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.75rem",
                fontSize: "12px",
              }}
              formatter={(value: number) => [`${Math.round(value)} kcal`, "Calories"]}
            />
            <ReferenceLine y={calorieGoal} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: "Objectif", fontSize: 10, fill: "hsl(var(--primary))" }} />
            <Bar dataKey="calories" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default WeeklyStats;
