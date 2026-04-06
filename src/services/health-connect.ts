/**
 * Health Connect Bridge
 * * Uses @capgo/capacitor-health for weight, steps, calories, sleep.
 * SkeletalMuscleMass and BodyFat use readSamples when supported.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────
export interface HealthConnectWeight {
  value_kg: number;
  timestamp: string;
}

export interface HealthConnectBodyFat {
  percentage: number;
  timestamp: string;
}

export interface HealthConnectLeanBodyMass {
  value_kg: number;
  timestamp: string;
}

export interface HealthConnectSkeletalMuscleMass {
  value_kg: number;
  timestamp: string;
}

export interface HealthConnectSleep {
  start_time: string;
  end_time: string;
  duration_minutes: number;
  stages?: { stage: string; start: string; end: string }[];
}

export interface HealthConnectActiveCalories {
  value_kcal: number;
  start_time: string;
  end_time: string;
}

export interface HealthConnectSteps {
  count: number;
  start_time: string;
  end_time: string;
}

export interface HealthConnectData {
  weight?: HealthConnectWeight[];
  bodyFat?: HealthConnectBodyFat[];
  leanBodyMass?: HealthConnectLeanBodyMass[];
  skeletalMuscleMass?: HealthConnectSkeletalMuscleMass[];
  sleep?: HealthConnectSleep[];
  activeCalories?: HealthConnectActiveCalories[];
  steps?: HealthConnectSteps[];
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

// Types de données demandés à Android
const HEALTH_READ_TYPES = ["steps", "weight", "calories", "sleep", "bodyFat", "skeletalMuscleMass"] as const;

const EMPTY_AUTH_STATUS = {
  readAuthorized: [] as string[],
  readDenied: [] as string[],
  writeAuthorized: [] as string[],
  writeDenied: [] as string[],
};

function hasGrantedAllPermissions(status: typeof EMPTY_AUTH_STATUS | null | undefined): boolean {
  const readAuthorized = Array.isArray(status?.readAuthorized) ? status.readAuthorized : [];
  return readAuthorized.includes("weight") || readAuthorized.includes("steps");
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
  if (!Capacitor || !Capacitor.Plugins.Health) {
    console.log("[HealthConnect] Plugin not found in Capacitor.Plugins");
    return null;
  }
  return Capacitor.Plugins.Health;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) return false;
    const result = await withTimeout(Health.isAvailable(), 4000, { available: false });
    return result.available === true;
  } catch (e) {
    console.error("[HealthConnect] isAvailable error:", e);
    return false;
  }
}

export async function checkHealthPermissions(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) return false;
    const status = await withTimeout(
      Health.checkAuthorization({
        read: [...HEALTH_READ_TYPES],
        write: [],
      }),
      4000,
      null
    );
    if (!status) return false;
    return hasGrantedAllPermissions(status);
  } catch (e) {
    console.error("[HealthConnect] checkAuthorization error:", e);
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) {
      alert("Plugin Health non trouvé");
      return false;
    }
    const authResult = await Health.requestAuthorization({
      read: [...HEALTH_READ_TYPES],
      write: [],
    });
    return hasGrantedAllPermissions(authResult);
  } catch (e: any) {
    alert("Erreur requestAuthorization: " + e.message);
    return false;
  }
}

export function onAppResumeRecheck(callback: () => void): (() => void) | null {
  if (typeof document === "undefined") return null;
  const handleVisibility = () => {
    if (document.visibilityState === "visible") callback();
  };
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
      const { samples } = await Health.readSamples({
        dataType: type,
        startDate,
        endDate,
        limit: 500,
      });
      return samples || [];
    } catch {
      return [];
    }
  };

  const weightSamples = await fetchType("weight");
  if (weightSamples.length) {
    data.weight = weightSamples.map((s: any) => ({
      value_kg: s.value,
      timestamp: s.startDate || s.date,
    }));
  }

  const calorieSamples = await fetchType("calories");
  if (calorieSamples.length) {
    data.activeCalories = calorieSamples.map((s: any) => ({
      value_kcal: s.value,
      start_time: s.startDate,
      end_time: s.endDate || s.startDate,
    }));
  }

  const stepSamples = await fetchType("steps");
  if (stepSamples.length) {
    data.steps = stepSamples.map((s: any) => ({
      count: s.value,
      start_time: s.startDate,
      end_time: s.endDate || s.startDate,
    }));
  }

  const muscleSamples = await fetchType("skeletalMuscleMass");
  if (muscleSamples.length) {
    data.skeletalMuscleMass = muscleSamples.map((s: any) => ({
      value_kg: s.value,
      timestamp: s.startDate || s.date,
    }));
  }

  const fatSamples = await fetchType("bodyFat");
  if (fatSamples.length) {
    data.bodyFat = fatSamples.map((s: any) => ({
      percentage: s.value,
      timestamp: s.startDate || s.date,
    }));
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
      // On trie pour avoir les plus récents en dernier (ils écraseront les plus vieux du même jour)
      const sortedWeight = [...data.weight].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const w of sortedWeight) {
        const recordedAt = w.timestamp.slice(0, 10);
        
        const bodyFatForDate = data.bodyFat?.find((bf) => bf.timestamp.slice(0, 10) === recordedAt);
        const skeletalMassForDate = data.skeletalMuscleMass?.find((sm) => sm.timestamp.slice(0, 10) === recordedAt);

        const record = {
          user_id: userId,
          recorded_at: recordedAt,
          weight_kg: w.value_kg,
          body_fat_percent: bodyFatForDate?.percentage ?? null,
          muscle_mass_kg: skeletalMassForDate?.value_kg ?? null,
          source: "health_connect",
        };

        // Utilisation de upsert pour forcer la mise à jour si la ligne existe déjà
        const { error } = await supabase
          .from("body_composition")
          .upsert(record, { onConflict: 'user_id,recorded_at' });

        if (error) throw error;
      }
      synced.push("Poids & Composition");

      // Mise à jour du profil principal avec la valeur la plus récente
      const latest = sortedWeight[sortedWeight.length - 1];
      if (latest) {
        await supabase
          .from("profiles")
          .update({ weight_kg: latest.value_kg })
          .eq("user_id", userId);
      }
    } catch (e: any) {
      errors.push(`Poids: ${e.message}`);
    }
  }

  return { synced, errors };
}
