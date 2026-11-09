import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, 
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell, Legend
} from "recharts";
import { format, subDays, subMonths, startOfDay, endOfDay, differenceInYears, differenceInCalendarDays, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { getMasterList, resolveMicroGoals, type MicroOverrides } from "@/utils/nutrition-logic";
import type { CustomNutrientDef } from "@/utils/nutrients-helpers";
import CustomChartsManager, { CHART_COLORS, type CustomChartConfig } from "@/components/CustomChartsManager";
import { useChartZoomPan, ZoomPanArea } from "@/hooks/useChartZoomPan";
import { RotateCcw } from "lucide-react";
import ActivityCalendar from "@/components/ActivityCalendar";
import EvolutionReport from "@/components/EvolutionReport";
import { Button } from "@/components/ui/button";
import { readSessionsInRange } from "@/services/training-days";
import { sessionsByDate } from "@/utils/activity-calendar";
import { alignBodyTimeline, localDayCoordinate, timelineTicks } from "@/utils/evolution-timeline";

const EMPTY_NUTRIENTS: CustomNutrientDef[] = [];
const EMPTY_MICRO_OVERRIDES: MicroOverrides = {};
const EMPTY_CHARTS: CustomChartConfig[] = [];

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
  microOverrides?: MicroOverrides;
  customCharts?: CustomChartConfig[];
  onCustomChartsChange?: (next: CustomChartConfig[]) => void;
}

