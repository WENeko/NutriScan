import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPersonalizedMicroGoals, getMicroInfo, getCustomMicroInfo, type UserProfile } from "@/lib/micro-goals";
import { resolveMicroGoals, type MicroOverrides } from "@/utils/nutrition-logic";
import { type CustomNutrientDef } from "@/utils/nutrients-helpers";
import CircularProgress from "@/components/CircularProgress";
import MealInput from "@/components/MealInput";
import MealHistory from "@/components/MealHistory";
import EvolutionPage from "@/components/EvolutionPage";
import NutriLibrary from "@/components/NutriLibrary";
import ProfilePage from "@/components/ProfilePage";
import CoachPage from "@/components/CoachPage";
import DataSourcesSettings from "@/components/DataSourcesSettings";
import BottomNav, { TabId } from "@/components/BottomNav";
import WaterTracker from "@/components/WaterTracker";
import HealthDetails from "@/components/HealthDetails";
import { TooltipProvider } from "@/components/TooltipContext";
import WeighinReminder from "@/components/WeighinReminder";
import { autoSyncHealthData } from "@/services/health-connect";
import { Leaf, LogOut, User, TrendingUp, TrendingDown, Minus, ChevronDown, Heart, AlertTriangle, Smartphone } from "lucide-react";
import { startOfDay, startOfWeek, endOfWeek, format } from "date-fns";
import BuildInfo from "@/components/BuildInfo";
import { MACRO_COLORS } from "@/lib/macro-colors";
import { isLovableAiEnabled, isAiConfigured, loadAiAccess } from "@/lib/aiAccess";
import OnboardingFlow, { isOnboardingDone } from "@/components/OnboardingFlow";
import { syncWidgetData, guessMealIcon } from "@/services/widgetSyncService";
import { initWidgetDeepLinks, consumePendingIntent, WIDGET_INTENT_EVENT, type WidgetIntent } from "@/services/widgetDeepLinks";
import { toast } from "@/hooks/use-toast";



