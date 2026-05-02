/**
 * Service de persistance des repas avec adaptation automatique des structures de BDD
 * Gère à la fois les colonnes individuelles et les colonnes JSONB (nutrients_std/nutrients_custom)
 */

import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import type { MicroNutrientFields } from "@/utils/nutrition-logic";

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
  detected: boolean;
} | null = null;

/**
 * Détecte la structure de la BDD perso (colonnes individuelles vs JSONB)
 */
async function detectPersonalDbSchema(): Promise<{ 
  hasIndividualColumns: boolean; 
  hasJsonbColumns: boolean;
  detected: boolean;
}> {
  if (!personalSupabase) return { hasIndividualColumns: false, hasJsonbColumns: false, detected: false };
  if (personalDbSchema) return personalDbSchema;

  try {
    // Tester si la colonne total_calcium_mg existe (indique structure complète Lovable)
    const { error: colError } = await personalSupabase
      .from("meals")
      .select("total_calcium_mg")
      .limit(1);
    
    const hasIndividualColumns = !colError?.message?.includes("total_calcium_mg");

    // Tester si nutrients_std existe (structure JSONB)
    const { error: jsonbError } = await personalSupabase
      .from("meal_items")
      .select("nutrients_std")
      .limit(1);
    
    const hasJsonbColumns = !jsonbError?.message?.includes("nutrients_std");

    personalDbSchema = { hasIndividualColumns, hasJsonbColumns, detected: true };
    
    console.log("[DB Schema] Détecté:", personalDbSchema);
    
    return personalDbSchema;
  } catch (err) {
    console.error("[DB Schema] Erreur détection:", err);
    // Fallback : assume structure Lovable (individuel)
    return { hasIndividualColumns: true, hasJsonbColumns: false, detected: false };
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
    total_fiber?: number;
    total_sugar?: number;
    total_sodium_mg?: number;
    total_potassium_mg?: number;
    total_magnesium_mg?: number;
    total_calcium_mg?: number;
    total_iron_mg?: number;
    total_zinc_mg?: number;
    total_vitamin_c_mg?: number;
    total_vitamin_d_mcg?: number;
    total_vitamin_b9_mcg?: number;
    total_vitamin_b12_mcg?: number;
    total_vitamin_e_mg?: number;
    total_omega3_mg?: number;
    total_saturated_fat?: number;
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
    total_fiber: mealData.total_fiber ?? 0,
    total_sugar: mealData.total_sugar ?? 0,
    total_sodium_mg: mealData.total_sodium_mg ?? 0,
    total_potassium_mg: mealData.total_potassium_mg ?? 0,
    total_magnesium_mg: mealData.total_magnesium_mg ?? 0,
    total_calcium_mg: mealData.total_calcium_mg ?? 0,
    total_iron_mg: mealData.total_iron_mg ?? 0,
    total_zinc_mg: mealData.total_zinc_mg ?? 0,
    total_vitamin_c_mg: mealData.total_vitamin_c_mg ?? 0,
    total_vitamin_d_mcg: mealData.total_vitamin_d_mcg ?? 0,
    total_vitamin_b9_mcg: mealData.total_vitamin_b9_mcg ?? 0,
    total_vitamin_b12_mcg: mealData.total_vitamin_b12_mcg ?? 0,
    total_vitamin_e_mg: mealData.total_vitamin_e_mg ?? 0,
    total_omega3_mg: mealData.total_omega3_mg ?? 0,
    total_saturated_fat: mealData.total_saturated_fat ?? 0,
    timestamp: mealData.timestamp ?? new Date().toISOString(),
    image_url: mealData.image_url ?? null
  };
}

