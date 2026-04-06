/**
 * Health Connect Bridge - VERSION FINALE TOUT-EN-UN
 * Correction : Arrondis, Muscle calculé et Calories Multi-Sources.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Types & Interfaces ──────────────────────────────────────────
export interface HealthConnectData {
  weight?: { value_kg: number; timestamp: string }[];
  bodyFat?: { percentage: number; timestamp: string }[];
  muscle?: { value_kg: number; timestamp: string }[];
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

const HEALTH_READ_TYPES = [
  "steps",
  "weight",
  "calories",
  "sleep",
  "bodyFat",
  "skeletalMuscleMass",
  "leanBodyMass",
  "activeEnergyBurned",
  "boneMass",
  "basalMetabolicRate"
] as const;

const round1 = (v: number) => Math.round(v * 10) / 10;

// ── Préférences & Permissions ──────────────────────────────────
export function getHealthConnectPreferences(): HealthConnectPreferences {
  try {
    const stored = localStorage.getItem("nutrivibe-health-connect-prefs");
    if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_PREFERENCES };
}

export function setHealthConnectPreferences(prefs: HealthConnectPreferences) {
  localStorage.setItem("nutrivibe-health-connect-prefs", JSON.stringify(prefs));
}

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
    const res = await Health.checkAuthorization({ read: [...HEALTH_READ_TYPES], write: [] });
    return Array.isArray(res?.readAuthorized) && res.readAuthorized.includes("weight");
  } catch { return false; }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const Health = await getHealthPlugin();
  if (!Health) return false;
  try {
    const res = await Health.requestAuthorization({ read: [...HEALTH_READ_TYPES], write: [] });
    return Array.isArray(res?.readAuthorized) && res.readAuthorized.includes("weight");
  } catch { return false; }
}

// ── Lecture & Calculs ──────────────────────────────────────────
export async function readNativeHealthData(days = 7): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const data: HealthConnectData = { weight: [], bodyFat: [], muscle: [], activeCalories: [] };

  const { data: { user } } = await supabase.auth.getUser();
  let isFemale = false;
  let userAge = 30;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("gender, birthday").eq("user_id", user.id).single();
    isFemale = profile?.gender === "female";
    if (profile?.birthday) userAge = new Date().getFullYear() - new Date(profile.birthday).getFullYear();
  }

  const fetch = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate });
      return samples || [];
    } catch { return []; }
  };

  const [weights, fats, activeEnergy, totalEnergy, steps] = await Promise.all([
    fetch("weight"),
    fetch("bodyFat"),
    fetch("activeEnergyBurned"),
    fetch("calories"), // Total calories (BMR + Active)
    fetch("steps")
  ]);

  // 1. Composition Corporelle (OK)
  data.weight = weights.map((s: any) => ({ value_kg: round1(Number(s.value)), timestamp: s.startDate || s.date }));
  data.bodyFat = fats.map((s: any) => ({ percentage: round1(Number(s.value)), timestamp: s.startDate || s.date }));

  const muscleMap = new Map();
  data.weight.forEach((w) => {
    const d = w.timestamp.slice(0, 10);
    const fatEntry = data.bodyFat?.find(f => f.timestamp.startsWith(d));
    if (fatEntry) {
      const fatKg = w.value_kg * (fatEntry.percentage / 100);
      const leanMass = w.value_kg - fatKg;
      const boneVal = isFemale ? 2.4 + (w.value_kg * 0.01) : 3.2 + (w.value_kg * 0.01);
      const ageAdj = userAge > 30 ? (userAge - 30) * 0.0001 : 0;
      const organFactor = isFemale ? (0.0145 - ageAdj) : (0.0125 - ageAdj);
      muscleMap.set(d, round1(leanMass - boneVal - (w.value_kg * organFactor)));
    }
  });
  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 2. Calories Sport (Correction du 0)
  const calMap = new Map();

  // Priorité 1 : Somme de l'énergie brûlée active (Sport explicite)
  activeEnergy.forEach((s: any) => {
    const d = (s.startDate || s.date).slice(0, 10);
    calMap.set(d, (calMap.get(d) || 0) + Number(s.value || 0));
  });

  // Priorité 2 : Si toujours 0, estimation via les pas (0.04 kcal par pas en moyenne)
  if (Array.from(calMap.values()).every(v => v === 0)) {
    steps.forEach((s: any) => {
      const d = (s.startDate || s.date).slice(0, 10);
      const estimatedBurn = Number(s.value || 0) * 0.04;
      calMap.set(d, (calMap.get(d) || 0) + estimatedBurn);
    });
  }

  data.activeCalories = Array.from(calMap.entries()).map(([date, val]) => ({ 
    value_kcal: Math.round(val), 
    timestamp: date 
  }));

  return data;
}

// ── Synchronisation ──────────────────────────────────────────
export async function syncHealthData(
  userId: string,
  data: HealthConnectData,
  prefs: HealthConnectPreferences
): Promise<{ synced: string[]; errors: string[] }> {
  const synced: string[] = [];
  const errors: string[] = [];

  try {
    const today = new Date().toISOString().slice(0, 10);

    if (prefs.sync_weight && data.weight?.length) {
      const sortedW = [...data.weight].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const lastW = sortedW[0];
      const d = lastW.timestamp.slice(0, 10);
      const lastFat = data.bodyFat?.find(f => f.timestamp.startsWith(d))?.percentage;
      const lastMus = data.muscle?.find(m => m.timestamp.startsWith(d))?.value_kg;

      await supabase.from("profiles").update({ 
        weight_kg: lastW.value_kg,
        body_fat_percent: lastFat || null,
        muscle_mass_kg: lastMus || null
      }).eq("user_id", userId);
      synced.push("Composition");
    }

    if (prefs.sync_calories && data.activeCalories?.length) {
      const todayCals = data.activeCalories.find(c => c.timestamp.startsWith(today))?.value_kcal || 0;
      await supabase.from("profiles").update({ sport_calories_day: todayCals }).eq("user_id", userId);
      synced.push("Calories Sport");
    }
  } catch (e: any) { errors.push(e.message); }

  return { synced, errors };
}

export function onAppResumeRecheck(callback: () => void): (() => void) | null {
  if (typeof document === "undefined") return null;
  const handleVisibility = () => { if (document.visibilityState === "visible") callback(); };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}
