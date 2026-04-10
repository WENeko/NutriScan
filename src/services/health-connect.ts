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

// Stratégie du filet large : on demande tout ce qui ressemble à des calories
const HEALTH_READ_TYPES = [
  "steps",
  "weight",
  "bodyFat",
  "boneMass",
  "calories",
  "activeEnergyBurned",
  "totalEnergyBurned"
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
  const today = new Date().toISOString().slice(0, 10);
  
  const data: HealthConnectData = { weight: [], bodyFat: [], muscle: [], boneMass: [], activeCalories: [] };

  const fetchSamples = async (type: string) => {
    try {
      const { samples } = await Health.readSamples({ dataType: type, startDate, endDate });
      return samples || [];
    } catch { return []; }
  };

  // On lance toutes les lectures en parallèle
  const [weights, fats, bones, activeEnergy, totalEnergy, legacyCals, steps] = await Promise.all([
    fetchSamples("weight"),
    fetchSamples("bodyFat"),
    fetchSamples("boneMass"),
    fetchSamples("activeEnergyBurned"),
    fetchSamples("totalEnergyBurned"),
    fetchSamples("calories"),
    fetchSamples("steps")
  ]);

  // 1. Composition Corporelle (Ok d'après ton test)
  data.weight = weights.map((s: any) => ({ value_kg: round1(Number(s.value)), timestamp: s.startDate || s.date }));
  data.bodyFat = fats.map((s: any) => ({ percentage: round1(Number(s.value)), timestamp: s.startDate || s.date }));
  data.boneMass = bones.map((s: any) => ({ value_kg: round1(Number(s.value)), timestamp: s.startDate || s.date }));

  // Calcul Muscle
  const muscleMap = new Map();
  data.weight.forEach((w) => {
    const d = w.timestamp.slice(0, 10);
    const fatEntry = data.bodyFat?.find(f => f.timestamp.startsWith(d));
    const boneEntry = data.boneMass?.find(b => b.timestamp.startsWith(d));
    if (fatEntry) {
      const fatKg = w.value_kg * (fatEntry.percentage / 100);
      const leanMass = w.value_kg - fatKg;
      const boneVal = boneEntry ? boneEntry.value_kg : 3.8;
      muscleMap.set(d, round1(leanMass - boneVal - (w.value_kg * 0.01)));
    }
  });
  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 2. LOGIQUE CALORIES (Le Filet Dérivant)
  const calMap = new Map();

  // On fusionne TOUTES les sources de calories possibles
  const allEnergySamples = [...activeEnergy, ...totalEnergy, ...legacyCals];
  
  allEnergySamples.forEach((s: any) => {
    const d = (s.startDate || s.date || "").slice(0, 10);
    const val = Number(s.value || 0);
    if (!d || val <= 0) return;

    // Si la valeur est > 1200 d'un coup, c'est probablement le total journalier (BMR inclus)
    // On ne garde que le surplus ou on plafonne pour éviter les erreurs
    const currentMax = calMap.get(d) || 0;
    if (val > 1200) {
      const estimatedActive = Math.max(0, val - 1800); // On retire le métabolisme de base moyen
      calMap.set(d, currentMax + estimatedActive);
    } else {
      calMap.set(d, currentMax + val);
    }
  });

  // Sécurité Pas : Si après les calories on est toujours à 0, on utilise les pas
  steps.forEach((s: any) => {
    const d = (s.startDate || s.date || "").slice(0, 10);
    if (d && (!calMap.get(d) || calMap.get(d) === 0)) {
      const stepKcal = Number(s.value || 0) * 0.04;
      calMap.set(d, stepKcal);
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

    if (prefs.sync_calories && data.activeCalories?.length) {
      // On cherche la donnée d'aujourd'hui
      const todayEntry = data.activeCalories.find(c => c.timestamp.startsWith(today));
      // Si pas aujourd'hui, on prend la dernière valeur connue
      const val = todayEntry ? todayEntry.value_kcal : 0;
      
      await supabase.from("profiles").update({ sport_calories_daily: val }).eq("user_id", userId);
      synced.push("Calories Sport");
    }
  } catch (e: any) { 
    errors.push(e.message); 
  }

  return { synced, errors };
}

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
