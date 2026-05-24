/**
 * Health Connect Bridge - NutriScan v0.85.0
 * Stratégie : Lecture Hybridée (Énergie + Pas) avec Naming Android 14.
 */

import { supabase } from "@/integrations/supabase/client";
import { calculateScientificGoals } from "@/utils/goals-calc";
import { differenceInYears } from "date-fns";

// ── TYPES ───────────────────────────────────────────────────────
export interface HealthConnectData {
  weight?: { value_kg: number; timestamp: string }[];
  bodyFat?: { percentage: number; timestamp: string }[];
  muscle?: { value_kg: number; timestamp: string }[];
  boneMass?: { value_kg: number; timestamp: string }[];
  activeCalories?: { value_kcal: number; timestamp: string }[];
}

export interface HealthConnectPreferences {
  sync_weight: boolean;
  sync_body_fat: boolean;
  sync_sleep: boolean;
  sync_calories: boolean;
}

const DEFAULT_PREFERENCES: HealthConnectPreferences = {
  sync_weight: false,
  sync_body_fat: false,
  sync_sleep: false,
  sync_calories: false,
};

// Types valides du plugin @capgo/capacitor-health (cf. HealthDataType)
// NOTE: "boneMass" n'est PAS supporté par le plugin côté autorisation (erreur
// "unsupported data type bonemass"). On le lit quand même via fetchSamples
// (try/catch) au cas où une future version l'expose ; sinon fallback 3.8 kg.
const HEALTH_READ_TYPES: any[] = [
  "weight",
  "bodyFat",
  "steps",
  "totalCalories",
  "basalCalories",
];

// Conserve les valeurs brutes Santé Connect (utilisées pour les calculs +
// stockées telles quelles). L'arrondi se fait uniquement à l'affichage.
const raw = (v: number) => Number(v);

// ── PLUGIN & PERMISSIONS ────────────────────────────────────────
async function getHealthPlugin() {
  const { Capacitor } = window as any;
  return Capacitor?.Plugins?.Health || null;
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  const Health = await getHealthPlugin();
  return !!Health && (await Health.isAvailable()).available;
}

