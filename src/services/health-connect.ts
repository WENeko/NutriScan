/**
 * Health Connect Integration Service
 * 
 * This module provides the sync layer between Health Connect (Android)
 * and the app's database. It's designed to work with a future Capacitor
 * plugin for Health Connect.
 * 
 * Data flow: Health Connect → Capacitor Plugin → This Service → Supabase
 */

import { supabase } from "@/integrations/supabase/client";

// Health Connect data types we support
export interface HealthConnectWeight {
  value_kg: number;
  timestamp: string; // ISO string
}

export interface HealthConnectBodyFat {
  percentage: number;
  timestamp: string;
}

export interface HealthConnectLeanBodyMass {
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

export interface HealthConnectData {
  weight?: HealthConnectWeight[];
  bodyFat?: HealthConnectBodyFat[];
  leanBodyMass?: HealthConnectLeanBodyMass[];
  sleep?: HealthConnectSleep[];
  activeCalories?: HealthConnectActiveCalories[];
}

// User preferences for which data sources to sync
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

// Unit conversion utilities
export const convertUnits = {
  lbsToKg: (lbs: number) => Math.round(lbs * 0.453592 * 10) / 10,
  kgToLbs: (kg: number) => Math.round(kg * 2.20462 * 10) / 10,
  cmToIn: (cm: number) => Math.round(cm * 0.393701 * 10) / 10,
  inToCm: (inches: number) => Math.round(inches * 2.54 * 10) / 10,
};

/**
 * Load Health Connect sync preferences from localStorage
 */
export function getHealthConnectPreferences(): HealthConnectPreferences {
  try {
    const stored = localStorage.getItem("nutrivibe-health-connect-prefs");
    if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Save Health Connect sync preferences
 */
export function setHealthConnectPreferences(prefs: HealthConnectPreferences) {
  localStorage.setItem("nutrivibe-health-connect-prefs", JSON.stringify(prefs));
}

/**
 * Main sync function — processes incoming Health Connect data
 * and updates the database with priority logic:
 * - If HC data is more recent than manual entry → use HC data
 * - Mark source as "health_connect" for traceability
 */
export async function syncHealthData(
  userId: string,
  data: HealthConnectData,
  prefs: HealthConnectPreferences
): Promise<{ synced: string[]; errors: string[] }> {
  const synced: string[] = [];
  const errors: string[] = [];

  // 1. Sync weight + body fat + lean body mass → body_composition table
  if (prefs.sync_weight && data.weight?.length) {
    try {
      for (const w of data.weight) {
        const recordedAt = w.timestamp.slice(0, 10);
        // Check if a more recent manual entry exists for this date
        const { data: existing } = await supabase
          .from("body_composition")
          .select("id, source, created_at")
          .eq("user_id", userId)
          .eq("recorded_at", recordedAt)
          .single();

        if (existing && existing.source === "manual" && new Date(existing.created_at) > new Date(w.timestamp)) {
          continue; // Manual entry is more recent, skip
        }

        const bodyFatForDate = data.bodyFat?.find(
          (bf) => bf.timestamp.slice(0, 10) === recordedAt
        );
        const leanMassForDate = data.leanBodyMass?.find(
          (lm) => lm.timestamp.slice(0, 10) === recordedAt
        );

        const record = {
          user_id: userId,
          recorded_at: recordedAt,
          weight_kg: w.value_kg,
          body_fat_percent: bodyFatForDate?.percentage ?? null,
          muscle_mass_kg: leanMassForDate?.value_kg ?? null,
          source: "health_connect",
        };

        if (existing) {
          await supabase.from("body_composition").update(record).eq("id", existing.id);
        } else {
          await supabase.from("body_composition").insert(record);
        }
      }
      synced.push("weight");

      // Update profile with latest weight for Katch-McArdle
      const latestWeight = data.weight.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];
      if (latestWeight) {
        await supabase
          .from("profiles")
          .update({
            weight_kg: latestWeight.value_kg,
            ...(data.bodyFat?.length
              ? { body_fat_percent: data.bodyFat.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].percentage }
              : {}),
            ...(data.leanBodyMass?.length
              ? { muscle_mass_kg: data.leanBodyMass.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].value_kg }
              : {}),
          })
          .eq("user_id", userId);
      }
    } catch (e: any) {
      errors.push(`weight: ${e.message}`);
    }
  }

  // 2. Sync active calories → body_composition.sport_calories
  if (prefs.sync_calories && data.activeCalories?.length) {
    try {
      for (const cal of data.activeCalories) {
        const recordedAt = cal.start_time.slice(0, 10);
        const { data: existing } = await supabase
          .from("body_composition")
          .select("id, sport_calories, source")
          .eq("user_id", userId)
          .eq("recorded_at", recordedAt)
          .single();

        if (existing) {
          await supabase
            .from("body_composition")
            .update({ sport_calories: cal.value_kcal, source: "health_connect" })
            .eq("id", existing.id);
        } else {
          await supabase.from("body_composition").insert({
            user_id: userId,
            recorded_at: recordedAt,
            sport_calories: cal.value_kcal,
            source: "health_connect",
          });
        }
      }
      synced.push("active_calories");
    } catch (e: any) {
      errors.push(`calories: ${e.message}`);
    }
  }

  // 3. Sync sleep → sleep_logs table (created via migration)
  if (prefs.sync_sleep && data.sleep?.length) {
    try {
      for (const s of data.sleep) {
        const recordedAt = s.start_time.slice(0, 10);
        const { data: existing } = await supabase
          .from("sleep_logs" as any)
          .select("id")
          .eq("user_id", userId)
          .eq("recorded_at", recordedAt)
          .single();

        const record = {
          user_id: userId,
          recorded_at: recordedAt,
          start_time: s.start_time,
          end_time: s.end_time,
          duration_minutes: s.duration_minutes,
          stages: s.stages ? JSON.stringify(s.stages) : null,
          source: "health_connect",
        };

        if (existing) {
          await (supabase.from("sleep_logs" as any) as any).update(record).eq("id", (existing as any).id);
        } else {
          await (supabase.from("sleep_logs" as any) as any).insert(record);
        }
      }
      synced.push("sleep");
    } catch (e: any) {
      errors.push(`sleep: ${e.message}`);
    }
  }

  return { synced, errors };
}
