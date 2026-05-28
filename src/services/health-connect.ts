/**
 * Health Connect Bridge - NutriScan v0.85.0
 * Stratégie : Lecture Hybridée (Énergie + Pas) avec Naming Android 14.
 */

import { supabase } from "@/integrations/supabase/client";
import { calculateScientificGoals } from "@/utils/goals-calc";
import { differenceInYears } from "date-fns";
import {
  computeSmoothedDailySport,
  type SportSample,
} from "@/services/sport-calories";

// ── TYPES ───────────────────────────────────────────────────────
export interface HealthConnectData {
  weight?: { value_kg: number; timestamp: string }[];
  bodyFat?: { percentage: number; timestamp: string }[];
  muscle?: { value_kg: number; timestamp: string }[];
  leanMass?: { value_kg: number; timestamp: string }[];
  boneMass?: { value_kg: number; timestamp: string }[];
  activeCalories?: { value_kcal: number; timestamp: string }[];
  /** Échantillons bruts par source — base pour filtrage et dédup. */
  sportSamples?: SportSample[];
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
    // Demande aussi les permissions BoneMass + LeanBodyMass et Sport
    // via les plugins natifs custom (non exposés par @capgo/capacitor-health).
    try {
      const BoneMass = (window as any).Capacitor?.Plugins?.BoneMass;
      if (BoneMass) await BoneMass.requestPermission();
    } catch (e) {
      console.warn("[health] BoneMass.requestPermission failed", e);
    }
    try {
      const SportSamples = (window as any).Capacitor?.Plugins?.SportSamples;
      if (SportSamples) await SportSamples.requestPermission();
    } catch (e) {
      console.warn("[health] SportSamples.requestPermission failed", e);
    }
    return Array.isArray(res?.readAuthorized) && res.readAuthorized.length > 0;
  } catch (e: any) {
    console.warn("[health] requestAuthorization failed", e);
    throw new Error(e?.message || "Échec de la demande de permissions Health Connect");
  }
}