export async function checkHealthPermissions(): Promise<boolean> {
  const Health = await getHealthPlugin();
  if (!Health) return false;
  try {
    const res = await Health.checkAuthorization({ read: HEALTH_READ_TYPES, write: [] });
    return Array.isArray(res?.readAuthorized) && res.readAuthorized.length > 0;
  } catch (e) {
    console.warn("[health] checkAuthorization failed", e);
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const Health = await getHealthPlugin();
  if (!Health) return false;
  try {
    const res = await Health.requestAuthorization({ read: HEALTH_READ_TYPES, write: [] });
    // Demande aussi les permissions BoneMass + LeanBodyMass via le plugin natif custom
    // (non exposées par @capgo/capacitor-health). Affiche un second popup Health Connect.
    try {
      const BoneMass = (window as any).Capacitor?.Plugins?.BoneMass;
      if (BoneMass) await BoneMass.requestPermission();
    } catch (e) {
      console.warn("[health] BoneMass.requestPermission failed", e);
    }
    return Array.isArray(res?.readAuthorized) && res.readAuthorized.length > 0;
  } catch (e: any) {
    console.warn("[health] requestAuthorization failed", e);
    throw new Error(e?.message || "Échec de la demande de permissions Health Connect");
  }
}

// ── LECTURE DES DONNÉES ──────────────────────────────────────────
export async function readNativeHealthData(days = 7): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  // On remonte 1 jour de plus pour assurer la jonction des données
  const startDate = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000).toISOString();
  
  const data: HealthConnectData = { weight: [], bodyFat: [], muscle: [], boneMass: [], activeCalories: [] };

  const fetchSamples = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate });
      return samples || [];
    } catch { return []; }
  };

  // BoneMass + LeanBodyMass : plugin natif custom
  // (@capgo/capacitor-health n'expose ni l'un ni l'autre)
  const fetchBoneAndLean = async (): Promise<{ bone: any[]; lean: any[] }> => {
    try {
      const BoneMass = (window as any).Capacitor?.Plugins?.BoneMass;
      if (!BoneMass) return { bone: [], lean: [] };
      const res = await BoneMass.readSamples({ startDate, endDate });
      return { bone: res?.bone || [], lean: res?.lean || [] };
    } catch (e) {
      console.warn("[health] BoneMass/Lean read failed", e);
      return { bone: [], lean: [] };
    }
  };

  const [weights, fats, boneLean, activeEnergy, steps] = await Promise.all([
    fetchSamples("weight"),
    fetchSamples("bodyFat"),
    fetchBoneAndLean(),
    fetchSamples("totalCalories"),
    fetchSamples("steps")
  ]);
  const bones = boneLean.bone;
  const leans = boneLean.lean;

  // 1. Composition Corporelle
  data.weight = weights.map((s: any) => ({ 
    value_kg: raw(Number(s.value)), 
    timestamp: s.startDate || s.date 
  }));
  
  data.bodyFat = fats.map((s: any) => ({ 
    percentage: raw(Number(s.value)), 
    timestamp: s.startDate || s.date 
  }));

  data.boneMass = bones.map((s: any) => ({ 
    value_kg: raw(Number(s.value)), 
    timestamp: s.startDate || s.date 
  }));

  // Muscle : priorité à LeanBodyMass importé depuis Health Connect (valeur balance directe).
  // Fallback : calcul Poids − Masse grasse − Os − 1% organes.
  const leanByDay = new Map<string, number>();
  leans.forEach((s: any) => {
    const ts = s.startDate || s.date || "";
    const d = ts.slice(0, 10);
    if (d) leanByDay.set(d, raw(Number(s.value)));
  });

  const muscleMap = new Map<string, number>();
  data.weight.forEach((w) => {
    const d = w.timestamp.slice(0, 10);
    const importedLean = leanByDay.get(d);
    if (importedLean !== undefined) {
      muscleMap.set(d, importedLean);
      return;
    }
    const fatEntry = data.bodyFat?.find(f => f.timestamp.startsWith(d));
    const boneEntry = data.boneMass?.find(b => b.timestamp.startsWith(d));
    if (fatEntry) {
      const fatKg = w.value_kg * (fatEntry.percentage / 100);
      const leanMass = w.value_kg - fatKg;
      const boneVal = boneEntry ? boneEntry.value_kg : 3.8;
      const organResidual = w.value_kg * 0.01;
      // Facteur de compensation organes (0.988) pour aligner sur la valeur balance bioimpédance
      muscleMap.set(d, raw((leanMass - boneVal) * 0.988));
    }
  });
  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 2. Calories : Logique de cumul Sport + Pas
  const calMap = new Map();

  // On ajoute les calories d'activité (Fit/Lyfta)
  activeEnergy.forEach((s: any) => {
    const d = (s.startDate || s.date || "").slice(0, 10);
    if (d) calMap.set(d, (calMap.get(d) || 0) + Number(s.value));
  });

  // On ajoute les pas (Samsung Health) convertis en Kcal (0.04)
  steps.forEach((s: any) => {
    const d = (s.startDate || s.date || "").slice(0, 10);
    if (d) {
      const stepKcal = Math.round(Number(s.value) * 0.04);
      const current = calMap.get(d) || 0;
      // On prend la valeur la plus haute entre sport déclaré et pas détectés
      if (stepKcal > current) calMap.set(d, stepKcal);
    }
  });

  data.activeCalories = Array.from(calMap.entries()).map(([date, val]) => ({ 
    value_kcal: Math.round(val), 
    timestamp: date 
  }));

  return data;
}

// ── SYNCHRONISATION SUPABASE ────────────────────────────────────

