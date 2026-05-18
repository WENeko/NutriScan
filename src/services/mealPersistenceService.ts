/**
 * Persistance des repas — double écriture Lovable + BDD perso via edge function bridge.
 * La BDD perso reçoit les écritures via la function `save-meal` (service_role, contourne RLS).
 */

import { supabase } from "@/integrations/supabase/client";
import { appLogger } from "./appLogger";
import {
  buildStdNutrients,
  buildCustomNutrients,
  type CustomNutrientDef,
} from "@/utils/nutrients-helpers";

const PERSO_URL = import.meta.env.VITE_PERSONAL_SUPABASE_URL as string | undefined;
const PERSO_BRIDGE_SECRET = import.meta.env.VITE_PERSONAL_BRIDGE_SECRET as string | undefined;
const PERSO_ENABLED = !!(PERSO_URL && PERSO_BRIDGE_SECRET);

export type MealItemWithMicros = {
  food_name?: string;
  name?: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  quantity?: number;
  estimated_weight_g?: number;
  unit_count?: number;
  unit_label?: string;
  unit_weight_g?: number;
  fiber?: number;
  sugar?: number;
  saturated_fat?: number;
  sodium_mg?: number;
  potassium_mg?: number;
  magnesium_mg?: number;
  calcium_mg?: number;
  iron_mg?: number;
  zinc_mg?: number;
  omega3_mg?: number;
  vitamin_b_mg?: number;
  vitamin_b9_mcg?: number;
  vitamin_b12_mcg?: number;
  vitamin_c_mg?: number;
  vitamin_d_mcg?: number;
  vitamin_e_mg?: number;
  [extra: string]: unknown;
};

interface SaveMealParams {
  userId: string;
  mealData: {
    meal_name: string;
    total_calories: number;
    total_proteins: number;
    total_carbs: number;
    total_fats: number;
    image_url?: string | null;
    timestamp?: string;
    raw_ai_analysis?: string | null;
    is_confirmed?: boolean;
    source?: string;
  };
  items: MealItemWithMicros[];
}

// ------------------------------------------------------------------
// Builders
// ------------------------------------------------------------------
function buildMealRow(m: SaveMealParams["mealData"], userId: string) {
  return {
    user_id: userId,
    meal_name: m.meal_name,
    total_calories: m.total_calories,
    total_proteins: m.total_proteins,
    total_carbs: m.total_carbs,
    total_fats: m.total_fats,
    timestamp: m.timestamp ?? new Date().toISOString(),
    image_url: m.image_url ?? null,
    raw_ai_analysis: m.raw_ai_analysis ?? null,
    is_confirmed: m.is_confirmed ?? true,
    source: m.source ?? "ai",
  };
}

function buildItemRows(
  items: MealItemWithMicros[],
  mealId: string,
  customDefs: CustomNutrientDef[] = [],
) {
  return items.map((it) => {
    const qtyNumeric =
      it.quantity ??
      (it.unit_count && it.unit_weight_g ? it.unit_count * it.unit_weight_g : 100);
    return {
      meal_id: mealId,
      name: it.food_name || it.name || "Aliment",
      quantity: String(qtyNumeric),
      calories: it.calories,
      proteins: it.proteins,
      carbs: it.carbs,
      fats: it.fats,
      fiber: it.fiber ?? 0,
      sugar: it.sugar ?? 0,
      saturated_fat: it.saturated_fat ?? 0,
      sodium_mg: it.sodium_mg ?? 0,
      potassium_mg: it.potassium_mg ?? 0,
      magnesium_mg: it.magnesium_mg ?? 0,
      calcium_mg: it.calcium_mg ?? 0,
      iron_mg: it.iron_mg ?? 0,
      zinc_mg: it.zinc_mg ?? 0,
      omega3_mg: it.omega3_mg ?? 0,
      vitamin_b_mg: it.vitamin_b_mg ?? 0,
      vitamin_b9_mcg: it.vitamin_b9_mcg ?? 0,
      vitamin_b12_mcg: it.vitamin_b12_mcg ?? 0,
      vitamin_c_mg: it.vitamin_c_mg ?? 0,
      vitamin_d_mcg: it.vitamin_d_mcg ?? 0,
      vitamin_e_mg: it.vitamin_e_mg ?? 0,
      unit_count: it.unit_count ?? null,
      unit_label: it.unit_label ?? null,
      unit_weight_g: it.unit_weight_g ?? null,
      // Source unique de vérité : nutrients_std (master list) + nutrients_custom (user-defined)
      nutrients_std: buildStdNutrients(it as Record<string, unknown>),
      nutrients_custom: buildCustomNutrients(it as Record<string, unknown>, customDefs),
    };
  });
}