function buildLovableItems(items: MealItemWithMicros[], mealId: string, userId: string) {
  return items.map(item => ({
    meal_id: mealId,
    user_id: userId,
    food_name: item.food_name || item.name || "Aliment",
    calories: item.calories,
    proteins: item.proteins,
    carbs: item.carbs,
    fats: item.fats,
    fiber: item.fiber ?? 0,
    sugar: item.sugar ?? 0,
    sodium_mg: item.sodium_mg ?? 0,
    potassium_mg: item.potassium_mg ?? 0,
    magnesium_mg: item.magnesium_mg ?? 0,
    calcium_mg: item.calcium_mg ?? 0,
    iron_mg: item.iron_mg ?? 0,
    zinc_mg: item.zinc_mg ?? 0,
    vitamin_c_mg: item.vitamin_c_mg ?? 0,
    vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
    vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
    vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
    vitamin_e_mg: item.vitamin_e_mg ?? 0,
    omega3_mg: item.omega3_mg ?? 0,
    saturated_fat: item.saturated_fat ?? 0,
    estimated_weight_g: item.estimated_weight_g ?? null,
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
  const base = {
    user_id: userId,
    meal_name: mealData.meal_name,
    timestamp: mealData.timestamp ?? new Date().toISOString(),
    image_url: mealData.image_url ?? null
  };

  if (schema.hasIndividualColumns) {
    // Structure complète (importée de Lovable)
    return {
      ...base,
      total_calories: mealData.total_calories,
      total_proteins: mealData.total_proteins,
      total_carbs: mealData.total_carbs,
      total_fats: mealData.total_fats,
      total_fiber: mealData.total_fiber ?? 0,
      total_sugar: mealData.total_sugar ?? 0,
      total_sodium_mg: mealData.total_sodium_mg ?? 0,
      total_potassium_mg: mealData.total_potassium_mg ?? 0,
      total_magnesium_mg: mealData.total_magnesium_mg ?? 0,
      total_calcium_mg: mealData.total_calcium_mg ?? 0,
      total_iron_mg: mealData.total_iron_mg ?? 0,
      total_zinc_mg: mealData.total_zinc_mg ?? 0,
      total_vitamin_c_mg: mealData.total_vitamin_c_mg ?? 0,
      total_vitamin_d_mcg: mealData.total_vitamin_d_mcg ?? 0,
      total_vitamin_b9_mcg: mealData.total_vitamin_b9_mcg ?? 0,
      total_vitamin_b12_mcg: mealData.total_vitamin_b12_mcg ?? 0,
      total_vitamin_e_mg: mealData.total_vitamin_e_mg ?? 0,
      total_omega3_mg: mealData.total_omega3_mg ?? 0,
      total_saturated_fat: mealData.total_saturated_fat ?? 0
    };
  } else {
    // Structure minimale (ancienne BDD perso)
    return {
      ...base,
      total_calories: mealData.total_calories,
      total_proteins: mealData.total_proteins,
      total_carbs: mealData.total_carbs,
      total_fats: mealData.total_fats
    };
  }
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

    // Construction du payload JSONB pour nutrients_std
    const nutrientsStd = {
      fiber: item.fiber ?? 0,
      sugar: item.sugar ?? 0,
      sodium_mg: item.sodium_mg ?? 0,
      potassium_mg: item.potassium_mg ?? 0,
      magnesium_mg: item.magnesium_mg ?? 0,
      calcium_mg: item.calcium_mg ?? 0,
      iron_mg: item.iron_mg ?? 0,
      zinc_mg: item.zinc_mg ?? 0,
      vitamin_c_mg: item.vitamin_c_mg ?? 0,
      vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
      vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
      vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
      vitamin_e_mg: item.vitamin_e_mg ?? 0,
      omega3_mg: item.omega3_mg ?? 0,
      saturated_fat: item.saturated_fat ?? 0
    };

    if (schema.hasIndividualColumns && schema.hasJsonbColumns) {
      // Structure complète avec JSONB (meilleur des deux mondes)
      return {
        ...base,
        // Colonnes individuelles
        fiber: item.fiber ?? 0,
        sugar: item.sugar ?? 0,
        sodium_mg: item.sodium_mg ?? 0,
        potassium_mg: item.potassium_mg ?? 0,
        magnesium_mg: item.magnesium_mg ?? 0,
        calcium_mg: item.calcium_mg ?? 0,
        iron_mg: item.iron_mg ?? 0,
        zinc_mg: item.zinc_mg ?? 0,
        vitamin_c_mg: item.vitamin_c_mg ?? 0,
        vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
        vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
        vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
        vitamin_e_mg: item.vitamin_e_mg ?? 0,
        omega3_mg: item.omega3_mg ?? 0,
        saturated_fat: item.saturated_fat ?? 0,
        // JSONB pour compatibilité future
        nutrients_std: nutrientsStd,
        nutrients_custom: {}
      };
    } else if (schema.hasJsonbColumns) {
      // Structure JSONB uniquement
      return {
        ...base,
        nutrients_std: nutrientsStd,
        nutrients_custom: {}
      };
    } else if (schema.hasIndividualColumns) {
      // Structure individuelle uniquement
      return {
        ...base,
        fiber: item.fiber ?? 0,
        sugar: item.sugar ?? 0,
        sodium_mg: item.sodium_mg ?? 0,
        potassium_mg: item.potassium_mg ?? 0,
        magnesium_mg: item.magnesium_mg ?? 0,
        calcium_mg: item.calcium_mg ?? 0,
        iron_mg: item.iron_mg ?? 0,
        zinc_mg: item.zinc_mg ?? 0,
        vitamin_c_mg: item.vitamin_c_mg ?? 0,
        vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
        vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
        vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
        vitamin_e_mg: item.vitamin_e_mg ?? 0,
        omega3_mg: item.omega3_mg ?? 0,
        saturated_fat: item.saturated_fat ?? 0
      };
    } else {
      // Fallback minimal
      return base;
    }
  });
}

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

export const saveMealWithDualWrite = async ({ userId, mealData, items }: SaveMealParams) => {
  console.log("[saveMealWithDualWrite] Démarrage:", { 
    userId, 
    mealName: mealData.meal_name,
    itemsCount: items?.length || 0,
    hasPersonalDb: !!personalSupabase
  });
  
  // Détecter la structure de la BDD perso
  const schema = await detectPersonalDbSchema();
  console.log("[saveMealWithDualWrite] Schema détecté:", schema);
  
  // --- 1. ÉCRITURE SUR LA BASE PRIMAIRE (LOVABLE) ---
  const lovableMeal = buildLovableMeal(mealData, userId);
  console.log("[saveMealWithDualWrite] Données Lovable:", JSON.stringify(lovableMeal, null, 2));
  
  const { data: primaryMeal, error: primaryError } = await supabase
    .from("meals")
    .insert([lovableMeal])
    .select()
    .single();

  if (primaryError) {
    console.error("[saveMealWithDualWrite] Erreur Lovable:", primaryError);
    throw primaryError;
  }

  // Insertion des items sur Lovable
  if (items && items.length > 0) {
    const lovableItems = buildLovableItems(items, primaryMeal.id, userId);
    const { error: itemsError } = await supabase.from("meal_items").insert(lovableItems);
    if (itemsError) {
      console.error("[saveMealWithDualWrite] Erreur items Lovable:", itemsError);
    }
  }

  // --- 2. ÉCRITURE SUR LA BASE SECONDAIRE (PERSONNELLE) ---
  if (personalSupabase) {
    try {
      const personalMeal = buildPersonalMeal(mealData, userId, schema);
      console.log("[saveMealWithDualWrite] Données Perso:", JSON.stringify(personalMeal, null, 2));
      
      const { data: secondaryMeal, error: secondaryError } = await personalSupabase
        .from("meals")
        .insert([personalMeal])
        .select()
        .single();

      if (secondaryError) {
        console.error("[saveMealWithDualWrite] Échec meal perso:", secondaryError);
        if (secondaryError.message?.includes("foreign key")) {
          console.error("[saveMealWithDualWrite] L'utilisateur n'existe pas dans auth.users perso");
        }
      } else if (secondaryMeal && items.length > 0) {
        const personalItems = buildPersonalItems(items, secondaryMeal.id, userId, schema);
        console.log("[saveMealWithDualWrite] Items perso:", personalItems.length, "items");
        console.log("[saveMealWithDualWrite] Premier item:", JSON.stringify(personalItems[0], null, 2));
        
        const { error: itemsError } = await personalSupabase.from("meal_items").insert(personalItems);
        
        if (itemsError) {
          console.error("[saveMealWithDualWrite] Échec items perso:", itemsError);
        } else {
          console.log("[saveMealWithDualWrite] Synchronisation perso OK");
        }
      }
    } catch (err) {
      console.error("[saveMealWithDualWrite] Erreur perso:", err);
    }
  }

  return primaryMeal;
};

// Export pour réinitialiser le cache si nécessaire
export function resetSchemaCache() {
  personalDbSchema = null;
}
