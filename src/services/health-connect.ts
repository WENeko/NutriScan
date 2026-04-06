/**
 * Health Connect Bridge - Version "Calculateur de Secours"
 * Force le calcul du muscle si les données sources sont manquantes dans Santé Connect.
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
] as const;

// Utilitaire d'arrondi à une décimale
const round1 = (v: number) => Math.round(v * 10) / 10;

// ── Gestion des Préférences (Exports requis pour le Build) ──────
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

// ── Bridge Natif (Capacitor) ───────────────────────────────────
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
    const authorized = Array.isArray(res?.readAuthorized) ? res.readAuthorized : [];
    return authorized.includes("weight");
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const Health = await getHealthPlugin();
  if (!Health) return false;
  try {
    const res = await Health.requestAuthorization({ read: [...HEALTH_READ_TYPES], write: [] });
    const authorized = Array.isArray(res?.readAuthorized) ? res.readAuthorized : [];
    return authorized.includes("weight");
  } catch {
    return false;
  }
}

// ── Lecture & Moteur Biométrique ───────────────────────────────
export async function readNativeHealthData(days = 7): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const data: HealthConnectData = { weight: [], bodyFat: [], muscle: [], activeCalories: [] };

  // Récupération du profil pour l'âge et le sexe
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

  const weights = await fetch("weight");
  const fats = await fetch("bodyFat");
  const energy = await fetch("activeEnergyBurned");

  // 1. Stockage Poids & Gras (Nettoyage immédiat des arrondis)
  data.weight = weights.map((s: any) => ({ value_kg: round1(Number(s.value)), timestamp: s.startDate || s.date }));
  data.bodyFat = fats.map((s: any) => ({ percentage: round1(Number(s.value)), timestamp: s.startDate || s.date }));

  const muscleMap = new Map();
  const calMap = new Map();

  // 2. RECONSTRUCTION DU MUSCLE (On calcule ce que la balance n'envoie pas)
  data.weight.forEach((w) => {
    const d = w.timestamp.slice(0, 10);
    const fatEntry = data.bodyFat?.find(f => f.timestamp.startsWith(d));

    if (fatEntry) {
      // Masse Maigre = Poids - Masse Grasse
      const fatKg = w.value_kg * (fatEntry.percentage / 100);
      const leanMass = w.value_kg - fatKg;

      // Masse Osseuse estimée (Standard 3.2 H / 2.4 F + 1% du poids corporel)
      const boneVal = isFemale ? 2.4 + (w.value_kg * 0.01) : 3.2 + (w.value_kg * 0.01);
      
      // Masse Organes/Fluides (ajustée selon l'âge)
      const ageAdj = userAge > 30 ? (userAge - 30) * 0.0001 : 0;
      const organFactor = isFemale ? (0.0145 - ageAdj) : (0.0125 - ageAdj);

      const calculatedMuscle = leanMass - boneVal - (w.value_kg * organFactor);
      muscleMap.set(d, round1(calculatedMuscle));
    }
  });

  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 3. Somme cumulative des calories
  energy.forEach((s: any) => {
    const d = (s.startDate || s.date).slice(0, 10);
    calMap.set(d, (calMap.get(d) || 0) + Number(s.value || 0));
  });

  data.activeCalories = Array.from(calMap.entries()).map(([date, val]) => ({ 
    value_kcal: Math.round(val), 
    timestamp: date 
  }));

  return data;
}

// ── Synchronisation Supabase ──────────────────────────────────
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
      // On prend la mesure la plus récente
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
  } catch (e: any) {
    errors.push(e.message);
  }

  return { synced, errors };
}

export function onAppResumeRecheck(callback: () => void): (() => void) | null {
  if (typeof document === "undefined") return null;
  const handleVisibility = () => { if (document.visibilityState === "visible") callback(); };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}
