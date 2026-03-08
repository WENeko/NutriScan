import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Save, ArrowLeft, Calculator, Dumbbell, Bell } from "lucide-react";
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

const WEIGHIN_FREQUENCIES = [
  { value: "daily", label: "Quotidien" },
  { value: "weekly", label: "Hebdo" },
  { value: "biweekly", label: "Bi-mensuel" },
];

const WEEKDAYS = [
  { label: "Lun", day: 1 },
  { label: "Mar", day: 2 },
  { label: "Mer", day: 3 },
  { label: "Jeu", day: 4 },
  { label: "Ven", day: 5 },
  { label: "Sam", day: 6 },
  { label: "Dim", day: 0 },
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
  const [bmrMethod, setBmrMethod] = useState<string>("mifflin");
  const [tdee, setTdee] = useState<number>(0);
  const [targets, setTargets] = useState({ calories: 0, proteins: 0, carbs: 0, fats: 0 });

  // Body composition
  const [bodyFat, setBodyFat] = useState<number | "">("");
  const [muscleMass, setMuscleMass] = useState<number | "">("");
  const [sportCalories, setSportCalories] = useState<number>(0);
  const [waterGoal, setWaterGoal] = useState<number>(2000);
  const [targetWeight, setTargetWeight] = useState<number | "">("");
  const [targetBodyFat, setTargetBodyFat] = useState<number | "">("");
  const [targetMuscleMass, setTargetMuscleMass] = useState<number | "">("");

  // Weighin reminders
  const [weighinFrequency, setWeighinFrequency] = useState<string>("weekly");
  const [weighinDay, setWeighinDay] = useState<number>(1);
  const [weighinHour, setWeighinHour] = useState<number>(8);
  const [weighinMinute, setWeighinMinute] = useState<number>(0);

  const age = dateOfBirth ? differenceInYears(new Date(), new Date(dateOfBirth)) : 30;

  // Compute lean mass from weight and body fat
  const leanMass = bodyFat !== "" && weight > 0 ? weight * (1 - (bodyFat as number) / 100) : null;

  useEffect(() => { loadProfile(); }, []);
  useEffect(() => { calculateTargets(); }, [weight, height, dateOfBirth, gender, activityLevel, goalType, bmrMethod, bodyFat]);

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
      if (d.bmr_method) setBmrMethod(d.bmr_method);
      if (d.body_fat_percent) setBodyFat(Number(d.body_fat_percent));
      if (d.muscle_mass_kg) setMuscleMass(Number(d.muscle_mass_kg));
      if (d.sport_calories_daily) setSportCalories(Number(d.sport_calories_daily));
      if (d.water_goal_ml) setWaterGoal(Number(d.water_goal_ml));
      if (d.target_weight_kg) setTargetWeight(Number(d.target_weight_kg));
      if (d.target_body_fat_percent) setTargetBodyFat(Number(d.target_body_fat_percent));
      if (d.target_muscle_mass_kg) setTargetMuscleMass(Number(d.target_muscle_mass_kg));
      if (d.weighin_frequency) setWeighinFrequency(d.weighin_frequency);
      if (d.weighin_day !== null && d.weighin_day !== undefined) setWeighinDay(Number(d.weighin_day));
      if (d.weighin_hour !== null && d.weighin_hour !== undefined) setWeighinHour(Number(d.weighin_hour));
      if ((d as any).weighin_minute !== null && (d as any).weighin_minute !== undefined) setWeighinMinute(Number((d as any).weighin_minute));
      const goals = d.goals as any;
      if (goals?.goalType) setGoalType(goals.goalType);
    }
  };

  const calculateTargets = () => {
    let usedBmr = 0;

    if (bmrMethod === "katch" && leanMass && leanMass > 0) {
      usedBmr = Math.round(21.6 * leanMass + 370);
    } else {
      // Mifflin-St Jeor
      if (gender === "female") {
        usedBmr = Math.round(10 * weight + 6.25 * height - 5 * age - 161);
      } else {
        usedBmr = Math.round(10 * weight + 6.25 * height - 5 * age + 5);
      }
    }
    setBmr(usedBmr);

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
          target_body_fat_percent: targetBodyFat || null,
          target_muscle_mass_kg: targetMuscleMass || null,
          bmr_method: bmrMethod,
          weighin_frequency: weighinFrequency,
          weighin_day: weighinDay,
          weighin_hour: weighinHour,
          weighin_minute: weighinMinute,
          last_weighin_date: null, // will be set on actual weigh-in
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
          </div>
          {leanMass && (
            <div className="mt-3 bg-accent rounded-xl p-2.5 text-xs">
              <span className="text-muted-foreground">Masse maigre estimée : </span>
              <span className="font-bold text-primary">{leanMass.toFixed(1)} kg</span>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">Ces champs sont prêts pour une synchronisation Health Connect future.</p>
        </section>

        {/* Targets: weight, body fat, muscle */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "75ms" }}>
          <h2 className="font-display font-semibold text-base mb-3">🎯 Objectifs corporels</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Poids cible (kg)</Label>
              <NumericInput value={targetWeight === "" ? 0 : targetWeight} onChange={(v) => setTargetWeight(v || "")} className="h-10 rounded-xl" placeholder="75" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Gras cible (%)</Label>
              <NumericInput value={targetBodyFat === "" ? 0 : targetBodyFat} onChange={(v) => setTargetBodyFat(v || "")} className="h-10 rounded-xl" placeholder="15" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Muscle cible (kg)</Label>
              <NumericInput value={targetMuscleMass === "" ? 0 : targetMuscleMass} onChange={(v) => setTargetMuscleMass(v || "")} className="h-10 rounded-xl" placeholder="40" />
            </div>
          </div>
        </section>

        {/* BMR Method */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "100ms" }}>
          <h2 className="font-display font-semibold text-base mb-3">Métabolisme de Base (MB)</h2>
          <div className="flex gap-2 mb-3">
            {[
              { value: "mifflin", label: "Mifflin-St Jeor" },
              { value: "katch", label: "Katch-McArdle" },
            ].map((m) => (
              <button
                key={m.value}
                onClick={() => setBmrMethod(m.value)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  bmrMethod === m.value ? "nutri-gradient text-primary-foreground shadow-float" : "bg-muted text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {bmrMethod === "katch" && !leanMass && (
            <p className="text-xs text-destructive mb-2">⚠️ Renseignez la masse grasse (%) pour utiliser Katch-McArdle.</p>
          )}
          {bmrMethod === "katch" && leanMass && (
            <p className="text-[10px] text-muted-foreground mb-2">Formule : 21.6 × {leanMass.toFixed(1)} kg (masse maigre) + 370</p>
          )}
          <div className="bg-accent rounded-xl p-3 text-center">
            <span className="text-xs text-muted-foreground">MB calculé : </span>
            <span className="text-lg font-bold text-primary">{bmr} kcal</span>
          </div>
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

        {/* Weighin reminders */}
        <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "225ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-primary" />
            <h2 className="font-display font-semibold text-base">Rappel de pesée</h2>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Fréquence</Label>
              <div className="flex gap-2">
                {WEIGHIN_FREQUENCIES.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setWeighinFrequency(f.value)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                      weighinFrequency === f.value ? "nutri-gradient text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {weighinFrequency !== "daily" && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Jour</Label>
                <div className="flex gap-1">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.day}
                      onClick={() => setWeighinDay(d.day)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all ${
                        weighinDay === d.day ? "nutri-gradient text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Heure</Label>
              <div className="flex items-center gap-2">
              <NumericInput value={weighinHour} onChange={(v) => setWeighinHour(Math.min(23, Math.max(0, v)))} className="h-10 rounded-xl w-16" />
                <span className="text-sm text-muted-foreground">h</span>
                <NumericInput value={weighinMinute} onChange={(v) => setWeighinMinute(Math.min(59, Math.max(0, v)))} className="h-10 rounded-xl w-16" />
              </div>
            </div>
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
              <div className="text-xs text-muted-foreground">MB ({bmrMethod === "katch" ? "Katch" : "Mifflin"})</div>
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
