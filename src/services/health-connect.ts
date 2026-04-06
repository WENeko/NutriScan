/**
 * Health Connect Bridge - Version Ultra-Complète
 * Gère Poids, Gras, Muscle (via Skeletal ou Lean) et Calories Sport.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────
export interface HealthConnectWeight { value_kg: number; timestamp: string; }
export interface HealthConnectBodyFat { percentage: number; timestamp: string; }
export interface HealthConnectMuscle { value_kg: number; timestamp: string; }
export interface HealthConnectCalories { value_kcal: number; timestamp: string; }

export interface HealthConnectData {
  weight?: HealthConnectWeight[];
  bodyFat?: HealthConnectBodyFat[];
  muscle?: HealthConnectMuscle[]; // Fusion de Skeletal et Lean
  activeCalories?: HealthConnectCalories[];
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

const HEALTH_READ_TYPES = ["steps", "weight", "calories", "sleep", "bodyFat", "skeletalMuscleMass", "leanBodyMass"] as const;

// ── Helpers ──────────────────────────────────────────────────
const round1 = (v: number) => Math.round(v * 10) / 10;

function hasGrantedPermissions(status: any): boolean {
  const authorized = Array.isArray(status?.readAuthorized) ? status.readAuthorized : [];
  return authorized.includes("weight") || authorized.includes("bodyFat");
}

// ── Bridge Logic ──────────────────────────────────────────────
async function getHealthPlugin() {
  const { Capacitor } = window as any;
  return Capacitor?.Plugins?.Health || null;
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  const Health = await getHealthPlugin();
  if (!Health) return false;
  try {
    const res = await Health.isAvailable();
    return res.available === true;
  } catch { return false; }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const Health = await getHealthPlugin();
  if (!Health) return false;
  try {
    const res = await Health.requestAuthorization({ read: [...HEALTH_READ_TYPES], write: [] });
    return hasGrantedPermissions(res);
  } catch { return false; }
}

// ── Lecture Native ───────────────────────────────────────────
export async function readNativeHealthData(days = 30): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const data: HealthConnectData = {};

  const fetch = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate, limit: 100 });
      return samples || [];
    } catch { return []; }
  };

  // 1. Poids
  const wSamples = await fetch("weight");
  data.weight = wSamples.map((s: any) => ({ value_kg: round1(s.value), timestamp: s.startDate || s.date }));

  // 2. Masse Grasse
  const fSamples = await fetch("bodyFat");
  data.bodyFat = fSamples.map((s: any) => ({ percentage: round1(s.value), timestamp: s.startDate || s.date }));

  // 3. Muscle (On check Skeletal ET Lean Body Mass)
  const skeletal = await fetch("skeletalMuscleMass");
  const lean = await fetch("leanBodyMass");
  const muscleMap = new Map();
  
  // On remplit avec le lean d'abord, le skeletal écrasera si présent (plus précis)
  [...lean, ...skeletal].forEach((s: any) => {
    const d = (s.startDate || s.date).slice(0, 10);
    muscleMap.set(d, { value_kg: round1(s.value), timestamp: s.startDate || s.date });
  });
  data.muscle = Array.from(muscleMap.values());

  // 4. Calories Sport
  const cSamples = await fetch("calories");
  data.activeCalories = cSamples.map((s: any) => ({ value_kcal: Math.round(s.value), timestamp: s.startDate }));

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

  // SYNC COMPOSITION CORPORELLE
  if (prefs.sync_weight && data.weight?.length) {
    try {
      const sortedW = [...data.weight].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      for (const w of sortedW) {
        const date = w.timestamp.slice(0, 10);
        const fat = data.bodyFat?.find(f => f.timestamp.slice(0, 10) === date);
        const mus = data.muscle?.find(m => m.timestamp.slice(0, 10) === date);

        const record = {
          user_id: userId,
          recorded_at: date,
          weight_kg: w.value_kg,
          body_fat_percent: fat?.percentage ?? null,
          muscle_mass_kg: mus?.value_kg ?? null,
          source: "health_connect"
        };

        await supabase.from("body_composition").delete().eq("user_id", userId).eq("recorded_at", date);
        await supabase.from("body_composition").insert(record);
      }
      synced.push("Composition");

      // Update Profil Principal
      const last = sortedW[sortedW.length - 1];
      const d = last.timestamp.slice(0, 10);
      await supabase.from("profiles").update({ 
        weight_kg: last.value_kg,
        body_fat_percent: data.bodyFat?.find(f => f.timestamp.slice(0, 10) === d)?.percentage ?? null,
        muscle_mass_kg: data.muscle?.find(m => m.timestamp.slice(0, 10) === d)?.value_kg ?? null
      }).eq("user_id", userId);
      
    } catch (e: any) { errors.push(`Comp: ${e.message}`); }
  }

  // SYNC CALORIES SPORT
  if (prefs.sync_calories && data.activeCalories?.length) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const dailyCals = data.activeCalories
        .filter(c => c.timestamp.slice(0, 10) === today)
        .reduce((sum, curr) => sum + curr.value_kcal, 0);

      if (dailyCals > 0) {
        await supabase.from("profiles").update({ sport_calories_day: dailyCals }).eq("user_id", userId);
        synced.push("Calories Sport");
      }
    } catch (e: any) { errors.push(`Calories: ${e.message}`); }
  }

  return { synced, errors };
}
  