export async function syncHealthData(
  userId: string,
  data: HealthConnectData,
  prefs: HealthConnectPreferences
): Promise<{ synced: string[]; errors: string[] }> {
  const synced: string[] = [];
  const errors: string[] = [];

  try {
    const today = new Date().toISOString().slice(0, 10);

    // ── Sync Poids et Composition (un seul enregistrement par jour grâce à la contrainte UNIQUE) ──
    if (prefs.sync_weight && data.weight?.length) {
      // Group par date pour upsert un enregistrement par jour
      const byDate = new Map<string, { weight?: number; fat?: number; muscle?: number; bone?: number; lean?: number; activeCal?: number; ts: string }>();

      data.weight.forEach((w) => {
        const d = w.timestamp.slice(0, 10);
        const cur = byDate.get(d) || { ts: w.timestamp };
        cur.weight = w.value_kg;
        cur.ts = w.timestamp;
        byDate.set(d, cur);
      });
      data.bodyFat?.forEach((f) => {
        const d = f.timestamp.slice(0, 10);
        const cur = byDate.get(d) || { ts: f.timestamp };
        cur.fat = f.percentage;
        byDate.set(d, cur);
      });
      data.muscle?.forEach((m) => {
        const d = m.timestamp.slice(0, 10);
        const cur = byDate.get(d) || { ts: m.timestamp };
        cur.muscle = m.value_kg;
        byDate.set(d, cur);
      });
      // Stocker aussi les valeurs intermédiaires (utilisées dans les calculs)
      data.boneMass?.forEach((b) => {
        const d = b.timestamp.slice(0, 10);
        const cur = byDate.get(d) || { ts: b.timestamp };
        cur.bone = b.value_kg;
        byDate.set(d, cur);
      });
      // LeanBodyMass importé directement depuis Health Connect (si dispo)
      // est égal à la valeur "muscle" quand elle a été fournie par la balance
      data.muscle?.forEach((m) => {
        const d = m.timestamp.slice(0, 10);
        const cur = byDate.get(d) || { ts: m.timestamp };
        if (cur.lean === undefined) cur.lean = m.value_kg;
        byDate.set(d, cur);
      });
      data.activeCalories?.forEach((c) => {
        const d = c.timestamp.slice(0, 10);
        const cur = byDate.get(d) || { ts: c.timestamp };
        cur.activeCal = c.value_kcal;
        byDate.set(d, cur);
      });

      // Upsert atomique grâce à la contrainte UNIQUE (user_id, recorded_at)
      const rows = Array.from(byDate.entries()).map(([date, vals]) => ({
        user_id: userId,
        recorded_at: date,
        weight_kg: vals.weight ?? null,
        body_fat_percent: vals.fat ?? null,
        muscle_mass_kg: vals.muscle ?? null,
        bone_mass_kg: vals.bone ?? null,
        lean_mass_kg: vals.lean ?? null,
        active_calories_kcal: vals.activeCal ?? null,
        source: "health_connect",
      }));

      if (rows.length > 0) {
        await supabase
          .from("body_composition")
          .upsert(rows, { onConflict: "user_id,recorded_at" });
      }

      // Plus de mise à jour de profiles ici : body_composition est la
      // source unique de vérité pour weight / body_fat / muscle.
      const sortedW = [...data.weight].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const lastW = sortedW[0];
      const d = lastW.timestamp.slice(0, 10);
      const lastFat = data.bodyFat?.find((f) => f.timestamp.startsWith(d))?.percentage ?? null;

      // ── Recalcul des objectifs (mode scientifique) + snapshot ──
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (profile && (profile as any).goals_mode === "scientific") {
        const p = profile as any;
        const age = p.date_of_birth
          ? differenceInYears(new Date(), new Date(p.date_of_birth))
          : p.age || 30;
        const currentGoals = p.goals || {};
        const recomputed = calculateScientificGoals({
          weight_kg: lastW.value_kg,
          height_cm: Number(p.height_cm) || 175,
          age,
          gender: p.gender || "male",
          activity_level: p.activity_level || "moderate",
          goal_type: currentGoals.goalType || "maintain",
          bmr_method: p.bmr_method || "mifflin",
          body_fat_percent: lastFat,
          morphotype: p.morphotype,
          mass_gain_phase: p.mass_gain_phase,
        });

        await supabase.from("profiles").update({
          bmr: recomputed.bmr,
          goals: {
            calories: recomputed.calories,
            proteins: recomputed.proteins,
            carbs: recomputed.carbs,
            fats: recomputed.fats,
            goalType: currentGoals.goalType || "maintain",
          },
        } as any).eq("user_id", userId);

        // Snapshot dans goals_history pour chaque jour de mesure
        for (const [date, vals] of byDate.entries()) {
          if (!vals.weight) continue;
          const dayGoals = calculateScientificGoals({
            weight_kg: vals.weight,
            height_cm: Number(p.height_cm) || 175,
            age,
            gender: p.gender || "male",
            activity_level: p.activity_level || "moderate",
            goal_type: currentGoals.goalType || "maintain",
            bmr_method: p.bmr_method || "mifflin",
            body_fat_percent: vals.fat ?? null,
            morphotype: p.morphotype,
            mass_gain_phase: p.mass_gain_phase,
          });

          const goalEntry: any = {
            user_id: userId,
            recorded_at: date,
            calories: dayGoals.calories,
            proteins: dayGoals.proteins,
            carbs: dayGoals.carbs,
            fats: dayGoals.fats,
            goals_mode: "scientific",
            source: "health_connect",
          };

          await supabase
            .from("goals_history")
            .upsert(goalEntry, { onConflict: "user_id,recorded_at" });
        }
      }

      synced.push("Composition");
    }

    // Sync Calories : déjà stocké dans body_composition.active_calories_kcal
    // ci-dessus. Plus de duplication dans profiles.
    if (prefs.sync_calories && data.activeCalories?.length) {
      synced.push("Calories Sport");
    }
  } catch (e: any) {
    errors.push(e.message);
  }

  return { synced, errors };
}

// ── PRÉFÉRENCES ────────────────────────────────────────────────
export function getHealthConnectPreferences(): HealthConnectPreferences {
  try {
    const stored = localStorage.getItem("nutriscan-health-prefs");
    if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_PREFERENCES };
}

export function setHealthConnectPreferences(prefs: HealthConnectPreferences) {
  localStorage.setItem("nutriscan-health-prefs", JSON.stringify(prefs));
}

export function onAppResumeRecheck(callback: () => void): (() => void) | null {
  if (typeof document === "undefined") return null;
  const handleVisibility = () => { if (document.visibilityState === "visible") callback(); };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
  }
