/**
 * Service de persistance des repas avec adaptation automatique des structures de BDD
 * Gère à la fois les colonnes individuelles et les colonnes JSONB (nutrients_std/nutrients_custom)
 */

import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import type { MicroNutrientFields } from "@/utils/nutrition-logic";
import { appLogger } from "./appLogger";

// Initialisation du client personnel (Base secondaire)
const personalUrl = import.meta.env.VITE_PERSONAL_SUPABASE_URL;
const personalKey = import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;

const personalSupabase = (personalUrl && personalKey) 
  ? createClient(personalUrl, personalKey) 
  : null;

// Cache de détection des colonnes
let personalDbSchema: { 
  hasIndividualColumns: boolean; 
  hasJsonbColumns: boolean;
} | null = null;

/**
 * Détecte la structure de la BDD perso (colonnes individuelles vs JSONB)
 * Conforme aux schémas fournis - meals n'a que les macros totales
 */
async function detectPersonalDbSchema(): Promise<{ 
  hasIndividualColumns: boolean; 
  hasJsonbColumns: boolean;
}> {
  if (!personalSupabase) return { hasIndividualColumns: false, hasJsonbColumns: false };
  if (personalDbSchema) return personalDbSchema;

  try {
    // Tester si meal_items a les colonnes micro individuelles (calcium_mg, etc.)
    const { error: microError } = await personalSupabase
      .from("meal_items")
      .select("calcium_mg")
      .limit(1);
    
    const hasIndividualColumns = !microError?.message?.includes("calcium_mg");

    // Tester si nutrients_std existe (structure JSONB)
    const { error: jsonbError } = await personalSupabase
      .from("meal_items")
      .select("nutrients_std")
      .limit(1);
    
    const hasJsonbColumns = !jsonbError?.message?.includes("nutrients_std");

    personalDbSchema = { hasIndividualColumns, hasJsonbColumns };
    
    appLogger.debug("DB Schema", "Schéma détecté", personalDbSchema);
    
    return personalDbSchema;
  } catch (err) {
    appLogger.error("DB Schema", "Erreur détection schéma", err);
    // Fallback : assume structure minimale (pas de colonnes micro dans items)
    return { hasIndividualColumns: false, hasJsonbColumns: false };
  }
}

// Type pour un item alimentaire
interface MealItem {
  food_name: string;
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
}

type MealItemWithMicros = MealItem & MicroNutrientFields;

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

// ============================================================
// FONCTIONS DE CONSTRUCTION - LOVABLE (Structure complète)
// ============================================================

function buildLovableMeal(mealData: SaveMealParams["mealData"], userId: string) {
  return {
    user_id: userId,
    meal_name: mealData.meal_name,
    total_calories: mealData.total_calories,
    total_proteins: mealData.total_proteins,
    total_carbs: mealData.total_carbs,
    total_fats: mealData.total_fats,
    timestamp: mealData.timestamp ?? new Date().toISOString(),
    image_url: mealData.image_url ?? null,
    raw_ai_analysis: mealData.raw_ai_analysis ?? null,
    is_confirmed: mealData.is_confirmed ?? true,
    source: mealData.source ?? "ai"
  };
}

function buildLovableItems(items: MealItemWithMicros[], mealId: string, userId: string) {
  return items.map(item => ({
    meal_id: mealId,
    user_id: userId,
    name: item.food_name || item.name || "Aliment",
    // Macros
    calories: item.calories,
    proteins: item.proteins,
    carbs: item.carbs,
    fats: item.fats,
    fiber: item.fiber ?? 0,
    sugar: item.sugar ?? 0,
    saturated_fat: item.saturated_fat ?? 0,
    // Micros (conforme au schéma meal_items complet)
    sodium_mg: item.sodium_mg ?? 0,
    potassium_mg: item.potassium_mg ?? 0,
    magnesium_mg: item.magnesium_mg ?? 0,
    calcium_mg: item.calcium_mg ?? 0,
    iron_mg: item.iron_mg ?? 0,
    zinc_mg: item.zinc_mg ?? 0,
    omega3_mg: item.omega3_mg ?? 0,
    vitamin_b_mg: item.vitamin_b_mg ?? 0,
    vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
    vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
    vitamin_c_mg: item.vitamin_c_mg ?? 0,
    vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
    vitamin_e_mg: item.vitamin_e_mg ?? 0,
    // Unités
    unit_count: item.unit_count ?? null,
    unit_label: item.unit_label ?? null,
    unit_weight_g: item.unit_weight_g ?? null
  }));
}

// ============================================================
// FONCTIONS DE CONSTRUCTION - PERSONNEL (Adaptatif)
// ============================================================