async function loadCustomNutrientDefs(userId: string): Promise<CustomNutrientDef[]> {
  const { data } = await supabase
    .from("profiles")
    .select("custom_nutrients")
    .eq("user_id", userId)
    .single();
  const arr = Array.isArray((data as any)?.custom_nutrients) ? (data as any).custom_nutrients : [];
  return arr as CustomNutrientDef[];
}

// ------------------------------------------------------------------
// Bridge call (BDD perso)
// ------------------------------------------------------------------
export interface PersoBridgeResult {
  ok: boolean;
  status?: number;
  error?: string;
  itemsInserted?: number;
}

export async function callPersoBridge(
  path: string,
  body: Record<string, unknown>,
): Promise<PersoBridgeResult> {
  if (!PERSO_ENABLED) return { ok: false, error: "perso disabled" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-shared-secret": PERSO_BRIDGE_SECRET!,
    };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

    const res = await fetch(`${PERSO_URL}/functions/v1/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: json?.error || res.statusText };
    }
    return { ok: true, status: res.status, ...(json ?? {}) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network error" };
  }
}

export async function pingPersoBridge(userId: string): Promise<PersoBridgeResult> {
  return callPersoBridge("save-meal", {
    userId,
    meal: { meal_name: "__ping__" },
    items: [],
    dryRun: true,
  });
}

// ------------------------------------------------------------------
// Main dual-write
// ------------------------------------------------------------------
export const saveMealWithDualWrite = async ({ userId, mealData, items }: SaveMealParams) => {
  appLogger.info("DualWrite", "Démarrage sauvegarde", {
    userId,
    name: mealData.meal_name,
    items: items?.length || 0,
    persoEnabled: PERSO_ENABLED,
  });

  // 1. Lovable (source de vérité) -----------------------------------
  const mealRow = buildMealRow(mealData, userId);
  const { data: primaryMeal, error: primaryErr } = await supabase
    .from("meals").insert([mealRow]).select().single();
  if (primaryErr) {
    appLogger.error("DualWrite", "Echec insert Lovable", primaryErr);
    throw primaryErr;
  }

  const itemRows = items?.length ? buildItemRows(items, primaryMeal.id) : [];
  if (itemRows.length > 0) {
    const { error: itemsErr } = await supabase.from("meal_items").insert(itemRows);
    if (itemsErr) {
      appLogger.error("DualWrite", "Echec insert items Lovable", itemsErr);
      throw new Error(`meal_items: ${itemsErr.message}`);
    }
  }
  appLogger.info("DualWrite", "Lovable OK", { mealId: primaryMeal.id });

  // 2. BDD perso via bridge -----------------------------------------
  let perso: PersoBridgeResult | null = null;
  if (PERSO_ENABLED) {
    // mêmes payloads, mais sans user_id (le bridge l'ajoute) et avec email récup pour création auto user
    const { data: { user } } = await supabase.auth.getUser();
    const mealPayload = { ...mealRow, email: user?.email };
    delete (mealPayload as any).user_id;
    const itemsPayload = itemRows.map(({ meal_id: _omit, ...rest }) => rest);

    perso = await callPersoBridge("save-meal", {
      userId,
      meal: mealPayload,
      items: itemsPayload,
    });
    if (perso.ok) {
      appLogger.info("DualWrite", "Perso OK", perso);
    } else {
      appLogger.warn("DualWrite", "Perso KO (ne bloque pas)", perso);
    }
  }

  return { lovable: primaryMeal, personal: perso };
};

export function isPersonalDbEnabled() { return PERSO_ENABLED; }
