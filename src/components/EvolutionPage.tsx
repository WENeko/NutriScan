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
  customNutrients = [], microOverrides = {},
  customCharts = [], onCustomChartsChange
}) => {
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const [nutritionData, setNutritionData] = useState<any[]>([]);
  const [bodyData, setBodyData] = useState<any[]>([]);
  const [goalsHistory, setGoalsHistory] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // (dynamicGoals retiré — la résolution des objectifs micro passe désormais
  // par resolveMicroGoals dans le useMemo `resolvedMicros` ci-dessous.)

  const allMicros = useMemo(() => getMasterList(customNutrients), [customNutrients]);

  useEffect(() => { fetchData(); }, [userId, period, customNutrients]);

  const fetchData = async () => {
    const today = new Date();
    let startDate = period === "7d" ? subDays(today, 6) : subDays(today, 29);

    if (period === "all") {
      // Amplitude complète des enregistrements (repas + composition corporelle)
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
      // Toujours au moins 3 mois d'axe pour la vue par défaut
      startDate = earliest < subMonths(today, 3) ? earliest : subMonths(today, 3);
    }

    const numDays = differenceInCalendarDays(startOfDay(today), startOfDay(startDate)) + 1;


    // Pagination : PostgREST plafonne à 1000 lignes par requête. Sans cela, la
    // vue "Global" perd des repas et affiche des totaux trop faibles.
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
      // Source unique de vérité : JSONB nutrients_std + nutrients_custom
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
      dayMap[key] = {
        key,
        day: period === "7d" ? format(d, "EEE", { locale: fr }) : format(d, "dd/MM"),
        date: format(d, "dd/MM/yyyy"),
        calories: 0, proteins: 0, carbs: 0, fats: 0
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
    // Arrondi une seule fois, après agrégation de la journée
    Object.values(dayMap).forEach((d: any) => {
      d.calories = Math.round(d.calories);
      d.proteins = Math.round(d.proteins);
      d.carbs = Math.round(d.carbs);
      d.fats = Math.round(d.fats);
    });

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
    // Point d'ancrage : dernier enregistrement AVANT la fenêtre, pour que la
    // courbe puisse être tracée jusqu'au premier point visible (sinon un seul
    // point dans la fenêtre = graphique vide).
    // Une ancre distincte est nécessaire par mesure : le relevé précédent de
    // poids peut ne contenir ni masse grasse ni masse musculaire (et inversement).
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
    // Déduplication par jour : priorité à health_connect, sinon la dernière entrée créée
    const bodyByDay = new Map<string, any>();
    [...bodyBefore, ...(bodyComp || [])].forEach((b: any) => {

      const key = b.recorded_at;
      const existing = bodyByDay.get(key);
      if (!existing) { bodyByDay.set(key, b); return; }
      const existingHC = existing.source === "health_connect";
      const currentHC = b.source === "health_connect";
      if (currentHC && !existingHC) { bodyByDay.set(key, b); return; }
      if (currentHC === existingHC) {
        // même priorité → garder la plus récente
        if (new Date(b.created_at).getTime() >= new Date(existing.created_at).getTime()) {
          bodyByDay.set(key, b);
        }
      }
    });
    const round1 = (v: any) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
    setBodyData(Array.from(bodyByDay.values())
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .map(b => ({
        key: String(b.recorded_at).slice(0, 10),
        day: format(new Date(b.recorded_at), "dd/MM"),
        date: format(new Date(b.recorded_at), "dd/MM/yyyy"),

        weight: round1(b.weight_kg),
        bodyFat: round1(b.body_fat_percent),
        muscleMass: round1(b.muscle_mass_kg)
      })));

    // Fetch goals history (incluant snapshots antérieurs au range pour forward-fill)
    const { data: goalsHist } = await supabase
      .from("goals_history")
      .select("*")
      .eq("user_id", userId)
      .lte("recorded_at", format(today, "yyyy-MM-dd"))
      .order("recorded_at");

    const goalsList = (goalsHist || []).map((g: any) => ({
      recorded_at: g.recorded_at,
      calories: Number(g.calories),
      proteins: Number(g.proteins),
      carbs: Number(g.carbs),
      fats: Number(g.fats),
    }));

    // Forward-fill objectifs sur chaque jour du dayMap
    const sortedKeys = Object.keys(dayMap).sort();
    let gIdx = 0;
    let current: any = null;
    // Initialiser current avec le dernier snapshot antérieur au range
    for (let i = 0; i < goalsList.length; i++) {
      if (goalsList[i].recorded_at <= sortedKeys[0]) current = goalsList[i];
      else break;
    }
    // Avancer gIdx au premier snapshot dans le range
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

  // --- Zoom / pan sur l'axe temporel (30 jours & Global) ---
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

  const getVisibleBodySeries = (metricKey: string) => {
    const hasValue = (entry: any) => entry[metricKey] !== null && Number.isFinite(Number(entry[metricKey]));
    if (!visibleNutritionData.length) return bodyData.filter(hasValue);
    const from = visibleNutritionData[0].key;
    const to = visibleNutritionData[visibleNutritionData.length - 1].key;
    const inRange = bodyData.filter((b) => hasValue(b) && (!b.key || (b.key >= from && b.key <= to)));
    // Conserve le dernier point antérieur qui possède réellement cette mesure.
    const anchor = [...bodyData].reverse().find((b) => hasValue(b) && b.key && b.key < from);
    return anchor ? [anchor, ...inRange] : inRange;
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
  }, [nutritionData, resolvedMicros]);

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
        <h3 className="font-display font-semibold text-sm mb-3">Calories vs Objectif</h3>
        <ZoomPanArea controller={controller} className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart 
              data={visibleNutritionData} 
              onMouseMove={(state) => { if (state.activeTooltipIndex !== undefined) setActiveIndex(state.activeTooltipIndex); }}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={tooltipStyle} 
                itemStyle={{ color: "#FFFFFF" }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
              />
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
        <h3 className="font-display font-semibold text-sm mb-3">Macronutriments (g)</h3>
        <ZoomPanArea controller={controller} className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visibleNutritionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={12} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
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
          // Une série distincte par micronutriment sélectionné (pas d'addition)
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
            const row: any = { day: d.day, date: d.date };
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
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "#FFFFFF" }}
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
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
                    <BarChart data={data} barGap={2}>
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
                    <LineChart data={data}>
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
            const chartData = getVisibleBodySeries(chart.key);
            return (
            <section key={chart.key} className="bg-card rounded-2xl p-4 shadow-card animate-fade-up">
              <h3 className="font-display font-semibold text-sm mb-3" style={{ color: chart.color }}>{chart.title} ({chart.unit})</h3>
              <ZoomPanArea controller={controller} className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                    <YAxis 
                      domain={getExtendedDomain(chartData, chart.key, chart.target, chart.padding)} 
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
                    <Line
                      type="monotone"
                      dataKey={chart.key}
                      stroke={chart.color}
                      strokeWidth={3}
                      dot={chartData.length === 1 ? { r: 3, fill: chart.color } : false}
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
                    