function buildPersonalMeal(
  mealData: SaveMealParams["mealData"], 
  userId: string, 
  schema: { hasIndividualColumns: boolean; hasJsonbColumns: boolean }
) {
  // Structure conforme au schéma exact de la table meals
  return {
    user_id: userId,
    meal_name: mealData.meal_name,
    timestamp: mealData.timestamp ?? new Date().toISOString(),
    image_url: mealData.image_url ?? null,
    total_calories: mealData.total_calories,
    total_proteins: mealData.total_proteins,
    total_carbs: mealData.total_carbs,
    total_fats: mealData.total_fats,
    raw_ai_analysis: mealData.raw_ai_analysis ?? null,
    is_confirmed: mealData.is_confirmed ?? true,
    source: mealData.source ?? "ai"
  };
}

function buildPersonalItems(
  items: MealItemWithMicros[], 
  mealId: string, 
  userId: string,
  schema: { hasIndividualColumns: boolean; hasJsonbColumns: boolean }
) {
  return items.map(item => {
    const base = {
      meal_id: mealId,
      user_id: userId,
      name: item.food_name || item.name || "Aliment",
      quantity: item.quantity ?? 1,
      calories: item.calories,
      proteins: item.proteins,
      carbs: item.carbs,
      fats: item.fats
    };

    // Construction du payload JSONB pour nutrients_std (conforme au schéma meal_items complet)
    const nutrientsStd = {
      fiber: item.fiber ?? 0,
      sugar: item.sugar ?? 0,
      saturated_fat: item.saturated_fat ?? 0,
      sodium_mg: item.sodium_mg ?? 0,
      potassium_mg: item.potassium_mg ?? 0,
      magnesium_mg: item.magnesium_mg ?? 0,
      calcium_mg: item.calcium_mg ?? 0,
      iron_mg: item.iron_mg ?? 0,
      zinc_mg: item.zinc_mg ?? 0,
      omega3_mg: item.omega3_mg ?? 0,
      vitamin_b_mg: item.vitamin_b_mg ?? 0,
      vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
      vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
      vitamin_c_mg: item.vitamin_c_mg ?? 0,
      vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
      vitamin_e_mg: item.vitamin_e_mg ?? 0
    };

    // Construction conforme au schéma meal_items
    const fullItem = {
      ...base,
      // Macros
      fiber: item.fiber ?? 0,
      sugar: item.sugar ?? 0,
      saturated_fat: item.saturated_fat ?? 0,
      // Micros (conforme au schéma complet)
      sodium_mg: item.sodium_mg ?? 0,
      potassium_mg: item.potassium_mg ?? 0,
      magnesium_mg: item.magnesium_mg ?? 0,
      calcium_mg: item.calcium_mg ?? 0,
      iron_mg: item.iron_mg ?? 0,
      zinc_mg: item.zinc_mg ?? 0,
      omega3_mg: item.omega3_mg ?? 0,
      vitamin_b_mg: item.vitamin_b_mg ?? 0,
      vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
      vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
      vitamin_c_mg: item.vitamin_c_mg ?? 0,
      vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
      vitamin_e_mg: item.vitamin_e_mg ?? 0,
      // Unités
      unit_count: item.unit_count ?? null,
      unit_label: item.unit_label ?? null,
      unit_weight_g: item.unit_weight_g ?? null
    };

    if (schema.hasJsonbColumns) {
      // Ajouter JSONB si la colonne existe
      return {
        ...fullItem,
        nutrients_std: nutrientsStd,
        nutrients_custom: {}
      };
    } else {
      // Structure simple sans JSONB
      return fullItem;
    }
  });
}

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

