/**
 * Réconciliation Health Connect ⇄ base de données.
 *
 * Garantit que chaque repas de la BDD (quel que soit son moyen de création :
 * app, widget favoris, autre appareil, fonction serveur) est présent dans
 * Health Connect, que les repas modifiés sont réécrits et que les repas
 * supprimés disparaissent de Health Connect.
 *
 * Déclenché : à l'ouverture, au retour au premier plan, et en temps réel sur
 * chaque INSERT / UPDATE / DELETE de la table `meals` (ou `meal_items`).
 */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { supabase } from "@/integrations/supabase/client";
import { appLogger } from "./appLogger";
import { isNutritionSyncEnabled } from "./nutritionWriter";

const WINDOWS_KEY = "nutriscan-hc-write-windows";
const LOOKBACK_DAYS = 30;
const NATIVE_WRITTEN_KEY = "hc_written_windows";

interface WriteWindow {
  startTime: string;
  sig?: string;
}

function getPlugin(): any | null {
  return (window as any).Capacitor?.Plugins?.NutritionWriter ?? null;
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
  } catch { /* ignore */ }
}

/** Fusionne les écritures faites nativement par le widget (app fermée). */
async function mergeNativeWindows(map: Record<string, WriteWindow>) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Preferences.configure({ group: "NutriScanWidget" });
    const { value } = await Preferences.get({ key: NATIVE_WRITTEN_KEY });
    if (!value) return;
    const native = JSON.parse(value) as Record<string, WriteWindow>;
    for (const [id, w] of Object.entries(native)) {
      if (!map[id]) map[id] = w;
    }
    await Preferences.remove({ key: NATIVE_WRITTEN_KEY });
  } catch (e) {
    appLogger.warn("HCReconcile", "lecture écritures widget impossible", { error: (e as Error)?.message });
  }
}

const num = (v: unknown) => Number(v) || 0;

function signature(meal: any, items: any[]): string {
  const r = (v: unknown) => Math.round(num(v) * 10) / 10;
  return [
    meal.timestamp, meal.meal_name, r(meal.total_calories), r(meal.total_proteins),
    r(meal.total_carbs), r(meal.total_fats), items.length,
  ].join("|");
}

function mealType(iso: string) {
  const h = new Date(iso).getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

function micro(items: any[], key: string) {
  return items.reduce((s, it) => s + num(it?.nutrients_std?.[key]), 0);
}

function buildPayload(meal: any, items: any[]) {
  const t = new Date(meal.timestamp);
  const end = new Date(Math.min(t.getTime(), Date.now()));
  const start = new Date(end.getTime() - 60_000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    kcal: num(meal.total_calories),
    kcalFromFat: 0,
    proteinGrams: num(meal.total_proteins),
    totalCarbohydrateGrams: num(meal.total_carbs),
    totalFatGrams: num(meal.total_fats),
    dietaryFiberGrams: micro(items, "fiber"),
    sugarGrams: micro(items, "sugar"),
    saturatedFatGrams: micro(items, "saturated_fat"),
    sodiumGrams: micro(items, "sodium_mg") / 1000,
    potassiumGrams: micro(items, "potassium_mg") / 1000,
    magnesiumGrams: micro(items, "magnesium_mg") / 1000,
    calciumGrams: micro(items, "calcium_mg") / 1000,
    ironGrams: micro(items, "iron_mg") / 1000,
    zincGrams: micro(items, "zinc_mg") / 1000,
    vitaminCGrams: micro(items, "vitamin_c_mg") / 1000,
    vitaminDGrams: micro(items, "vitamin_d_mcg") / 1_000_000,
    folateGrams: micro(items, "vitamin_b9_mcg") / 1_000_000,
    vitaminB12Grams: micro(items, "vitamin_b12_mcg") / 1_000_000,
    vitaminEGrams: micro(items, "vitamin_e_mg") / 1000,
    name: meal.meal_name || "Repas NutriScan",
    mealType: mealType(end.toISOString()),
  };
}

function deleteWindow(startIso: string) {
  const s = new Date(startIso);
  return { startDate: s.toISOString(), endDate: new Date(s.getTime() + 2 * 60_000).toISOString() };
}

let running: Promise<void> | null = null;
let rerun = false;

export function reconcileHealthConnect(): Promise<void> {
  if (running) { rerun = true; return running; }
  running = (async () => {
    try {
      do {
        rerun = false;
        await doReconcile();
      } while (rerun);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function doReconcile() {
  const p = getPlugin();
  if (!p || !isNutritionSyncEnabled()) return;
  try {
    if ((await p.hasPermission())?.granted !== true) return;
  } catch { return; }

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: meals, error } = await supabase
    .from("meals")
    .select("id, timestamp, meal_name, total_calories, total_proteins, total_carbs, total_fats, meal_items(nutrients_std)")
    .eq("user_id", userId)
    .gte("timestamp", since);
  if (error || !meals) {
    appLogger.warn("HCReconcile", "lecture repas impossible", { error: error?.message });
    return;
  }

  const map = readWindows();
  await mergeNativeWindows(map);
  const present = new Set<string>();
  let written = 0, updated = 0, removed = 0;

  for (const meal of meals as any[]) {
    present.add(meal.id);
    const items = Array.isArray(meal.meal_items) ? meal.meal_items : [];
    const sig = signature(meal, items);
    const existing = map[meal.id];
    if (existing && (existing.sig === sig || existing.sig === undefined)) {
      // Anciennes entrées sans signature : on les adopte sans réécrire.
      if (existing.sig === undefined) map[meal.id] = { ...existing, sig };
      continue;
    }
    try {
      if (existing) await p.deleteMealWindow(deleteWindow(existing.startTime));
      const payload = buildPayload(meal, items);
      const res = await p.writeMeal(payload);
      if (res?.ok) {
        map[meal.id] = { startTime: payload.startTime, sig };
        existing ? updated++ : written++;
      }
    } catch (e) {
      appLogger.warn("HCReconcile", "écriture échouée", { mealId: meal.id, error: (e as Error)?.message });
    }
  }

  // Repas supprimés de la BDD (dans la fenêtre de réconciliation).
  for (const [id, w] of Object.entries(map)) {
    if (present.has(id)) continue;
    if (new Date(w.startTime).getTime() < new Date(since).getTime()) {
      delete map[id];
      continue;
    }
    try {
      await p.deleteMealWindow(deleteWindow(w.startTime));
      delete map[id];
      removed++;
    } catch { /* retenté au prochain passage */ }
  }

  writeWindows(map);
  if (written || updated || removed) {
    appLogger.info("HCReconcile", "réconciliation", { written, updated, removed });
  }
}

let debounce: ReturnType<typeof setTimeout> | null = null;
function schedule(delay = 1500) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => { void reconcileHealthConnect(); }, delay);
}

/** Démarre l'écoute temps réel + ouverture/reprise. Retourne un nettoyeur. */
export function startHealthConnectAutoSync(userId: string): () => void {
  schedule(500);
  const channel = supabase
    .channel(`hc-sync-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "meals", filter: `user_id=eq.${userId}` }, () => schedule())
    .on("postgres_changes", { event: "*", schema: "public", table: "meal_items" }, () => schedule())
    .subscribe();
  const onVisible = () => { if (document.visibilityState === "visible") schedule(300); };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    void supabase.removeChannel(channel);
    if (debounce) clearTimeout(debounce);
  };
}
