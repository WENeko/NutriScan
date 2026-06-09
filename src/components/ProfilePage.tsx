import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Save, ArrowLeft, Calculator, Dumbbell, Bell, Palette, Info, HelpCircle, Sparkles, Sliders, FlaskConical, Plus, Loader2, User, Activity, Heart, Target, Settings, ChevronRight, RefreshCw, Droplets } from "lucide-react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { differenceInYears, format } from "date-fns";
import NumericInput from "@/components/NumericInput";
import CustomNutrientsEditor from "@/components/CustomNutrientsEditor";
import GeminiKeySettings from "@/components/GeminiKeySettings";
import AdminUsersPanel from "@/components/AdminUsersPanel";


import MicroGoalsEditor from "@/components/MicroGoalsEditor";
import { validateCustomNutrient, type CustomNutrientDef } from "@/utils/nutrients-helpers";
import type { MicroOverrides } from "@/utils/nutrition-logic";
import {
  isHealthConnectAvailable,
  checkHealthPermissions,
  requestHealthPermissions,
  readNativeHealthData,
  syncHealthData,
  getHealthConnectPreferences,
} from "@/services/health-connect";
import { computeSmoothedDailySport } from "@/services/sport-calories";

type GoalsMode = "scientific" | "manual" | "ai_coach";
type SubPage = null | "identity" | "activity" | "health" | "goals" | "settings";


interface SuggestedCustom extends CustomNutrientDef {}

interface ProfilePageProps {
  userId: string;
  onBack: () => void;
}

const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sédentaire", factor: 1.2 },
  { value: "lightly_active", label: "Légèrement actif", factor: 1.35 },
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

const BMR_METHOD_INFO: Record<string, string> = {
  mifflin: "Formule standard recommandée pour la majorité. Très fiable pour un suivi classique basé sur le poids, la taille et l'âge.",
  katch: "Idéale si vous connaissez votre taux de masse grasse. Plus précise pour les profils sportifs car elle se base sur la masse maigre.",
};

const ACTIVITY_LEVEL_INFO: Record<string, string> = {
  sedentary: "Travail de bureau, peu ou pas d'exercice. Multiplicateur ×1.2 appliqué au MB.",
  lightly_active: "Travail debout (vendeur, serveur…) sans sport régulier. Multiplicateur ×1.35. Recommandé quand l'import sportif est actif.",
  moderate: "3 à 5 séances de sport modéré par semaine ou travail debout. Multiplicateur ×1.55.",
  athletic: "Entraînement intense quotidien ou travail physique très exigeant. Multiplicateur ×1.8.",
};

const MORPHOTYPES = [
  { value: "ecto", label: "Ectomorphe", emoji: "🦴", desc: "Ossature fine, métabolisme rapide, difficulté à prendre du poids." },
  { value: "meso", label: "Mésomorphe", emoji: "💪", desc: "Ossature moyenne, prend du muscle facilement, physique naturellement athlétique." },
  { value: "endo", label: "Endomorphe", emoji: "🐻", desc: "Ossature large, métabolisme lent, tendance à stocker les graisses." },
  { value: "ecto-meso", label: "Ecto-Méso", emoji: "🏃", desc: "Mince avec une bonne capacité de prise musculaire." },
  { value: "endo-meso", label: "Endo-Méso", emoji: "🏋️", desc: "Fort et musclé naturellement, mais stocke aussi facilement." },
];

const MORPHOTYPE_BMR_FACTOR: Record<string, number> = {
  ecto: 1.05,
  meso: 1.0,
  endo: 0.95,
  "ecto-meso": 1.02,
  "endo-meso": 0.97,
};

