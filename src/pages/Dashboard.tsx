import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import CircularProgress from "@/components/CircularProgress";
import MealScanner from "@/components/MealScanner";
import MealHistory from "@/components/MealHistory";
import GoalsEditor from "@/components/GoalsEditor";
import { Leaf, LogOut, Settings, ChevronDown } from "lucide-react";
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
}

const Dashboard: React.FC<{ userId: string }> = ({ userId }) => {
  const [goals, setGoals] = useState<Goals>({ calories: 2000, proteins: 150, carbs: 250, fats: 70 });
  const [todayTotals, setTodayTotals] = useState({ calories: 0, proteins: 0, carbs: 0, fats: 0 });
  const [meals, setMeals] = useState<Meal[]>([]);
  const [showGoals, setShowGoals] = useState(false);

  const fetchData = useCallback(async () => {
    // Fetch profile
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

    // Fetch today's meals
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: allMeals } = await supabase
      .from("meals")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false });

    if (allMeals) {
      setMeals(allMeals as Meal[]);

      const todayMeals = allMeals.filter(
        (m: any) => new Date(m.timestamp) >= todayStart
      );
      const totals = todayMeals.reduce(
        (acc: any, m: any) => ({
          calories: acc.calories + Number(m.total_calories),
          proteins: acc.proteins + Number(m.total_proteins),
          carbs: acc.carbs + Number(m.total_carbs),
          fats: acc.fats + Number(m.total_fats),
        }),
        { calories: 0, proteins: 0, carbs: 0, fats: 0 }
      );
      setTodayTotals(totals);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const caloriePercent = Math.min(Math.round((todayTotals.calories / goals.calories) * 100), 100);

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
            <button onClick={() => setShowGoals(!showGoals)} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <Settings className="w-5 h-5 text-muted-foreground" />
            </button>
            <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 space-y-6 mt-6">
        {/* Daily overview */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-base">Aujourd'hui</h2>
            <span className="text-xs bg-accent text-accent-foreground px-2 py-1 rounded-full font-medium">
              {caloriePercent}% de l'objectif
            </span>
          </div>

          {/* Big calorie ring */}
          <div className="flex items-center justify-center mb-4">
            <CircularProgress
              value={todayTotals.calories}
              max={goals.calories}
              size={130}
              strokeWidth={10}
              color="hsl(var(--primary))"
              label="Calories"
              unit="kcal"
            />
          </div>

          {/* Macro rings */}
          <div className="flex justify-around">
            <CircularProgress
              value={todayTotals.proteins}
              max={goals.proteins}
              size={72}
              strokeWidth={6}
              color="hsl(var(--nutri-blue))"
              label="Protéines"
            />
            <CircularProgress
              value={todayTotals.carbs}
              max={goals.carbs}
              size={72}
              strokeWidth={6}
              color="hsl(var(--nutri-orange))"
              label="Glucides"
            />
            <CircularProgress
              value={todayTotals.fats}
              max={goals.fats}
              size={72}
              strokeWidth={6}
              color="hsl(var(--nutri-pink))"
              label="Lipides"
            />
          </div>
        </section>

        {/* Goals editor */}
        {showGoals && (
          <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
            <GoalsEditor userId={userId} currentGoals={goals} onUpdate={(g) => { setGoals(g); setShowGoals(false); }} />
          </section>
        )}

        {/* Scanner */}
        <section className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <MealScanner userId={userId} onMealSaved={fetchData} />
        </section>

        {/* History */}
        <section className="animate-fade-up" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-base">Historique</h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>
          <MealHistory meals={meals} onSelect={(_id) => toast({ title: "Détails bientôt disponibles" })} />
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
