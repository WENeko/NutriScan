/**
 * Health Connect Bridge - Correctif Poids & Valeurs Zéro
 * Force la récupération du dernier poids exact et sécurise les calculs.
 */

import { supabase } from "@/integrations/supabase/client";

// ... (Garder les interfaces et préférences identiques)
export interface HealthConnectData {
  weight?: { value_kg: number; timestamp: string }[];
  bodyFat?: { percentage: number; timestamp: string }[];
  muscle?: { value_kg: number; timestamp: string }[];
  activeCalories?: { value_kcal: number; timestamp: string }[];
}

export interface HealthConnectPreferences {
  sync_weight: boolean; sync_body_fat: boolean; sync_sleep: boolean; sync_calories: boolean;
}

const DEFAULT_PREFERENCES: HealthConnectPreferences = {
  sync_weight: false, sync_body_fat: false, sync_sleep: false, sync_calories: false,
};

const HEALTH_READ_TYPES = [
  "steps", "weight", "calories", "sleep", "bodyFat", 
  "skeletalMuscleMass", "leanBodyMass", "activeEnergyBurned", "boneMass"
] as const;

const round1 = (v: number) => Math.round(v * 10) / 10;

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
  let age = 30;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("gender, birthday").eq("user_id", user.id).single();
    isFemale = profile?.gender === "female";
    if (profile?.birthday) age = new Date().getFullYear() - new Date(profile.birthday).getFullYear();
  }

  const fetch = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate });
      return samples || [];
    } catch { return []; }
  };

  // 1. Poids : On trie par date pour prendre le plus récent sans calcul parasite
  const weightSamples = await fetch("weight");
  const sortedWeights = [...weightSamples].sort((a, b) => new Date(b.startDate || b.date).getTime() - new Date(a.startDate || a.date).getTime());
  data.weight = sortedWeights.map((s: any) => ({ value_kg: Number(s.value), timestamp: s.startDate || s.date }));
  
  const fats = await fetch("bodyFat");
  data.bodyFat = fats.map((s: any) => ({ percentage: Number(s.value), timestamp: s.startDate || s.date }));

  const leans = await fetch("leanBodyMass"); 
  const bones = await fetch("boneMass");
  const skels = await fetch("skeletalMuscleMass");
  const activeEnergy = await fetch("activeEnergyBurned");

  const muscleMap = new Map();

  // 2. Calcul du Muscle
  leans.forEach((l: any) => {
    const d = (l.startDate || l.date).slice(0, 10);
    const weightVal = data.weight?.find(we => we.timestamp.startsWith(d))?.value_kg || (l.value / 0.85);
    const boneVal = bones.find((b: any) => (b.startDate || b.date).startsWith(d))?.value || (isFemale ? 2.4 + (weightVal * 0.01) : 3.2 + (weightVal * 0.01));
    
    const ageAdjustment = age > 30 ? (age - 30) * 0.0001 : 0;
    const organFactor = isFemale ? (0.0145 - ageAdjustment) : (0.0125 - ageAdjustment);

    // Calcul brut avant arrondi
    const muscleVal = l.value - boneVal - (weightVal * organFactor);
    if (muscleVal > 0) muscleMap.set(d, round1(muscleVal));
  });

  // Fallback si leanBodyMass est vide mais que skeletal existe
  skels.forEach((s: any) => {
    const d = (s.startDate || s.date).slice(0, 10);
    if (!muscleMap.has(d)) muscleMap.set(d, round1(s.value));
  });

  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 3. Calories Sport (Somme stricte)
  const calMap = new Map();
  activeEnergy.forEach((s: any) => {
    const d = (s.startDate || s.date).slice(0, 10);
    calMap.set(d, (calMap.get(d) || 0) + Number(s.value || 0));
  });
  
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
      // On prend le poids le plus récent
      const lastW = data.weight[0]; 
      const d = lastW.timestamp.slice(0, 10);
      const lastFat = data.bodyFat?.find(f => f.timestamp.startsWith(d))?.percentage;
      const lastMus = data.muscle?.find(m => m.timestamp.startsWith(d))?.value_kg;

      await supabase.from("profiles").update({ 
        weight_kg: round1(lastW.value_kg),
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
