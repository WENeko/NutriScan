import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import CircularProgress from "@/components/CircularProgress";
import MealInput from "@/components/MealInput";
import MealHistory from "@/components/MealHistory";
import EvolutionPage from "@/components/EvolutionPage";
import NutriLibrary from "@/components/NutriLibrary";
import ProfilePage from "@/components/ProfilePage";
import BottomNav, { TabId } from "@/components/BottomNav";
import WaterTracker from "@/components/WaterTracker";
import HealthDetails from "@/components/HealthDetails";
import { TooltipProvider } from "@/components/TooltipContext";
import WeighinReminder from "@/components/WeighinReminder";
import { Leaf, LogOut, User, TrendingUp, TrendingDown, Minus, ChevronDown, Heart, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { subDays, startOfDay, format } from "date-fns";

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
  const [showFavorites, setShowFavorites] = useState(false);
  const [weekAvgCalories, setWeekAvgCalories] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [waterGoal, setWaterGoal] = useState(2000);
  const [weight, setWeight] = useState(70);
  const [sportCalories, setSportCalories] = useState(0);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [targetBodyFat, setTargetBodyFat] = useState<number | null>(null);
  const [targetMuscleMass, setTargetMuscleMass] = useState<number | null>(null);
  const [proteinTargetPerKg, setProteinTargetPerKg] = useState(2.0);
  const [todayMicros, setTodayMicros] = useState({
    fiber: 0, sodium_mg: 0, potassium_mg: 0, magnesium_mg: 0,
    calcium_mg: 0, sugar: 0, saturated_fat: 0, omega3_mg: 0,
    vitamin_b_mg: 0, vitamin_c_mg: 0, vitamin_d_mcg: 0, vitamin_e_mg: 0,
  });

  const fetchData = useCallback(async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("goals, weight_kg, water_goal_ml, sport_calories_daily, target_weight_kg, target_body_fat_percent, target_muscle_mass_kg")
      .eq("user_id", userId)
      .single();

    let baseCalories = 2000;
    let weekSportTotal = 0;

    if (profile) {
      const g = profile.goals as any;
      baseCalories = g?.calories ?? 2000;
      const dailySport = Number((profile as any).sport_calories_daily) || 0;
      setSportCalories(dailySport);
      setWeight(Number(profile.weight_kg) || 70);
      setWaterGoal(Number((profile as any).water_goal_ml) || 2000);
      setTargetWeight((profile as any).target_weight_kg ? Number((profile as any).target_weight_kg) : null);
      setTargetBodyFat((profile as any).target_body_fat_percent ? Number((profile as any).target_body_fat_percent) : null);
      setTargetMuscleMass((profile as any).target_muscle_mass_kg ? Number((profile as any).target_muscle_mass_kg) : null);

      const weekAgo = subDays(new Date(), 6);
      const { data: weekBody } = await supabase
        .from("body_composition")
        .select("sport_calories, recorded_at")
        .eq("user_id", userId)
        .gte("recorded_at", format(weekAgo, "yyyy-MM-dd"));

      if (weekBody && weekBody.length > 0) {
        weekSportTotal = (weekBody as any[]).reduce((sum, b) => sum + (Number(b.sport_calories) || 0), 0);
      } else {
        weekSportTotal = dailySport * 7;
      }

      const smoothedGoal = Math.round((baseCalories * 7 + weekSportTotal) / 7);

      setGoals({
        calories: smoothedGoal,
        proteins: g?.proteins ?? 150,
        carbs: g?.carbs ?? 250,
        fats: g?.fats ?? 70,
      });
    }

    const todayStart = startOfDay(new Date());
    const { data: meals } = await supabase
      .from("meals")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false });

    if (meals) {
      const typedMeals = meals as Meal[];
      setAllMeals(typedMeals);
      setFavoriteMeals(typedMeals.filter((m) => m.is_favorite));
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

      const weekAgo = subDays(new Date(), 6);
      const weekMeals = typedMeals.filter((m) => new Date(m.timestamp) >= startOfDay(weekAgo));
      const weekTotal = weekMeals.reduce((acc, m) => acc + Number(m.total_calories), 0);
      setWeekAvgCalories(Math.round(weekTotal / 7));

      // Fetch today's micros
      const todayMealIds = today.map((m) => m.id);
      if (todayMealIds.length > 0) {
        const { data: items } = await supabase
          .from("meal_items")
          .select("fiber, sodium_mg, potassium_mg, magnesium_mg, calcium_mg, sugar, saturated_fat, omega3_mg, vitamin_b_mg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg")
          .in("meal_id", todayMealIds);
        if (items) {
          const micros = (items as any[]).reduce((acc, item) => ({
            fiber: acc.fiber + (Number(item.fiber) || 0),
            sodium_mg: acc.sodium_mg + (Number(item.sodium_mg) || 0),
            potassium_mg: acc.potassium_mg + (Number(item.potassium_mg) || 0),
            magnesium_mg: acc.magnesium_mg + (Number(item.magnesium_mg) || 0),
            calcium_mg: acc.calcium_mg + (Number(item.calcium_mg) || 0),
            sugar: acc.sugar + (Number(item.sugar) || 0),
            saturated_fat: acc.saturated_fat + (Number(item.saturated_fat) || 0),
            omega3_mg: acc.omega3_mg + (Number(item.omega3_mg) || 0),
            vitamin_b_mg: acc.vitamin_b_mg + (Number(item.vitamin_b_mg) || 0),
            vitamin_c_mg: acc.vitamin_c_mg + (Number(item.vitamin_c_mg) || 0),
            vitamin_d_mcg: acc.vitamin_d_mcg + (Number(item.vitamin_d_mcg) || 0),
            vitamin_e_mg: acc.vitamin_e_mg + (Number(item.vitamin_e_mg) || 0),
          }), { fiber: 0, sodium_mg: 0, potassium_mg: 0, magnesium_mg: 0, calcium_mg: 0, sugar: 0, saturated_fat: 0, omega3_mg: 0, vitamin_b_mg: 0, vitamin_c_mg: 0, vitamin_d_mcg: 0, vitamin_e_mg: 0 });
          setTodayMicros(micros);
        }
      } else {
        setTodayMicros({ fiber: 0, sodium_mg: 0, potassium_mg: 0, magnesium_mg: 0, calcium_mg: 0, sugar: 0, saturated_fat: 0, omega3_mg: 0, vitamin_b_mg: 0, vitamin_c_mg: 0, vitamin_d_mcg: 0, vitamin_e_mg: 0 });
      }
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

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
  
  // Protein per kg as donut
  const proteinPerKg = weight > 0 ? todayTotals.proteins / weight : 0;
  const proteinPerKgMax = proteinTargetPerKg;

  // Electrolyte recovery feedback
  const showElectrolyteWarning = sportCalories >= 500 && (
    todayMicros.sodium_mg < 1500 || todayMicros.potassium_mg < 2000 || todayMicros.magnesium_mg < 200
  );

  const microsList = [
    { name: "Fibres", value: todayMicros.fiber, unit: "g", info: "Digestion et satiété. Objectif : 25-35g/jour." },
    { name: "Sucres", value: todayMicros.sugar, unit: "g", info: "Glucides simples. Limitez à <50g/jour." },
    { name: "AG Saturés", value: todayMicros.saturated_fat, unit: "g", info: "Santé cardiovasculaire. Limitez à <20g/jour." },
    { name: "Oméga-3", value: todayMicros.omega3_mg, unit: "mg", info: "Inflammation et santé cardiaque. 250-500mg/jour." },
    { name: "Sodium", value: todayMicros.sodium_mg, unit: "mg", info: "Équilibre hydrique et congestion. <2300mg/jour." },
    { name: "Potassium", value: todayMicros.potassium_mg, unit: "mg", info: "Équilibre hydrique et congestion. 3500mg/jour." },
    { name: "Magnésium", value: todayMicros.magnesium_mg, unit: "mg", info: "Récupération et santé osseuse. 400mg/jour." },
    { name: "Calcium", value: todayMicros.calcium_mg, unit: "mg", info: "Récupération et santé osseuse. 1000mg/jour." },
    { name: "Vitamine B", value: todayMicros.vitamin_b_mg, unit: "mg", info: "Énergie et système nerveux." },
    { name: "Vitamine C", value: todayMicros.vitamin_c_mg, unit: "mg", info: "Antioxydants. 90mg/jour." },
    { name: "Vitamine D", value: todayMicros.vitamin_d_mcg, unit: "µg", info: "Immunité et hormones. 15µg/jour." },
    { name: "Vitamine E", value: todayMicros.vitamin_e_mg, unit: "mg", info: "Antioxydants. 15mg/jour." },
  ];

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 glass-card px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg nutri-gradient flex items-center justify-center">
              <Leaf className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-display font-bold nutri-gradient-text">NutriVibe</h1>
          </div>
          <div className="flex items-center gap-1">
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
                  { label: "Protéines", value: todayTotals.proteins, max: goals.proteins, remaining: remaining.proteins, color: "hsl(var(--nutri-blue))" },
                  { label: "Glucides", value: todayTotals.carbs, max: goals.carbs, remaining: remaining.carbs, color: "hsl(var(--nutri-orange))" },
                  { label: "Lipides", value: todayTotals.fats, max: goals.fats, remaining: remaining.fats, color: "hsl(var(--nutri-pink))" },
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
                    <><TrendingUp className="w-3.5 h-3.5 text-destructive" /><span>Moyenne 7j : +{trendPercent}% au-dessus</span></>
                  ) : trendDiff < -50 ? (
                    <><TrendingDown className="w-3.5 h-3.5 text-primary" /><span>Moyenne 7j : -{trendPercent}% en dessous</span></>
                  ) : (
                    <><Minus className="w-3.5 h-3.5 text-primary" /><span>Moyenne 7j : dans l'objectif ✓</span></>
                  )}
                </div>
              )}
            </section>

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
              <MealInput userId={userId} onMealSaved={fetchData} />
            </section>

            {/* Today's meals */}
            {todayMeals.length > 0 && (
              <section className="animate-fade-up" style={{ animationDelay: "150ms" }}>
                <h2 className="font-display font-semibold text-base mb-3">Repas du jour</h2>
                <MealHistory meals={todayMeals} userId={userId} onSelect={() => {}} onRefresh={fetchData} />
              </section>
            )}

            {/* Health details */}
            <section className="animate-fade-up" style={{ animationDelay: "175ms" }}>
              <HealthDetails micros={microsList} />
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
                  <MealHistory meals={favoriteMeals} userId={userId} onSelect={() => {}} onRefresh={fetchData} />
                )}
              </section>
            )}

            {/* All history */}
            <section className="animate-fade-up" style={{ animationDelay: "250ms" }}>
              <h2 className="font-display font-semibold text-base mb-3">Historique complet</h2>
              <MealHistory meals={allMeals} userId={userId} onSelect={() => {}} onRefresh={fetchData} />
            </section>
          </>
        )}

        {activeTab === "evolution" && (
          <EvolutionPage userId={userId} calorieGoal={goals.calories} proteinGoal={goals.proteins} carbsGoal={goals.carbs} fatsGoal={goals.fats} targetWeight={targetWeight} />
        )}

        {activeTab === "library" && (
          <NutriLibrary userId={userId} />
        )}
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
    </TooltipProvider>
  );
};

export default Dashboard;