const EvolutionPage: React.FC<EvolutionPageProps> = ({ 
  userId, calorieGoal, proteinGoal, carbsGoal, fatsGoal, 
  targetWeight, targetBodyFat, targetMuscleMass, userProfile,
  customNutrients = EMPTY_NUTRIENTS, microOverrides = EMPTY_MICRO_OVERRIDES,
  customCharts = EMPTY_CHARTS, onCustomChartsChange
}) => {
  const [view, setView] = useState<"charts" | "calendar" | "report">("charts");
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const [nutritionData, setNutritionData] = useState<any[]>([]);
  const [bodyData, setBodyData] = useState<any[]>([]);
  const [goalsHistory, setGoalsHistory] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const allMicros = useMemo(() => getMasterList(customNutrients), [customNutrients]);

  useEffect(() => { 
    fetchData(); 
  }, [userId, period, customNutrients, userProfile?.sport_allowed_sources]);

  const fetchData = async () => {
    const today = new Date();
    let startDate = period === "7d" ? subDays(today, 6) : subDays(today, 29);

    if (period === "all") {
      const [{ data: firstMeal }, { data: firstBody }] = await Promise.all([
        supabase.from("meals").select("timestamp").eq("user_id", userId).order("timestamp").limit(1),
        supabase.from("body_composition").select("recorded_at").eq("user_id", userId).order("recorded_at").limit(1),
      ]);
      const candidates: Date[] = [];
      if (firstMeal?.[0]?.timestamp) candidates.push(new Date(firstMeal[0].timestamp));
      if (firstBody?.[0]?.recorded_at) candidates.push(parseISO(firstBody[0].recorded_at));
      const earliest = candidates.length
        ? new Date(Math.min(...candidates.map((d) => d.getTime())))
        : subMonths(today, 3);
      startDate = earliest < subMonths(today, 3) ? earliest : subMonths(today, 3);
    }

    const numDays = differenceInCalendarDays(startOfDay(today), startOfDay(startDate)) + 1;

    // Récupération des séances natives (sources approuvées)
    const allowedSources: string[] = Array.isArray(userProfile?.sport_allowed_sources)
      ? userProfile.sport_allowed_sources
      : [];
    let sessionsMap: Record<string, number> = {};
    try {
      const rawSessions = await readSessionsInRange(startOfDay(startDate), endOfDay(today));
      sessionsMap = sessionsByDate(rawSessions, allowedSources);
    } catch {
      sessionsMap = {};
    }

    // Pagination repas
    const PAGE = 1000;
    const meals: any[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data: page } = await supabase
        .from("meals")
        .select("id, timestamp, total_calories, total_proteins, total_carbs, total_fats")
        .eq("user_id", userId)
        .gte("timestamp", startOfDay(startDate).toISOString())
        .lte("timestamp", endOfDay(today).toISOString())
        .order("timestamp")
        .range(offset, offset + PAGE - 1);
      const rows = page || [];
      meals.push(...rows);
      if (rows.length < PAGE) break;
    }

    const mealIds = meals.map((m: any) => m.id);
    const microsByMeal: Record<string, Record<string, number>> = {};

    if (mealIds.length > 0) {
      const CHUNK = 200;
      const items: any[] = [];
      for (let i = 0; i < mealIds.length; i += CHUNK) {
        const idsChunk = mealIds.slice(i, i + CHUNK);
        for (let offset = 0; ; offset += PAGE) {
          const { data: page } = await supabase
            .from("meal_items")
            .select("meal_id, nutrients_std, nutrients_custom")
            .in("meal_id", idsChunk)
            .range(offset, offset + PAGE - 1);
          const rows = page || [];
          items.push(...rows);
          if (rows.length < PAGE) break;
        }
      }
      items.forEach((item) => {
        if (!microsByMeal[item.meal_id]) microsByMeal[item.meal_id] = {};
        const merged = { ...(item.nutrients_std || {}), ...(item.nutrients_custom || {}) };
        for (const [k, v] of Object.entries(merged)) {
          const n = Number(v) || 0;
          microsByMeal[item.meal_id][k] = (microsByMeal[item.meal_id][k] || 0) + n;
        }
      });
    }

    const dayMap: Record<string, any> = {};
    for (let i = 0; i < numDays; i++) {
      const d = subDays(today, numDays - 1 - i);
      const key = format(d, "yyyy-MM-dd");
      const sessionCount = sessionsMap[key] || 0;
      dayMap[key] = {
        key,
        time: localDayCoordinate(key),
        day: period === "7d" ? format(d, "EEE", { locale: fr }) : format(d, "dd/MM"),
        date: format(d, "dd/MM/yyyy"),
        calories: 0, proteins: 0, carbs: 0, fats: 0,
        hasSession: sessionCount > 0,
        sessionsCount: sessionCount,
      };

      allMicros.forEach(n => dayMap[key][n.key] = 0);
    }

    meals.forEach((m: any) => {
      const key = format(new Date(m.timestamp), "yyyy-MM-dd");
      if (dayMap[key]) {
        dayMap[key].calories += Number(m.total_calories) || 0;
        dayMap[key].proteins += Number(m.total_proteins) || 0;
        dayMap[key].carbs += Number(m.total_carbs) || 0;
        dayMap[key].fats += Number(m.total_fats) || 0;
        const micros = microsByMeal[m.id];
        if (micros) Object.keys(micros).forEach((k) => {
          dayMap[key][k] = (dayMap[key][k] || 0) + micros[k];
        });
      }
    });

    Object.values(dayMap).forEach((d: any) => {
      d.calories = Math.round(d.calories);
      d.proteins = Math.round(d.proteins);
      d.carbs = Math.round(d.carbs);
      d.fats = Math.round(d.fats);
    });

    // Composition corporelle
    const bodyComp: any[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data: page } = await supabase
        .from("body_composition")
        .select("*")
        .eq("user_id", userId)
        .gte("recorded_at", format(startDate, "yyyy-MM-dd"))
        .order("recorded_at")
        .order("created_at")
        .range(offset, offset + PAGE - 1);
      const rows = page || [];
      bodyComp.push(...rows);
      if (rows.length < PAGE) break;
    }

    const previousBodyQueries = ["weight_kg", "body_fat_percent", "muscle_mass_kg"].map((column) =>
      supabase
        .from("body_composition")
        .select("*")
        .eq("user_id", userId)
        .lt("recorded_at", format(startDate, "yyyy-MM-dd"))
        .not(column, "is", null)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1),
    );
    const previousBodyResults = await Promise.all(previousBodyQueries);
    const bodyBefore = previousBodyResults.flatMap(({ data }) => data || []);

    const bodyByDay = new Map<string, any>();
    [...bodyBefore, ...(bodyComp || [])].forEach((b: any) => {
      const key = b.recorded_at;
      const existing = bodyByDay.get(key);
      if (!existing) { bodyByDay.set(key, b); return; }
      const existingHC = existing.source === "health_connect";
      const currentHC = b.source === "health_connect";
      if (currentHC && !existingHC) { bodyByDay.set(key, b); return; }
      if (currentHC === existingHC) {
        if (new Date(b.created_at).getTime() >= new Date(existing.created_at).getTime()) {
          bodyByDay.set(key, b);
        }
      }
    });

    const round1 = (v: any) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
    setBodyData(Array.from(bodyByDay.values())
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .map(b => {
        const dayKey = String(b.recorded_at).slice(0, 10);
        const sessionCount = sessionsMap[dayKey] || 0;
        return {
          key: dayKey,
          day: format(new Date(b.recorded_at), "dd/MM"),
          date: format(new Date(b.recorded_at), "dd/MM/yyyy"),
          weight: round1(b.weight_kg),
          bodyFat: round1(b.body_fat_percent),
          muscleMass: round1(b.muscle_mass_kg),
          hasSession: sessionCount > 0,
          sessionsCount: sessionCount,
        };
      }));

    // Historique des objectifs
    const goalsHist: any[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data: page } = await supabase
        .from("goals_history")
        .select("*")
        .eq("user_id", userId)
        .lte("recorded_at", format(today, "yyyy-MM-dd"))
        .order("recorded_at")
        .range(offset, offset + PAGE - 1);
      const rows = page || [];
      goalsHist.push(...rows);
      if (rows.length < PAGE) break;
    }

    const goalsList = goalsHist.map((g: any) => ({
      recorded_at: g.recorded_at,
      calories: Number(g.calories),
      proteins: Number(g.proteins),
      carbs: Number(g.carbs),
      fats: Number(g.fats),
    }));

    const sortedKeys = Object.keys(dayMap).sort();
    let gIdx = 0;
    let current: any = null;
    for (let i = 0; i < goalsList.length; i++) {
      if (goalsList[i].recorded_at <= sortedKeys[0]) current = goalsList[i];
      else break;
    }
    while (gIdx < goalsList.length && goalsList[gIdx].recorded_at < sortedKeys[0]) gIdx++;

    sortedKeys.forEach((key) => {
      while (gIdx < goalsList.length && goalsList[gIdx].recorded_at <= key) {
        current = goalsList[gIdx];
        gIdx++;
      }
      const c = current;
      dayMap[key].calorieGoal = c?.calories ?? calorieGoal;
      dayMap[key].proteinGoal = c?.proteins ?? proteinGoal;
      dayMap[key].carbsGoal = c?.carbs ?? carbsGoal;
      dayMap[key].fatsGoal = c?.fats ?? fatsGoal;
    });

    setNutritionData(Object.values(dayMap));
    setGoalsHistory(goalsList);
  };

  // Zoom / pan
  const zoomEnabled = period !== "7d";
  const defaultVisibleCount = period === "all" ? 90 : nutritionData.length || 30;
  const { window: zoomWindow, isZoomed, reset: resetZoom, controller } = useChartZoomPan(
    nutritionData.length,
    defaultVisibleCount,
    zoomEnabled,
  );

  const visibleNutritionData = useMemo(
    () => nutritionData.slice(zoomWindow.start, zoomWindow.start + zoomWindow.count),
    [nutritionData, zoomWindow],
  );

  const visibleBodyData = useMemo(
    () => alignBodyTimeline(visibleNutritionData, bodyData),
    [visibleNutritionData, bodyData],
  );
  const xTicks = useMemo(() => timelineTicks(visibleNutritionData), [visibleNutritionData]);
  const firstTime = visibleNutritionData[0]?.time ?? 0;
  const lastTime = visibleNutritionData[visibleNutritionData.length - 1]?.time ?? firstTime;
  const xDomain: [number, number] = firstTime === lastTime
    ? [firstTime - 43200000, lastTime + 43200000]
    : [firstTime, lastTime];
  const chartMargin = { top: 20, right: 8, bottom: 5, left: 0 };
  const timeAxis = (
    <XAxis dataKey="time" type="number" scale="time" domain={xDomain}
      ticks={xTicks} allowDataOverflow padding={{ left: 8, right: 8 }}
      tickFormatter={(time) => format(new Date(time), period === "7d" ? "EEE" : "dd/MM", { locale: fr })}
      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
      axisLine={false} tickLine={false} interval={0} />
  );
  const sessionLines = visibleNutritionData.filter((day) => day.hasSession).map((day) => (
    <ReferenceLine key={`session-${day.key}`} x={day.time}
      stroke="hsl(var(--primary))" strokeDasharray="3 3" strokeOpacity={0.6}
      label={{ value: "🏋️", position: "top", fontSize: 10 }} />
  ));
  const dateLabel = (time: number) => {
    const item = visibleNutritionData.find((day) => day.time === Number(time));
    const date = format(new Date(Number(time)), "dd/MM/yyyy");
    return item?.hasSession
      ? `${date} · 🏋️ ${item.sessionsCount} séance${item.sessionsCount > 1 ? "s" : ""}`
      : date;
  };

  const rangeLabel = visibleNutritionData.length
    ? `${visibleNutritionData[0].date} → ${visibleNutritionData[visibleNutritionData.length - 1].date}`
    : "";

  const resolvedMicros = useMemo(
    () => resolveMicroGoals(
      {
        gender: userProfile?.gender,
        age: userProfile?.birth_date ? differenceInYears(new Date(), new Date(userProfile.birth_date)) : (userProfile?.age ?? 30),
        weight_kg: userProfile?.current_weight ?? userProfile?.weight_kg,
        totalCaloriesGoal: calorieGoal,
        isAthlete: userProfile?.is_athlete ?? userProfile?.isAthlete,
        isSmoker: userProfile?.is_smoker ?? userProfile?.isSmoker,
        isPregnant: userProfile?.is_pregnant ?? userProfile?.isPregnant,
        isMenopausal: userProfile?.is_menopausal ?? userProfile?.isMenopausal,
      },
      customNutrients,
      microOverrides,
    ),
    [userProfile, calorieGoal, customNutrients, microOverrides],
  );

  const radarData = useMemo(() => {
    const daysWithData = visibleNutritionData.filter((d) => d.calories > 0).length || 1;
    return resolvedMicros.map((m) => {
      const avg = visibleNutritionData.reduce((sum, d) => sum + (Number(d[m.key]) || 0), 0) / daysWithData;
      const goal = m.goal > 0 ? m.goal : 1;
      const pct = (avg / goal) * 100;
      return {
        nutrient: m.label,
        value: Math.min(pct, 150),
        fullPct: Math.round(pct),
        avg: Math.round(avg * 10) / 10,
        goalVal: goal,
        unit: m.unit,
        goalMarker: 100,
        isLimit: m.isLimit,
      };
    });
  }, [visibleNutritionData, resolvedMicros]);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "12px",
    fontSize: "13px",
    color: "hsl(var(--popover-foreground))",
    padding: "10px"
  };

  const getExtendedDomain = (data: any[], key: string, target: number | null | undefined, padding: number) => {
    const values = data.map(d => d[key]).filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)));
    if (values.length === 0 && !target) return [0, 100];
    const min = Math.min(...values, target || Infinity);
    const max = Math.max(...values, target || -Infinity);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  };

  const viewSwitch = (
    <div className="flex rounded-xl bg-muted p-1 gap-1 max-w-lg mx-auto">
      {(["charts", "calendar", "report"] as const).map((v) => (
        <Button variant="ghost" key={v} onClick={() => setView(v)} aria-pressed={view === v}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${view === v ? "bg-card text-foreground shadow-card" : "text-muted-foreground"}`}>
          {v === "charts" ? "Graphiques" : v === "calendar" ? "Calendrier" : "Bilans"}
        </Button>
      ))}
    </div>
  );

  if (view === "calendar" || view === "report") {
    return (
      <div className="space-y-4 pb-10">
        {viewSwitch}
        {view === "calendar" ? <ActivityCalendar userId={userId} calorieGoal={calorieGoal} userProfile={userProfile} /> : <EvolutionReport userId={userId} />}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {viewSwitch}
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
        {zoomEnabled && (
          <div className="flex items-center justify-between gap-2 max-w-lg mx-auto mt-1.5">
            <span className="text-[10px] text-muted-foreground truncate">
              {rangeLabel} · pincez pour zoomer, glissez pour défiler
            </span>
            {isZoomed && (
              <button onClick={resetZoom} className="flex items-center gap-1 text-[10px] font-semibold text-primary shrink-0">
                <RotateCcw className="w-3 h-3" /> Réinit.
              </button>
            )}
          </div>
        )}
      </div>

      {/* 1. CALORIES */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-sm">Calories vs Objectif</h3>
          {visibleNutritionData.some((d) => d.hasSession) && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              🏋️ Séance effectuée
            </span>
          )}
        </div>
        <ZoomPanArea controller={controller} className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart 
              data={visibleNutritionData} margin={chartMargin}
              onMouseMove={(state) => { if (state.activeTooltipIndex !== undefined) setActiveIndex(state.activeTooltipIndex); }}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" vertical={false} />
              {timeAxis}
              <YAxis width={60} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={tooltipStyle} 
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                cursor={{ fill: 'hsl(var(--muted))' }}
                labelFormatter={dateLabel}
              />
              {sessionLines}
              <Bar dataKey="calories" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {visibleNutritionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={activeIndex === index ? "hsl(var(--primary))" : "rgba(16, 185, 129, 0.4)"} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="calorieGoal" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Objectif" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ZoomPanArea>
      </section>

      {/* 2. MACRONUTRIMENTS */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-sm">Macronutriments (g)</h3>
          {visibleNutritionData.some((d) => d.hasSession) && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              🏋️ Séance d'entraînement
            </span>
          )}
        </div>
        <ZoomPanArea controller={controller} className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visibleNutritionData} margin={chartMargin}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" vertical={false} />
              {timeAxis}
              <YAxis width={60} tick={{ fontSize: 10 }} />
              <Tooltip 
                contentStyle={tooltipStyle}
                labelFormatter={dateLabel}
              />
              {sessionLines}
              <Line type="monotone" dataKey="proteinGoal" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="4 4" dot={false} strokeOpacity={0.5} name="Obj. Prot." isAnimationActive={false} />
              <Line type="monotone" dataKey="carbsGoal" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 4" dot={false} strokeOpacity={0.5} name="Obj. Gluc." isAnimationActive={false} />
              <Line type="monotone" dataKey="fatsGoal" stroke="#F43F5E" strokeWidth={1.5} strokeDasharray="4 4" dot={false} strokeOpacity={0.5} name="Obj. Lip." isAnimationActive={false} />
              <Line type="monotone" dataKey="proteins" stroke="#3B82F6" strokeWidth={3} dot={false} name="Prot." isAnimationActive={false} />
              <Line type="monotone" dataKey="carbs" stroke="#F59E0B" strokeWidth={3} dot={false} name="Gluc." isAnimationActive={false} />
              <Line type="monotone" dataKey="fats" stroke="#F43F5E" strokeWidth={3} dot={false} name="Lip." isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ZoomPanArea>
      </section>

      {/* 3. RADAR MICROS */}
      <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
        <h3 className="font-display font-semibold text-sm mb-1">Bilan Micronutriments</h3>
        <p className="text-[10px] text-muted-foreground mb-3">Moyenne vs objectifs personnalisés (%)</p>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="nutrient"
                tick={(props: any) => {
                  const { x, y, textAnchor, payload } = props;
                  const entry = radarData.find((d) => d.nutrient === payload.value);
                  const fill = entry?.isLimit ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))";
                  return (
                    <text x={x} y={y} textAnchor={textAnchor} fill={fill} fontSize={9} fontWeight={entry?.isLimit ? 600 : 400}>
                      {payload.value}
                    </text>
                  );
                }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 150]} tick={false} axisLine={false} />
              <Radar
                name="Objectif"
                dataKey="goalMarker"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                fill="none"
                strokeOpacity={0.5}
              />
              <Radar
                name="Apport"
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.25}
                strokeWidth={2}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border p-3 rounded-xl shadow-xl">
                        <p className="text-popover-foreground font-bold text-xs mb-1">{data.nutrient}</p>
                        <p className="text-primary text-[11px] font-medium">{data.avg} {data.unit} / {data.goalVal} {data.unit}</p>
                        <p className="text-muted-foreground text-[10px]">Couverture : {data.fullPct}%</p>
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

      {/* 3bis. GRAPHIQUES PERSONNALISÉS */}
      <div className="space-y-3 pt-2">
        <CustomChartsManager
          userId={userId}
          charts={customCharts}
          onChange={(next) => onCustomChartsChange?.(next)}
          resolvedMicros={resolvedMicros}
        />
        {customCharts.map((chart) => {
          const selected = chart.micros
            .map((k) => resolvedMicros.find((r) => r.key === k))
            .filter(Boolean) as typeof resolvedMicros;
          if (selected.length === 0) return null;

          const palette = [chart.color, ...CHART_COLORS.map((c) => c.value).filter((c) => c !== chart.color)];
          const series = selected.map((s, i) => ({
            key: s.key,
            label: s.label,
            unit: s.unit,
            goal: s.goal || 0,
            isLimit: !!s.isLimit,
            color: palette[i % palette.length],
          }));

          const isSingle = series.length === 1;
          const single = series[0];

          const data = visibleNutritionData.map((d) => {
            const row: any = { time: d.time, day: d.day, date: d.date };
            series.forEach((s) => {
              row[s.key] = Math.round((Number(d[s.key]) || 0) * 10) / 10;
            });
            if (isSingle) {
              const v = row[single.key] as number;
              row.baseValue = single.isLimit ? Math.min(v, single.goal) : v;
              row.overValue = single.isLimit && v > single.goal ? v - single.goal : 0;
            }
            return row;
          });

          const referenceLines = series.map((s) => (
            <ReferenceLine
              key={`ref-${s.key}`}
              y={s.goal}
              stroke={s.isLimit ? "hsl(var(--destructive))" : s.color}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={
                isSingle
                  ? {
                      position: "insideTopRight",
                      value: `${s.isLimit ? "⚠️" : "🎯"} ${s.isLimit ? "Max" : "Min"}: ${Math.round(s.goal * 10) / 10} ${s.unit}`,
                      fill: s.isLimit ? "hsl(var(--destructive))" : s.color,
                      fontSize: 10,
                      fontWeight: 600,
                    }
                  : undefined
              }
            />
          ));

          const commonAxes = (
            <>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" vertical={false} />
              {timeAxis}
              <YAxis width={60} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                cursor={{ fill: "hsl(var(--muted))" }}
                labelFormatter={dateLabel}
                formatter={(v: any, name: any) => {
                  const s = series.find((x) => x.label === name || x.key === name);
                  return [`${v} ${s?.unit ?? ""}`, s?.label ?? name];
                }}
              />
              {!isSingle && <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />}
            </>
          );

          return (
            <section key={chart.id} className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: chart.color }} />
                  {chart.title}
                </h3>
                {isSingle && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      single.isLimit ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                    }`}
                  >
                    {single.isLimit ? "⚠️" : "🎯"} {single.isLimit ? "Max" : "Min"}: {Math.round(single.goal * 10) / 10} {single.unit}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-1 mb-3">
                {series.map((s) => (
                  <span key={s.key} className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label} ({s.isLimit ? "max" : "min"} {Math.round(s.goal * 10) / 10} {s.unit})
                  </span>
                ))}
              </div>
              <ZoomPanArea controller={controller} className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  {chart.chart_type === "bar" ? (
                    <BarChart data={data} barGap={2} margin={chartMargin}>
                      {commonAxes}
                      {referenceLines}
                      {isSingle ? (
                        <>
                          <Bar dataKey="baseValue" name={single.label} stackId="a" radius={single.isLimit ? [0, 0, 0, 0] : [4, 4, 0, 0]}>
                            {data.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={single.color}
                                fillOpacity={!single.isLimit && (entry[single.key] as number) < single.goal ? 0.35 : 1}
                              />
                            ))}
                          </Bar>
                          {single.isLimit && (
                            <Bar dataKey="overValue" name="Dépassement" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                          )}
                        </>
                      ) : (
                        series.map((s) => (
                          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} />
                        ))
                      )}
                    </BarChart>
                  ) : (
                    <LineChart data={data} margin={chartMargin}>
                      {commonAxes}
                      {referenceLines}
                      {series.map((s) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stroke={s.color}
                          strokeWidth={3}
                          dot={(chart.show_dots ?? true) ? { r: 3, fill: s.color } : false}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </ZoomPanArea>
            </section>
          );
        })}
      </div>

      {/* 4. COMPOSITION CORPORELLE */}
      {bodyData.length > 0 && (
        <div className="space-y-6">
          <h2 className="font-display font-bold text-lg px-1 mt-8">Analyse Corporelle</h2>
          {[
            { title: "Poids", key: "weight", unit: "kg", color: "hsl(var(--primary))", target: targetWeight, padding: 2 },
            { title: "Masse Grasse", key: "bodyFat", unit: "%", color: "#F43F5E", target: targetBodyFat, padding: 1 },
            { title: "Masse Musculaire", key: "muscleMass", unit: "kg", color: "#3B82F6", target: targetMuscleMass, padding: 1 }
          ].map((chart) => {
            const chartData = visibleBodyData;
            const measuredCount = chartData.filter((day) => day[chart.key] != null).length;
            return (
            <section key={chart.key} className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-sm" style={{ color: chart.color }}>
                  {chart.title} ({chart.unit})
                </h3>
                {chartData.some((d: any) => d.hasSession) && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    🏋️ Séance effectuée
                  </span>
                )}
              </div>
              <ZoomPanArea controller={controller} className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" vertical={false} />
                    {timeAxis}
                    <YAxis 
                      domain={getExtendedDomain(chartData, chart.key, chart.target, chart.padding)} 
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                      width={60}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip filterNull={false}
                      content={({ active, label }) => {
                        if (!active || label == null) return null;
                        const item = chartData.find((day) => day.time === Number(label));
                        if (!item) return null;
                        const value = item[chart.key];
                        return (
                          <div className="bg-popover border border-border p-2.5 rounded-lg shadow-xl">
                            <p className="text-muted-foreground text-[11px] mb-0.5">{item.date}</p>
                            <p className="text-popover-foreground font-bold text-sm">
                              {value == null ? "Aucune mesure" : `${value} ${chart.unit}`}
                            </p>
                            {item.hasSession && <p className="text-primary text-[11px] font-medium mt-1">
                              🏋️ {item.sessionsCount} séance{item.sessionsCount > 1 ? "s" : ""}
                            </p>}
                          </div>
                        );
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
                    {sessionLines}
                    <Line
                      type="monotone"
                      dataKey={chart.key}
                      stroke={chart.color}
                      strokeWidth={3}
                      dot={(props: any) => {
                        const { cx, cy, payload, index } = props;
                        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !payload || payload[chart.key] == null) return <g key={`dot-${index}`} />;
                        if (payload.hasSession) {
                          return (
                            <g key={`dot-${index}`}>
                              <circle cx={cx} cy={cy} r={6} fill="hsl(var(--primary))" fillOpacity={0.3} />
                              <circle cx={cx} cy={cy} r={3.5} fill={chart.color} stroke="hsl(var(--card))" strokeWidth={1.5} />
                            </g>
                          );
                        }
                        return measuredCount === 1 ? (
                          <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill={chart.color} />
                        ) : (
                          <g key={`dot-${index}`} />
                        );
                      }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ZoomPanArea>
            </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EvolutionPage;
