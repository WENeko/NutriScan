/**
 * Health Connect Bridge
 * 
 * Uses @capgo/capacitor-health for weight, steps, calories, sleep.
 * SkeletalMuscleMass and BodyFat use readSamples when supported,
 * with graceful fallback on web/unsupported platforms.
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

const HEALTH_READ_TYPES = ["steps", "weight", "calories", "sleep", "bodyFat"] as const;
const EMPTY_AUTH_STATUS = {
  readAuthorized: [] as string[],
  readDenied: [] as string[],
  writeAuthorized: [] as string[],
  writeDenied: [] as string[],
};

function hasGrantedAllPermissions(status: typeof EMPTY_AUTH_STATUS | null | undefined): boolean {
  const readAuthorized = Array.isArray(status?.readAuthorized) ? status.readAuthorized : [];
  return HEALTH_READ_TYPES.every((permission) => readAuthorized.includes(permission));
}

// ── Unit conversions ───────────────────────────────────────────
export const convertUnits = {
  lbsToKg: (lbs: number) => Math.round(lbs * 0.453592 * 10) / 10,
  kgToLbs: (kg: number) => Math.round(kg * 2.20462 * 10) / 10,
  cmToIn: (cm: number) => Math.round(cm * 0.393701 * 10) / 10,
  inToCm: (inches: number) => Math.round(inches * 2.54 * 10) / 10,
};

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
let _healthPlugin: any = null;

async function getHealthPlugin(): Promise<any> {
  if (_healthPlugin) return _healthPlugin;
  try {
    const { Health } = await import("@capgo/capacitor-health");
    _healthPlugin = Health;
    console.log("[HealthConnect] Plugin loaded successfully");
    return _healthPlugin;
  } catch (e) {
    console.log("[HealthConnect] Plugin not available (web?):", e);
    return null;
  }
}

/** Promise with timeout – resolves to fallback value on expiry */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => {
      console.log(`[HealthConnect] Timeout after ${ms}ms, using fallback`);
      resolve(fallback);
    }, ms)),
  ]);
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) {
      console.log("[HealthConnect] No plugin – not available");
      return false;
    }
    const result = await withTimeout(Health.isAvailable(), 3000, { available: false });
    console.log("[HealthConnect] isAvailable result:", JSON.stringify(result));
    return result.available === true;
  } catch (e) {
    console.log("[HealthConnect] isAvailable error:", e);
    return false;
  }
}

export async function checkHealthPermissions(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) {
      console.log("[HealthConnect] No plugin – permissions unavailable");
      return false;
    }

    const status = await withTimeout(
      Health.checkAuthorization({
        read: [...HEALTH_READ_TYPES],
        write: [],
      }),
      3000,
      EMPTY_AUTH_STATUS
    );

    const granted = hasGrantedAllPermissions(status);
    console.log("[HealthConnect] Permissions granted:", granted, JSON.stringify(status));
    return granted;
  } catch (e) {
    console.log("[HealthConnect] checkAuthorization error:", e);
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  try {
    const Health = await getHealthPlugin();
    if (!Health) return false;
    const authResult = await withTimeout(
      Health.requestAuthorization({
        read: [...HEALTH_READ_TYPES],
        write: [],
      }),
      5000,
      null
    );
    const granted = hasGrantedAllPermissions(authResult ?? EMPTY_AUTH_STATUS);
    console.log("[HealthConnect] Permissions granted:", granted, authResult ? JSON.stringify(authResult) : "null");
    return granted;
  } catch (e) {
    console.log("[HealthConnect] requestAuthorization error:", e);
    return false;
  }
}

/** Register a listener that re-checks availability when app resumes */
export function onAppResumeRecheck(callback: () => void): (() => void) | null {
  try {
    const doc = typeof document !== "undefined" ? document : null;
    const win = typeof window !== "undefined" ? window : null;
    if (!doc) return null;

    const handleVisibility = () => {
      if (doc.visibilityState === "visible") {
        console.log("[HealthConnect] App status change: visible – rechecking");
        callback();
      }
    };

    const handleFocus = () => {
      if (doc.visibilityState === "visible") {
        console.log("[HealthConnect] App status change: focus – rechecking");
        callback();
      }
    };

    doc.addEventListener("visibilitychange", handleVisibility);
    win?.addEventListener("focus", handleFocus);
    win?.addEventListener("pageshow", handleFocus);

    return () => {
      doc.removeEventListener("visibilitychange", handleVisibility);
      win?.removeEventListener("focus", handleFocus);
      win?.removeEventListener("pageshow", handleFocus);
    };
  } catch {
    return null;
  }
}

