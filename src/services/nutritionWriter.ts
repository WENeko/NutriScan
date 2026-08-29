/**
 * Bridge TypeScript vers le plugin natif NutritionWriter (Health Connect).
 *
 * Écrit les nutriments d'un repas (NutritionRecord) dans Health Connect :
 *  - writeMealToHealthConnect : à l'enregistrement d'un nouveau repas
 *  - resyncMealToHealthConnect : à la modification d'un repas (delete old window + insert new)
 *  - deleteMealFromHealthConnect : à la suppression d'un repas
 *
 * No-op silencieux sur web (plugin Capacitor absent) ou si Health Connect
 * indisponible / permission refusée. Les fenêtres temporelles écrites sont
 * mémorisées dans localStorage pour permettre la resync/suppression.
 */
import { appLogger } from "./appLogger";
import type { MealItemWithMicros } from "./mealPersistenceService";

const WINDOWS_KEY = "nutriscan-hc-write-windows";
const ENABLED_KEY = "nutriscan-hc-nutrition-sync";

/** L'utilisateur a-t-il activé l'écriture nutrition vers Health Connect ? */
export function isNutritionSyncEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNutritionSyncEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface WriteWindow {
  startTime: string;
}

function getPlugin(): any | null {
  const Cap = (window as any).Capacitor;
  if (!Cap?.Plugins?.NutritionWriter) return null;
  return Cap.Plugins.NutritionWriter;
}

