import { supabase } from "@/integrations/supabase/client";

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

// Types de lecture simplifiés pour Xiaomi/Android 14
const HEALTH_READ_TYPES = [
  "steps",
  "weight",
  "bodyFat",
  "activeEnergyBurned",
  "boneMass"
];

const round1 = (v: number) => Math.round(v * 10) / 10;

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
    // On vérifie si au moins le poids est autorisé
    return Array.isArray(res?.readAuthorized) && res.readAuthorized.includes("weight");
  } catch { return false; }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const Health = await getHealthPlugin();
  if (!Health) return false;
  try {
    const res = await Health.requestAuthorization({ read: HEALTH_READ_TYPES, write: [] });
    return Array.isArray(res?.readAuthorized) && res.readAuthorized.includes("weight");
  } catch { return false; }
}

// ── LECTURE DES DONNÉES ──────────────────────────────────────────
export async function readNativeHealthData(days = 7): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const data: HealthConnectData = { weight: [], bodyFat: [], muscle: [], boneMass: [], activeCalories: [] };

  const fetchSamples = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate });
      return samples || [];
    } catch { return []; }
  };

  const [weights, fats, bones, activeEnergy, steps] = await Promise.all([
    fetchSamples("weight"),
    fetchSamples("bodyFat"),
    fetchSamples("boneMass"),
    fetchSamples("activeEnergyBurned"),
    fetchSamples("steps")
  ]);

  // 1. Poids, Gras et Os
  data.weight = weights.map((s: any) => ({ value_kg: round1(Number(s.value)), timestamp: s.startDate || s.date }));
  data.bodyFat = fats.map((s: any) => ({ percentage: round1(Number(s.value)), timestamp: s.startDate || s.date }));
  data.boneMass = bones.map((s: any) => ({ value_kg: round1(Number(s.value)), timestamp: s.startDate || s.date }));

  // 2. Calcul du Muscle (Reconstruction)
  const muscleMap = new Map();
  data.weight.forEach((w) => {
    const d = w.timestamp.slice(0, 10);
    const fatEntry = data.bodyFat?.find(f => f.timestamp.startsWith(d));
    const boneEntry = data.boneMass?.find(b => b.timestamp.startsWith(d));

    if (fatEntry) {
      const fatKg = w.value_kg * (fatEntry.percentage / 100);
      const leanMass = w.value_kg - fatKg;
      const boneVal = boneEntry ? boneEntry.value_kg : 3.8; // Fallback si pas d'os
      const organResidual = w.value_kg * 0.01;
      muscleMap.set(d, round1(leanMass - boneVal - organResidual));
    }
  });
  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 3. Calories Sport & Pas (Le cumul forcé)
  const calMap = new Map();

  activeEnergy.forEach((s: any) => {
    const d = (s.startDate || s.date || "").slice(0, 10);
    if (d) calMap.set(d, (calMap.get(d) || 0) + Number(s.value || 0));
  });

  steps.forEach((s: any) => {
    const d = (s.startDate || s.date || "").slice(0, 10);
    if (d) {
      const stepKcal = Number(s.value || 0) * 0.04;
      calMap.set(d, (calMap.get(d) || 0) + stepKcal);
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

    // Sync Composition (Poids, Gras, Muscle)
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
      synced.push("Poids & Composition");
    }

    // Sync Calories (vers sport_calories_daily)
    if (prefs.sync_calories && data.activeCalories?.length) {
      const todayEntry = data.activeCalories.find(c => c.timestamp.startsWith(today));
      const val = todayEntry ? todayEntry.value_kcal : 0;
      
      await supabase.from("profiles").update({ sport_calories_daily: val }).eq("user_id", userId);
      synced.push("Calories Sport");
    }
  } catch (e: any) { 
    errors.push(e.message); 
  }

  return { synced, errors };
}

// ── PRÉFÉRENCES & UTILITAIRES ───────────────────────────────────
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

export function onAppResumeRecheck(callback: () => void): (() => void) | null {
  if (typeof document === "undefined") return null;
  const handleVisibility = () => { if (document.visibilityState === "visible") callback(); };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}