// ── LECTURE DES DONNÉES ──────────────────────────────────────────
export async function readNativeHealthData(days = 30): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  // On remonte 1 jour de plus pour assurer la jonction des données
  const startDate = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000).toISOString();

  const data: HealthConnectData = {
    weight: [], bodyFat: [], muscle: [], leanMass: [], boneMass: [],
    activeCalories: [], sportSamples: [],
  };

  const fetchSamples = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate });
      return samples || [];
    } catch { return []; }
  };

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

  const fetchSportSamplesNative = async (): Promise<SportSample[]> => {
    try {
      const SportSamples = (window as any).Capacitor?.Plugins?.SportSamples;
      if (!SportSamples) return [];
      const res = await SportSamples.readSamples({ startDate, endDate });
      const arr: any[] = res?.samples || [];
      return arr
        .filter((s) => s && s.start_time && s.end_time)
        .map((s) => ({
          source_package: String(s.source_package || "unknown"),
          source_name: s.source_name || null,
          start_time: new Date(s.start_time).toISOString(),
          end_time: new Date(s.end_time).toISOString(),
          value_kcal: Number(s.value_kcal) || 0,
          recorded_date: new Date(s.start_time).toISOString().slice(0, 10),
        }))
        .filter((s) => {
          const durationMs = new Date(s.end_time).getTime() - new Date(s.start_time).getTime();
          // Les records "Total calories" sur une journée complète incluent le métabolisme basal :
          // on ne les range pas dans les calories sportives pour éviter un double comptage massif.
          return s.value_kcal > 0 && durationMs > 0 && durationMs < 20 * 60 * 60 * 1000;
        });
    } catch (e) {
      console.warn("[health] SportSamples.readSamples failed", e);
      return [];
    }
  };

  const [weights, fats, boneLean, sportSamples] = await Promise.all([
    fetchSamples("weight"),
    fetchSamples("bodyFat"),
    fetchBoneAndLean(),
    fetchSportSamplesNative(),
  ]);
  const bones = boneLean.bone;
  const leans = boneLean.lean;

  // 1. Composition Corporelle
  data.weight = weights.map((s: any) => ({ value_kg: raw(Number(s.value)), timestamp: s.startDate || s.date }));
  data.bodyFat = fats.map((s: any) => ({ percentage: raw(Number(s.value)), timestamp: s.startDate || s.date }));
  data.boneMass = bones.map((s: any) => ({ value_kg: raw(Number(s.value)), timestamp: s.startDate || s.date }));

  const leanByDay = new Map<string, number>();
  leans.forEach((s: any) => {
    const ts = s.startDate || s.date || "";
    const d = ts.slice(0, 10);
    if (d) leanByDay.set(d, raw(Number(s.value)));
  });

  const weightByDay = new Map((data.weight || []).map((w) => [w.timestamp.slice(0, 10), w]));
  const fatByDay = new Map((data.bodyFat || []).map((f) => [f.timestamp.slice(0, 10), f]));
  const boneByDay = new Map((data.boneMass || []).map((b) => [b.timestamp.slice(0, 10), b]));
  const leanMap = new Map<string, number>();
  const muscleMap = new Map<string, number>();
  const compositionDays = new Set<string>([
    ...Array.from(weightByDay.keys()),
    ...Array.from(leanByDay.keys()),
  ]);
  compositionDays.forEach((d) => {
    const w = weightByDay.get(d);
    const importedLean = leanByDay.get(d);
    const fatEntry = fatByDay.get(d);
    const boneEntry = boneByDay.get(d);
    const computedLean = w && fatEntry
      ? w.value_kg - w.value_kg * (fatEntry.percentage / 100)
      : undefined;
    const leanMass = importedLean ?? computedLean;
    if (leanMass !== undefined && Number.isFinite(leanMass)) {
      const boneVal = boneEntry ? boneEntry.value_kg : 3.8;
      leanMap.set(d, raw(leanMass));
      muscleMap.set(d, raw(Math.max(0, (leanMass - boneVal) * 0.988)));
    }
  });
  data.leanMass = Array.from(leanMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));
  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 2. Calories sportives — un sample par enregistrement Health Connect
  //    avec sa source d'origine (packageName). Le filtrage / dédoublonnage par
  //    source autorisée est fait côté agrégation (sport-calories.ts).
  data.sportSamples = sportSamples;
  const calMap = new Map<string, number>();
  sportSamples.forEach((s) => {
    calMap.set(s.recorded_date, (calMap.get(s.recorded_date) || 0) + s.value_kcal);
  });
  data.activeCalories = Array.from(calMap.entries()).map(([date, val]) => ({
    value_kcal: val, timestamp: date,
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
      // LeanBodyMass reste stocké comme masse maigre uniquement ; la masse
      // musculaire est toujours calculée séparément (jamais copiée depuis lean_mass).
      data.leanMass?.forEach((l) => {
        const d = l.timestamp.slice(0, 10);
        const cur = byDate.get(d) || { ts: l.timestamp };
        if (cur.lean === undefined) cur.lean = l.value_kg;
        byDate.set(d, cur);
      });
      // active_calories_kcal n'est plus écrit ici : la valeur lissée 7 j est
      // recalculée à partir de sport_activity_samples + sport_allowed_sources
      // après l'upsert des samples (voir bloc Sport ci-dessous).

      // Upsert atomique grâce à la contrainte UNIQUE (user_id, recorded_at)
      const rows = Array.from(byDate.entries()).map(([date, vals]) => ({
        user_id: userId,
        recorded_at: date,
        weight_kg: vals.weight ?? null,
        body_fat_percent: vals.fat ?? null,
        muscle_mass_kg: vals.muscle ?? null,
        bone_mass_kg: vals.bone ?? null,
        lean_mass_kg: vals.lean ?? null,
        source: "health_connect",
      }));

      if (rows.length > 0) {
        await supabase
          .from("body_composition")
          .upsert(rows, { onConflict: "user_id,recorded_at" });
      }

      synced.push("Composition");
    }

    // ── Sync Calories sportives : stocke les samples bruts + recalcule la
    //    valeur lissée 7 j filtrée par sport_allowed_sources. ──
    if (prefs.sync_calories && data.sportSamples?.length) {
      const sampleRows = data.sportSamples.map((s) => ({
        user_id: userId,
        source_package: s.source_package,
        source_name: s.source_name,
        start_time: s.start_time,
        end_time: s.end_time,
        value_kcal: s.value_kcal,
        recorded_date: s.recorded_date,
      }));
      await supabase
        .from("sport_activity_samples")
        .upsert(sampleRows, { onConflict: "user_id,source_package,start_time,end_time" });

      // Récupère sources autorisées + recompute moyenne lissée
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      const allowed = (profile as any)?.sport_allowed_sources || [];
      const smoothed = allowed.length
        ? await computeSmoothedDailySport(userId, allowed)
        : 0;

      await supabase.from("body_composition").upsert({
        user_id: userId,
        recorded_at: today,
        active_calories_kcal: smoothed,
        source: "health_connect",
      }, { onConflict: "user_id,recorded_at" });

      // Recalcul des objectifs Mode Scientifique avec la moyenne lissée
      if (profile && (profile as any).goals_mode === "scientific") {
        const p = profile as any;
        const age = p.date_of_birth
          ? differenceInYears(new Date(), new Date(p.date_of_birth))
          : p.age || 30;
        const currentGoals = p.goals || {};
        const { data: lastBody } = await supabase
          .from("body_composition")
          .select("weight_kg, body_fat_percent")
          .eq("user_id", userId)
          .order("recorded_at", { ascending: false })
          .limit(30);
        const lastW = (lastBody || []).find((r: any) => r.weight_kg != null)?.weight_kg
          ?? p.goals?.weight_kg ?? 70;
        const lastBf = (lastBody || []).find((r: any) => r.body_fat_percent != null)?.body_fat_percent ?? null;

        const recomputed = calculateScientificGoals({
          weight_kg: Number(lastW),
          height_cm: Number(p.height_cm) || 175,
          age,
          gender: p.gender || "male",
          activity_level: p.activity_level || "moderate",
          goal_type: currentGoals.goalType || "maintain",
          bmr_method: p.bmr_method || "mifflin",
          body_fat_percent: lastBf,
          morphotype: p.morphotype,
          mass_gain_phase: p.mass_gain_phase,
          sport_daily_avg: smoothed,
          phase_adjust_mode: (p.phase_adjust_mode as any) || "percent",
          phase_adjust_value: p.phase_adjust_value ?? null,
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
      }

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
