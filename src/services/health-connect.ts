/**
 * Health Connect Bridge - Version Stabilité Totale
 * Règle les problèmes d'arrondi infini et force la détection des calories/muscle.
 */

import { supabase } from "@/integrations/supabase/client";

// ... (Garder les types et préférences identiques)

const round1 = (v: number) => Math.round(v * 10) / 10;

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

  // 1. Récupération des données
  const weightSamples = await fetch("weight");
  const fatSamples = await fetch("bodyFat");
  const leanSamples = await fetch("leanBodyMass");
  const energySamples = await fetch("activeEnergyBurned");
  const skeletalSamples = await fetch("skeletalMuscleMass");

  // Traitement Poids & Gras (On force l'arrondi ici pour l'affichage)
  data.weight = weightSamples.map((s: any) => ({ value_kg: round1(Number(s.value)), timestamp: s.startDate || s.date }));
  data.bodyFat = fatSamples.map((s: any) => ({ percentage: round1(Number(s.value)), timestamp: s.startDate || s.date }));

  // 2. Calcul du Muscle (Logique Biométrique)
  const muscleMap = new Map();
  leanSamples.forEach((l: any) => {
    const d = (l.startDate || l.date).slice(0, 10);
    const weightVal = data.weight?.find(we => we.timestamp.startsWith(d))?.value_kg || (l.value / 0.85);
    
    // Formule biométrique complète
    const boneVal = isFemale ? 2.4 + (weightVal * 0.01) : 3.2 + (weightVal * 0.01);
    const ageAdjustment = age > 30 ? (age - 30) * 0.0001 : 0;
    const organFactor = isFemale ? (0.0145 - ageAdjustment) : (0.0125 - ageAdjustment);

    const calculatedMuscle = Number(l.value) - boneVal - (weightVal * organFactor);
    if (calculatedMuscle > 0) muscleMap.set(d, round1(calculatedMuscle));
  });

  // Fallback si skeletalMuscleMass existe
  skeletalSamples.forEach((s: any) => {
    const d = (s.startDate || s.date).slice(0, 10);
    if (!muscleMap.has(d)) muscleMap.set(d, round1(Number(s.value)));
  });

  data.muscle = Array.from(muscleMap.entries()).map(([date, val]) => ({ value_kg: val, timestamp: date }));

  // 3. Calories Sport (Addition totale)
  const calMap = new Map();
  energySamples.forEach((s: any) => {
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

    // Sync Poids, Gras, Muscle
    if (prefs.sync_weight && data.weight?.length) {
      // On prend le plus récent
      const sortedW = [...data.weight].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const lastW = sortedW[0];
      const d = lastW.timestamp.slice(0, 10);
      
      const lastFat = data.bodyFat?.find(f => f.timestamp.startsWith(d))?.percentage;
      const lastMus = data.muscle?.find(m => m.timestamp.startsWith(d))?.value_kg;

      // UPDATE PROFIL
      await supabase.from("profiles").update({ 
        weight_kg: lastW.value_kg,
        body_fat_percent: lastFat ? round1(lastFat) : null,
        muscle_mass_kg: lastMus ? round1(lastMus) : null
      }).eq("user_id", userId);

      synced.push("Composition");
    }

    // Sync Calories
    if (prefs.sync_calories && data.activeCalories?.length) {
      const todayCals = data.activeCalories.find(c => c.timestamp.startsWith(today))?.value_kcal || 0;
      await supabase.from("profiles").update({ sport_calories_day: todayCals }).eq("user_id", userId);
      synced.push("Calories Sport");
    }
  } catch (e: any) { errors.push(e.message); }

  return { synced, errors };
}
