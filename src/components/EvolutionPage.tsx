import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, 
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from "recharts";
import { format, subDays, subMonths, startOfDay, endOfDay, differenceInYears } from "date-fns";
import { fr } from "date-fns/locale";
import { calculateMicroGoals, NUTRIENTS_MASTER_LIST } from "@/utils/nutrition-logic";

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
  [key: string]: any; // Permet d'accéder aux micros dynamiquement via d[m.key]
}

interface BodyData {
  day: string;
  date: string;
  weight: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
  source: string;
}

const EvolutionPage: React.FC<EvolutionPageProps> = ({ 
  userId, calorieGoal, proteinGoal, carbsGoal, fatsGoal, 
  targetWeight, targetBodyFat, targetMuscleMass, userProfile 
}) => {
  const [period, setPeriod] = useState<Period>("7d");
  const [nutritionData, setNutritionData] = useState<DayData[]>([]);
  const [bodyData, setBodyData] = useState<BodyData[]>([]);

  // 1. Calcul des objectifs personnalisés via le moteur centralisé
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

    // Récupération des repas
    const { data: meals } = await supabase
      .from("meals")
      .select("id, timestamp, total_calories, total_proteins, total_carbs, total_fats")
      .eq("user_id", userId)
      .gte("timestamp", startOfDay(startDate).toISOString())
      .lte("timestamp", endOfDay(today).toISOString());

    const mealIds = (meals || []).map((m: any) => m.id);

    // Récupération des micros dynamiquement selon la MASTER_LIST
    let microsByMeal: Record<string, Record<string, number>> = {};
    if (mealIds.length > 0) {
      const microKeys = NUTRIENTS_MASTER_LIST.map(n => n.key);
      const { data: items } = await supabase
        .from("meal_items")
        .select(`meal_id, ${microKeys.join(', ')}`)
        .in("meal_id", mealIds);

      if (items) {
        (items as any[]).forEach((item) => {
          if (!microsByMeal[item.meal_id]) microsByMeal[item.meal_id] = {};
          microKeys.forEach((k) => {
            microsByMeal[item.meal_id][k] = (microsByMeal[item.meal_id][k] || 0) + (Number(item[k]) || 0);
          });
        });
      }
    }

    // Récupération poids/corps
    const { data: bodyComp } = await supabase
      .from("body_composition")
      .select("recorded_at, weight_kg, body_fat_percent, muscle_mass_kg, source")
      .eq("user_id", userId)
      .gte("recorded_at", format(startDate, "yyyy-MM-dd"))
      .order("recorded_at");

    // Construction du map des jours
    const dayMap: Record<string, DayData> = {};
    for (let i = 0; i < numDays; i++) {
      const d = subDays(today, numDays - 1 - i);
      const key = format(d, "yyyy-MM-dd");
      const dayEntry: DayData = {
        day: period === "7d" ? format(d, "EEE", { locale: fr }) : format(d, "dd/MM"),
        date: key, calories: 0, proteins: 0, carbs: 0, fats: 0, goal: calorieGoal
      };
      // Initialisation de chaque micro à 0
      NUTRIENTS_MASTER_LIST.forEach(n => dayEntry[n.key] = 0);
      dayMap[key] = dayEntry;
    }

    // Agrégation des données
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
            dayMap[key][k] += micros[k];
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
      source: b.source || "manual",
    }));
    setBodyData(bodyArr);
  };

  // 2. Calcul des données du Radar (Dynamique)
  const radarData = useMemo(() => {
    const daysWithData = nutritionData.filter((d) => d.calories > 0).length || 1;
    
    return NUTRIENTS_MASTER_LIST.map((m) => {
      const avg = nutritionData.reduce((sum, d) => sum + (Number(d[m.key]) || 0), 0) / daysWithData;
      const goal = dynamicGoals[m.key] || 1;
      const realPct = Math.round((avg / goal) * 100);
      
      return { 
        nutrient: m.label, 
        value: Math.min(realPct, 150), // Cap visuel
        realPct: realPct,
        avg: Math.round(avg * 10) / 10, 
        goalVal: goal, 
        unit: m.unit 
      };
    });
  }, [nutritionData, dynamicGoals]);

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
    padding: "8px"
  };

  const tickInterval = period === "7d" ? 0 : period === "30d" ? 4 : 29;

  return (
    <div className="space-y-6">
      {/* Sélecteur de période */}
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

      {/* Graphique Calories */}
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

      {/* Graphique Macros */}
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
      </section>

      {/* Radar de Micronutriments (Source Unique) */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up" style={{ animationDelay: "150ms" }}>
        <h3 className="font-display font-semibold text-sm mb-1">Bilan Micronutriments</h3>
        <p className="text-[10px] text-muted-foreground mb-3">Moyenne vs objectifs personnalisés (%)</p>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="68%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="nutrient" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
              <PolarRadiusAxis angle={90} domain={[0, 150]} tick={{ fontSize: 8 }} tickCount={4} />
              <Radar name="Objectif" dataKey={() => 100} stroke="hsl(var(--muted-foreground))" fill="none" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Radar name="Apport" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name: string, props: any) => {
                  if (name === "Objectif") return ["100%", "Objectif idéal"];
                  const item = props.payload;
                  return [
                    <div key={item.nutrient} className="flex flex-col gap-0.5 text-foreground">
                      <span className="font-bold">{item.avg} {item.unit} / {item.goalVal} {item.unit}</span>
                      <span className="text-[10px] text-primary">Couverture : {item.realPct}%</span>
                    </div>,
                    "Moyenne"
                  ];
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Composition corporelle */}
      {bodyData.length > 0 && (
        <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm">Composition corporelle</h3>
            {bodyData.some((b) => b.source === "health_connect") && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />Source : Santé
              </span>
            )}
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bodyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                {targetWeight && <ReferenceLine y={targetWeight} stroke="hsl(var(--primary))" strokeDasharray="6 3" />}
                <Line type="monotone" dataKey="weight" name="Poids (kg)" stroke="hsl(var(--primary))" strokeWidth={2} dot connectNulls />
                <Line type="monotone" dataKey="bodyFat" name="Gras (%)" stroke="hsl(var(--nutri-pink))" strokeWidth={2} dot connectNulls />
                <Line type="monotone" dataKey="muscleMass" name="Muscle (kg)" stroke="hsl(var(--nutri-blue))" strokeWidth={2} dot connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
};

export default EvolutionPage;
                         