export const saveMealWithDualWrite = async ({ userId, mealData, items }: SaveMealParams) => {
  const personalUrlConfigured = !!import.meta.env.VITE_PERSONAL_SUPABASE_URL;
  const personalKeyConfigured = !!import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;
  
  appLogger.info("MealSave", "Démarrage sauvegarde repas", { 
    userId, 
    mealName: mealData.meal_name,
    itemsCount: items?.length || 0,
    hasPersonalDb: !!personalSupabase,
    personalUrlConfigured,
    personalKeyConfigured
  });
  
  if (!personalSupabase) {
    appLogger.warn("MealSave", "BDD perso non configurée", { 
      VITE_PERSONAL_SUPABASE_URL: personalUrlConfigured,
      VITE_PERSONAL_SUPABASE_ANON_KEY: personalKeyConfigured 
    });
  }
  
  // Détecter la structure de la BDD perso
  const schema = await detectPersonalDbSchema();
  appLogger.debug("MealSave", "Schéma détecté", schema);
  
  // --- 1. ÉCRITURE SUR LA BASE PRIMAIRE (LOVABLE) ---
  const lovableMeal = buildLovableMeal(mealData, userId);
  appLogger.debug("MealSave", "Données Lovable", lovableMeal);
  
  const { data: primaryMeal, error: primaryError } = await supabase
    .from("meals")
    .insert([lovableMeal])
    .select()
    .single();

  if (primaryError) {
    appLogger.error("MealSave", "Erreur insertion Lovable meals", primaryError);
    throw primaryError;
  }

  // Insertion des items sur Lovable
  if (items && items.length > 0) {
    const lovableItems = buildLovableItems(items, primaryMeal.id, userId);
    appLogger.debug("MealSave", `Insertion ${lovableItems.length} items Lovable`, { premierItem: lovableItems[0] });
    const { data: insertedItems, error: itemsError } = await supabase.from("meal_items").insert(lovableItems).select();
    if (itemsError) {
      appLogger.error("MealSave", "Erreur insertion items Lovable", itemsError);
      throw new Error(`Erreur insertion meal_items: ${itemsError.message}`);
    } else {
      appLogger.info("MealSave", `${insertedItems?.length || 0} items Lovable insérés`);
    }
  }

  // --- 2. ÉCRITURE SUR LA BASE SECONDAIRE (PERSONNELLE) ---
  let secondaryMeal: any = null;
  let itemsError: any = null;
  
  if (personalSupabase) {
    try {
      let personalMeal = buildPersonalMeal(mealData, userId, schema);
      appLogger.debug("MealSave", "Données Perso", personalMeal);
      
      let { data: insertedMeal, error: secondaryError } = await personalSupabase
        .from("meals")
        .insert([personalMeal])
        .select()
        .single();

      // FALLBACK : Si erreur de colonne manquante, retry avec structure minimale
      if (secondaryError && (
        secondaryError.message?.includes("total_calcium_mg") ||
        secondaryError.message?.includes("total_sodium_mg") ||
        secondaryError.message?.includes("total_fiber") ||
        secondaryError.message?.includes("Could not find the")
      )) {
        appLogger.warn("MealSave", "Fallback structure minimale (colonnes manquantes)", { erreur: secondaryError.message });
        // Forcer structure minimale
        const minimalSchema = { hasIndividualColumns: false, hasJsonbColumns: false };
        personalMeal = buildPersonalMeal(mealData, userId, minimalSchema);
        
        const retry = await personalSupabase
          .from("meals")
          .insert([personalMeal])
          .select()
          .single();
        
        insertedMeal = retry.data;
        secondaryError = retry.error;
      }

      if (secondaryError) {
        appLogger.error("MealSave", "Échec insertion meal perso", secondaryError);
        if (secondaryError.message?.includes("foreign key")) {
          appLogger.error("MealSave", "Utilisateur non existant dans auth.users perso - créez le profil manuellement");
        }
      } else if (insertedMeal && items.length > 0) {
        secondaryMeal = insertedMeal;
        // Déterminer le schéma à utiliser (original ou fallback minimal)
        const effectiveSchema = (secondaryError && schema.hasIndividualColumns) 
          ? { hasIndividualColumns: false, hasJsonbColumns: false }
          : schema;
        
        const personalItems = buildPersonalItems(items, secondaryMeal.id, userId, effectiveSchema);
        appLogger.debug("MealSave", `Items perso: ${personalItems.length}`, { premierItem: personalItems[0] });
        
        let { error: insertedItemsError } = await personalSupabase.from("meal_items").insert(personalItems);
        
        // Fallback items si colonnes manquantes
        if (insertedItemsError && insertedItemsError.message?.includes("Could not find the")) {
          appLogger.warn("MealSave", "Fallback items structure minimale");
          const minimalItems = buildPersonalItems(items, secondaryMeal.id, userId, { 
            hasIndividualColumns: false, hasJsonbColumns: false 
          });
          const retryItems = await personalSupabase.from("meal_items").insert(minimalItems);
          insertedItemsError = retryItems.error;
        }
        
        itemsError = insertedItemsError;
        if (insertedItemsError) {
          appLogger.error("MealSave", "Échec insertion items perso", insertedItemsError);
        } else {
          appLogger.info("MealSave", "Synchronisation perso OK");
        }
      }
    } catch (err) {
      appLogger.error("MealSave", "Erreur inattendue BDD perso", err);
    }
  }

  // Retourner les deux résultats pour permettre le diagnostic
  return { 
    lovable: primaryMeal, 
    personal: personalSupabase ? { 
      mealSaved: !!secondaryMeal, 
      itemsSaved: !itemsError 
    } : null 
  };
};

// Export pour réinitialiser le cache si nécessaire
export function resetSchemaCache() {
  personalDbSchema = null;
}
