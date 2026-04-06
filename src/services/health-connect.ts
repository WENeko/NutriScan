/**
 * Health Connect Bridge - Final Version
 * Handles Weight, Fat %, and multiple Muscle mass types with 1-decimal rounding.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────
export interface HealthConnectWeight { value_kg: number; timestamp: string; }
export interface HealthConnectBodyFat { percentage: number; timestamp: string; }
export interface HealthConnectSkeletalMuscleMass { value_kg: number; timestamp: string; }
export interface HealthConnectLeanBodyMass { value_kg: number; timestamp: string; }

export interface HealthConnectData {
  weight?: HealthConnectWeight[];
  bodyFat?: HealthConnectBodyFat[];
  skeletalMuscleMass?: HealthConnectSkeletalMuscleMass[];
  leanBodyMass?: HealthConnectLeanBodyMass[];
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

// On demande tout ce qui touche à la composition corporelle
const HEALTH_READ_TYPES = ["steps", "weight", "calories", "sleep", "bodyFat", "skeletalMuscleMass", "leanBodyMass"] as const;

// ── Helpers ──────────────────────────────────────────────────
const roundTo1 = (val: number) => Math.round(val * 10) / 10;

function hasGrantedAllPermissions(status: any): boolean {
  const readAuthorized = Array.isArray(status?.readAuthorized) ? status.readAuthorized : [];
  return readAuthorized.includes("weight") || readAuthorized.includes("bodyFat");
}

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

// ── Native bridge ──────────────────────────────────────────────
async function getHealthPlugin(): Promise<any> {
  const { Capacitor } = window as any;
  return Capacitor?.Plugins?.Health || null;
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) return false;
    const result = await Health.isAvailable();
    return result.available === true;
  } catch { return false; }
}

export async function checkHealthPermissions(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) return false;
    const status = await Health.checkAuthorization({ read: [...HEALTH_READ_TYPES], write: [] });
    return hasGrantedAllPermissions(status);
  } catch { return false; }
}

export async function requestHealthPermissions(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) return false;
    const authResult = await Health.requestAuthorization({ read: [...HEALTH_READ_TYPES], write: [] });
    return hasGrantedAllPermissions(authResult);
  } catch (e: any) {
    alert("Erreur permissions: " + e.message);
    return false;
  }
}

export function onAppResumeRecheck(callback: () => void): (() => void) | null {
  if (typeof document === "undefined") return null;
  const handleVisibility = () => { if (document.visibilityState === "visible") callback(); };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}

// ── Read from native Health Connect ────────────────────────────
export async function readNativeHealthData(days = 30): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const data: HealthConnectData = {};

  const fetchType = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate, limit: 100 });
      return samples || [];
    } catch { return []; }
  };

  const weightSamples = await fetchType("weight");
  if (weightSamples.length) {
    data.weight = weightSamples.map((s: any) => ({ value_kg: roundTo1(s.value), timestamp: s.startDate || s.date }));
  }

  const fatSamples = await fetchType("bodyFat");
  if (fatSamples.length) {
    data.bodyFat = fatSamples.map((s: any) => ({ percentage: roundTo1(s.value), timestamp: s.startDate || s.date }));
  }

  // On récupère les deux types de muscles possibles
  const skeletalSamples = await fetchType("skeletalMuscleMass");
  if (skeletalSamples.length) {
    data.skeletalMuscleMass = skeletalSamples.map((s: any) => ({ value_kg: roundTo1(s.value), timestamp: s.startDate || s.date }));
  }

  const leanSamples = await fetchType("leanBodyMass");
  if (leanSamples.length) {
    data.leanBodyMass = leanSamples.map((s: any) => ({ value_kg: roundTo1(s.value), timestamp: s.startDate || s.date }));
  }

  return data;
}

// ── Sync function ──────────────────────────────────────────────
export async function syncHealthData(
  userId: string,
  data: HealthConnectData,
  prefs: HealthConnectPreferences
): Promise<{ synced: string[]; errors: string[] }> {
  const synced: string[] = [];
  const errors: string[] = [];

  if (prefs.sync_weight && data.weight?.length) {
    try {
      const sortedWeight = [...data.weight].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      for (const w of sortedWeight) {
        const recordedAt = w.timestamp.slice(0, 10);
        
        const fat = data.bodyFat?.find((bf) => bf.timestamp.slice(0, 10) === recordedAt);
        // On prend le skeletal muscle en priorité, sinon le lean body mass
        const muscle = data.skeletalMuscleMass?.find((sm) => sm.timestamp.slice(0, 10) === recordedAt) 
                    || data.leanBodyMass?.find((lm) => lm.timestamp.slice(0, 10) === recordedAt);

        const record = {
          user_id: userId,
          recorded_at: recordedAt,
          weight_kg: w.value_kg,
          body_fat_percent: fat?.percentage ?? null,
          muscle_mass_kg: muscle?.value_kg ?? null,
          source: "health_connect",
        };

        await supabase.from("body_composition").delete().eq("user_id", userId).eq("recorded_at", recordedAt);
        const { error: insErr } = await supabase.from("body_composition").insert(record);
        if (insErr) throw insErr;
      }
      synced.push("Composition Corporelle");

      // Mise à jour du profil final
      const latestW = sortedWeight[sortedWeight.length - 1];
      if (latestW) {
        const date = latestW.timestamp.slice(0, 10);
        const latestF = data.bodyFat?.find(f => f.timestamp.slice(0, 10) === date);
        const latestM = data.skeletalMuscleMass?.find(m => m.timestamp.slice(0, 10) === date)
                     || data.leanBodyMass?.find(lm => lm.timestamp.slice(0, 10) === date);

        await supabase.from("profiles").update({ 
          weight_kg: latestW.value_kg,
          body_fat_percent: latestF?.percentage ?? null,
          muscle_mass_kg: latestM?.value_kg ?? null
        }).eq("user_id", userId);
      }
    } catch (e: any) {
      errors.push(`Poids/Composition: ${e.message}`);
    }
  }

  return { synced, errors };
          }