const MASS_GAIN_PHASES = [
  { value: "initial", label: "Initiale", surplus: 500, desc: "Début de prise de masse (+500 kcal). Gain estimé : ~0.5 kg/sem." },
  { value: "growth", label: "Croissance", surplus: 700, desc: "Phase intensive (+700 kcal). Gain estimé : ~0.7 kg/sem." },
  { value: "stabilization", label: "Stabilisation", surplus: 500, desc: "Consolidation des acquis (+500 kcal). Gain estimé : ~0.5 kg/sem." },
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
  const [morphotype, setMorphotype] = useState<string>("");
  const [massGainPhase, setMassGainPhase] = useState<string>("");
  const [showMorphoHelp, setShowMorphoHelp] = useState(false);

  // Sources sportives Santé Connect + ajustement de phase (Mode Scientifique)
  const [sportAllowedSources, setSportAllowedSources] = useState<string[]>([]);
  const [phaseAdjustMode, setPhaseAdjustMode] = useState<"percent" | "absolute">("percent");
  const [phaseAdjustValue, setPhaseAdjustValue] = useState<number>(0);
  const [sportDailyAvg, setSportDailyAvg] = useState<number>(0);

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

  // Goals mode (scientific / manual / ai_coach)
  const [goalsMode, setGoalsMode] = useState<GoalsMode>("scientific");
  const [manualUnit, setManualUnit] = useState<"g" | "g_per_kg" | "percent">("g");
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRationale, setAiRationale] = useState<string>("");
  const [suggestedCustoms, setSuggestedCustoms] = useState<SuggestedCustom[]>([]);
  const [existingCustoms, setExistingCustoms] = useState<CustomNutrientDef[]>([]);
  const [customsRefreshKey, setCustomsRefreshKey] = useState(0);

  // Santé & mode de vie
  const [isAthlete, setIsAthlete] = useState(false);
  const [isSmoker, setIsSmoker] = useState(false);
  const [isPregnant, setIsPregnant] = useState(false);
  const [isMenopausal, setIsMenopausal] = useState(false);

  // Mode expert micronutriments
  const [expertMode, setExpertMode] = useState(false);
  const [microOverrides, setMicroOverrides] = useState<MicroOverrides>({});

  // Sub-page navigation
  const [subPage, setSubPage] = useState<SubPage>(null);

  // Health Connect sync state
  const [isSyncing, setIsSyncing] = useState(false);

  const handleHealthSync = async () => {
    setIsSyncing(true);
    try {
      const available = await isHealthConnectAvailable();
      if (!available) {
        toast({ title: "Health Connect indisponible", description: "Lance l'app native pour synchroniser.", variant: "destructive" });
        return;
      }
      let granted = await checkHealthPermissions();
      if (!granted) granted = await requestHealthPermissions();
      if (!granted) {
        toast({ title: "Permissions refusées", variant: "destructive" });
        return;
      }
      const data = await readNativeHealthData(30);
      const prefs = getHealthConnectPreferences();
      const result = await syncHealthData(userId, data, prefs);
      if (result.synced.length) {
        toast({ title: "Synchronisation réussie", description: result.synced.join(", ") });
        await loadProfile();
      } else {
        toast({ title: "Aucune donnée importée", description: "Active les sources dans Sources de données." });
      }
      if (result.errors.length) {
        toast({ title: "Erreurs", description: result.errors.join("; "), variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erreur de synchronisation", description: e.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };


  const age = dateOfBirth ? differenceInYears(new Date(), new Date(dateOfBirth)) : 30;
  const leanMass = bodyFat !== "" && weight > 0 ? weight * (1 - (bodyFat as number) / 100) : null;

  useEffect(() => { loadProfile(); }, []);
  useEffect(() => {
    if (goalsMode === "scientific") calculateTargets();
  }, [weight, height, dateOfBirth, gender, activityLevel, goalType, bmrMethod, bodyFat, morphotype, massGainPhase, goalsMode, sportDailyAvg, phaseAdjustMode, phaseAdjustValue]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Source unique de vérité pour weight / fat / muscle / sport_calories :
    // dernière entrée NON NULLE par champ dans body_composition.
    const { data: lastBodyRows } = await supabase
      .from("body_composition")
      .select("weight_kg, body_fat_percent, muscle_mass_kg, active_calories_kcal, recorded_at, created_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    if (lastBodyRows && lastBodyRows.length) {
      const firstNonNull = (key: string) =>
        (lastBodyRows.find((r: any) => r[key] !== null && r[key] !== undefined) as any)?.[key];
      const w = firstNonNull("weight_kg");
      const bf = firstNonNull("body_fat_percent");
      const mm = firstNonNull("muscle_mass_kg");
      const ac = firstNonNull("active_calories_kcal");
      if (w !== undefined) setWeight(Math.round(Number(w) * 10) / 10);
      if (bf !== undefined) setBodyFat(Math.round(Number(bf) * 10) / 10);
      if (mm !== undefined) setMuscleMass(Math.round(Number(mm) * 10) / 10);
      if (ac !== undefined) setSportCalories(Math.round(Number(ac)));
    }

    if (data) {
      const d = data as any;
      if (d.height_cm) setHeight(Number(d.height_cm));
      if (d.date_of_birth) setDateOfBirth(d.date_of_birth);
      if (d.gender) setGender(d.gender);
      if (d.activity_level) setActivityLevel(d.activity_level);
      if (d.bmr) setBmr(Number(d.bmr));
      if (d.bmr_method) setBmrMethod(d.bmr_method);
      if (d.water_goal_ml) setWaterGoal(Number(d.water_goal_ml));
      if (d.target_weight_kg) setTargetWeight(Number(d.target_weight_kg));
      if (d.target_body_fat_percent) setTargetBodyFat(Number(d.target_body_fat_percent));
      if (d.target_muscle_mass_kg) setTargetMuscleMass(Number(d.target_muscle_mass_kg));
      if (d.weighin_frequency) setWeighinFrequency(d.weighin_frequency);
      if (d.weighin_day !== null && d.weighin_day !== undefined) setWeighinDay(Number(d.weighin_day));
      if (d.weighin_hour !== null && d.weighin_hour !== undefined) setWeighinHour(Number(d.weighin_hour));
      if (d.weighin_minute !== null && d.weighin_minute !== undefined) setWeighinMinute(Number(d.weighin_minute));
      if (d.morphotype) setMorphotype(d.morphotype);
      if (d.mass_gain_phase) setMassGainPhase(d.mass_gain_phase);
      if (Array.isArray(d.sport_allowed_sources)) setSportAllowedSources(d.sport_allowed_sources as string[]);
      if (d.phase_adjust_mode === "absolute" || d.phase_adjust_mode === "percent") setPhaseAdjustMode(d.phase_adjust_mode);
      if (d.phase_adjust_value !== null && d.phase_adjust_value !== undefined) setPhaseAdjustValue(Number(d.phase_adjust_value));
      if (d.goals_mode) setGoalsMode(d.goals_mode as GoalsMode);
      if (d.ai_coach_prompt) setAiPrompt(d.ai_coach_prompt);
      if (Array.isArray(d.custom_nutrients)) setExistingCustoms(d.custom_nutrients as CustomNutrientDef[]);
      setIsAthlete(!!d.is_athlete);
      setIsSmoker(!!d.is_smoker);
      setIsPregnant(!!d.is_pregnant);
      setIsMenopausal(!!d.is_menopausal);
      setExpertMode(!!d.expert_mode);
      if (d.micro_overrides && typeof d.micro_overrides === "object") {
        setMicroOverrides(d.micro_overrides as MicroOverrides);
      }
      const goals = d.goals as any;
      if (goals?.goalType) setGoalType(goals.goalType);
      // For non-scientific modes, restore saved targets so they are not overwritten
      if (d.goals_mode && d.goals_mode !== "scientific" && goals) {
        setTargets({
          calories: Number(goals.calories) || 0,
          proteins: Number(goals.proteins) || 0,
          carbs: Number(goals.carbs) || 0,
          fats: Number(goals.fats) || 0,
        });
      }
    }

    // Moyenne sportive 7 j lissée (filtrée par sources autorisées)
    try {
      const allowed = (data as any)?.sport_allowed_sources || [];
      if (allowed.length) {
        const avg = await computeSmoothedDailySport(userId, allowed);
        setSportDailyAvg(avg);
      } else {
        setSportDailyAvg(0);
      }
    } catch {}
  };

  const runAiCoach = async () => {
    if (!aiPrompt.trim()) {
      toast({ title: "Décris ton objectif", description: "Renseigne un prompt pour le coach IA.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setSuggestedCustoms([]);
    setAiRationale("");
    try {
      const profilePayload = {
        gender, age, weight_kg: weight, height_cm: height,
        body_fat_percent: bodyFat || null, muscle_mass_kg: muscleMass || null,
        activity_level: activityLevel, morphotype: morphotype || null,
        bmr, sport_calories_daily: sportCalories,
        target_weight_kg: targetWeight || null,
        target_body_fat_percent: targetBodyFat || null,
        target_muscle_mass_kg: targetMuscleMass || null,
        custom_nutrients: existingCustoms,
      };
      const { data, error } = await supabase.functions.invoke("coach-goals", {
        body: { profile: profilePayload, prompt: aiPrompt.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const cal = Math.round(Number(data?.calories) || 0);
      const p = Math.round(Number(data?.proteins) || 0);
      const c = Math.round(Number(data?.carbs) || 0);
      const f = Math.round(Number(data?.fats) || 0);
      if (cal > 0) setTargets({ calories: cal, proteins: p, carbs: c, fats: f });
      setAiRationale(typeof data?.rationale === "string" ? data.rationale : "");
      const sugg = Array.isArray(data?.suggested_custom_nutrients) ? data.suggested_custom_nutrients : [];
      // Filter out keys already present in existing customs
      const existingKeys = new Set(existingCustoms.map((c) => c.key));
      const cleaned: SuggestedCustom[] = [];
      for (const s of sugg) {
        const v = validateCustomNutrient(s, [...existingKeys, ...cleaned.map((x) => x.key)]);
        if (v.ok) cleaned.push(v.value);
      }
      setSuggestedCustoms(cleaned);
      toast({ title: "Objectifs calculés par l'IA ✨" });
    } catch (e: any) {
      toast({ title: "Erreur coach IA", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const addSuggestedCustom = async (s: SuggestedCustom) => {
    const next = [...existingCustoms, s];
    const { error } = await supabase
      .from("profiles")
      .update({ custom_nutrients: next as any })
      .eq("user_id", userId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    setExistingCustoms(next);
    setSuggestedCustoms((prev) => prev.filter((x) => x.key !== s.key));
    setCustomsRefreshKey((k) => k + 1);
    toast({ title: `${s.label} ajouté` });
  };

  const calculateTargets = () => {
    let usedBmr = 0;

    if (bmrMethod === "katch" && leanMass && leanMass > 0) {
      usedBmr = Math.round(21.6 * leanMass + 370);
    } else if (gender === "female") {
      usedBmr = Math.round(10 * weight + 6.25 * height - 5 * age - 161);
    } else {
      usedBmr = Math.round(10 * weight + 6.25 * height - 5 * age + 5);
    }

    const morphoFactor = MORPHOTYPE_BMR_FACTOR[morphotype] || 1.0;
    usedBmr = Math.round(usedBmr * morphoFactor);
    setBmr(usedBmr);

    const activity = ACTIVITY_LEVELS.find((a) => a.value === activityLevel) || ACTIVITY_LEVELS[0];
    const tdeeBase = usedBmr * activity.factor;
    const sport = Math.max(0, sportDailyAvg || 0);
    setTdee(Math.round(tdeeBase + sport));

    // Ajustement de phase : % ou kcal absolu
    const v = Number(phaseAdjustValue) || 0;
    const adjust = phaseAdjustMode === "absolute" ? v : (tdeeBase + sport) * (v / 100);
    const targetCalories = Math.round(tdeeBase + sport + adjust);

    const goal = GOAL_TYPES.find((g) => g.value === goalType) || GOAL_TYPES[1];
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
          height_cm: height,
          age,
          gender,
          activity_level: activityLevel,
          bmr,
          date_of_birth: dateOfBirth || null,
          water_goal_ml: waterGoal,
          target_weight_kg: targetWeight || null,
          target_body_fat_percent: targetBodyFat || null,
          target_muscle_mass_kg: targetMuscleMass || null,
          bmr_method: bmrMethod,
          weighin_frequency: weighinFrequency,
          weighin_day: weighinDay,
          weighin_hour: weighinHour,
          weighin_minute: weighinMinute,
          morphotype: morphotype || null,
          mass_gain_phase: massGainPhase || null,
          last_weighin_date: null,
          goals_mode: goalsMode,
          is_athlete: isAthlete,
          is_smoker: isSmoker,
          is_pregnant: isPregnant,
          is_menopausal: isMenopausal,
          expert_mode: expertMode,
          micro_overrides: microOverrides as any,
          sport_allowed_sources: sportAllowedSources as any,
          phase_adjust_mode: phaseAdjustMode,
          phase_adjust_value: phaseAdjustValue,
          ai_coach_prompt: goalsMode === "ai_coach" ? aiPrompt : null,
          goals: { ...targets, goalType } as any,
        } as any)
        .eq("user_id", userId);
      if (error) throw error;

      const today = format(new Date(), "yyyy-MM-dd");

      // Source unique de vérité : on enregistre weight / fat / muscle /
      // sport_calories dans body_composition (upsert sur le jour).
      if (weight || bodyFat !== "" || muscleMass !== "" || sportCalories) {
        await supabase.from("body_composition").upsert({
          user_id: userId,
          recorded_at: today,
          weight_kg: weight || null,
          body_fat_percent: bodyFat === "" ? null : (bodyFat as number),
          muscle_mass_kg: muscleMass === "" ? null : (muscleMass as number),
          active_calories_kcal: sportCalories || null,
          source: "manual",
        }, { onConflict: "user_id,recorded_at" });
      }

      // Snapshot des objectifs du jour (sans dupliquer weight/fat)
      const goalsSnap: any = {
        user_id: userId,
        recorded_at: today,
        calories: targets.calories,
        proteins: targets.proteins,
        carbs: targets.carbs,
        fats: targets.fats,
        goals_mode: goalsMode,
        source: "manual",
      };
      await supabase
        .from("goals_history")
        .upsert(goalsSnap, { onConflict: "user_id,recorded_at" });

      toast({ title: "Profil sauvegardé !" });
      onBack();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const PAGE_TITLES: Record<Exclude<SubPage, null>, string> = {
    identity: "Identité & Mensurations",
    activity: "Activité & Objectif",
    health: "Santé & Mode de vie",
    goals: "Objectifs nutritionnels",
    settings: "Préférences & Rappels",
  };

  const hubItems: Array<{ id: Exclude<SubPage, null>; icon: any; label: string; desc: string }> = [
    {
      id: "identity",
      icon: User,
      label: "Identité & Mensurations",
      desc: `${weight} kg · ${height} cm · ${gender === "male" ? "Homme" : "Femme"}`,
    },
    {
      id: "activity",
      icon: Activity,
      label: "Activité & Objectif corporel",
      desc: `${ACTIVITY_LEVELS.find((a) => a.value === activityLevel)?.label ?? "—"} · ${GOAL_TYPES.find((g) => g.value === goalType)?.label ?? "—"}`,
    },
    {
      id: "health",
      icon: Heart,
      label: "Santé & Mode de vie",
      desc: [isAthlete && "Sportif", isSmoker && "Fumeur", isPregnant && "Grossesse", isMenopausal && "Ménopause"].filter(Boolean).join(" · ") || "Aucun indicateur",
    },
    {
      id: "goals",
      icon: Target,
      label: "Objectifs nutritionnels",
      desc: `${targets.calories || 0} kcal · ${goalsMode === "scientific" ? "Scientifique" : goalsMode === "manual" ? "Manuel" : "Coach IA"}`,
    },
    {
      id: "settings",
      icon: Settings,
      label: "Préférences & Rappels",
      desc: `Pesée ${WEIGHIN_FREQUENCIES.find((f) => f.value === weighinFrequency)?.label.toLowerCase() ?? weighinFrequency}`,
    },
  ];

  const goBack = () => (subPage ? setSubPage(null) : onBack());

  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-10 glass-card px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={goBack} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">{subPage ? PAGE_TITLES[subPage] : "Mon Profil"}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 space-y-6 mt-6">
        {/* ============ HUB ============ */}
        {subPage === null && (
          <>
            <div className="space-y-3">
              {hubItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSubPage(item.id)}
                    className="w-full bg-card rounded-2xl p-4 shadow-card flex items-center gap-3 text-left hover:bg-muted/40 transition-colors animate-fade-up"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="w-10 h-10 rounded-xl nutri-gradient flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-display font-semibold">{item.label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{item.desc}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-12 rounded-xl nutri-gradient text-primary-foreground font-semibold shadow-float hover:opacity-90"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Enregistrement..." : "Sauvegarder mon profil"}
            </Button>
          </>
        )}

        {/* ============ IDENTITY ============ */}
        {subPage === "identity" && (
          <>
            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
              <h2 className="font-display font-semibold text-base mb-4">Informations corporelles</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Taille (cm)</Label>
                  <NumericInput value={height} onChange={(v) => setHeight(v)} className="h-10 rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date de naissance</Label>
                  <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10 rounded-xl" />
                </div>
                <div className="space-y-1 col-span-2">
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

            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "30ms" }}>
              <div className="flex items-center gap-2 mb-4">
                <Dumbbell className="w-4 h-4 text-primary" />
                <h2 className="font-display font-semibold text-base">Composition corporelle</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Poids (kg)</Label>
                  <NumericInput value={weight} onChange={(v) => setWeight(v)} displayDecimals={1} className="h-10 rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Masse grasse (%)</Label>
                  <NumericInput value={bodyFat === "" ? 0 : bodyFat} onChange={(v) => setBodyFat(v || "")} displayDecimals={1} className="h-10 rounded-xl" placeholder="Ex: 18" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Masse musculaire (kg)</Label>
                  <NumericInput value={muscleMass === "" ? 0 : muscleMass} onChange={(v) => setMuscleMass(v || "")} displayDecimals={1} className="h-10 rounded-xl" placeholder="Ex: 35" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Calories sport/jour</Label>
                  <NumericInput value={sportCalories} onChange={(v) => setSportCalories(v)} displayDecimals={0} className="h-10 rounded-xl" placeholder="Ex: 300" />
                </div>
              </div>
              {leanMass && (
                <div className="mt-3 bg-accent rounded-xl p-2.5 text-xs">
                  <span className="text-muted-foreground">Masse maigre estimée : </span>
                  <span className="font-bold text-primary">{leanMass.toFixed(1)} kg</span>
                </div>
              )}
              <Button
                onClick={handleHealthSync}
                disabled={isSyncing}
                variant="outline"
                className="w-full h-11 rounded-xl mt-4"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Synchronisation…" : "Synchroniser maintenant"}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Importe poids, masse grasse & musculaire depuis Health Connect, avec leurs dates de mesure.
              </p>
            </section>
          </>
        )}

        {/* ============ ACTIVITY ============ */}
        {subPage === "activity" && (
          <>
            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
              <h2 className="font-display font-semibold text-base mb-3">Niveau d'activité</h2>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITY_LEVELS.map((a) => {
                  const sportImportActive = sportAllowedSources.length > 0;
                  const restricted = sportImportActive && a.value !== "sedentary" && a.value !== "lightly_active";
                  return (
                    <button
                      key={a.value}
                      onClick={() => !restricted && setActivityLevel(a.value)}
                      disabled={restricted}
                      title={restricted ? "Désactive l'import sportif pour utiliser ce niveau" : ""}
                      className={`py-3 rounded-xl text-xs font-semibold transition-all ${
                        activityLevel === a.value
                          ? "nutri-gradient text-primary-foreground shadow-float"
                          : restricted
                          ? "bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <div>{a.label}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">×{a.factor}</div>
                    </button>
                  );
                })}
              </div>
              <div className="bg-accent/50 rounded-lg p-2.5 mt-3">
                <div className="flex items-start gap-1.5">
                  <Info className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-muted-foreground">{ACTIVITY_LEVEL_INFO[activityLevel]}</p>
                </div>
              </div>
              {sportAllowedSources.length > 0 && (
                <div className="mt-3 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-[11px] text-muted-foreground">
                    🏃 Sport moyen 7 j : <span className="font-semibold text-foreground">{Math.round(sportDailyAvg)} kcal/j</span>
                    {" · "}{sportAllowedSources.length} source(s) active(s)
                  </p>
                </div>
              )}
            </section>

            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "30ms" }}>
              <h2 className="font-display font-semibold text-base mb-3">Objectif corporel</h2>
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
                  </button>
                ))}
              </div>
            </section>

            {goalType !== "maintain" && (
              <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "60ms" }}>
                <h2 className="font-display font-semibold text-base mb-3">Ajustement de phase</h2>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Définit le déficit (sèche) ou surplus (prise de masse) appliqué au-dessus de la dépense totale (MB + activité + sport moyen).
                </p>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setPhaseAdjustMode("percent")}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${phaseAdjustMode === "percent" ? "nutri-gradient text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >Pourcentage (%)</button>
                  <button
                    onClick={() => setPhaseAdjustMode("absolute")}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${phaseAdjustMode === "absolute" ? "nutri-gradient text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >Kcal absolu</button>
                </div>
                <NumericInput
                  value={phaseAdjustValue}
                  onChange={(num) => setPhaseAdjustValue(Number.isFinite(num) ? num : 0)}
                  placeholder={phaseAdjustMode === "percent" ? "ex : -15 ou 10" : "ex : -400 ou 500"}
                />
                <p className="text-[10px] text-muted-foreground mt-2">
                  {phaseAdjustMode === "percent"
                    ? "Valeurs typiques : sèche −15 à −20 %, prise +10 à +15 %."
                    : "Valeurs typiques : sèche −300 à −500 kcal, prise +300 à +700 kcal."}
                </p>
              </section>
            )}



            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "90ms" }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold text-base">Morphotype</h2>
                <button onClick={() => setShowMorphoHelp(!showMorphoHelp)} className="p-1 rounded-lg hover:bg-muted">
                  <HelpCircle className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              {showMorphoHelp && (
                <div className="bg-accent rounded-xl p-3 mb-3 text-xs text-muted-foreground space-y-2 animate-fade-up">
                  <p className="font-semibold text-foreground">🔍 Comment identifier ton morphotype ?</p>
                  <p>• <strong>Poignets fins</strong> (tour &lt; 16cm) → tendance Ecto</p>
                  <p>• <strong>Métabolisme rapide</strong>, difficulté à grossir → Ecto</p>
                  <p>• <strong>Prends du muscle facilement</strong>, épaules larges → Méso</p>
                  <p>• <strong>Ossature large</strong>, stocke facilement → Endo</p>
                  <p>• Tu te situes entre deux ? Choisis un <strong>hybride</strong> (Ecto-Méso ou Endo-Méso).</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {MORPHOTYPES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMorphotype(m.value)}
                    className={`p-3 rounded-xl text-left transition-all ${
                      morphotype === m.value ? "nutri-gradient text-primary-foreground shadow-float" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    <div className="text-sm font-semibold">{m.emoji} {m.label}</div>
                    <div className={`text-[10px] mt-0.5 ${morphotype === m.value ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{m.desc}</div>
                  </button>
                ))}
              </div>
              {morphotype && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Facteur MB appliqué : ×{MORPHOTYPE_BMR_FACTOR[morphotype] || 1.0}
                </p>
              )}
            </section>

            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "120ms" }}>
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
          </>
        )}

        {/* ============ HEALTH ============ */}
        {subPage === "health" && (
          <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4 text-primary" />
              <h2 className="font-display font-semibold text-base">Santé & Mode de vie</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Ces indicateurs personnalisent les objectifs <strong>micronutriments</strong> en mode scientifique (vitamines, minéraux…).
            </p>

            <div className="space-y-3">
              {[
                {
                  key: "athlete",
                  label: "Sportif·ve régulier·ère",
                  desc: "Augmente Magnésium, Zinc, Sodium, Vit. C/E, B12, Oméga-3.",
                  value: isAthlete,
                  set: setIsAthlete,
                },
                {
                  key: "smoker",
                  label: "Fumeur·euse",
                  desc: "Augmente Vit. C (+35 mg) et Vit. E (+2 mg).",
                  value: isSmoker,
                  set: setIsSmoker,
                },
                {
                  key: "pregnant",
                  label: "Grossesse",
                  desc: "Fer 27 mg, B9 (folates) 600 µg.",
                  value: isPregnant,
                  set: setIsPregnant,
                },
                {
                  key: "menopausal",
                  label: "Ménopause",
                  desc: "Calcium 1200 mg, Fer abaissé à 8 mg.",
                  value: isMenopausal,
                  set: setIsMenopausal,
                },
              ].map((item) => (
                <div key={item.key} className="flex items-start gap-3 bg-accent/40 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
                  </div>
                  <Switch checked={item.value} onCheckedChange={item.set} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============ GOALS ============ */}
        {subPage === "goals" && (
          <>
            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
              <h2 className="font-display font-semibold text-base mb-3">Mode de calcul des objectifs</h2>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "scientific" as GoalsMode, label: "Scientifique", icon: Calculator, desc: "Formules" },
                  { value: "manual" as GoalsMode, label: "Manuel", icon: Sliders, desc: "Valeurs ou %" },
                  { value: "ai_coach" as GoalsMode, label: "Coach IA", icon: Sparkles, desc: "Prompt libre" },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setGoalsMode(m.value)}
                      className={`p-3 rounded-xl transition-all flex flex-col items-center gap-1 ${
                        goalsMode === m.value ? "nutri-gradient text-primary-foreground shadow-float" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-semibold">{m.label}</span>
                      <span className={`text-[9px] ${goalsMode === m.value ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}>{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "15ms" }}>
              <div className="flex items-center gap-2 mb-3">
                <Droplets className="w-4 h-4 text-primary" />
                <h2 className="font-display font-semibold text-base">Objectif d'hydratation</h2>
              </div>
              <Label className="text-xs text-muted-foreground">Eau (ml / jour)</Label>
              <NumericInput value={waterGoal} onChange={(v) => setWaterGoal(v)} className="h-10 rounded-xl" placeholder="2000" />
              <p className="text-[10px] text-muted-foreground mt-2">+500 ml automatiques les jours avec sport.</p>
            </section>



            {goalsMode === "scientific" && (
              <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "30ms" }}>
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
                <div className="bg-accent/50 rounded-lg p-2.5 mb-3">
                  <div className="flex items-start gap-1.5">
                    <Info className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-muted-foreground">{BMR_METHOD_INFO[bmrMethod]}</p>
                  </div>
                </div>
                <div className="bg-accent rounded-xl p-3 text-center">
                  <span className="text-xs text-muted-foreground">MB calculé : </span>
                  <span className="text-lg font-bold text-primary">{bmr} kcal</span>
                  {morphotype && <span className="text-[10px] text-muted-foreground ml-1">(morpho ×{MORPHOTYPE_BMR_FACTOR[morphotype]})</span>}
                </div>
              </section>
            )}

            {goalsMode === "manual" && (
              <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "30ms" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    <h2 className="font-display font-semibold text-base">Réglages manuels</h2>
                  </div>
                  <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                    {(["g", "g_per_kg", "percent"] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => setManualUnit(u)}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                          manualUnit === u ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                        }`}
                      >
                        {u === "g" ? "g" : u === "g_per_kg" ? "g/kg" : "% cal."}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Calories (kcal/jour)</Label>
                    <NumericInput
                      value={targets.calories}
                      onChange={(v) => setTargets({ ...targets, calories: Math.round(v) })}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  {(["proteins", "carbs", "fats"] as const).map((k) => {
                    const labels: Record<string, string> = { proteins: "Protéines", carbs: "Glucides", fats: "Lipides" };
                    const kcalPerG = k === "fats" ? 9 : 4;
                    const cal = targets.calories || 0;
                    const grams = targets[k];
                    const percent = cal > 0 ? Math.round((grams * kcalPerG / cal) * 100) : 0;
                    const w = Number(weight) || 0;
                    const perKg = w > 0 ? Math.round((grams / w) * 10) / 10 : 0;
                    return (
                      <div key={k}>
                        <Label className="text-xs text-muted-foreground flex items-center justify-between">
                          <span>{labels[k]}</span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {manualUnit === "g"
                              ? `≈ ${perKg}g/kg · ${percent}%`
                              : manualUnit === "g_per_kg"
                              ? `≈ ${grams}g (${grams * kcalPerG} kcal)`
                              : `≈ ${grams}g · ${perKg}g/kg`}
                          </span>
                        </Label>
                        {manualUnit === "g" ? (
                          <NumericInput
                            value={grams}
                            onChange={(v) => setTargets({ ...targets, [k]: Math.round(v) })}
                            className="h-10 rounded-xl"
                          />
                        ) : manualUnit === "g_per_kg" ? (
                          <NumericInput
                            value={perKg}
                            onChange={(v) => {
                              const newGrams = w > 0 ? Math.round(v * w) : 0;
                              setTargets({ ...targets, [k]: newGrams });
                            }}
                            className="h-10 rounded-xl"
                          />
                        ) : (
                          <NumericInput
                            value={percent}
                            onChange={(v) => {
                              const newGrams = cal > 0 ? Math.round((cal * v / 100) / kcalPerG) : 0;
                              setTargets({ ...targets, [k]: newGrams });
                            }}
                            className="h-10 rounded-xl"
                          />
                        )}
                      </div>
                    );
                  })}
                  {(() => {
                    const c = targets.calories || 0;
                    const reconstituted = targets.proteins * 4 + targets.carbs * 4 + targets.fats * 9;
                    const diff = c - reconstituted;
                    const ok = Math.abs(diff) <= Math.max(50, c * 0.05);
                    return (
                      <div className={`rounded-xl p-3 text-xs ${ok ? "bg-accent" : "bg-destructive/10 text-destructive"}`}>
                        Somme macros : <strong>{reconstituted} kcal</strong> · objectif <strong>{c} kcal</strong>
                        {!ok && <span> · écart {diff > 0 ? `+${diff}` : diff} kcal</span>}
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}

            {goalsMode === "ai_coach" && (
              <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "30ms" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h2 className="font-display font-semibold text-base">Coach nutrition IA</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Décris ton objectif en langage naturel. L'IA utilise ton profil pour calculer calories, macros et te suggérer des micronutriments à suivre.
                </p>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ex : Je veux prendre 3kg de muscle sec en 12 semaines, je m'entraîne 5x/semaine en force, je suis intolérant au lactose et je prends 5g de créatine par jour."
                  className="min-h-[110px] rounded-xl text-sm"
                />
                <Button
                  onClick={runAiCoach}
                  disabled={aiLoading}
                  className="w-full h-10 rounded-xl nutri-gradient text-primary-foreground mt-3"
                >
                  {aiLoading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Calcul en cours…</> : <><Sparkles className="w-4 h-4 mr-1" /> Calculer mes objectifs</>}
                </Button>
                {aiRationale && (
                  <div className="bg-accent rounded-xl p-3 mt-3 text-xs">
                    <div className="flex items-start gap-1.5">
                      <Info className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">{aiRationale}</p>
                    </div>
                  </div>
                )}
                {suggestedCustoms.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-semibold">Micronutriments suggérés</h3>
                    </div>
                    {suggestedCustoms.map((s) => (
                      <div key={s.key} className="flex items-center gap-2 bg-accent rounded-xl p-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {s.label} <span className="text-xs text-muted-foreground">({s.unit})</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {s.category}{s.goal != null ? ` · obj. ${s.goal}${s.unit}` : ""}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => addSuggestedCustom(s)}>
                          <Plus className="w-3 h-3 mr-1" /> Ajouter
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="bg-accent rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "60ms" }}>
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="w-4 h-4 text-primary" />
                <h2 className="font-display font-semibold text-base">Objectifs calculés</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {goalsMode === "scientific" && (
                  <>
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
                  </>
                )}
                {goalsMode !== "scientific" && (
                  <div className="bg-card rounded-xl p-3 col-span-2">
                    <div className="text-xs text-muted-foreground">Calories cibles</div>
                    <div className="font-bold text-lg text-primary">{targets.calories} <span className="text-xs font-normal text-muted-foreground">kcal</span></div>
                  </div>
                )}
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

            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "70ms" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-display font-semibold text-base">Mode expert micronutriments</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Personnalise les objectifs de chaque micronutriment et marque-les comme minimum à atteindre ou limite à ne pas dépasser.
                  </p>
                </div>
                <Switch checked={expertMode} onCheckedChange={setExpertMode} />
              </div>
            </section>

            {expertMode && (
              <MicroGoalsEditor
                userProfile={{
                  gender,
                  age,
                  weight_kg: weight,
                  activity_level: activityLevel,
                  totalCaloriesGoal: targets.calories,
                  isAthlete,
                  isSmoker,
                  isPregnant,
                  isMenopausal,
                }}
                overrides={microOverrides}
                onChange={setMicroOverrides}
              />
            )}

            <CustomNutrientsEditor key={customsRefreshKey} userId={userId} />
          </>
        )}

        {/* ============ SETTINGS ============ */}
        {subPage === "settings" && (
          <>
            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
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

            <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "30ms" }}>
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4 text-primary" />
                <h2 className="font-display font-semibold text-base">Thème d'affichage</h2>
              </div>
              <ThemeSwitcher />
            </section>

            <GeminiKeySettings userId={userId} />
            <AdminUsersPanel userId={userId} />
          </>
        )}

        {/* Save button at bottom of every sub-page */}
        {subPage !== null && (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 rounded-xl nutri-gradient text-primary-foreground font-semibold shadow-float hover:opacity-90"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Enregistrement..." : "Sauvegarder mon profil"}
          </Button>
        )}
      </main>
    </div>
  );
};

export default ProfilePage;
