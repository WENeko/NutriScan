import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { format, subDays, subMonths, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";

interface EvolutionPageProps {
  userId: string;
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatsGoal: number;
  targetWeight?: number | null;
  targetBodyFat?: number | null;
  targetMuscleMass?: number | null;
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
  sodium_mg: number;
  potassium_mg: number;
  fiber: number;
  omega3_mg: number;
  magnesium_mg: number;
  calcium_mg: number;
  vitamin_c_mg: number;
  vitamin_d_mcg: number;
}

interface BodyData {
  day: string;
  date: string;
  weight: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
  source: string;
}


const RADAR_MICROS = [
  { key: "fiber", label: "Fibres", goal: 30, unit: "g" },
  { key: "sodium_mg", label: "Sodium", goal: 2300, unit: "mg" },
  { key: "potassium_mg", label: "Potassium", goal: 3500, unit: "mg" },
  { key: "magnesium_mg", label: "Magnésium", goal: 400, unit: "mg" },
  { key: "calcium_mg", label: "Calcium", goal: 1000, unit: "mg" },
  { key: "omega3_mg", label: "Oméga-3", goal: 500, unit: "mg" },
  { key: "vitamin_c_mg", label: "Vit. C", goal: 90, unit: "mg" },
  { key: "vitamin_d_mcg", label: "Vit. D", goal: 15, unit: "µg" },
];

const EvolutionPage: React.FC<EvolutionPageProps> = ({ userId, calorieGoal, proteinGoal, carbsGoal, fatsGoal, targetWeight, targetBodyFat, targetMuscleMass }) => {
  const [period, setPeriod] = useState<Period>("7d");
  const [nutritionData, setNutritionData] = useState<DayData[]>([]);
  const [bodyData, setBodyData] = useState<BodyData[]>([]);
  

  useEffect(() => { fetchData(); }, [userId, period]);

  const getStartDate = () => {
    if (period === "7d") return subDays(new Date(), 6);
    if (period === "30d") return subDays(new Date(), 29);
    return subMonths(new Date(), 6);
  };

  const fetchData = async () => {
    const startDate = getStartDate();
    const today = new Date();
    const numDays = period === "7d" ? 7 : period === "30d" ? 30 : 180;

    const { data: meals } = await supabase
      .from("meals")
      .select("id, timestamp, total_calories, total_proteins, total_carbs, total_fats")
      .eq("user_id", userId)
      .gte("timestamp", startOfDay(startDate).toISOString())
      .lte("timestamp", endOfDay(today).toISOString());

    const mealIds = (meals || []).map((m: any) => m.id);

    let microsByMeal: Record<string, Record<string, number>> = {};
    if (mealIds.length > 0) {
      const { data: items } = await supabase
        .from("meal_items")
        .select("meal_id, fiber, sodium_mg, potassium_mg, omega3_mg, magnesium_mg, calcium_mg, vitamin_c_mg, vitamin_d_mcg")
        .in("meal_id", mealIds);
      if (items) {
        (items as any[]).forEach((item) => {
          if (!microsByMeal[item.meal_id]) microsByMeal[item.meal_id] = {};
          ["fiber", "sodium_mg", "potassium_mg", "omega3_mg", "magnesium_mg", "calcium_mg", "vitamin_c_mg", "vitamin_d_mcg"].forEach((k) => {
            microsByMeal[item.meal_id][k] = (microsByMeal[item.meal_id][k] || 0) + (Number(item[k]) || 0);
          });
        });
      }
    }

    const { data: bodyComp } = await supabase
      .from("body_composition")
      .select("recorded_at, weight_kg, body_fat_percent, muscle_mass_kg")
      .eq("user_id", userId)
      .gte("recorded_at", format(startDate, "yyyy-MM-dd"))
      .order("recorded_at");

    const dayMap: Record<string, DayData> = {};
    for (let i = 0; i < numDays; i++) {
      const d = subDays(today, numDays - 1 - i);
      const key = format(d, "yyyy-MM-dd");
      dayMap[key] = {
        day: period === "7d" ? format(d, "EEE", { locale: fr }) : format(d, "dd/MM"),
        date: key, calories: 0, proteins: 0, carbs: 0, fats: 0, goal: calorieGoal,
        sodium_mg: 0, potassium_mg: 0, fiber: 0, omega3_mg: 0,
        magnesium_mg: 0, calcium_mg: 0, vitamin_c_mg: 0, vitamin_d_mcg: 0,
      };
    }

    (meals || []).forEach((m: any) => {
      const key = format(new Date(m.timestamp), "yyyy-MM-dd");
      if (dayMap[key]) {
        dayMap[key].calories += Number(m.total_calories);
        dayMap[key].proteins += Number(m.total_proteins);
        dayMap[key].carbs += Number(m.total_carbs);
        dayMap[key].fats += Number(m.total_fats);
        const micros = microsByMeal[m.id];
        if (micros) {
          Object.keys(micros).forEach((k) => {
            (dayMap[key] as any)[k] = ((dayMap[key] as any)[k] || 0) + micros[k];
          });
        }
      }
    });

    setNutritionData(Object.values(dayMap));

    const bodyArr: BodyData[] = (bodyComp || []).map((b: any) => ({
      day: format(new Date(b.recorded_at), period === "7d" ? "EEE" : "dd/MM", { locale: fr }),
      date: b.recorded_at,
      weight: b.weight_kg ? Number(b.weight_kg) : null,
      bodyFat: b.body_fat_percent ? Number(b.body_fat_percent) : null,
      muscleMass: b.muscle_mass_kg ? Number(b.muscle_mass_kg) : null,
    }));
    setBodyData(bodyArr);
  };

  // Compute average for radar based on current period
  const radarData = React.useMemo(() => {
    const daysWithData = nutritionData.filter((d) => d.calories > 0).length || 1;
    return RADAR_MICROS.map((m) => {
      const avg = nutritionData.reduce((sum, d) => sum + ((d as any)[m.key] || 0), 0) / daysWithData;
      const pct = Math.min(Math.round((avg / m.goal) * 100), 150);
      return { nutrient: m.label, value: pct, goal: 100, avg: Math.round(avg), goalVal: m.goal, unit: m.unit };
    });
  }, [nutritionData]);

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

  const tickInterval = period === "7d" ? 0 : period === "30d" ? 4 : 29;
  

  return (
    <div className="space-y-6">
      {/* Period selector - sticky below header */}
      <div className="sticky top-[52px] z-20 bg-background/95 backdrop-blur-sm px-4 py-2 -mx-4">
        <div className="flex rounded-xl bg-muted p-1 gap-1 max-w-lg mx-auto">
          {periods.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${period === p.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
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
              <ReferenceLine y={proteinGoal} stroke="hsl(var(--nutri-blue))" strokeDasharray="4 4" strokeOpacity={0.5} />
              <ReferenceLine y={carbsGoal} stroke="hsl(var(--nutri-orange))" strokeDasharray="4 4" strokeOpacity={0.5} />
              <ReferenceLine y={fatsGoal} stroke="hsl(var(--nutri-pink))" strokeDasharray="4 4" strokeOpacity={0.5} />
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

      {/* Micro Radar */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up" style={{ animationDelay: "150ms" }}>
        <h3 className="font-display font-semibold text-sm mb-1">Bilan Micronutriments</h3>
        <p className="text-[10px] text-muted-foreground mb-3">Moyenne sur la période vs objectifs recommandés (%)</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="nutrient" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <PolarRadiusAxis angle={90} domain={[0, 150]} tick={{ fontSize: 8 }} tickCount={4} />
              <Radar name="Objectif" dataKey="goal" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.1} strokeDasharray="4 4" />
              <Radar name="Apport" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name: string, props: any) => {
                  if (name === "Objectif") return ["100%", "Objectif"];
                  const item = props.payload;
                  return [`${item.avg} ${item.unit} / ${item.goalVal} ${item.unit} (${v}%)`, "Apport"];
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-4 mt-1 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Apport moyen</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground" /> Objectif</span>
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
                {targetWeight && (
                  <ReferenceLine y={targetWeight} stroke="hsl(var(--primary))" strokeDasharray="6 3" label={{ value: `Poids: ${targetWeight}kg`, position: "insideTopRight", fontSize: 10, fill: "hsl(var(--primary))" }} />
                )}
                {targetBodyFat && (
                  <ReferenceLine y={targetBodyFat} stroke="hsl(var(--nutri-pink))" strokeDasharray="6 3" label={{ value: `Gras: ${targetBodyFat}%`, position: "insideBottomRight", fontSize: 10, fill: "hsl(var(--nutri-pink))" }} />
                )}
                {targetMuscleMass && (
                  <ReferenceLine y={targetMuscleMass} stroke="hsl(var(--nutri-blue))" strokeDasharray="6 3" label={{ value: `Muscle: ${targetMuscleMass}kg`, position: "insideTopLeft", fontSize: 10, fill: "hsl(var(--nutri-blue))" }} />
                )}
                <Line type="monotone" dataKey="weight" name="Poids (kg)" stroke="hsl(var(--primary))" strokeWidth={2} dot connectNulls />
                <Line type="monotone" dataKey="bodyFat" name="Masse grasse (%)" stroke="hsl(var(--nutri-pink))" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="muscleMass" name="Muscle (kg)" stroke="hsl(var(--nutri-blue))" strokeWidth={2} dot connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Poids</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--nutri-pink))" }} /> Masse grasse</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--nutri-blue))" }} /> Muscle</span>
            {targetWeight && <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-primary" style={{ borderTop: "1px dashed" }} /> Cible poids</span>}
            {targetBodyFat && <span className="flex items-center gap-1"><span className="w-2 h-0.5" style={{ background: "hsl(var(--nutri-pink))", borderTop: "1px dashed" }} /> Cible gras</span>}
            {targetMuscleMass && <span className="flex items-center gap-1"><span className="w-2 h-0.5" style={{ background: "hsl(var(--nutri-blue))", borderTop: "1px dashed" }} /> Cible muscle</span>}
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
