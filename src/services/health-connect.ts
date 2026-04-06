/**
 * Health Connect Bridge - Version Précision Scientifique
 * Calcule la masse musculaire via : LBM - BoneMass - (Weight * 0.01)
 */

import { supabase } from "@/integrations/supabase/client";

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
  sync_weight: false, sync_body_fat: false, sync_sleep: false, sync_calories: false,
};

const HEALTH_READ_TYPES = [
  "steps", "weight", "calories", "sleep", "bodyFat", 
  "skeletalMuscleMass", "leanBodyMass", "activeEnergyBurned", "boneMass"
] as const;

const round1 = (v: number) => Math.round(v * 10) / 10;

// ── Preferences ────────────────────────────────────────────────
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

// ── Native Bridge ──────────────────────────────────────────────
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
  const res = await Health.checkAuthorization({ read: [...HEALTH_READ_TYPES], write: [] });
  const authorized = Array.isArray(res?.readAuthorized) ? res.readAuthorized : [];
  return authorized.includes("weight");
}

export async function requestHealthPermissions(): Promise<boolean> {
  const Health = await getHealthPlugin();
  if (!Health) return false;
  const res = await Health.requestAuthorization({ read: [...HEALTH_READ_TYPES], write: [] });
  return Array.isArray(res?.readAuthorized) && res.readAuthorized.includes("weight");
}

// ── Lecture Native ───────────────────────────────────────────
export async function readNativeHealthData(days = 7): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const data: HealthConnectData = { weight: [], bodyFat: [], muscle: [], activeCalories: [] };

  const fetch = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate });
      return samples || [];
    } catch { return []; }
  };

  const w = await fetch("weight");
  data.weight = w.map((s: any) => ({ value_kg: round1(s.value), timestamp: s.startDate || s.date }));
  
  const f = await fetch("bodyFat");
  data.bodyFat = f.map((s: any) => ({ percentage: round1(s.value), timestamp: s.startDate || s.date }));

  const lean = await fetch("leanBodyMass"); 
  const bones = await fetch("boneMass");
  
  const muscleMap = new Map();

  lean.forEach((l: any) => {
    const d = (l.startDate || l.date).slice(0, 10);
    const weightEntry = data.weight?.find(we => we.timestamp.slice(0, 10) === d);
    const boneEntry = bones.find((b: any) => (b.startDate || b.date).slice(0, 10) === d);
    
    const weightVal = weightEntry ? weightEntry.value_kg : 85.7;
    const boneVal = boneEntry ? boneEntry.value : 3.8;

    // FORMULE PRÉCISE : Masse Maigre - Masse Osseuse - (1.1% du poids pour les tissus mous non-musculaires)
    const muscleVal = l.value - boneVal - (weightVal * 0.011);
    
    muscleMap.set(d, { value_kg: round1(muscleVal), timestamp: l.startDate || l.date });
  });

  data.muscle = Array.from(muscleMap.values());

  const energy = await fetch("activeEnergyBurned");
  const calMap = new Map();
  energy.forEach((s: any) => {
    const d = s.startDate.slice(0, 10);
    calMap.set(d, (calMap.get(d) || 0) + (s.value || 0));
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
    if (prefs.sync_weight && data.weight?.length) {
      const sortedW = [...data.weight].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      for (const w of sortedW) {
        const date = w.timestamp.slice(0, 10);
        const fat = data.bodyFat?.find(f => f.timestamp.slice(0, 10) === date);
        const mus = data.muscle?.find(m => m.timestamp.slice(0, 10) === date);

        await supabase.from("body_composition").delete().eq("user_id", userId).eq("recorded_at", date);
        await supabase.from("body_composition").insert({
          user_id: userId, recorded_at: date, weight_kg: w.value_kg,
          body_fat_percent: fat?.percentage ?? null, muscle_mass_kg: mus?.value_kg ?? null,
          source: "health_connect"
        });
      }

      const last = sortedW[sortedW.length - 1];
      const d = last.timestamp.slice(0, 10);
      await supabase.from("profiles").update({ 
        weight_kg: last.value_kg,
        body_fat_percent: data.bodyFat?.find(f => f.timestamp.slice(0, 10) === d)?.percentage ?? null,
        muscle_mass_kg: data.muscle?.find(m => m.timestamp.slice(0, 10) === d)?.value_kg ?? null
      }).eq("user_id", userId);
      synced.push("Composition");
    }

    if (prefs.sync_calories && data.activeCalories?.length) {
      const today = new Date().toISOString().slice(0, 10);
      const todayCals = data.activeCalories.find(c => c.timestamp.slice(0, 10) === today)?.value_kcal || 0;
      
      if (todayCals > 0) {
        await supabase.from("profiles").update({ sport_calories_day: todayCals }).eq("user_id", userId);
        synced.push("Calories Sport");
      }
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
