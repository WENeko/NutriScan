/**
 * Health Connect Bridge - VERSION FINALE COMPLÈTE
 * Gère la synchronisation biométrique et les autorisations.
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

// ── Gestion des Préférences ────────────────────────────────────
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

// ── Lecture & Calculs Biométriques ──────────────────────────────
export async function readNativeHealthData(days = 7): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const data: HealthConnectData = { weight: [], bodyFat: [], muscle: [], activeCalories: [] };

  // 1. Récupération du profil pour le calcul dynamique
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

  // 2. Acquisition des données
  const weights = await fetch("weight");
  const fats = await fetch("bodyFat");
  const leans = await fetch("leanBodyMass");
  const energy = await fetch("activeEnergyBurned");
  const skeletal = await fetch("skeletalMuscleMass");

  // Traitement Poids & Gras avec arrondi forcé
  data.weight = weights.map((s: any) => ({ value_kg: round1(Number(s.value)), timestamp: s.startDate || s.date }));
  data.bodyFat = fats.map((s: any) => ({ percentage: round1(Number(s.value)), timestamp: s.startDate || s.date }));

  // 3. Calcul du Muscle (Logique Biométrique Avancée)
  const muscleMap = new Map();
  leans.forEach((l: any) => {
    const d = (l.startDate || l.date).slice(0, 10);
    const weightVal = data.weight?.find(we => we.timestamp.startsWith(d))?.value_kg || (Number(l.value) / 0.85);
    
    // Formule biométrique (Masse Maigre - Os - Organes)
    const boneVal = isFemale ? 2.4 + (weightVal * 0.01) : 3.2 + (weightVal * 0.01);
    const ageAdjustment = age > 30 ? (age - 30) * 0.0001 : 0;
    const organFactor = isFemale ? (0.0145 - ageAdjustment) : (0.0125 - ageAdjustment);

    const calculatedMuscle = Number(l.value) - boneVal - (weightVal * organFactor);
    if (calculatedMuscle > 0) muscleMap.set(d, round1(calculatedMuscle));
  });

  // Fallback si la balance écrit directement le muscle squelettique
  skeletal.forEach((s: any) => {
    const d = (s.startDate || s.date).slice(0, 10);
    if (!muscleMap.has(d)) muscleMap.set(d, round1(Number(s.value)));
  });

  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 4. Somme Cumulative des Calories Actives
  const calMap = new Map();
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
      // Trier pour prendre le poids le plus récent
      const sortedW = [...data.weight].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const lastW = sortedW[0];
      const d = lastW.timestamp.slice(0, 10);
      
      const lastFat = data.bodyFat?.find(f => f.timestamp.startsWith(d))?.percentage;
      const lastMus = data.muscle?.find(m => m.timestamp.startsWith(d))?.value_kg;

      await supabase.from("profiles").update({ 
        weight_kg: lastW.value_kg,
        body_fat_percent: lastFat ? round1(lastFat) : null,
        muscle_mass_kg: lastMus ? round1(lastMus) : null
      }).eq("user_id", userId);

      synced.push("Composition");
    }

    if (prefs.sync_calories && data.activeCalories?.length) {
      const todayCals = data.activeCalories.find(c => c.timestamp.startsWith(today))?.value_kcal || 0;
      // On met à jour même si c'est 0 pour refléter l'état actuel de la journée
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