interface Goals {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

interface Meal {
  id: string;
  timestamp: string;
  image_url: string | null;
  total_calories: number;
  total_proteins: number;
  total_carbs: number;
  total_fats: number;
  meal_name?: string | null;
  is_favorite?: boolean;
}

const Dashboard: React.FC<{ userId: string }> = ({ userId }) => {
  const [goals, setGoals] = useState<Goals>({ calories: 2000, proteins: 150, carbs: 250, fats: 70 });
  const [todayTotals, setTodayTotals] = useState({ calories: 0, proteins: 0, carbs: 0, fats: 0 });
  const [todayMeals, setTodayMeals] = useState<Meal[]>([]);
  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [favoriteMeals, setFavoriteMeals] = useState<Meal[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [weekAvgCalories, setWeekAvgCalories] = useState(0);
  const [weekTotalCalories, setWeekTotalCalories] = useState(0);
  const [weekDaysElapsed, setWeekDaysElapsed] = useState(1);
  const [weeklyCalorieTarget, setWeeklyCalorieTarget] = useState(0);
  const [weeklyElapsedTarget, setWeeklyElapsedTarget] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [pendingRecipe, setPendingRecipe] = useState<{ title: string; portions: number; ingredients: { name: string; grams: number }[] } | null>(null);
  const [waterGoal, setWaterGoal] = useState(2000);
  const [weight, setWeight] = useState(70);
  const [sportCalories, setSportCalories] = useState(0);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [targetBodyFat, setTargetBodyFat] = useState<number | null>(null);
  const [targetMuscleMass, setTargetMuscleMass] = useState<number | null>(null);
  const [proteinTargetPerKg, setProteinTargetPerKg] = useState(2.0);
  const [userProfile, setUserProfile] = useState<UserProfile>({});
  const [customNutrients, setCustomNutrients] = useState<CustomNutrientDef[]>([]);
  const [microOverrides, setMicroOverrides] = useState<MicroOverrides>({});
  const [customCharts, setCustomCharts] = useState<any[]>([]);
  const [todayMicros, setTodayMicros] = useState<Record<string, number>>({});
  const [weekMicros, setWeekMicros] = useState<Record<string, number>>({});

  // État IA : onboarding (nouvel utilisateur) + rappel si aucune IA fonctionnelle.
  const [aiReady, setAiReady] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      await loadAiAccess(userId);
      const ready = isAiConfigured();
      setAiReady(ready);
      if (!ready && !isOnboardingDone(userId)) setShowOnboarding(true);
    })();
  }, [userId]);



  // Génère les descriptions IA manquantes pour les micros custom existants (créés
  // avant la fonctionnalité) puis persiste et rafraîchit l'état.
  const backfillCustomDescriptions = useCallback(async (defs: CustomNutrientDef[]) => {
    if (!isLovableAiEnabled()) return; // describe-nutrient = edge function Lovable réservée
    if (defs.length === 0) return;
    // Régénération forcée (nouvelle règle synthétique) : une seule fois par utilisateur.
    const REGEN_FLAG = `custom_desc_regen_v2_${userId}`;
    const forceRegen = localStorage.getItem(REGEN_FLAG) !== "1";
    const targets = forceRegen ? defs : defs.filter((d) => !d.description || !d.description.trim());
    if (targets.length === 0) {
      localStorage.setItem(REGEN_FLAG, "1");
      return;
    }
    let changed = false;
    const updated = [...defs];
    for (const def of targets) {
      try {
        const { data, error } = await supabase.functions.invoke("describe-nutrient", {
          body: { label: def.label, unit: def.unit, goal: def.goal, is_limit: def.is_limit, category: def.category },
        });
        if (!error && data?.description) {
          const idx = updated.findIndex((u) => u.key === def.key);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], description: String(data.description).slice(0, 120) };
            changed = true;
          }
        }
      } catch {
        // ignore: le tooltip retombera sur le fallback
      }
    }
    if (changed) {
      await supabase.from("profiles").update({ custom_nutrients: updated as any }).eq("user_id", userId);
      setCustomNutrients(updated);
    }
    localStorage.setItem(REGEN_FLAG, "1");
  }, [userId]);



  const fetchData = useCallback(async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("goals, water_goal_ml, target_weight_kg, target_body_fat_percent, target_muscle_mass_kg, gender, age, activity_level, custom_nutrients, micro_overrides, custom_charts, is_athlete, is_smoker, is_pregnant, is_menopausal, goals_mode")
      .eq("user_id", userId)
      .single();

    // Dernière mesure de composition corporelle (source unique de vérité)
    // -> récupère plusieurs lignes pour trouver les dernières valeurs NON NULLES
    // par champ (poids vs calories actives sont souvent enregistrés séparément).
    const { data: lastBodyRows } = await supabase
      .from("body_composition")
      .select("weight_kg, active_calories_kcal, recorded_at, created_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    const firstNonNull = (key: string) =>
      ((lastBodyRows || []).find((r: any) => r[key] !== null && r[key] !== undefined) as any)?.[key];
    const lastWeight = firstNonNull("weight_kg");
    const lastActiveCal = firstNonNull("active_calories_kcal");

    let baseCalories = 2000;
    // (anciennement weekSportTotal — désormais lissé en amont dans profiles.goals)

    // Calendar week: Monday 00:00 to Sunday 23:59
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
    const dayOfWeek = now.getDay(); // 0=Sun
    const mondayBased = dayOfWeek === 0 ? 7 : dayOfWeek; // 1=Mon..7=Sun
    setWeekDaysElapsed(mondayBased);

    if (profile) {
      const g = profile.goals as any;
      baseCalories = g?.calories ?? 2000;
      const currentWeight = lastWeight !== undefined ? Number(lastWeight) : 70;
      const dailySport = lastActiveCal !== undefined ? Number(lastActiveCal) : 0;
      setSportCalories(Math.round(dailySport));
      setWeight(Math.round(currentWeight * 10) / 10);
      setWaterGoal(Number((profile as any).water_goal_ml) || 2000);
      setTargetWeight((profile as any).target_weight_kg ? Number((profile as any).target_weight_kg) : null);
      setTargetBodyFat((profile as any).target_body_fat_percent ? Number((profile as any).target_body_fat_percent) : null);
      setTargetMuscleMass((profile as any).target_muscle_mass_kg ? Number((profile as any).target_muscle_mass_kg) : null);
      setUserProfile({
        gender: profile.gender,
        age: profile.age,
        weight_kg: currentWeight,
        activity_level: profile.activity_level,
        isAthlete: !!(profile as any).is_athlete,
        isSmoker: !!(profile as any).is_smoker,
        isPregnant: !!(profile as any).is_pregnant,
        isMenopausal: !!(profile as any).is_menopausal,
      });
      const cn = (profile as any).custom_nutrients;
      const cnArr: CustomNutrientDef[] = Array.isArray(cn) ? cn : [];
      setCustomNutrients(cnArr);
      void backfillCustomDescriptions(cnArr);
      const mo = (profile as any).micro_overrides;
      setMicroOverrides(mo && typeof mo === "object" ? (mo as MicroOverrides) : {});
      const cc = (profile as any).custom_charts;
      setCustomCharts(Array.isArray(cc) ? cc : []);

      // `baseCalories` (= profile.goals.calories) inclut déjà la moyenne
      // sportive 7 j lissée pour le Mode Scientifique (calculée à la synchro/sauvegarde).
      // Plus de re-lissage côté Dashboard pour éviter le double comptage.
      setGoals({
        calories: baseCalories,
        proteins: g?.proteins ?? 150,
        carbs: g?.carbs ?? 250,
        fats: g?.fats ?? 70,
      });


      // === Persistance auto des objectifs du jour ===
      const todayStr = format(now, "yyyy-MM-dd");
      const todaySnap = {
        user_id: userId,
        recorded_at: todayStr,
        calories: baseCalories,
        proteins: g?.proteins ?? 150,
        carbs: g?.carbs ?? 250,
        fats: g?.fats ?? 70,
        goals_mode: (profile as any).goals_mode ?? "scientific",
        source: "auto",
      };
      // Upsert atomique grâce à la contrainte UNIQUE (user_id, recorded_at)
      await supabase
        .from("goals_history")
        .upsert(todaySnap, { onConflict: "user_id,recorded_at" });

      // === Budget hebdo : somme des objectifs caloriques journaliers (forward-fill) ===
      const { data: goalsHist } = await supabase
        .from("goals_history")
        .select("recorded_at, calories")
        .eq("user_id", userId)
        .lte("recorded_at", format(weekEnd, "yyyy-MM-dd"))
        .order("recorded_at");
      const histList = (goalsHist || []) as Array<{ recorded_at: string; calories: number }>;
      let weeklyTarget = 0;
      let elapsedTarget = 0;
      let current: number | null = null;
      // dernier snapshot antérieur au début de semaine
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      for (const h of histList) {
        if (h.recorded_at < weekStartStr) current = Number(h.calories);
        else break;
      }
      let hIdx = histList.findIndex((h) => h.recorded_at >= weekStartStr);
      if (hIdx < 0) hIdx = histList.length;
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const key = format(d, "yyyy-MM-dd");
        while (hIdx < histList.length && histList[hIdx].recorded_at <= key) {
          current = Number(histList[hIdx].calories);
          hIdx++;
        }
        const dailyGoal = current ?? baseCalories;
        weeklyTarget += dailyGoal;
        if (i < mondayBased) elapsedTarget += dailyGoal;
      }
      setWeeklyCalorieTarget(Math.round(weeklyTarget));
      setWeeklyElapsedTarget(Math.round(elapsedTarget));
    }

    const todayStart = startOfDay(now);
    const { data: meals } = await supabase
      .from("meals")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false });

    if (meals) {
      const typedMeals = meals as Meal[];
      setAllMeals(typedMeals);
      setFavoriteMeals(
        typedMeals
          .filter((m) => m.is_favorite)
          .filter((m) => !(m as any).parent_meal_id)
          .filter((meal, index, self) => 
            index === self.findIndex((t) => t.meal_name === meal.meal_name)
          )
      );

      const today = typedMeals.filter((m) => new Date(m.timestamp) >= todayStart);
      setTodayMeals(today);
      const totals = today.reduce(
        (acc, m) => ({
          calories: acc.calories + Number(m.total_calories),
          proteins: acc.proteins + Number(m.total_proteins),
          carbs: acc.carbs + Number(m.total_carbs),
          fats: acc.fats + Number(m.total_fats),
        }),
        { calories: 0, proteins: 0, carbs: 0, fats: 0 }
      );
      setTodayTotals(totals);

      // Calendar week meals (Mon-Sun)
      const weekMeals = typedMeals.filter((m) => {
        const ts = new Date(m.timestamp);
        return ts >= weekStart && ts <= weekEnd;
      });
      const weekTotal = weekMeals.reduce((acc, m) => acc + Number(m.total_calories), 0);
      setWeekTotalCalories(Math.round(weekTotal));
      setWeekAvgCalories(Math.round(weekTotal / mondayBased));

      // Fetch week micros via JSONB (source unique de vérité)
      const todayMealIds = today.map((m) => m.id);
      const weekMealIds = weekMeals.map((m) => m.id);
      if (weekMealIds.length > 0) {
        const { data: items } = await supabase
          .from("meal_items")
          .select("meal_id, nutrients_std, nutrients_custom")
          .in("meal_id", weekMealIds);
        if (items) {
          const todayMealIdSet = new Set(todayMealIds);
          const weekTotals: Record<string, number> = {};
          const dayTotals: Record<string, number> = {};
          (items as any[]).forEach((item) => {
            const merged = { ...(item.nutrients_std || {}), ...(item.nutrients_custom || {}) };
            const isToday = todayMealIdSet.has(item.meal_id);
            for (const [k, v] of Object.entries(merged)) {
              const n = Number(v) || 0;
              weekTotals[k] = (weekTotals[k] || 0) + n;
              if (isToday) dayTotals[k] = (dayTotals[k] || 0) + n;
            }
          });
          setWeekMicros(weekTotals);
          setTodayMicros(dayTotals);
        }
      } else {
        setTodayMicros({});
        setWeekMicros({});
      }
    } else {
      setTodayMeals([]);
      setAllMeals([]);
      setFavoriteMeals([]);
      setTodayTotals({ calories: 0, proteins: 0, carbs: 0, fats: 0 });
      setTodayMicros({});
      setWeekMicros({});
      setWeekTotalCalories(0);
      setWeekAvgCalories(0);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Synchronisation Health Connect silencieuse à l'ouverture de l'app.
  // recorded_at provient de la date Health Connect → upsert sans doublons.
  useEffect(() => {
    if (!userId) return;
    autoSyncHealthData(userId).then(() => fetchData());
  }, [userId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Objectifs micros (incluant les overrides du mode expert) sous forme d'objet
  // pour MealHistory / MealMicros (tooltips affichant `goal`).
  const microGoals = useMemo(() => {
    const base = getPersonalizedMicroGoals(userProfile) as any;
    const out: any = { ...base };
    for (const [k, ov] of Object.entries(microOverrides || {})) {
      if (ov && typeof (ov as any).goal === "number") out[k] = (ov as any).goal;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile.gender, userProfile.age, userProfile.weight_kg, userProfile.activity_level, userProfile.isAthlete, userProfile.isSmoker, userProfile.isPregnant, userProfile.isMenopausal, microOverrides]);

  if (showDataSources) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-10 glass-card px-4 py-3">
          <div className="flex items-center gap-2 max-w-lg mx-auto">
            <div className="w-8 h-8 rounded-lg nutri-gradient flex items-center justify-center">
              <Leaf className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-display font-bold nutri-gradient-text">NutriScan</h1>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 mt-6">
          <DataSourcesSettings onBack={() => setShowDataSources(false)} />
        </main>
      </div>
    );
  }

  if (showProfile) {
    return <ProfilePage userId={userId} onBack={() => { setShowProfile(false); fetchData(); }} />;
  }

  const remaining = {
    calories: Math.max(0, goals.calories - todayTotals.calories),
    proteins: Math.max(0, goals.proteins - todayTotals.proteins),
    carbs: Math.max(0, goals.carbs - todayTotals.carbs),
    fats: Math.max(0, goals.fats - todayTotals.fats),
  };

  const trendDiff = weekAvgCalories - goals.calories;
  const trendPercent = Math.abs(Math.round((trendDiff / goals.calories) * 100));
  
  const proteinPerKg = weight > 0 ? todayTotals.proteins / weight : 0;
  const proteinPerKgMax = proteinTargetPerKg;

  const showElectrolyteWarning = sportCalories >= 500 && (
    (todayMicros.sodium_mg || 0) < 1500 || (todayMicros.potassium_mg || 0) < 2000 || (todayMicros.magnesium_mg || 0) < 200
  );

  // Source unique de vérité : objectifs micros + flag is_limit (std + custom + overrides expert)
  const resolvedMicros = resolveMicroGoals(userProfile, customNutrients, microOverrides);
  const microsList = resolvedMicros.map((r) => ({
    name: r.label,
    value: todayMicros[r.key] || 0,
    unit: r.unit,
    info: r.isCustom ? getCustomMicroInfo(r.label, r.unit, r.goal, r.isLimit, r.description) : getMicroInfo(r.key, r.goal),
    goal: r.goal,
    isLimit: r.isLimit,
  }));

  // Radar uses SAME todayMicros as the bars to ensure alignment
  const radarMicrosList = microsList;

  return (
    <TooltipProvider>
    {showOnboarding && (
      <OnboardingFlow
        userId={userId}
        onComplete={async () => {
          setShowOnboarding(false);
          await loadAiAccess(userId);
          setAiReady(isAiConfigured());
        }}
      />
    )}
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 glass-card px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg nutri-gradient flex items-center justify-center">
              <Leaf className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-display font-bold nutri-gradient-text">NutriScan</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowDataSources(true)} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Sources de données">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
            </button>
            <button onClick={() => setShowProfile(true)} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <User className="w-5 h-5 text-muted-foreground" />
            </button>
            <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 space-y-6 mt-6">
        {activeTab === "dashboard" && (
          <>
            {/* Rappel : aucune IA fonctionnelle */}
            {!aiReady && (
              <button
                onClick={() => setShowProfile(true)}
                className="w-full flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-left animate-fade-up"
              >
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">Aucune IA configurée</div>
                  <div className="text-xs text-muted-foreground">
                    Ajoutez une clé API pour activer l'analyse de repas par IA.
                  </div>
                </div>
                <span className="text-xs font-semibold text-amber-500">Configurer</span>
              </button>
            )}

            {/* Remaining focus card */}
            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
              <div className="flex items-center justify-center mb-4">
                <div className="relative">
                  <CircularProgress
                    value={todayTotals.calories}
                    max={goals.calories}
                    size={140}
                    strokeWidth={10}
                    color="hsl(var(--primary))"
                    label=""
                    unit=""
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-display font-bold text-foreground leading-none">
                      {Math.round(remaining.calories)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">kcal restantes</span>
                    <span className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {Math.round(todayTotals.calories)} consommées
                    </span>
                  </div>
                </div>
              </div>

              {/* Macro remaining bars + protein/kg donut */}
              <div className="flex justify-around mb-4">
                {[
                  { label: "Protéines", value: todayTotals.proteins, max: goals.proteins, remaining: remaining.proteins, color: MACRO_COLORS.protein },
                  { label: "Glucides", value: todayTotals.carbs, max: goals.carbs, remaining: remaining.carbs, color: MACRO_COLORS.carb },
                  { label: "Lipides", value: todayTotals.fats, max: goals.fats, remaining: remaining.fats, color: MACRO_COLORS.fat },
                ].map((m) => (
                  <div key={m.label} className="flex flex-col items-center gap-1">
                    <CircularProgress value={m.value} max={m.max} size={64} strokeWidth={5} color={m.color} label="" unit="" />
                    <span className="text-xs font-semibold">{Math.round(m.remaining)}g</span>
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                  </div>
                ))}
                {/* Protein per kg donut */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative" style={{ width: 64, height: 64 }}>
                    <svg width={64} height={64} className="-rotate-90">
                      <circle cx={32} cy={32} r={27} fill="none" stroke="hsl(var(--muted))" strokeWidth={5} />
                      <circle
                        cx={32} cy={32} r={27} fill="none"
                        stroke="hsl(var(--secondary))"
                        strokeWidth={5}
                        strokeDasharray={2 * Math.PI * 27}
                        strokeDashoffset={2 * Math.PI * 27 * (1 - Math.min(proteinPerKg / proteinPerKgMax, 1))}
                        strokeLinecap="round"
                        className="transition-all duration-700 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg">💪</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold">{proteinPerKg.toFixed(1)}/{proteinPerKgMax}</span>
                  <span className="text-[10px] text-muted-foreground">g/kg</span>
                </div>
              </div>

              {/* Sport info */}
              {sportCalories > 0 && (
                <div className="flex items-center justify-center mb-3">
                  <span className="text-xs bg-accent px-2.5 py-1 rounded-lg font-semibold">
                    🔥 +{sportCalories} kcal sport (lissé)
                  </span>
                </div>
              )}

              {/* Motivational message */}
              <div className="bg-accent rounded-xl p-3 text-center">
                <p className="text-sm">
                  {remaining.calories > 0 ? (
                    <>Il te reste <strong className="text-primary">{Math.round(remaining.proteins)}g de protéines</strong> et <strong className="text-primary">{Math.round(remaining.calories)} kcal</strong> pour ton objectif</>
                  ) : (
                    <span className="text-primary font-semibold">🎯 Objectif atteint !</span>
                  )}
                </p>
              </div>

              {weekAvgCalories > 0 && (
                <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
                  {trendDiff > 50 ? (
                    <><TrendingUp className="w-3.5 h-3.5 text-destructive" /><span>Moyenne sem. : +{trendPercent}% au-dessus</span></>
                  ) : trendDiff < -50 ? (
                    <><TrendingDown className="w-3.5 h-3.5 text-primary" /><span>Moyenne sem. : -{trendPercent}% en dessous</span></>
                  ) : (
                    <><Minus className="w-3.5 h-3.5 text-primary" /><span>Moyenne sem. : dans l'objectif ✓</span></>
                  )}
                </div>
              )}
            </section>

            {/* Weekly calorie budget - Calendar week Mon-Sun */}
            {weeklyCalorieTarget > 0 && (
              <section className="bg-card rounded-2xl p-4 shadow-card animate-fade-up" style={{ animationDelay: "25ms" }}>
                {(() => {
                  const weeklyTarget = weeklyCalorieTarget;
                  const budgetDelta = weekTotalCalories - weeklyTarget;
                  const absDiff = Math.abs(budgetDelta);
                  const pct = weeklyTarget > 0 ? weekTotalCalories / weeklyTarget : 0;
                  const expectedPct = weeklyTarget > 0 ? weeklyElapsedTarget / weeklyTarget : 0;
                  const isBalanced = absDiff < 1;
                  const isSurplus = budgetDelta > 0 && !isBalanced;
                  const isRemaining = budgetDelta < 0 && !isBalanced;

                  return (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-display font-semibold text-sm">Budget Hebdo</h3>
                        <span className="text-xs text-muted-foreground">
                          Lun→Dim · J{weekDaysElapsed}/7
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-2">
                        <div
                          className="absolute top-0 h-full w-0.5 bg-foreground/30 z-10"
                          style={{ left: `${Math.min(expectedPct * 100, 100)}%` }}
                        />
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isSurplus ? "bg-destructive" : "bg-primary"
                          }`}
                          style={{ width: `${Math.min(pct * 100, 100)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {Math.round(weekTotalCalories).toLocaleString()} / {Math.round(weeklyTarget).toLocaleString()} kcal ({Math.round(pct * 100)}%)
                        </span>
                        <span className={`font-bold ${
                          isSurplus ? "text-destructive" : "text-primary"
                        }`}>
                          {isSurplus ? (
                            <>▲ Surplus +{Math.round(absDiff)} kcal</>
                          ) : isRemaining ? (
                            <>Restant {Math.round(absDiff)} kcal</>
                          ) : (
                            <>✓ Dans l'objectif</>
                          )}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </section>
            )}

            {/* Weighin reminder */}
            <WeighinReminder userId={userId} onGoToProfile={() => setShowProfile(true)} />

            {/* Electrolyte recovery warning */}
            {showElectrolyteWarning && (
              <section className="bg-secondary/10 border border-secondary/30 rounded-2xl p-4 animate-fade-up flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-secondary">Récupération</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ton apport en électrolytes est faible par rapport à ton activité du jour ({sportCalories} kcal sport). Pense à bien t'hydrater et saler ton prochain repas.
                  </p>
                </div>
              </section>
            )}

            {/* Water tracker */}
            <section className="animate-fade-up" style={{ animationDelay: "50ms" }}>
              <WaterTracker userId={userId} goal={waterGoal} sportCalories={sportCalories} />
            </section>

            {/* Meal input */}
            <section className="animate-fade-up" style={{ animationDelay: "100ms" }}>
              <MealInput userId={userId} onMealSaved={fetchData} prefillRecipe={pendingRecipe} onPrefillConsumed={() => setPendingRecipe(null)} />
            </section>

            {/* Today's meals */}
            {todayMeals.length > 0 && (
              <section className="animate-fade-up" style={{ animationDelay: "150ms" }}>
                <h2 className="font-display font-semibold text-base mb-3">Repas du jour</h2>
                <MealHistory meals={todayMeals} userId={userId} onSelect={() => {}} onRefresh={fetchData} microGoals={microGoals} customDefs={customNutrients} />
              </section>
            )}

            {/* Health details */}
            <section className="animate-fade-up" style={{ animationDelay: "175ms" }}>
              <HealthDetails micros={microsList} radarMicros={radarMicrosList} />
            </section>

            {/* Favorites */}
            {favoriteMeals.length > 0 && (
              <section className="animate-fade-up" style={{ animationDelay: "200ms" }}>
                <button onClick={() => setShowFavorites(!showFavorites)} className="flex items-center justify-between w-full mb-3">
                  <h2 className="font-display font-semibold text-base flex items-center gap-1.5">
                    <Heart className="w-4 h-4 fill-destructive text-destructive" /> Favoris
                  </h2>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showFavorites ? "rotate-180" : ""}`} />
                </button>
                {showFavorites && (
                  <MealHistory meals={favoriteMeals} userId={userId} onSelect={() => {}} onRefresh={fetchData} microGoals={microGoals} customDefs={customNutrients} />
                )}
              </section>
            )}

            {/* All history */}
            <section className="animate-fade-up" style={{ animationDelay: "250ms" }}>
              <h2 className="font-display font-semibold text-base mb-3">Historique complet</h2>
              <MealHistory meals={allMeals} userId={userId} onSelect={() => {}} onRefresh={fetchData} microGoals={microGoals} customDefs={customNutrients} groupByPeriod searchable />
            </section>
          </>
        )}

        {activeTab === "coach" && (
          <CoachPage
            userId={userId}
            context={{
              goals,
              consumed: todayTotals,
              sportCalories,
              weight,
              targetWeight,
              phase: (userProfile as any)?.mass_gain_phase ?? null,
              userProfile,
            }}
            onExportRecipe={(recipe) => {
              setPendingRecipe(recipe);
              setActiveTab("dashboard");
            }}
          />
        )}

        {activeTab === "evolution" && (
          <EvolutionPage userId={userId} calorieGoal={goals.calories} proteinGoal={goals.proteins} carbsGoal={goals.carbs} fatsGoal={goals.fats} targetWeight={targetWeight} targetBodyFat={targetBodyFat} targetMuscleMass={targetMuscleMass} userProfile={userProfile} customNutrients={customNutrients} microOverrides={microOverrides} customCharts={customCharts} onCustomChartsChange={setCustomCharts} />
        )}

        {activeTab === "library" && (
          <NutriLibrary userId={userId} />
        )}
          <footer className="mt-8 pb-6 text-center">
          {/* Footer de debug avec horodatage automatique */}
          <BuildInfo />
          </footer>  
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
    </TooltipProvider>
  );
};

export default Dashboard;
