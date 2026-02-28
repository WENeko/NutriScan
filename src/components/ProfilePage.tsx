import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Save, ArrowLeft, Calculator, Dumbbell } from "lucide-react";
import { differenceInYears, format } from "date-fns";
import NumericInput from "@/components/NumericInput";

interface ProfilePageProps {
  userId: string;
  onBack: () => void;
}

const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sédentaire", factor: 1.2 },
  { value: "moderate", label: "Actif", factor: 1.55 },
  { value: "athletic", label: "Sportif", factor: 1.8 },
];

const GOAL_TYPES = [
  { value: "cut", label: "Perte de gras", calorieModifier: -0.15, proteinPerKg: 1.6 },
  { value: "maintain", label: "Maintenance", calorieModifier: 0, proteinPerKg: 1.8 },
  { value: "bulk", label: "Prise de muscle", calorieModifier: 0.10, proteinPerKg: 2.0 },
];

const ProfilePage: React.FC<ProfilePageProps> = ({ userId, onBack }) => {
  const [weight, setWeight] = useState<number>(70);
  const [height, setHeight] = useState<number>(175);
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [gender, setGender] = useState<string>("male");
  const [activityLevel, setActivityLevel] = useState<string>("moderate");
  const [goalType, setGoalType] = useState<string>("maintain");
  const [saving, setSaving] = useState(false);
  const [bmr, setBmr] = useState<number>(0);
  const [tdee, setTdee] = useState<number>(0);
  const [targets, setTargets] = useState({ calories: 0, proteins: 0, carbs: 0, fats: 0 });

  // Body composition
  const [bodyFat, setBodyFat] = useState<number | "">("");
  const [muscleMass, setMuscleMass] = useState<number | "">("");
  const [sportCalories, setSportCalories] = useState<number>(0);
  const [waterGoal, setWaterGoal] = useState<number>(2000);
  const [targetWeight, setTargetWeight] = useState<number | "">("");

  const age = dateOfBirth ? differenceInYears(new Date(), new Date(dateOfBirth)) : 30;

  useEffect(() => { loadProfile(); }, []);
  useEffect(() => { calculateTargets(); }, [weight, height, dateOfBirth, gender, activityLevel, goalType, bmr]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (data) {
      const d = data as any;
      if (d.weight_kg) setWeight(Number(d.weight_kg));
      if (d.height_cm) setHeight(Number(d.height_cm));
      if (d.date_of_birth) setDateOfBirth(d.date_of_birth);
      if (d.gender) setGender(d.gender);
      if (d.activity_level) setActivityLevel(d.activity_level);
      if (d.bmr) setBmr(Number(d.bmr));
      if (d.body_fat_percent) setBodyFat(Number(d.body_fat_percent));
      if (d.muscle_mass_kg) setMuscleMass(Number(d.muscle_mass_kg));
      if (d.sport_calories_daily) setSportCalories(Number(d.sport_calories_daily));
      if (d.water_goal_ml) setWaterGoal(Number(d.water_goal_ml));
      if (d.target_weight_kg) setTargetWeight(Number(d.target_weight_kg));
      const goals = d.goals as any;
      if (goals?.goalType) setGoalType(goals.goalType);
    }
  };

  const calculateTargets = () => {
    let usedBmr = bmr;
    if (!usedBmr) {
      if (gender === "female") {
        usedBmr = Math.round(10 * weight + 6.25 * height - 5 * age - 161);
      } else {
        usedBmr = Math.round(10 * weight + 6.25 * height - 5 * age + 5);
      }
      setBmr(usedBmr);
    }

    const activity = ACTIVITY_LEVELS.find((a) => a.value === activityLevel) || ACTIVITY_LEVELS[1];
    const calculatedTdee = usedBmr * activity.factor;
    setTdee(Math.round(calculatedTdee));

    const goal = GOAL_TYPES.find((g) => g.value === goalType) || GOAL_TYPES[1];
    const targetCalories = Math.round(calculatedTdee * (1 + goal.calorieModifier));
    const targetProteins = Math.round(weight * goal.proteinPerKg);
    const targetFats = Math.round((targetCalories * 0.25) / 9);
    const targetCarbs = Math.round((targetCalories - targetProteins * 4 - targetFats * 9) / 4);

    setTargets({
      calories: targetCalories,
      proteins: targetProteins,
      carbs: Math.max(targetCarbs, 50),
      fats: targetFats,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          weight_kg: weight,
          height_cm: height,
          age,
          gender,
          activity_level: activityLevel,
          bmr,
          date_of_birth: dateOfBirth || null,
          body_fat_percent: bodyFat || null,
          muscle_mass_kg: muscleMass || null,
          sport_calories_daily: sportCalories,
          water_goal_ml: waterGoal,
          target_weight_kg: targetWeight || null,
          goals: { ...targets, goalType } as any,
        } as any)
        .eq("user_id", userId);
      if (error) throw error;

      // Save today's body composition entry
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: existing } = await supabase
        .from("body_composition")
        .select("id")
        .eq("user_id", userId)
        .eq("recorded_at", today)
        .single();

      const bodyEntry = {
        user_id: userId,
        recorded_at: today,
        weight_kg: weight,
        body_fat_percent: bodyFat || null,
        muscle_mass_kg: muscleMass || null,
        sport_calories: sportCalories,
        source: "manual",
      };

      if (existing) {
        await supabase.from("body_composition").update(bodyEntry as any).eq("id", (existing as any).id);
      } else {
        await supabase.from("body_composition").insert(bodyEntry as any);
      }

      toast({ title: "Profil sauvegardé !" });
      onBack();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-10 glass-card px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">Mon Profil</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 space-y-6 mt-6">
        {/* Body info */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
          <h2 className="font-display font-semibold text-base mb-4">Informations corporelles</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Poids (kg)</Label>
              <NumericInput value={weight} onChange={(v) => setWeight(v)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Taille (cm)</Label>
              <NumericInput value={height} onChange={(v) => setHeight(v)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date de naissance</Label>
              <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Genre</Label>
              <div className="flex gap-2">
                {["male", "female"].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`flex-1 h-10 rounded-xl text-xs font-semibold transition-all ${
                      gender === g ? "nutri-gradient text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {g === "male" ? "Homme" : "Femme"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Body composition */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "50ms" }}>
          <div className="flex items-center gap-2 mb-4">
            <Dumbbell className="w-4 h-4 text-primary" />
            <h2 className="font-display font-semibold text-base">Composition corporelle</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Masse grasse (%)</Label>
              <NumericInput value={bodyFat === "" ? 0 : bodyFat} onChange={(v) => setBodyFat(v || "")} className="h-10 rounded-xl" placeholder="Ex: 18" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Masse musculaire (kg)</Label>
              <NumericInput value={muscleMass === "" ? 0 : muscleMass} onChange={(v) => setMuscleMass(v || "")} className="h-10 rounded-xl" placeholder="Ex: 35" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Calories sport/jour</Label>
              <NumericInput value={sportCalories} onChange={(v) => setSportCalories(v)} className="h-10 rounded-xl" placeholder="Ex: 300" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Objectif eau (ml)</Label>
              <NumericInput value={waterGoal} onChange={(v) => setWaterGoal(v)} className="h-10 rounded-xl" placeholder="2000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Poids cible (kg)</Label>
              <NumericInput value={targetWeight === "" ? 0 : targetWeight} onChange={(v) => setTargetWeight(v || "")} className="h-10 rounded-xl" placeholder="Ex: 75" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Ces champs sont prêts pour une synchronisation Health Connect future.</p>
        </section>

        {/* MB Manual */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "100ms" }}>
          <h2 className="font-display font-semibold text-base mb-3">Métabolisme de Base (MB)</h2>
          <p className="text-xs text-muted-foreground mb-2">Saisissez la valeur de votre balance ou laissez le calcul automatique.</p>
          <NumericInput value={bmr} onChange={(v) => setBmr(v)} className="h-10 rounded-xl" placeholder="Ex: 1650" />
        </section>

        {/* Activity */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "150ms" }}>
          <h2 className="font-display font-semibold text-base mb-3">Niveau d'activité</h2>
          <div className="flex gap-2">
            {ACTIVITY_LEVELS.map((a) => (
              <button
                key={a.value}
                onClick={() => setActivityLevel(a.value)}
                className={`flex-1 py-3 rounded-xl text-xs font-semibold transition-all ${
                  activityLevel === a.value ? "nutri-gradient text-primary-foreground shadow-float" : "bg-muted text-muted-foreground"
                }`}
              >
                <div>{a.label}</div>
                <div className="text-[10px] opacity-80 mt-0.5">×{a.factor}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Goal */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "200ms" }}>
          <h2 className="font-display font-semibold text-base mb-3">Objectif</h2>
          <div className="flex gap-2">
            {GOAL_TYPES.map((g) => (
              <button
                key={g.value}
                onClick={() => setGoalType(g.value)}
                className={`flex-1 py-3 rounded-xl text-xs font-semibold transition-all ${
                  goalType === g.value ? "nutri-gradient text-primary-foreground shadow-float" : "bg-muted text-muted-foreground"
                }`}
              >
                <div>{g.label}</div>
                <div className="text-[10px] opacity-80 mt-0.5">
                  {g.calorieModifier > 0 ? `+${g.calorieModifier * 100}%` : g.calorieModifier < 0 ? `${g.calorieModifier * 100}%` : "="}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Calculated targets */}
        <section className="bg-accent rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "250ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-primary" />
            <h2 className="font-display font-semibold text-base">Objectifs calculés</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-card rounded-xl p-3">
              <div className="text-xs text-muted-foreground">MB</div>
              <div className="font-bold text-lg">{bmr} <span className="text-xs font-normal text-muted-foreground">kcal</span></div>
            </div>
            <div className="bg-card rounded-xl p-3">
              <div className="text-xs text-muted-foreground">TDEE → Cible</div>
              <div className="font-bold text-lg text-primary">{targets.calories} <span className="text-xs font-normal text-muted-foreground">kcal</span></div>
              {sportCalories > 0 && (
                <div className="text-[10px] text-muted-foreground">Lissage sport inclus dans le dashboard</div>
              )}
            </div>
            <div className="bg-card rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Protéines</div>
              <div className="font-bold">{targets.proteins}g <span className="text-[10px] font-normal text-muted-foreground">({(targets.proteins / Math.max(weight, 1)).toFixed(1)}g/kg)</span></div>
            </div>
            <div className="bg-card rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Glucides</div>
              <div className="font-bold">{targets.carbs}g</div>
            </div>
            <div className="bg-card rounded-xl p-3 col-span-2">
              <div className="text-xs text-muted-foreground">Lipides</div>
              <div className="font-bold">{targets.fats}g <span className="text-[10px] font-normal text-muted-foreground">(25% des calories)</span></div>
            </div>
          </div>
        </section>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 rounded-xl nutri-gradient text-primary-foreground font-semibold shadow-float hover:opacity-90"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Enregistrement..." : "Sauvegarder mon profil"}
        </Button>
      </main>
    </div>
  );
};

export default ProfilePage;