// ── Read from native Health Connect ────────────────────────────
export async function readNativeHealthData(days = 30): Promise<HealthConnectData> {
  const Health = await getHealthPlugin();
  if (!Health) return {};

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const data: HealthConnectData = {};

  try {
    const { samples } = await Health.readSamples({
      dataType: "weight",
      startDate,
      endDate,
      limit: 500,
    });
    if (samples?.length) {
      data.weight = samples.map((s: any) => ({
        value_kg: s.value,
        timestamp: s.startDate || s.date,
      }));
    }
  } catch {}

  try {
    const { samples } = await Health.readSamples({
      dataType: "calories",
      startDate,
      endDate,
      limit: 500,
    });
    if (samples?.length) {
      data.activeCalories = samples.map((s: any) => ({
        value_kcal: s.value,
        start_time: s.startDate,
        end_time: s.endDate || s.startDate,
      }));
    }
  } catch {}

  try {
    const { samples } = await Health.readSamples({
      dataType: "steps",
      startDate,
      endDate,
      limit: 500,
    });
    if (samples?.length) {
      data.steps = samples.map((s: any) => ({
        count: s.value,
        start_time: s.startDate,
        end_time: s.endDate || s.startDate,
      }));
    }
  } catch {}

  try {
    const { samples } = await Health.readSamples({
      dataType: "sleep",
      startDate,
      endDate,
      limit: 100,
    });
    if (samples?.length) {
      data.sleep = samples.map((s: any) => ({
        start_time: s.startDate,
        end_time: s.endDate,
        duration_minutes: Math.round(
          (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000
        ),
      }));
    }
  } catch {}

  // Body fat & skeletal muscle mass: attempt via readSamples
  // These may not be supported by all plugins; graceful fallback
  try {
    const { samples } = await Health.readSamples({
      dataType: "bodyFat",
      startDate,
      endDate,
      limit: 500,
    });
    if (samples?.length) {
      data.bodyFat = samples.map((s: any) => ({
        percentage: s.value,
        timestamp: s.startDate || s.date,
      }));
    }
  } catch {}

  try {
    const { samples } = await Health.readSamples({
      dataType: "leanBodyMass",
      startDate,
      endDate,
      limit: 500,
    });
    if (samples?.length) {
      data.leanBodyMass = samples.map((s: any) => ({
        value_kg: s.value,
        timestamp: s.startDate || s.date,
      }));
    }
  } catch {}

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
      for (const w of data.weight) {
        const recordedAt = w.timestamp.slice(0, 10);
        const { data: existing } = await supabase
          .from("body_composition")
          .select("id, source, created_at")
          .eq("user_id", userId)
          .eq("recorded_at", recordedAt)
          .single();

        if (existing && existing.source === "manual" && new Date(existing.created_at) > new Date(w.timestamp)) {
          continue;
        }

        const bodyFatForDate = data.bodyFat?.find((bf) => bf.timestamp.slice(0, 10) === recordedAt);
        // Use skeletalMuscleMass (68.8 kg from balance) instead of leanBodyMass
        const skeletalMassForDate = data.skeletalMuscleMass?.find((sm) => sm.timestamp.slice(0, 10) === recordedAt);

        const record = {
          user_id: userId,
          recorded_at: recordedAt,
          weight_kg: w.value_kg,
          body_fat_percent: bodyFatForDate?.percentage ?? null,
          muscle_mass_kg: skeletalMassForDate?.value_kg ?? null,
          source: "health_connect",
        };

        if (existing) {
          await supabase.from("body_composition").update(record).eq("id", existing.id);
        } else {
          await supabase.from("body_composition").insert(record);
        }
      }
      synced.push("weight");

      const latestWeight = data.weight.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];
      if (latestWeight) {
        const latestBodyFat = data.bodyFat?.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];
        const latestSkeletal = data.skeletalMuscleMass?.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];

        await supabase
          .from("profiles")
          .update({
            weight_kg: latestWeight.value_kg,
            ...(latestBodyFat ? { body_fat_percent: latestBodyFat.percentage } : {}),
            ...(latestSkeletal ? { muscle_mass_kg: latestSkeletal.value_kg } : {}),
          })
          .eq("user_id", userId);
      }
    } catch (e: any) {
      errors.push(`weight: ${e.message}`);
    }
  }

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

  if (prefs.sync_sleep && data.sleep?.length) {
    try {
      for (const s of data.sleep) {
        const recordedAt = s.start_time.slice(0, 10);
        const { data: existing } = await supabase
          .from("sleep_logs")
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
          await supabase.from("sleep_logs").update(record).eq("id", existing.id);
        } else {
          await supabase.from("sleep_logs").insert(record);
        }
      }
      synced.push("sleep");
    } catch (e: any) {
      errors.push(`sleep: ${e.message}`);
    }
  }

  return { synced, errors };
}
