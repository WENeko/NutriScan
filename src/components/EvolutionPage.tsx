import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";
import { format, subDays, subMonths, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";

interface EvolutionPageProps {
  userId: string;
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatsGoal: number;
}

type Period = "7d" | "30d" | "all";

interface DayData {
  day: string;
  date: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  goal: number;
}

interface BodyData {
  day: string;
  date: string;
  weight: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
}

const EvolutionPage: React.FC<EvolutionPageProps> = ({ userId, calorieGoal, proteinGoal, carbsGoal, fatsGoal }) => {
  const [period, setPeriod] = useState<Period>("7d");
  const [nutritionData, setNutritionData] = useState<DayData[]>([]);
  const [bodyData, setBodyData] = useState<BodyData[]>([]);

  useEffect(() => {
    fetchData();
  }, [userId, period]);

  const getStartDate = () => {
    if (period === "7d") return subDays(new Date(), 6);
    if (period === "30d") return subDays(new Date(), 29);
    return subMonths(new Date(), 6);
  };

  const fetchData = async () => {
    const startDate = getStartDate();
    const today = new Date();

    // Fetch meals
    const { data: meals } = await supabase
      .from("meals")
      .select("timestamp, total_calories, total_proteins, total_carbs, total_fats")
      .eq("user_id", userId)
      .gte("timestamp", startOfDay(startDate).toISOString())
      .lte("timestamp", endOfDay(today).toISOString());

    // Fetch body composition
    const { data: bodyComp } = await supabase
      .from("body_composition")
      .select("recorded_at, weight_kg, body_fat_percent, muscle_mass_kg")
      .eq("user_id", userId)
      .gte("recorded_at", format(startDate, "yyyy-MM-dd"))
      .order("recorded_at");

    // Build day map for nutrition
    const numDays = period === "7d" ? 7 : period === "30d" ? 30 : 180;
    const dayMap: Record<string, DayData> = {};
    for (let i = 0; i < numDays; i++) {
      const d = subDays(today, numDays - 1 - i);
      const key = format(d, "yyyy-MM-dd");
      dayMap[key] = {
        day: period === "7d" ? format(d, "EEE", { locale: fr }) : format(d, "dd/MM"),
        date: key,
        calories: 0,
        proteins: 0,
        carbs: 0,
        fats: 0,
        goal: calorieGoal,
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

    setNutritionData(Object.values(dayMap));

    // Map body data
    const bodyMap: Record<string, BodyData> = {};
    (bodyComp || []).forEach((b: any) => {
      const key = b.recorded_at;
      bodyMap[key] = {
        day: format(new Date(key), period === "7d" ? "EEE" : "dd/MM", { locale: fr }),
        date: key,
        weight: b.weight_kg ? Number(b.weight_kg) : null,
        bodyFat: b.body_fat_percent ? Number(b.body_fat_percent) : null,
        muscleMass: b.muscle_mass_kg ? Number(b.muscle_mass_kg) : null,
      };
    });
    setBodyData(Object.values(bodyMap));
  };

  const periods: { id: Period; label: string }[] = [
    { id: "7d", label: "7 jours" },
    { id: "30d", label: "30 jours" },
    { id: "all", label: "Global" },
  ];

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.75rem",
    fontSize: "12px",
  };

  // For 30d/all, only show every Nth label
  const tickInterval = period === "7d" ? 0 : period === "30d" ? 4 : 29;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex rounded-xl bg-muted p-1 gap-1">
        {periods.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              period === p.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Calories vs Goal */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
        <h3 className="font-display font-semibold text-sm mb-3">Calories vs Objectif</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={nutritionData} barSize={period === "7d" ? 20 : 6}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={tickInterval} />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${Math.round(v)} kcal`]} />
              <ReferenceLine y={calorieGoal} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
              <Bar dataKey="calories" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Macros evolution */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up" style={{ animationDelay: "100ms" }}>
        <h3 className="font-display font-semibold text-sm mb-3">Macronutriments</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={nutritionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={tickInterval} />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`${Math.round(v)}g`, name === "proteins" ? "Protéines" : name === "carbs" ? "Glucides" : "Lipides"]} />
              <Line type="monotone" dataKey="proteins" stroke="hsl(var(--nutri-blue))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="carbs" stroke="hsl(var(--nutri-orange))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="fats" stroke="hsl(var(--nutri-pink))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-4 mt-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--nutri-blue))" }} /> Protéines</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--nutri-orange))" }} /> Glucides</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--nutri-pink))" }} /> Lipides</span>
        </div>
      </section>

      {/* Body composition */}
      {bodyData.length > 0 && (
        <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up" style={{ animationDelay: "200ms" }}>
          <h3 className="font-display font-semibold text-sm mb-3">Composition corporelle</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bodyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="weight" name="Poids (kg)" stroke="hsl(var(--primary))" strokeWidth={2} dot connectNulls />
                <Line type="monotone" dataKey="bodyFat" name="Masse grasse (%)" stroke="hsl(var(--nutri-pink))" strokeWidth={2} dot connectNulls />
                <Line type="monotone" dataKey="muscleMass" name="Muscle (kg)" stroke="hsl(var(--nutri-blue))" strokeWidth={2} dot connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Poids</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--nutri-pink))" }} /> Masse grasse</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--nutri-blue))" }} /> Muscle</span>
          </div>
        </section>
      )}

      {bodyData.length === 0 && (
        <div className="bg-accent rounded-2xl p-4 text-center text-sm text-muted-foreground">
          <p>Aucune donnée de composition corporelle.</p>
          <p className="text-xs mt-1">Ajoute tes mesures dans ton Profil pour suivre ton évolution.</p>
        </div>
      )}
    </div>
  );
};

export default EvolutionPage;