function deriveMealType(timestampIso: string): string {
  const h = new Date(timestampIso).getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

function sumItems(items: MealItemWithMicros[] | undefined | null) {
  const n = (it: any, k: string) => Number(it?.[k]) || 0;
  const list = items || [];
  return {
    fiber: list.reduce((s, it) => s + n(it, "fiber"), 0),
    sugar: list.reduce((s, it) => s + n(it, "sugar"), 0),
    saturated_fat: list.reduce((s, it) => s + n(it, "saturated_fat"), 0),
    sodium_mg: list.reduce((s, it) => s + n(it, "sodium_mg"), 0),
    potassium_mg: list.reduce((s, it) => s + n(it, "potassium_mg"), 0),
    magnesium_mg: list.reduce((s, it) => s + n(it, "magnesium_mg"), 0),
    calcium_mg: list.reduce((s, it) => s + n(it, "calcium_mg"), 0),
    iron_mg: list.reduce((s, it) => s + n(it, "iron_mg"), 0),
    zinc_mg: list.reduce((s, it) => s + n(it, "zinc_mg"), 0),
    vitamin_c_mg: list.reduce((s, it) => s + n(it, "vitamin_c_mg"), 0),
    vitamin_d_mcg: list.reduce((s, it) => s + n(it, "vitamin_d_mcg"), 0),
    vitamin_b9_mcg: list.reduce((s, it) => s + n(it, "vitamin_b9_mcg"), 0),
    vitamin_b12_mcg: list.reduce((s, it) => s + n(it, "vitamin_b12_mcg"), 0),
    vitamin_e_mg: list.reduce((s, it) => s + n(it, "vitamin_e_mg"), 0),
  };
}

function buildPayload(
  mealData: {
    meal_name: string;
    total_calories: number;
    total_proteins: number;
    total_carbs: number;
    total_fats: number;
    timestamp?: string;
  },
  items: MealItemWithMicros[] | undefined | null,
) {
  // Health Connect refuse les intervalles qui se terminent dans le futur.
  // Une duplication est horodatée à l'instant même : l'ancien intervalle
  // [timestamp, timestamp + 1 min] était donc systématiquement rejeté.
  // Le timestamp du repas représente désormais la fin de l'intervalle.
  const mealTime = new Date(mealData.timestamp || new Date().toISOString());
  const end = new Date(Math.min(mealTime.getTime(), Date.now()));
  const start = new Date(end.getTime() - 60_000);
  const startIso = start.toISOString();
  const s = sumItems(items);
  return {
    startTime: startIso,
    endTime: end.toISOString(),
    kcal: Number(mealData.total_calories) || 0,
    kcalFromFat: 0,
    proteinGrams: Number(mealData.total_proteins) || 0,
    totalCarbohydrateGrams: Number(mealData.total_carbs) || 0,
    totalFatGrams: Number(mealData.total_fats) || 0,
    dietaryFiberGrams: s.fiber,
    sugarGrams: s.sugar,
    saturatedFatGrams: s.saturated_fat,
    sodiumGrams: s.sodium_mg / 1000,
    potassiumGrams: s.potassium_mg / 1000,
    magnesiumGrams: s.magnesium_mg / 1000,
    calciumGrams: s.calcium_mg / 1000,
    ironGrams: s.iron_mg / 1000,
    zincGrams: s.zinc_mg / 1000,
    vitaminCGrams: s.vitamin_c_mg / 1000,
    vitaminDGrams: s.vitamin_d_mcg / 1_000_000,
    folateGrams: s.vitamin_b9_mcg / 1_000_000,
    vitaminB12Grams: s.vitamin_b12_mcg / 1_000_000,
    vitaminEGrams: s.vitamin_e_mg / 1000,
    name: mealData.meal_name || "Repas NutriScan",
    mealType: deriveMealType(mealTime.toISOString()),
  };
}

function readWindows(): Record<string, WriteWindow> {
  try {
    return JSON.parse(localStorage.getItem(WINDOWS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeWindows(map: Record<string, WriteWindow>) {
  try {
    localStorage.setItem(WINDOWS_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Fenêtre de suppression couvrant un record (startTime → startTime+1min). */
function deleteWindowFor(startIso: string) {
  const s = new Date(startIso);
  const e = new Date(s.getTime() + 2 * 60_000);
  return { startDate: s.toISOString(), endDate: e.toISOString() };
}

export async function isNutritionWriterAvailable(): Promise<boolean> {
  const p = getPlugin();
  if (!p) return false;
  try {
    return (await p.isAvailable())?.available === true;
  } catch {
    return false;
  }
}

export async function hasNutritionWritePermission(): Promise<boolean> {
  const p = getPlugin();
  if (!p) return false;
  try {
    return (await p.hasPermission())?.granted === true;
  } catch {
    return false;
  }
}

export async function requestNutritionWritePermission(): Promise<boolean> {
  const p = getPlugin();
  if (!p) return false;
  try {
    return (await p.requestPermission())?.granted === true;
  } catch {
    return false;
  }
}

/** Écrit un nouveau repas dans Health Connect. No-op silencieux hors Android. */
export async function writeMealToHealthConnect(
  mealId: string,
  mealData: {
    meal_name: string;
    total_calories: number;
    total_proteins: number;
    total_carbs: number;
    total_fats: number;
    timestamp?: string;
  },
  items: MealItemWithMicros[] | undefined | null,
  context = "write",
): Promise<boolean> {
  const p = getPlugin();
  if (!p) {
    appLogger.info("NutritionWriter", "ignoré : plugin absent", { mealId, context });
    return false;
  }
  if (!isNutritionSyncEnabled()) {
    appLogger.info("NutritionWriter", "ignoré : sync désactivée", { mealId, context });
    return false;
  }
  try {
    // Health Connect révoque les permissions après une longue inactivité :
    // on revérifie (et redemande) avant chaque écriture.
    if (!(await hasNutritionWritePermission())) {
      const granted = await requestNutritionWritePermission();
      if (!granted) {
        appLogger.warn("NutritionWriter", "permission refusée", { mealId, context });
        return false;
      }
    }
    const payload = buildPayload(mealData, items);
    const res = await p.writeMeal(payload);
    if (res?.ok) {
      const map = readWindows();
      map[mealId] = { startTime: payload.startTime };
      writeWindows(map);
      appLogger.info("NutritionWriter", "écrit", { mealId, context, kcal: payload.kcal, startTime: payload.startTime });
      return true;
    } else {
      appLogger.warn("NutritionWriter", "échec écriture", { mealId, context, error: res?.error });
      return false;
    }
  } catch (e: any) {
    appLogger.warn("NutritionWriter", "exception", { mealId, context, error: e?.message });
    return false;
  }
}


/**
 * Resynchronise un repas modifié : supprime l'ancienne fenêtre temporelle
 * (mémorisée) puis écrit le nouveau record. Gère le changement d'heure/contenu.
 */
export async function resyncMealToHealthConnect(
  mealId: string,
  mealData: {
    meal_name: string;
    total_calories: number;
    total_proteins: number;
    total_carbs: number;
    total_fats: number;
    timestamp?: string;
  },
  items: MealItemWithMicros[] | undefined | null,
): Promise<void> {
  const p = getPlugin();
  if (!p || !isNutritionSyncEnabled()) return;
  try {
    if (!(await hasNutritionWritePermission())) {
      const granted = await requestNutritionWritePermission();
      if (!granted) {
        appLogger.warn("NutritionWriter", "resync : permission refusée", { mealId });
        return;
      }
    }
    const map = readWindows();
    const old = map[mealId];
    if (old) {
      await p.deleteMealWindow(deleteWindowFor(old.startTime));
    }
    const payload = buildPayload(mealData, items);
    const res = await p.writeMeal(payload);
    if (res?.ok) {
      map[mealId] = { startTime: payload.startTime };
      writeWindows(map);
      appLogger.info("NutritionWriter", "resync ok", { mealId });
    } else {
      appLogger.warn("NutritionWriter", "resync échec", { mealId, error: res?.error });
    }
  } catch (e: any) {
    appLogger.warn("NutritionWriter", "resync exception", { mealId, error: e?.message });
  }
}

/** Supprime le record Health Connect d'un repas (à la suppression du repas). */
export async function deleteMealFromHealthConnect(
  mealId: string,
  timestampIso?: string,
): Promise<void> {
  const p = getPlugin();
  if (!p) return;
  try {
    const map = readWindows();
    const old = map[mealId] || (timestampIso ? { startTime: timestampIso } : null);
    if (!old) return;
    await p.deleteMealWindow(deleteWindowFor(old.startTime));
    delete map[mealId];
    writeWindows(map);
    appLogger.info("NutritionWriter", "supprimé", { mealId });
  } catch (e: any) {
    appLogger.warn("NutritionWriter", "delete exception", { mealId, error: e?.message });
  }
}
