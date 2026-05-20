import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, 
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell
} from "recharts";
import { format, subDays, subMonths, startOfDay, endOfDay, differenceInYears } from "date-fns";
import { fr } from "date-fns/locale";
import { calculateMicroGoals, NUTRIENTS_STD_LIST, getMasterList } from "@/utils/nutrition-logic";
import type { CustomNutrientDef } from "@/utils/nutrients-helpers";

interface EvolutionPageProps {
  userId: string;
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatsGoal: number;
  targetWeight?: number | null;
  targetBodyFat?: number | null;
  targetMuscleMass?: number | null;
  userProfile?: any;
  customNutrients?: CustomNutrientDef[];
}

const EvolutionPage: React.FC<EvolutionPageProps> = ({ 
  userId, calorieGoal, proteinGoal, carbsGoal, fatsGoal, 
  targetWeight, targetBodyFat, targetMuscleMass, userProfile,
  customNutrients = []
}) => {
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const [nutritionData, setNutritionData] = useState<any[]>([]);
  const [bodyData, setBodyData] = useState<any[]>([]);
  const [goalsHistory, setGoalsHistory] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const dynamicGoals = useMemo(() => {
    return calculateMicroGoals({
      age: userProfile?.birth_date ? differenceInYears(new Date(), new Date(userProfile.birth_date)) : 30,
      gender: userProfile?.gender || 'male',
      weight: userProfile?.current_weight || 75,
      totalCaloriesGoal: calorieGoal,
      isAthlete: userProfile?.is_athlete,
      isSmoker: userProfile?.is_smoker,
      isPregnant: userProfile?.is_pregnant
    });
  }, [userProfile, calorieGoal]);

  const allMicros = useMemo(() => getMasterList(customNutrients), [customNutrients]);

  useEffect(() => { fetchData(); }, [userId, period, customNutrients]);

  const fetchData = async () => {
    const startDate = period === "7d" ? subDays(new Date(), 6) : period === "30d" ? subDays(new Date(), 29) : subMonths(new Date(), 6);
    const today = new Date();
    const numDays = period === "7d" ? 7 : period === "30d" ? 30 : 180;

    const { data: meals } = await supabase
      .from("meals")
      .select("id, timestamp, total_calories, total_proteins, total_carbs, total_fats")
      .eq("user_id", userId)
      .gte("timestamp", startOfDay(startDate).toISOString())
      .lte("timestamp", endOfDay(today).toISOString());

    const mealIds = (meals || []).map((m: any) => m.id);
    const microsByMeal: Record<string, Record<string, number>> = {};

    if (mealIds.length > 0) {
      // Source unique de vérité : JSONB nutrients_std + nutrients_custom
      const { data: items } = await supabase
        .from("meal_items")
        .select("meal_id, nutrients_std, nutrients_custom")
        .in("meal_id", mealIds);
      if (items) {
        (items as any[]).forEach((item) => {
          if (!microsByMeal[item.meal_id]) microsByMeal[item.meal_id] = {};
          const merged = { ...(item.nutrients_std || {}), ...(item.nutrients_custom || {}) };
          for (const [k, v] of Object.entries(merged)) {
            const n = Number(v) || 0;
            microsByMeal[item.meal_id][k] = (microsByMeal[item.meal_id][k] || 0) + n;
          }
        });
      }
    }

    const dayMap: Record<string, any> = {};
    for (let i = 0; i < numDays; i++) {
      const d = subDays(today, numDays - 1 - i);
      const key = format(d, "yyyy-MM-dd");
      dayMap[key] = {
        day: period === "7d" ? format(d, "EEE", { locale: fr }) : format(d, "dd/MM"),
        date: format(d, "dd/MM/yyyy"),
        calories: 0, proteins: 0, carbs: 0, fats: 0
      };
      allMicros.forEach(n => dayMap[key][n.key] = 0);
    }

    (meals || []).forEach((m: any) => {
      const key = format(new Date(m.timestamp), "yyyy-MM-dd");
      if (dayMap[key]) {
        dayMap[key].calories += Math.round(Number(m.total_calories));
        dayMap[key].proteins += Math.round(Number(m.total_proteins));
        dayMap[key].carbs += Math.round(Number(m.total_carbs));
        dayMap[key].fats += Math.round(Number(m.total_fats));
        const micros = microsByMeal[m.id];
        if (micros) Object.keys(micros).forEach((k) => {
          dayMap[key][k] = (dayMap[key][k] || 0) + micros[k];
        });
      }
    });
    setNutritionData(Object.values(dayMap));

    const { data: bodyComp } = await supabase.from("body_composition").select("*").eq("user_id", userId).gte("recorded_at", format(startDate, "yyyy-MM-dd")).order("recorded_at");
    setBodyData((bodyComp || []).map(b => ({
      day: format(new Date(b.recorded_at), "dd/MM"),
      date: format(new Date(b.recorded_at), "dd/MM/yyyy"),
      weight: b.weight_kg,
      bodyFat: b.body_fat_percent,
      muscleMass: b.muscle_mass_kg
    })));

    const { data: goalsHist } = await supabase
      .from("goals_history")
      .select("*")
      .eq("user_id", userId)
      .gte("recorded_at", format(startDate, "yyyy-MM-dd"))
      .order("recorded_at");
    setGoalsHistory((goalsHist || []).map((g: any) => ({
      day: format(new Date(g.recorded_at), "dd/MM"),
      date: format(new Date(g.recorded_at), "dd/MM/yyyy"),
      calories: Number(g.calories),
      proteins: Number(g.proteins),
      carbs: Number(g.carbs),
      fats: Number(g.fats),
    })));
  };

  const radarData = useMemo(() => {
    const daysWithData = nutritionData.filter((d) => d.calories > 0).length || 1;
    const stdKeys = new Set(NUTRIENTS_STD_LIST.map(n => n.key));
    return allMicros.map((m) => {
      const avg = nutritionData.reduce((sum, d) => sum + (Number(d[m.key]) || 0), 0) / daysWithData;
      const isStd = stdKeys.has(m.key);
      const goal = isStd
        ? (dynamicGoals[m.key] || 1)
        : (Number((m as any).goal) > 0 ? Number((m as any).goal) : 1);
      const pct = (avg / goal) * 100;
      return { 
        nutrient: m.label, 
        value: Math.min(pct, 150),
        fullPct: Math.round(pct),
        avg: Math.round(avg * 10) / 10, 
        goalVal: goal, 
        unit: m.unit,
        goalMarker: 100
      };
    });
  }, [nutritionData, dynamicGoals, allMicros]);

  const tooltipStyle = {
    backgroundColor: "#1A1F2C",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    fontSize: "13px",
    color: "#FFFFFF",
    padding: "10px"
  };

  const getExtendedDomain = (data: any[], key: string, target: number | null | undefined, padding: number) => {
    const values = data.map(d => d[key]).filter(v => v !== null);
    if (values.length === 0 && !target) return [0, 100];
    const min = Math.min(...values, target || Infinity);
    const max = Math.max(...values, target || -Infinity);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Période */}
      <div className="sticky top-[52px] z-20 bg-background/95 backdrop-blur-sm px-4 py-2 -mx-4">
        <div className="flex rounded-xl bg-muted p-1 gap-1 max-w-lg mx-auto">
          {["7d", "30d", "all"].map((p) => (
            <button key={p} onClick={() => setPeriod(p as any)}
              className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${period === p ? "bg-card text-foreground shadow-card" : "text-muted-foreground"}`}>
              {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "Global"}
            </button>
          ))}
        </div>
      </div>

      {/* 1. CALORIES */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
        <h3 className="font-display font-semibold text-sm mb-3">Calories vs Objectif</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={nutritionData} 
              onMouseMove={(state) => { if (state.activeTooltipIndex !== undefined) setActiveIndex(state.activeTooltipIndex); }}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={tooltipStyle} 
                itemStyle={{ color: "#FFFFFF" }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
              />
              <ReferenceLine y={calorieGoal} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
              <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                {nutritionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={activeIndex === index ? "hsl(var(--primary))" : "rgba(16, 185, 129, 0.4)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 2. MACRONUTRIMENTS */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
        <h3 className="font-display font-semibold text-sm mb-3">Macronutriments (g)</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={nutritionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine y={proteinGoal} stroke="#3B82F6" strokeDasharray="3 3" opacity={0.3} />
              <ReferenceLine y={carbsGoal} stroke="#F59E0B" strokeDasharray="3 3" opacity={0.3} />
              <ReferenceLine y={fatsGoal} stroke="#F43F5E" strokeDasharray="3 3" opacity={0.3} />
              <Line type="monotone" dataKey="proteins" stroke="#3B82F6" strokeWidth={3} dot={false} name="Prot." />
              <Line type="monotone" dataKey="carbs" stroke="#F59E0B" strokeWidth={3} dot={false} name="Gluc." />
              <Line type="monotone" dataKey="fats" stroke="#F43F5E" strokeWidth={3} dot={false} name="Lip." />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 3. RADAR MICROS */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
        <h3 className="font-display font-semibold text-sm mb-1">Bilan Micronutriments</h3>
        <p className="text-[10px] text-muted-foreground mb-3">Moyenne vs objectifs personnalisés (%)</p>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="nutrient" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} />
              <PolarRadiusAxis angle={90} domain={[0, 150]} tick={false} axisLine={false} />
              <Radar dataKey="goalMarker" stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" fill="none" />
              <Radar name="Apport" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#1A1F2C] border border-white/10 p-3 rounded-xl shadow-xl">
                        <p className="text-white font-bold text-xs mb-1">{data.nutrient}</p>
                        <p className="text-[#10b981] text-[11px] font-medium">{data.avg} {data.unit} / {data.goalVal} {data.unit}</p>
                        <p className="text-white/50 text-[10px]">Couverture : {data.fullPct}%</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 3.5 ÉVOLUTION DES OBJECTIFS */}
      {goalsHistory.length > 1 && (
        <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
          <h3 className="font-display font-semibold text-sm mb-1">Évolution des objectifs</h3>
          <p className="text-[10px] text-muted-foreground mb-3">Calories cibles au fil du temps</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={goalsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} width={40} axisLine={false} tickLine={false} domain={['dataMin - 100', 'dataMax + 100']} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-[#1A1F2C] border border-white/10 p-2.5 rounded-xl shadow-xl">
                          <p className="text-white/60 text-[11px] mb-0.5">{d.date}</p>
                          <p className="text-white font-bold text-sm">{d.calories} kcal</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line type="monotone" dataKey="calories" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-44 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={goalsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} width={35} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="proteins" stroke="#3B82F6" strokeWidth={2} dot={false} name="Prot." />
                <Line type="monotone" dataKey="carbs" stroke="#F59E0B" strokeWidth={2} dot={false} name="Gluc." />
                <Line type="monotone" dataKey="fats" stroke="#F43F5E" strokeWidth={2} dot={false} name="Lip." />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* 4. COMPOSITION CORPORELLE */}
      {bodyData.length > 0 && (
        <div className="space-y-6">
          <h2 className="font-display font-bold text-lg px-1 mt-8">Analyse Corporelle</h2>
          {[
            { title: "Poids", key: "weight", unit: "kg", color: "hsl(var(--primary))", target: targetWeight, padding: 2 },
            { title: "Masse Grasse", key: "bodyFat", unit: "%", color: "#F43F5E", target: targetBodyFat, padding: 1 },
            { title: "Masse Musculaire", key: "muscleMass", unit: "kg", color: "#3B82F6", target: targetMuscleMass, padding: 1 }
          ].map((chart) => (
            <section key={chart.key} className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
              <h3 className="font-display font-semibold text-sm mb-3" style={{ color: chart.color }}>{chart.title} ({chart.unit})</h3>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bodyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                    <YAxis 
                      domain={getExtendedDomain(bodyData, chart.key, chart.target, chart.padding)} 
                      tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} 
                      width={35}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-[#1A1F2C] border border-white/10 p-2.5 rounded-xl shadow-xl">
                              <p className="text-white/60 text-[11px] mb-0.5">{payload[0].payload.date}</p>
                              <p className="text-white font-bold text-sm">
                                {payload[0].value} {chart.unit}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {chart.target && (
                      <ReferenceLine 
                        y={chart.target} 
                        stroke={chart.color} 
                        strokeDasharray="6 3" 
                        label={{ position: 'insideTopRight', value: 'Cible', fill: chart.color, fontSize: 9, opacity: 0.8 }}
                      />
                    )}
                    <Line type="monotone" dataKey={chart.key} stroke={chart.color} strokeWidth={3} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default EvolutionPage;
                    
