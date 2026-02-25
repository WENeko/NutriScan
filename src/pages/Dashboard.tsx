import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import CircularProgress from "@/components/CircularProgress";
import MealInput from "@/components/MealInput";
import MealHistory from "@/components/MealHistory";
import WeeklyStats from "@/components/WeeklyStats";
import ProfilePage from "@/components/ProfilePage";
import { Leaf, LogOut, User, TrendingUp, TrendingDown, Minus, ChevronDown, Heart } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { subDays, startOfDay } from "date-fns";

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
  const [showStats, setShowStats] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [weekAvgCalories, setWeekAvgCalories] = useState(0);

  const fetchData = useCallback(async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("goals")
      .eq("user_id", userId)
      .single();

    if (profile?.goals) {
      const g = profile.goals as any;
      setGoals({
        calories: g.calories ?? 2000,
        proteins: g.proteins ?? 150,
        carbs: g.carbs ?? 250,
        fats: g.fats ?? 70,
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

  return (
    <div className="min-h-screen bg-background pb-8">
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
              {/* Override inner text: show remaining big, consumed small */}
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

          {/* Macro remaining bars */}
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
          </div>

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

        {/* Favorites */}
        {favoriteMeals.length > 0 && (
          <section className="animate-fade-up" style={{ animationDelay: "175ms" }}>
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

        {/* Weekly stats */}
        <section className="animate-fade-up" style={{ animationDelay: "200ms" }}>
          <button onClick={() => setShowStats(!showStats)} className="flex items-center justify-between w-full mb-3">
            <h2 className="font-display font-semibold text-base">Évolution</h2>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showStats ? "rotate-180" : ""}`} />
          </button>
          {showStats && <WeeklyStats userId={userId} calorieGoal={goals.calories} />}
        </section>

        {/* All history */}
        <section className="animate-fade-up" style={{ animationDelay: "250ms" }}>
          <h2 className="font-display font-semibold text-base mb-3">Historique complet</h2>
          <MealHistory meals={allMeals} userId={userId} onSelect={() => {}} onRefresh={fetchData} />
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
